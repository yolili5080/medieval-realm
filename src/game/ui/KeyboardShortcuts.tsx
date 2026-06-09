import React, { useEffect, useState } from 'react';
import { gameState, pushNotification } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import type { BuildingType } from '../core/EventBus';

interface KeyboardShortcutsProps {
  onTimeScale: (scale: number) => void;
  onBuildMode: (type: BuildingType | null) => void;
  onCenterCamera?: () => void;
}

const HOTKEYS = [
  { key: 'Space', label: 'Space', desc: 'Pause / Unpause' },
  { key: 'F', label: 'F', desc: 'Fast-forward (2x)' },
  { key: 'H', label: 'H', desc: 'Center camera on Town Center' },
  { key: 'B', label: 'B', desc: 'Open Build Menu' },
  { key: 'Esc', label: 'Escape', desc: 'Cancel / Deselect / Close' },
  { key: 'Delete', label: 'Delete', desc: 'Demolish selected building' },
  { key: 'Ctrl+S', label: 'Ctrl+S', desc: 'Save game' },
  { key: '1-9', label: '1-9', desc: 'Recall control group (or soldier fallback)' },
  { key: 'Ctrl+1-9', label: 'Ctrl+1-9', desc: 'Assign current selection to control group' },
  { key: 'Shift+1-5', label: 'Shift+1-5', desc: 'Formation: Line/Box/Wedge/Spread/Circle' },
  { key: 'Q', label: 'Q', desc: 'Assign selected worker to Chop wood' },
  { key: 'W', label: 'W', desc: 'Assign selected worker to Mine stone' },
  { key: 'E', label: 'E', desc: 'Assign selected worker to Farm' },
  { key: 'R', label: 'R', desc: 'Assign selected worker to Build' },
  { key: 'A', label: 'A', desc: 'Select all soldiers' },
  { key: 'Tab', label: 'Tab', desc: 'Cycle selection through units' },
  { key: 'F1', label: 'F1 / ?', desc: 'Show this hotkey reference' },
];

let tabCycleIndex = 0;
let lastRecalledGroup = 0;
let lastRecallTs = 0;

function getCurrentSelectionIds(): number[] {
  if (gameState.selectedGroupIds.length > 0) {
    return gameState.selectedGroupIds.filter((id) => gameState.citizens.has(id) || gameState.military.soldiers.has(id));
  }

  const ids: number[] = [];
  if (gameState.military.selectedSoldierId !== null) ids.push(gameState.military.selectedSoldierId);
  if (gameState.selectedEntity !== null) ids.push(gameState.selectedEntity);
  return ids.filter((id, idx, arr) => arr.indexOf(id) === idx);
}

