// ──────────────────────────────────────────────
//  ChapterPill – collapsed chapter pill + expand overlay
// ──────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { gameState, pushNotification, addResource } from '../core/GameState';
import type { ResourceType } from '../core/EventBus';

interface ChapterStep {
  id: string;
  icon: string;
  label: string;
  description: string;
  condition: () => boolean;
  reward?: Partial<Record<ResourceType, number>>;
}

interface Chapter {
  id: number;
  title: string;
  unlockDay: number;
  steps: ChapterStep[];
}

const CHAPTERS: Chapter[] = [
  {
    id: 1, title: 'Settlement Founding', unlockDay: 1,
    steps: [
      { id: 'c1_woodcutter', icon: '🪵', label: "Build Woodcutter's Hut", description: 'Wood is the lifeblood of your settlement.', condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'woodcutter_hut' && b.state === 'active'), reward: { wood: 5 } },
      { id: 'c1_house', icon: '🏠', label: 'Build a House', description: 'Attract new settlers.', condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'house' && b.state === 'active'), reward: { food: 10 } },
      { id: 'c1_pop6', icon: '👥', label: 'Reach 6 Population', description: 'Build more houses.', condition: () => gameState.population >= 6, reward: { wood: 10, food: 5 } },
      { id: 'c1_farm', icon: '🌾', label: 'Build a Farm', description: 'Feed your people.', condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'farm_field' && b.state === 'active'), reward: { food: 20 } },
      { id: 'c1_storage', icon: '📦', label: 'Build Storage Barn', description: 'Expand storage capacity.', condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'storage_barn' && b.state === 'active') },
    ],
  },
  {
    id: 2, title: 'First Defense', unlockDay: 3,
    steps: [
      { id: 'c2_quarry', icon: '⛏️', label: 'Build a Quarry', description: 'Mine stone for walls.', condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'quarry' && b.state === 'active'), reward: { stone: 10 } },
      { id: 'c2_barracks', icon: '⚔️', label: 'Build a Barracks', description: 'Raiders come on Day 5.', condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'barracks' && b.state === 'active'), reward: { wood: 10, stone: 5 } },
      { id: 'c2_soldier', icon: '🗡️', label: 'Train First Soldier', description: 'A barracks without soldiers is useless.', condition: () => gameState.military.soldiersTrainedTotal >= 1 },
      { id: 'c2_repel', icon: '🛡️', label: 'Repel First Raid', description: 'Prove your realm can survive.', condition: () => gameState.military.raidsRepelled >= 1, reward: { stone: 15, food: 10 } },
      { id: 'c2_pop10', icon: '👥', label: 'Reach 10 Population', description: 'Keep growing.', condition: () => gameState.population >= 10, reward: { wood: 15 } },
    ],
  },
  {
    id: 3, title: 'Economy', unlockDay: 8,
    steps: [
      { id: 'c3_pop12', icon: '👥', label: 'Reach 12 Population', description: 'More workers needed.', condition: () => gameState.population >= 12, reward: { food: 15 } },
      { id: 'c3_smithy', icon: '⚒️', label: 'Build a Smithy', description: 'Forge better weapons.', condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'smithy' && b.state === 'active'), reward: { wood: 10 } },
      { id: 'c3_equip', icon: '🗡️', label: 'Equip 2 Soldiers', description: 'Craft weapons at the Smithy.', condition: () => { let e = 0; gameState.military.soldiers.forEach(s => { if (s.equipment?.weapon && s.equipment.weapon !== 'fists') e++; }); return e >= 2; }, reward: { stone: 10 } },
      { id: 'c3_repel2', icon: '⚔️', label: 'Repel 2 Raids', description: 'Show your military might.', condition: () => gameState.military.raidsRepelled >= 2, reward: { wood: 20, food: 20 } },
      { id: 'c3_pop15', icon: '👥', label: 'Reach 15 Population', description: 'A thriving settlement.', condition: () => gameState.population >= 15, reward: { stone: 15, wood: 15 } },
    ],
  },
  {
    id: 4, title: 'Military Power', unlockDay: 15,
    steps: [
      { id: 'c4_soldiers3', icon: '⚔️', label: 'Field 3 Soldiers', description: 'Build a real army.', condition: () => Array.from(gameState.military.soldiers.values()).filter(s => s.state !== 'dead').length >= 3, reward: { wood: 20 } },
      { id: 'c4_repel3', icon: '🛡️', label: 'Repel 3 Raids', description: 'Your realm grows stronger.', condition: () => gameState.military.raidsRepelled >= 3, reward: { stone: 20, food: 20 } },
      { id: 'c4_pop18', icon: '👥', label: 'Reach 18 Population', description: 'A proper village.', condition: () => gameState.population >= 18, reward: { wood: 25 } },
      { id: 'c4_tower', icon: '🏰', label: 'Build a Tower', description: 'Fortify your perimeter.', condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'tower' && b.state === 'active'), reward: { stone: 25 } },
      { id: 'c4_day20', icon: '📅', label: 'Survive to Day 20', description: 'The hardest raids come.', condition: () => gameState.gameTime.day >= 20, reward: { wood: 30, food: 20, stone: 15 } },
    ],
  },
  {
    id: 5, title: 'Dominion', unlockDay: 22,
    steps: [
      { id: 'c5_pop20', icon: '👥', label: 'Reach 20 Population', description: 'A true medieval realm.', condition: () => gameState.population >= 20, reward: { food: 25 } },
      { id: 'c5_repel5', icon: '⚔️', label: 'Repel 5 Raids', description: 'Prove your invincibility.', condition: () => gameState.military.raidsRepelled >= 5, reward: { stone: 30, wood: 30 } },
      { id: 'c5_soldiers5', icon: '🗡️', label: 'Field 5 Soldiers', description: 'A true army.', condition: () => Array.from(gameState.military.soldiers.values()).filter(s => s.state !== 'dead').length >= 5, reward: { food: 30 } },
      { id: 'c5_stronghold', icon: '🏰', label: 'Build a Stronghold', description: 'Your ultimate fortress.', condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'stronghold' && b.state === 'active'), reward: { wood: 40, stone: 40 } },
      { id: 'c5_survive30', icon: '🏆', label: 'Survive 30 Days', description: 'The ultimate test.', condition: () => gameState.gameTime.day >= 30 },
    ],
  },
];

