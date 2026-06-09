import React, { useEffect, useRef, useState } from 'react';
import TopBar from './TopBar';
import LeftSidebar from './LeftSidebar';
import BottomBand from './BottomBand';
import RightUtilityDock from './RightUtilityDock';
import Minimap from '../Minimap';
import { gameState } from '../../core/GameState';
import { EventBus } from '../../core/EventBus';
import { smithyCrafting, smithyQueue } from '../../systems/SmithySystem';
import { RtsIcon } from './IconAtlas';

interface GameLayoutProps {
  tick: number;
  selectedEntity: number | null;
  selectedSoldierId: number | null;
  multiSelected: number[];
  buildMode: any;
  wallDrawMode: boolean;
  onSelectBuild: (type: any) => void;
  onWallDrawMode: (active: boolean) => void;
  onClearSelection: () => void;
  onTimeScale: (scale: number) => void;
  onCameraMove: (x: number, z: number) => void;
  onSelectIdleCitizen: () => void;
  onSelectIdleSoldier: () => void;
}

const GameLayout: React.FC<GameLayoutProps> = ({
  tick,
  selectedEntity,
  selectedSoldierId,
  multiSelected,
  buildMode,
  wallDrawMode,
  onSelectBuild,
  onWallDrawMode,
  onClearSelection,
  onTimeScale,
  onCameraMove,
  onSelectIdleCitizen,
  onSelectIdleSoldier,
}) => {
  const ui = gameState.ui;
  const [, forceRerender] = useState(0);

  const classNames = [
    'rts-shell',
    `scale-${String(ui.uiScale).replace('.', '-')}`,
    `hud-${ui.hudDensity}`,
    ui.highContrastUI ? 'high-contrast' : '',
    `motion-${ui.motionMode}`,
    `cb-${ui.colorblindMode}`,
  ].filter(Boolean).join(' ');

  const lastInteractionRef = useRef<number>(Date.now());

  useEffect(() => {
    const markInteraction = () => {
      lastInteractionRef.current = Date.now();
    };
    window.addEventListener('pointerdown', markInteraction, true);
    window.addEventListener('keydown', markInteraction, true);
    window.addEventListener('wheel', markInteraction, true);
    return () => {
      window.removeEventListener('pointerdown', markInteraction, true);
      window.removeEventListener('keydown', markInteraction, true);
      window.removeEventListener('wheel', markInteraction, true);
    };
  }, []);

  useEffect(() => {
    if (ui.utilityDrawer === 'none') return;

    const inCombat = gameState.military.activeRaid || Array.from(gameState.military.enemies.values()).some((e) => e.state !== 'dead');
    if (inCombat) {
      gameState.ui.utilityDrawer = 'none';
      forceRerender((v) => v + 1);
      return;
    }

    const timeoutMs = Math.max(1500, gameState.ui.drawerAutoCollapseMs);
    if (Date.now() - lastInteractionRef.current >= timeoutMs) {
      gameState.ui.utilityDrawer = 'none';
      forceRerender((v) => v + 1);
    }
  }, [tick, ui.utilityDrawer]);

  const toggleDrawer = (side: 'left' | 'right') => {
    gameState.ui.utilityDrawer = gameState.ui.utilityDrawer === side ? 'none' : side;
    lastInteractionRef.current = Date.now();
    forceRerender((v) => v + 1);
  };

  const activeEnemies = Array.from(gameState.military.enemies.values()).filter((e) => e.state !== 'dead').length;
  const raidActive = gameState.military.activeRaid && activeEnemies > 0;
  let idleCitizens = 0;
  gameState.citizens.forEach((_, id) => {
    const job = gameState.jobs.get(id);
    if (!!job && job.jobType === 'idle' && (job.actionState === 'idle' || job.actionState === 'sleeping')) {
      idleCitizens++;
    }
  });
  const idleSoldiers = Array.from(gameState.military.soldiers.values()).filter((s) => s.state === 'idle').length;

  const productionCards: Array<{ id: string; label: string; now: string; remaining: number; pct: number; queued: number }> = [];
  gameState.buildings.forEach((b, id) => {
    if (b.type === 'barracks') {
      const q = gameState.military.trainingQueues.get(id) ?? [];
      if (q.length > 0) {
        const head = q[0];
        const pct = head.totalTime > 0 ? 1 - Math.max(0, head.timeRemaining) / head.totalTime : 0;
        productionCards.push({
          id: `barracks-${id}`,
          label: 'Barracks',
          now: head.soldierType,
          remaining: Math.max(0, head.timeRemaining),
          pct,
          queued: q.length - 1,
        });
      }
    }
    if (b.type === 'smithy') {
      const active = smithyCrafting.get(id);
      const queue = smithyQueue.get(id) ?? [];
      if (active || queue.length > 0) {
        const pct = active && active.totalTime > 0 ? 1 - Math.max(0, active.timeRemaining) / active.totalTime : 0;
        productionCards.push({
          id: `smithy-${id}`,
          label: 'Smithy',
          now: active ? active.recipe.output : queue[0],
          remaining: active ? Math.max(0, active.timeRemaining) : 0,
          pct,
          queued: active ? queue.length : Math.max(0, queue.length - 1),
        });
      }
    }
  });

  const priorityAlerts: Array<{ id: string; label: string; level: 'danger' | 'warn' | 'info' }> = [];
  if (raidActive) priorityAlerts.push({ id: 'raid', label: `Raid Active (${activeEnemies})`, level: 'danger' });
  if (gameState.resources.food < Math.max(10, Math.ceil(gameState.population * 0.4))) {
    priorityAlerts.push({ id: 'food', label: 'Low Food Supply', level: 'warn' });
  }
  if (idleCitizens > 0) priorityAlerts.push({ id: 'idle-workers', label: `${idleCitizens} Idle Workers`, level: 'info' });
  if (idleSoldiers > 0) priorityAlerts.push({ id: 'idle-soldiers', label: `${idleSoldiers} Idle Soldiers`, level: 'info' });

  return (
    <div className={classNames}>
      <TopBar onTimeScale={onTimeScale} />

      {productionCards.length > 0 && (
        <div className="rts-production-strip">
          {productionCards.slice(0, 4).map((card) => (
            <button
              key={card.id}
              className="rts-prod-card"
              onClick={() => {
                const buildingId = Number(card.id.split('-')[1]);
                if (!Number.isFinite(buildingId)) return;
                EventBus.emit('EntitySelected', { entityId: buildingId });
                gameState.ui.utilityDrawer = 'right';
                forceRerender((v) => v + 1);
              }}
              title={`Select ${card.label}`}
            >
              <div className="rts-prod-head">
                <span>{card.label}</span>
                <span>{card.queued > 0 ? `+${card.queued}` : ''}</span>
              </div>
              <div className="rts-prod-now">{card.now}{card.remaining > 0 ? ` · ${Math.ceil(card.remaining)}s` : ''}</div>
              <div className="rts-prod-bar"><span style={{ width: `${Math.round(card.pct * 100)}%` }} /></div>
            </button>
          ))}
        </div>
      )}

      <div className="rts-helper-rail">
        {priorityAlerts.length > 0 && (
          <div className="rts-priority-feed">
            {priorityAlerts.slice(0, 4).map((a) => (
              <span key={a.id} className={`rts-priority-chip ${a.level}`}>{a.label}</span>
            ))}
          </div>
        )}
        <div className="rts-helper-text">
          {buildMode ? `Placing ${String(buildMode).replace(/_/g, ' ')}. Left-click terrain to place.` : wallDrawMode ? 'Wall draw active. Click start and end points.' : selectedEntity !== null || selectedSoldierId !== null || multiSelected.length > 0 ? 'Selection active. Use command cards or right-click to issue orders.' : 'No selection. Choose a helper action to start.'}
        </div>
        <div className="rts-helper-actions">
          <button className="rts-helper-btn" onClick={onSelectIdleCitizen} disabled={idleCitizens <= 0}>Idle Worker</button>
          <button className="rts-helper-btn" onClick={onSelectIdleSoldier} disabled={idleSoldiers <= 0}>Idle Soldier</button>
          <button className="rts-helper-btn" onClick={() => toggleDrawer('left')}>Objectives</button>
          <button className="rts-helper-btn" onClick={() => toggleDrawer('right')}>Strategy</button>
        </div>
      </div>

      {(idleCitizens > 0 || idleSoldiers > 0) && (
        <div className="rts-idle-alerts">
          {idleCitizens > 0 && (
            <button className="rts-idle-chip" onClick={onSelectIdleCitizen} title="Select idle citizen">
              Idle Workers: {idleCitizens}
            </button>
          )}
          {idleSoldiers > 0 && (
            <button className="rts-idle-chip" onClick={onSelectIdleSoldier} title="Select idle soldier">
              Idle Soldiers: {idleSoldiers}
            </button>
          )}
        </div>
      )}

      <div className={`rts-utility-drawer left ${ui.utilityDrawer === 'left' ? 'open' : ''}`}>
        <LeftSidebar tick={tick} />
      </div>

      <div className={`rts-utility-drawer right ${ui.utilityDrawer === 'right' ? 'open' : ''}`}>
        <RightUtilityDock tick={tick} selectedEntity={selectedEntity} embedded />
      </div>

      <div className="rts-bottom-citadel">
        <button
          className={`rts-drawer-toggle left ${ui.utilityDrawer === 'left' ? 'active' : ''}`}
          onClick={() => toggleDrawer('left')}
          title="Objectives and Event Log"
        >
          <RtsIcon name="drawerLeft" className="rts-drawer-icon" />
        </button>

        <div className="rts-citadel-minimap">
          {raidActive && <div className="rts-citadel-alert">Raid · {activeEnemies}</div>}
          <Minimap tick={tick} onCameraMove={onCameraMove} embedded />
        </div>

        <BottomBand
          tick={tick}
          selectedEntity={selectedEntity}
          selectedSoldierId={selectedSoldierId}
          multiSelected={multiSelected}
          buildMode={buildMode}
          wallDrawMode={wallDrawMode}
          onSelectBuild={onSelectBuild}
          onWallDrawMode={onWallDrawMode}
          onClearSelection={onClearSelection}
          compact
        />

        <button
          className={`rts-drawer-toggle right ${ui.utilityDrawer === 'right' ? 'active' : ''}`}
          onClick={() => toggleDrawer('right')}
          title="Strategic Panels"
        >
          <RtsIcon name="drawerRight" className="rts-drawer-icon" />
        </button>
      </div>
    </div>
  );
};

export default GameLayout;
