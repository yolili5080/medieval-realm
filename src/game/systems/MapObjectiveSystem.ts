import { gameState } from '../core/GameState';
import type { MapObjective } from '../core/GameState';
import { EventBus } from '../core/EventBus';

const OBJECTIVE_TICK_INTERVAL = 60; // 4s @15Hz
let lastRewardTick = 0;

function spawnDefaultObjectives(): void {
  if (!gameState.pressure.firstObjectiveSpawned) return;
  if (gameState.mapObjectives.size > 0) return;
  const defs: Array<Omit<MapObjective, 'id'>> = [
    { type: 'relic', owner: 'neutral', captureProgress: 0, position: { x: 0, z: -70 }, bonus: { key: 'morale', value: 0.4 } },
    { type: 'watchpoint', owner: 'neutral', captureProgress: 0, position: { x: -80, z: 20 }, bonus: { key: 'vision', value: 1 } },
    { type: 'supply_cache', owner: 'neutral', captureProgress: 0, position: { x: 75, z: 55 }, bonus: { key: 'resource_tick', value: 4 } },
  ];
  defs.forEach((d, idx) => {
    const id = idx + 1;
    gameState.mapObjectives.set(id, { id, ...d });
    EventBus.emit('ObjectiveSpawned', { objectiveId: id, type: d.type });
  });
}

function nearbyCounts(x: number, z: number): { player: number; enemy: number } {
  let player = 0;
  let enemy = 0;

  gameState.military.soldierTransforms.forEach((t, id) => {
    const s = gameState.military.soldiers.get(id);
    if (!s || s.state === 'dead') return;
    const dx = t.x - x;
    const dz = t.z - z;
    if (dx * dx + dz * dz < 11 * 11) player++;
  });

  gameState.military.enemyTransforms.forEach((t, id) => {
    const e = gameState.military.enemies.get(id);
    if (!e || e.state === 'dead') return;
    const dx = t.x - x;
    const dz = t.z - z;
    if (dx * dx + dz * dz < 11 * 11) enemy++;
  });

  return { player, enemy };
}

function applyObjectiveIncome(): void {
  gameState.mapObjectives.forEach((o) => {
    if (o.owner !== 'player') return;
    if (o.bonus.key === 'resource_tick') {
      gameState.resources.food += o.bonus.value;
      gameState.resources.wood += Math.floor(o.bonus.value * 0.5);
    }
  });
}

export function runMapObjectiveSystem(_dt: number): void {
  if (gameState.paused || gameState.military.gameOver) return;
  spawnDefaultObjectives();

  gameState.mapObjectives.forEach((o) => {
    const counts = nearbyCounts(o.position.x, o.position.z);
    const prevOwner = o.owner;

    if (counts.player > counts.enemy && counts.player > 0) {
      o.captureProgress += 0.04 * Math.max(1, counts.player * 0.5);
    } else if (counts.enemy > counts.player && counts.enemy > 0) {
      o.captureProgress -= 0.04 * Math.max(1, counts.enemy * 0.5);
    } else if (o.captureProgress > 0.02) {
      o.captureProgress -= 0.01;
    } else if (o.captureProgress < -0.02) {
      o.captureProgress += 0.01;
    }

    if (o.captureProgress >= 1) o.owner = 'player';
    else if (o.captureProgress <= -1) o.owner = 'enemy';
    else if (Math.abs(o.captureProgress) < 0.08) o.owner = 'neutral';

    if (prevOwner !== o.owner) {
      if (o.owner === 'neutral') {
        EventBus.emit('ObjectiveLost', { objectiveId: o.id, previousOwner: prevOwner });
      } else {
        EventBus.emit('ObjectiveCaptured', { objectiveId: o.id, owner: o.owner });
      }
    }
  });

  if (gameState.tick - lastRewardTick >= OBJECTIVE_TICK_INTERVAL) {
    lastRewardTick = gameState.tick;
    applyObjectiveIncome();
  }
}