const completedSteps = new Set<string>();
let _lastTick = -1;

interface ChapterPillProps {
  tick: number;
  embedded?: boolean;
}

const ChapterPill: React.FC<ChapterPillProps> = ({ tick, embedded = false }) => {
  const [expanded, setExpanded] = useState(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (tick === _lastTick) return;
    _lastTick = tick;
    let changed = false;
    const day = gameState.gameTime.day;
    for (const chapter of CHAPTERS) {
      if (chapter.unlockDay > day) continue;
      for (const step of chapter.steps) {
        if (completedSteps.has(step.id)) continue;
        if (step.condition()) {
          completedSteps.add(step.id);
          changed = true;
          if (step.reward) {
            for (const [res, amt] of Object.entries(step.reward) as [ResourceType, number][]) {
              if (amt > 0) addResource(res, amt);
            }
          }
          const rewardStr = step.reward
            ? Object.entries(step.reward).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `+${v} ${k}`).join(', ')
            : '';
          pushNotification(`✅ ${step.label}${rewardStr ? ` — Reward: ${rewardStr}` : ''}`, 'success');
        }
      }
    }
    if (changed) forceUpdate(n => n + 1);
  }, [tick]);

  const day = gameState.gameTime.day;
  const activeChapter = CHAPTERS.filter(c => c.unlockDay <= day).at(-1);
  if (!activeChapter) return null;

  const completedInChapter = activeChapter.steps.filter(s => completedSteps.has(s.id)).length;
  const nextStep = activeChapter.steps.find(s => !completedSteps.has(s.id));
  const progress = completedInChapter / activeChapter.steps.length;

  return (
    <>
      {/* Compact pill */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          position: embedded ? 'relative' : 'absolute',
          top: embedded ? undefined : 58,
          left: embedded ? undefined : 12,
          zIndex: embedded ? 1 : 200,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px',
          background: 'hsla(28 22% 9% / 0.97)',
          border: '1px solid hsl(38 28% 22%)',
          borderRadius: 20,
          color: 'hsl(42 55% 68%)',
          fontSize: 11, fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(6px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          transition: 'all 0.12s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'hsl(38 50% 36%)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'hsl(38 28% 22%)')}
        title={nextStep ? nextStep.label : 'Chapter complete!'}
      >
        {/* Mini progress ring via border */}
        <span style={{ fontSize: 14 }}>📖</span>
        <span>Ch.{activeChapter.id}</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {activeChapter.steps.map((s, i) => (
            <div key={s.id} style={{
              width: 5, height: 5, borderRadius: '50%',
              background: completedSteps.has(s.id) ? 'hsl(120 50% 45%)' : i === completedInChapter ? 'hsl(38 60% 52%)' : 'hsl(38 15% 25%)',
            }} />
          ))}
        </div>
        <span style={{ fontSize: 9, color: 'hsl(42 20% 48%)' }}>{completedInChapter}/{activeChapter.steps.length}</span>
        <span style={{ fontSize: 8, opacity: 0.5 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expand overlay */}
      {expanded && (
        <div style={{
          position: embedded ? 'absolute' : 'absolute',
          top: embedded ? 42 : 90,
          left: embedded ? 0 : 12,
          zIndex: embedded ? 410 : 400,
          width: 260,
          background: 'hsla(28 22% 9% / 0.98)',
          border: '1px solid hsl(38 28% 22%)',
          borderRadius: 12,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          animation: 'panelSlideIn 0.15s ease-out both',
        }}>
          <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid hsl(38 18% 16%)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'hsl(38 70% 64%)', letterSpacing: '0.08em' }}>
              📖 CH.{activeChapter.id} — {activeChapter.title.toUpperCase()}
            </div>
            <div style={{ height: 3, background: 'hsl(38 15% 18%)', borderRadius: 2, marginTop: 6 }}>
              <div style={{ width: `${progress * 100}%`, height: '100%', background: 'linear-gradient(90deg, hsl(38 55% 38%), hsl(38 75% 56%))', borderRadius: 2, transition: 'width 0.5s' }} />
            </div>
          </div>
          <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {activeChapter.steps.map((step, i) => {
              const isDone = completedSteps.has(step.id);
              const isCurrent = step === nextStep;
              return (
                <div key={step.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 7, padding: '5px 7px', borderRadius: 6,
                  background: isCurrent ? 'hsla(38,38%,13%,0.9)' : isDone ? 'hsla(120,18%,9%,0.6)' : 'transparent',
                  border: `1px solid ${isCurrent ? 'hsl(38 48% 30%)' : isDone ? 'hsl(120 20% 18%)' : 'transparent'}`,
                  opacity: !isCurrent && !isDone ? 0.5 : 1,
                }}>
                  <span style={{ fontSize: 12, flexShrink: 0 }}>{isDone ? '✅' : step.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: isDone ? 'hsl(120 45% 55%)' : isCurrent ? 'hsl(42 40% 88%)' : 'hsl(42 18% 52%)', textDecoration: isDone ? 'line-through' : 'none' }}>{step.label}</div>
                    {isCurrent && <div style={{ fontSize: 9, color: 'hsl(42 14% 48%)', marginTop: 2 }}>{step.description}</div>}
                    {isCurrent && step.reward && (
                      <div style={{ fontSize: 9, color: 'hsl(38 55% 52%)' }}>Reward: {Object.entries(step.reward).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `+${v} ${k}`).join(', ')}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Survival bar */}
          <div style={{ padding: '6px 10px 8px', borderTop: '1px solid hsl(38 15% 16%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'hsl(42 18% 48%)', marginBottom: 3 }}>
              <span>DAYS SURVIVED</span>
              <span style={{ color: 'hsl(38 62% 62%)', fontWeight: 700 }}>{Math.min(day, 30)} / 30</span>
            </div>
            <div style={{ height: 4, background: 'hsl(38 12% 16%)', borderRadius: 2 }}>
              <div style={{ width: `${Math.min(day / 30 * 100, 100)}%`, height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, hsl(38 45% 30%), hsl(38 65% 48%))', transition: 'width 1s' }} />
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {expanded && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 399 }} onClick={() => setExpanded(false)} />
      )}
    </>
  );
};

export default ChapterPill;
