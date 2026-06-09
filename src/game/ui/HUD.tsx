// ──────────────────────────────────────────────
//  HUD – top bar: resources, population, time, happiness
//  With animated counters + day/night clock
// ──────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { gameState } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import type { ResourceType } from '../core/EventBus';
import { getHappinessScore, getHappinessEmoji, getHappinessColor, getHappinessModifiers } from '../systems/HappinessSystem';

interface HUDProps {
  tick: number;
}

// Animated number that ticks toward a target value
const AnimatedNumber: React.FC<{ value: number; delta?: number }> = ({ value, delta }) => {
  const [display, setDisplay] = useState(value);
  const [showDelta, setShowDelta] = useState<{ val: number; id: number } | null>(null);
  const prevRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value !== prevRef.current) {
      const diff = value - prevRef.current;
      if (diff !== 0) {
        const id = Date.now();
        setShowDelta({ val: diff, id });
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setShowDelta(null), 1500);
      }
      prevRef.current = value;
      setDisplay(value);
    }
  }, [value]);

  return (
    <span className="hud-resource-value" style={{ position: 'relative' }}>
      {Math.floor(display)}
      {showDelta && (
        <span
          key={showDelta.id}
          className="hud-delta-pop"
          style={{ color: showDelta.val > 0 ? 'hsl(120 50% 60%)' : 'hsl(0 60% 60%)' }}
        >
          {showDelta.val > 0 ? `+${showDelta.val}` : showDelta.val}
        </span>
      )}
    </span>
  );
};

const ResourceIcon: React.FC<{
  icon: string; label: string; value: number; color: string; capacity?: number;
}> = ({ icon, label, value, color, capacity }) => (
  <div className="hud-resource" title={capacity !== undefined ? `${Math.floor(value)} / ${capacity}` : undefined}>
    <span className="hud-resource-icon" style={{ color }}>{icon}</span>
    <div className="hud-resource-info">
      <span className="hud-resource-label">{label}</span>
      <AnimatedNumber value={value} />
    </div>
    {capacity !== undefined && (
      <span style={{ fontSize: 9, color: 'hsl(42 10% 40%)', alignSelf: 'flex-end', paddingBottom: 1 }}>
        /{capacity}
      </span>
    )}
  </div>
);