export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({
  onTimeScale, onBuildMode, onCenterCamera,
}) => {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'F1' || e.key === '?') {
        e.preventDefault();
        setShowHelp((s) => !s);
        return;
      }

      if (e.key === 'Escape') {
        setShowHelp(false);
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        EventBus.emit('SaveRequested', {});
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (gameState.paused) {
          gameState.paused = false;
          gameState.timeScale = 1;
          onTimeScale(1);
        } else {
          gameState.paused = true;
          onTimeScale(0);
        }
        return;
      }

      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const newScale = gameState.timeScale === 2 ? 1 : 2;
        gameState.paused = false;
        gameState.timeScale = newScale;
        onTimeScale(newScale);
        return;
      }

      if (e.key.toLowerCase() === 'h') {
        e.preventDefault();
        onCenterCamera?.();
        return;
      }

      if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        onBuildMode(null);
        pushNotification('Press [B] to open Build Menu (click a building type)', 'info');
        return;
      }

      if (e.key.toLowerCase() === 'a') {
        if (gameState.military.soldiers.size > 0) {
          const ids = Array.from(gameState.military.soldiers.keys());
          const first = ids[0];
          gameState.military.selectedSoldierId = first;
          EventBus.emit('SoldierSelected', { soldierId: first });
          pushNotification(`Selected all ${ids.length} soldiers`, 'info');
        }
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const citizenIds: number[] = [];
        gameState.isCitizen.forEach((_, id) => citizenIds.push(id));
        if (citizenIds.length > 0) {
          tabCycleIndex = (tabCycleIndex + 1) % citizenIds.length;
          const id = citizenIds[tabCycleIndex];
          gameState.selectables.forEach((s) => {
            s.isSelected = false;
          });
          const sel = gameState.selectables.get(id);
          if (sel) sel.isSelected = true;
          gameState.selectedEntity = id;
          EventBus.emit('EntitySelected', { entityId: id });
        }
        return;
      }

      if (/^[1-9]$/.test(e.key) && e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const group = Number(e.key);
        const selectedIds = getCurrentSelectionIds().filter((id) => gameState.citizens.has(id) || (gameState.military.soldiers.has(id) && gameState.military.soldiers.get(id)?.state !== 'dead'));
        if (selectedIds.length === 0) {
          pushNotification(`Control Group ${group}: select units first`, 'warning');
          return;
        }
        (gameState.controlGroups as Record<number, number[]>)[group] = selectedIds;
        EventBus.emit('ControlGroupAssigned', { group, ids: selectedIds });
        pushNotification(`Control Group ${group} assigned (${selectedIds.length})`, 'success');
        return;
      }

      if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const group = Number(e.key);
        const assigned = ((gameState.controlGroups as Record<number, number[]>)[group] ?? [])
          .filter((id) => gameState.citizens.has(id) || (gameState.military.soldiers.has(id) && gameState.military.soldiers.get(id)?.state !== 'dead'));

        if (assigned.length > 0) {
          EventBus.emit('ControlGroupRecalled', { group, ids: assigned });
          const now = Date.now();
          const isDoubleTap = lastRecalledGroup === group && (now - lastRecallTs) < 550;
          lastRecalledGroup = group;
          lastRecallTs = now;
          if (isDoubleTap) {
            let sumX = 0;
            let sumZ = 0;
            let count = 0;
            assigned.forEach((id) => {
              const t = gameState.transforms.get(id);
              if (!t) return;
              sumX += t.x;
              sumZ += t.z;
              count++;
            });
            if (count > 0) {
              (window as any).__minimapCameraTarget = { x: sumX / count, z: sumZ / count };
              pushNotification(`Centered camera on Group ${group}`, 'info');
            }
          }
          pushNotification(`Control Group ${group} recalled (${assigned.length})`, 'info');
          return;
        }

        const index = parseInt(e.key, 10) - 1;
        const aliveSoldiers = Array.from(gameState.military.soldiers.entries())
          .filter(([, s]) => s.state !== 'dead')
          .map(([id]) => id);

        if (index < aliveSoldiers.length) {
          const soldierId = aliveSoldiers[index];
          gameState.military.selectedSoldierId = soldierId;
          EventBus.emit('SoldierSelected', { soldierId });
          pushNotification(`Selected soldier #${index + 1}`, 'info');
        } else {
          pushNotification(`No soldier assigned to key ${e.key}`, 'warning');
        }
        return;
      }

      if (/^Digit[1-5]$/.test(e.code) && e.shiftKey && !e.ctrlKey) {
        const formations = ['line', 'box', 'wedge', 'spread', 'circle'];
        const selected = formations[Number(e.code.replace('Digit', '')) - 1];
        (gameState as any).currentFormation = selected;
        pushNotification(`Formation: ${selected}`, 'info');
        return;
      }

      if (e.key.toLowerCase() === 'q') {
        const sel = gameState.selectedEntity;
        if (sel && gameState.isCitizen.has(sel)) {
          const job = gameState.jobs.get(sel);
          if (job) {
            job.jobType = 'woodcutter';
            job.actionState = 'idle';
            job.targetEntityId = null;
          }
          pushNotification('Worker set to woodcutting', 'info');
        }
        return;
      }

      if (e.key.toLowerCase() === 'w') {
        const sel = gameState.selectedEntity;
        if (sel && gameState.isCitizen.has(sel)) {
          const job = gameState.jobs.get(sel);
          if (job) {
            job.jobType = 'quarryman';
            job.actionState = 'idle';
            job.targetEntityId = null;
          }
          pushNotification('Worker set to mining', 'info');
        }
        return;
      }

      if (e.key.toLowerCase() === 'e') {
        const sel = gameState.selectedEntity;
        if (sel && gameState.isCitizen.has(sel)) {
          const job = gameState.jobs.get(sel);
          if (job) {
            job.jobType = 'farmer';
            job.actionState = 'idle';
            job.targetEntityId = null;
          }
          pushNotification('Worker set to farming', 'info');
        }
        return;
      }

      if (e.key.toLowerCase() === 'r') {
        const sel = gameState.selectedEntity;
        if (sel && gameState.isCitizen.has(sel)) {
          const job = gameState.jobs.get(sel);
          if (job) {
            job.jobType = 'builder';
            job.actionState = 'idle';
            job.targetEntityId = null;
          }
          pushNotification('Worker set to building', 'info');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onTimeScale, onBuildMode, onCenterCamera]);

  if (!showHelp) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        background: 'rgba(8,5,3,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(6px)',
        animation: 'panelSlideIn 0.15s ease-out both',
      }}
      onClick={() => setShowHelp(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(160deg, hsl(28 22% 10%), hsl(28 18% 7%))',
          border: '1px solid hsl(38 35% 26%)',
          borderRadius: 14,
          padding: '32px 36px',
          maxWidth: 560,
          width: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '0.16em', color: 'hsl(38 72% 62%)' }}>
            KEYBOARD SHORTCUTS
          </h2>
          <button
            onClick={() => setShowHelp(false)}
            style={{
              background: 'none', border: '1px solid hsl(38 25% 24%)',
              borderRadius: 5, color: 'hsl(42 25% 55%)', fontSize: 13, cursor: 'pointer',
              padding: '2px 8px', fontFamily: 'inherit',
            }}
          >Close</button>
        </div>
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, hsl(38 35% 26%), transparent)', marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
          {HOTKEYS.map((h) => (
            <div key={h.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <kbd
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 42, padding: '2px 6px', height: 22,
                  background: 'hsl(28 22% 14%)',
                  border: '1px solid hsl(38 28% 26%)',
                  borderBottom: '2px solid hsl(38 22% 18%)',
                  borderRadius: 4,
                  fontSize: 9, fontWeight: 700,
                  color: 'hsl(38 65% 62%)',
                  fontFamily: 'monospace',
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}
              >
                {h.label}
              </kbd>
              <span style={{ fontSize: 11, color: 'hsl(42 20% 65%)' }}>{h.desc}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, fontSize: 10, color: 'hsl(42 14% 40%)', textAlign: 'center' }}>
          Click outside to close · Press F1 or ? to toggle
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcuts;
