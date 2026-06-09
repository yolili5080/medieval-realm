import React, { useMemo, useState } from 'react';
import { gameState, pushNotification } from '../../core/GameState';
import { EventBus } from '../../core/EventBus';
import { unassignCitizen } from '../../systems/JobAssignmentSystem';
import { RtsIcon } from './IconAtlas';

interface TopBarProps {
  onTimeScale: (scale: number) => void;
}

const TopBar: React.FC<TopBarProps> = ({ onTimeScale }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [laborOpen, setLaborOpen] = useState(false);
  const { resources, population, maxPopulation, gameTime, paused, timeScale, ui } = gameState;

  const dayPeriod = useMemo(() => {
    if (gameTime.hour >= 21 || gameTime.hour < 6) return 'night';
    if (gameTime.hour >= 18) return 'dusk';
    return 'day';
  }, [gameTime.hour]);

  const labourStats = useMemo(() => {
    const stats = { woodcutter: 0, farmer: 0, quarryman: 0, builder: 0, idle: 0, total: 0 };
    gameState.jobs.forEach((job, id) => {
      if (!gameState.citizens.has(id)) return;
      stats.total++;
      if (job.jobType === 'woodcutter') stats.woodcutter++;
      else if (job.jobType === 'farmer') stats.farmer++;
      else if (job.jobType === 'quarryman') stats.quarryman++;
      else if (job.jobType === 'builder') stats.builder++;
      else stats.idle++;
    });
    return stats;
  }, [population, gameTime.minute, gameTime.day]);

  const setUI = <K extends keyof typeof ui>(key: K, value: (typeof ui)[K]) => {
    (gameState.ui[key] as (typeof ui)[K]) = value;
    EventBus.emit('UISettingsChanged', {
      uiScale: gameState.ui.uiScale,
      colorblindMode: gameState.ui.colorblindMode,
      highContrastUI: gameState.ui.highContrastUI,
      motionMode: gameState.ui.motionMode,
      hudDensity: gameState.ui.hudDensity,
      drawerAutoCollapseMs: gameState.ui.drawerAutoCollapseMs,
      minimapPosition: gameState.ui.minimapPosition,
    });
  };

  const assignWorkerTo = (target: 'woodcutter' | 'farmer' | 'quarryman') => {
    const candidates = Array.from(gameState.jobs.entries())
      .filter(([id]) => gameState.citizens.has(id))
      .map(([id, job]) => ({ id, job }));

    const idleCandidate = candidates.find(({ job }) => job.jobType === 'idle' || job.actionState === 'idle');
    let selected = idleCandidate ?? null;
    if (!selected) {
      const donorType = (['woodcutter', 'farmer', 'quarryman'] as const)
        .filter((t) => t !== target)
        .sort((a, b) => labourStats[b] - labourStats[a])[0];
      selected = donorType ? candidates.find(({ job }) => job.jobType === donorType) ?? null : null;
    }

    if (!selected) {
      pushNotification('No worker available to reassign.', 'warning');
      return;
    }

    const { id, job } = selected;
    if (job.assignedBuildingId !== null) {
      const oldBuilding = gameState.buildings.get(job.assignedBuildingId);
      if (oldBuilding) oldBuilding.assignedWorkers = oldBuilding.assignedWorkers.filter((workerId) => workerId !== id);
    }
    job.jobType = target;
    job.actionState = 'idle';
    job.targetEntityId = null;
    job.assignedBuildingId = null;
    const citizen = gameState.citizens.get(id);
    if (citizen) citizen.workplaceId = null;
    pushNotification(`${target === 'woodcutter' ? 'Wood' : target === 'farmer' ? 'Food' : 'Stone'} worker assigned`, 'info');
  };

  const unassignWorkerFrom = (source: 'woodcutter' | 'farmer' | 'quarryman') => {
    const candidate = Array.from(gameState.jobs.entries())
      .find(([id, job]) => gameState.citizens.has(id) && job.jobType === source);
    if (!candidate) {
      pushNotification(`No ${source} worker to unassign.`, 'warning');
      return;
    }
    unassignCitizen(candidate[0]);
    pushNotification('Worker returned to idle pool', 'info');
  };

  const timeText = `${gameTime.hour.toString().padStart(2, '0')}:${gameTime.minute.toString().padStart(2, '0')}`;
  const activeEnemies = Array.from(gameState.military.enemies.values()).filter((e) => e.state !== 'dead').length;
  const raidActive = gameState.military.activeRaid && activeEnemies > 0;
  const characterMode = gameState.playerCharacter.controlActive;

  return (
    <div className="rts-topbar">
      <div className="rts-resource-strip">
        <div className="rts-resource-pill"><span><RtsIcon name="wood" className="rts-inline-icon" /></span><b>{resources.wood}</b><small>Wood</small></div>
        <div className="rts-resource-pill"><span><RtsIcon name="food" className="rts-inline-icon" /></span><b>{resources.food}</b><small>Food</small></div>
        <div className="rts-resource-pill"><span><RtsIcon name="stone" className="rts-inline-icon" /></span><b>{resources.stone}</b><small>Stone</small></div>
        <div className="rts-resource-pill"><span><RtsIcon name="population" className="rts-inline-icon" /></span><b>{population}/{maxPopulation}</b><small>Population</small></div>
        <button className={`rts-labor-toggle ${laborOpen ? 'active' : ''}`} title="Worker Assignment" onClick={() => setLaborOpen((v) => !v)}><RtsIcon name="worker" className="rts-btn-icon" /></button>
      </div>

      <div className="rts-topbar-center">
        <div className="rts-game-title">MEDIEVAL REALM</div>
        <div className={`rts-time ${dayPeriod}`}>{dayPeriod === 'night' ? '🌙' : dayPeriod === 'dusk' ? '🌆' : '☀️'} Day {gameTime.day} · {timeText}</div>
        {raidActive && <div className="rts-top-alert">Raid Active · {activeEnemies} Enemies</div>}
      </div>

      <div className="rts-topbar-actions">
        <button className={`rts-icon-btn ${paused ? 'active' : ''}`} title="Pause" onClick={() => onTimeScale(0)}><RtsIcon name="pause" className="rts-btn-icon" /></button>
        <button className={`rts-icon-btn ${!paused && timeScale === 1 ? 'active' : ''}`} title="1x" onClick={() => onTimeScale(1)}><RtsIcon name="play" className="rts-btn-icon" /></button>
        <button className={`rts-icon-btn ${!paused && timeScale === 2 ? 'active' : ''}`} title="2x" onClick={() => onTimeScale(2)}><RtsIcon name="playFast" className="rts-btn-icon" /></button>
        <button className={`rts-icon-btn ${!paused && timeScale === 4 ? 'active' : ''}`} title="4x" onClick={() => onTimeScale(4)}><RtsIcon name="playFaster" className="rts-btn-icon" /></button>
        <button
          className={`rts-icon-btn ${characterMode ? 'active' : ''}`}
          title="Toggle Character Control"
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
        >
          <RtsIcon name="thirdPerson" className="rts-btn-icon" />
        </button>
        <button className="rts-icon-btn" title="Save" onClick={() => EventBus.emit('SaveRequested', {})}><RtsIcon name="save" className="rts-btn-icon" /></button>
        <button className="rts-icon-btn" title="UI/Accessibility" onClick={() => setSettingsOpen((v) => !v)}><RtsIcon name="settings" className="rts-btn-icon" /></button>
      </div>

      {settingsOpen && (
        <div className="rts-settings-panel">
          <h4>UI and Accessibility</h4>
          <label>UI Scale
            <select value={ui.uiScale} onChange={(e) => setUI('uiScale', Number(e.target.value) as 1 | 1.25 | 1.5 | 1.75)}>
              <option value={1}>100%</option>
              <option value={1.25}>125%</option>
              <option value={1.5}>150%</option>
              <option value={1.75}>175%</option>
            </select>
          </label>
          <label>Colorblind
            <select value={ui.colorblindMode} onChange={(e) => setUI('colorblindMode', e.target.value as typeof ui.colorblindMode)}>
              <option value="off">Off</option>
              <option value="protanopia">Protanopia</option>
              <option value="deuteranopia">Deuteranopia</option>
              <option value="tritanopia">Tritanopia</option>
            </select>
          </label>
          <label>Motion
            <select value={ui.motionMode} onChange={(e) => setUI('motionMode', e.target.value as typeof ui.motionMode)}>
              <option value="normal">Normal</option>
              <option value="reduced">Reduced</option>
              <option value="minimal">Minimal</option>
            </select>
          </label>
          <label>HUD Density
            <select value={ui.hudDensity} onChange={(e) => setUI('hudDensity', e.target.value as typeof ui.hudDensity)}>
              <option value="compact">Compact</option>
              <option value="balanced">Balanced</option>
              <option value="dense">Dense</option>
            </select>
          </label>
          <label>Drawer Timeout
            <select value={String(ui.drawerAutoCollapseMs)} onChange={(e) => setUI('drawerAutoCollapseMs', Number(e.target.value))}>
              <option value="5000">5 seconds</option>
              <option value="8000">8 seconds</option>
              <option value="12000">12 seconds</option>
              <option value="20000">20 seconds</option>
            </select>
          </label>
          <label className="rts-check"><input type="checkbox" checked={ui.highContrastUI} onChange={(e) => setUI('highContrastUI', e.target.checked)} /> High Contrast</label>
          <label className="rts-check"><input type="checkbox" checked={ui.tutorialHintsEnabled} onChange={(e) => setUI('tutorialHintsEnabled', e.target.checked)} /> Tutorial Hints</label>
        </div>
      )}

      {laborOpen && (
        <div className="rts-worker-board">
          <div className="rts-worker-head">Worker Assignment</div>
          <div className="rts-worker-row">
            <span>Wood</span>
            <b>{labourStats.woodcutter}</b>
            <div>
              <button onClick={() => unassignWorkerFrom('woodcutter')}>-</button>
              <button onClick={() => assignWorkerTo('woodcutter')}>+</button>
            </div>
          </div>
          <div className="rts-worker-row">
            <span>Food</span>
            <b>{labourStats.farmer}</b>
            <div>
              <button onClick={() => unassignWorkerFrom('farmer')}>-</button>
              <button onClick={() => assignWorkerTo('farmer')}>+</button>
            </div>
          </div>
          <div className="rts-worker-row">
            <span>Stone</span>
            <b>{labourStats.quarryman}</b>
            <div>
              <button onClick={() => unassignWorkerFrom('quarryman')}>-</button>
              <button onClick={() => assignWorkerTo('quarryman')}>+</button>
            </div>
          </div>
          <div className="rts-worker-foot">Idle: {labourStats.idle} · Builders: {labourStats.builder}</div>
        </div>
      )}
    </div>
  );
};

export default TopBar;