const HUD: React.FC<HUDProps> = ({ tick }) => {
  const resources = gameState.resources;
  const { paused, timeScale, population, maxPopulation, gameTime } = gameState;

  const handleTimeScale = (scale: number) => {
    if (scale === 0) {
      gameState.paused = true;
    } else {
      gameState.paused = false;
      gameState.timeScale = scale;
    }
    EventBus.emit('TimeScaleChanged', { scale });
  };

  const { day, hour, minute } = gameTime;
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  const isNight = hour >= 21 || hour < 6;
  const isDusk = hour >= 18 && hour < 21;

  // Storage capacity (sum of all active storage buildings)
  let totalCapacity = 0;
  gameState.buildings.forEach((b) => {
    if (b.state === 'active' && (b.type === 'town_center' || b.type === 'storage_barn')) {
      totalCapacity += b.storageCapacity;
    }
  });

  const happiness = getHappinessScore();
  const happinessEmoji = getHappinessEmoji();
  const happinessColor = getHappinessColor();
  const happinessMods = getHappinessModifiers();
  const characterMode = gameState.playerCharacter.controlActive;

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!gameState.playerCharacter.controlActive) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-player-icon]')) return;
      if (target?.closest('canvas')) return;
      gameState.playerCharacter.controlActive = false;
      gameState.playerCharacter.aiMode = true;
      EventBus.emit('PlayerControlToggled', { active: false });
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  return (
    <div className="hud-bar">
      {/* Resources */}
      <div className="hud-resources">
        <ResourceIcon icon="🪵" label="Wood" value={resources.wood} color="#c8a86b" capacity={totalCapacity} />
        <ResourceIcon icon="🌾" label="Food" value={resources.food} color="#8bc34a" capacity={totalCapacity} />
        <ResourceIcon icon="🪨" label="Stone" value={resources.stone} color="#90a4ae" capacity={totalCapacity} />
        <div className="hud-divider" />
        <ResourceIcon icon="👥" label="People" value={population} color="#ef9a9a" capacity={maxPopulation} />
        <div className="hud-divider" />
        {/* Happiness */}
        <div className="hud-resource" style={{ cursor: 'help', position: 'relative' }}
          title={`Happiness: ${Math.round(happiness)}\n${happinessMods.map(m => `${m.value > 0 ? '+' : ''}${m.value} ${m.label}`).join('\n')}`}
        >
          <span className="hud-resource-icon">{happinessEmoji}</span>
          <div className="hud-resource-info">
            <span className="hud-resource-label">Morale</span>
            <span className="hud-resource-value" style={{ color: happinessColor, fontSize: 12 }}>
              {Math.round(happiness)}
            </span>
          </div>
          {/* Thin color bar */}
          <div style={{
            position: 'absolute', bottom: 0, left: 4, right: 4, height: 2,
            background: 'hsl(38 12% 20%)', borderRadius: 1,
          }}>
            <div style={{
              width: `${happiness}%`, height: '100%',
              background: happinessColor,
              borderRadius: 1, transition: 'width 0.5s, background 0.5s',
            }} />
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="hud-title">
        <span className="hud-game-title">MEDIEVAL REALM</span>
        <span className="hud-date" style={{ color: isNight ? 'hsl(220 40% 60%)' : isDusk ? 'hsl(30 60% 55%)' : 'hsl(42 20% 55%)' }}>
          {isNight ? '🌙' : isDusk ? '🌆' : '☀️'} Day {day} · {timeStr}
        </span>
      </div>

      {/* Time controls */}
      <div className="hud-time-controls">
        <button
          className={`hud-time-btn ${paused ? 'active' : ''}`}
          onClick={() => handleTimeScale(0)}
          title="Pause [Space]"
        >⏸</button>
        <button
          className={`hud-time-btn ${!paused && timeScale === 1 ? 'active' : ''}`}
          onClick={() => handleTimeScale(1)}
          title="1× Speed"
        >▶</button>
        <button
          className={`hud-time-btn ${!paused && timeScale === 2 ? 'active' : ''}`}
          onClick={() => handleTimeScale(2)}
          title="2× Speed [F]"
        >⏩</button>
        <button
          className={`hud-time-btn ${!paused && timeScale === 4 ? 'active' : ''}`}
          onClick={() => handleTimeScale(4)}
          title="4× Speed"
        >⚡</button>
        <div className="hud-divider" />
        <button
          className="hud-save-btn"
          onClick={() => EventBus.emit('SaveRequested', {})}
          title="Save Game [Ctrl+S]"
        >💾</button>
        <button
          className="hud-save-btn"
          onClick={() => { const ev = new KeyboardEvent('keydown', { key: 'F1' }); window.dispatchEvent(ev); }}
          title="Hotkeys [F1]"
          style={{ fontSize: 11 }}
        >?</button>
        <button
          data-player-icon
          className="hud-save-btn"
          onClick={(e) => {
            e.stopPropagation();
            const next = !gameState.playerCharacter.controlActive;
            gameState.playerCharacter.controlActive = next;
            gameState.playerCharacter.aiMode = !next;
            if (next) {
              const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
              canvas?.requestPointerLock?.();
              document.body.style.cursor = 'none';
            } else {
              if (document.pointerLockElement) document.exitPointerLock?.();
              document.body.style.cursor = '';
            }
            EventBus.emit('PlayerControlToggled', { active: next });
          }}
          title="Toggle Main Character Control"
          style={{
            fontSize: 12,
            borderColor: characterMode ? 'hsl(140 45% 40%)' : undefined,
            color: characterMode ? 'hsl(140 55% 72%)' : undefined,
          }}
        >
          🧍
        </button>
      </div>
    </div>
  );
};

export default HUD;
