import { gameState, pushNotification } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import type { EnemyType } from '../core/EventBus';
import { ENEMY_DEFS } from '../core/MilitaryTypes';
import { getTerrainHeight } from '../core/Noise';

type Difficulty = 'easy' | 'standard' | 'hard';
const DIFF: Record<Difficulty, {
  gather: number;
  buildTime: number;
  trainTime: number;
  minScoutMinute: number;
  maxScoutMinute: number;
  minAttackMinute: number;
  attackCadenceTicks: [number, number];
  workerSpawnTicks: number;
}> = {
  easy: { gather: 0.82, buildTime: 1.25, trainTime: 1.2, minScoutMinute: 7, maxScoutMinute: 12, minAttackMinute: 14, attackCadenceTicks: [620, 780], workerSpawnTicks: 15 * 180 },
  standard: { gather: 1.0, buildTime: 1.0, trainTime: 1.0, minScoutMinute: 6, maxScoutMinute: 10, minAttackMinute: 10, attackCadenceTicks: [460, 620], workerSpawnTicks: 15 * 145 },
  hard: { gather: 1.2, buildTime: 0.85, trainTime: 0.85, minScoutMinute: 4, maxScoutMinute: 8, minAttackMinute: 8, attackCadenceTicks: [330, 500], workerSpawnTicks: 15 * 120 },
};

function inferSpawnSide(x: number, z: number): 'north' | 'south' | 'east' | 'west' {
  if (Math.abs(x) > Math.abs(z)) return x > 0 ? 'east' : 'west';
  return z > 0 ? 'south' : 'north';
}

function randTick(minTicks: number, maxTicks: number): number {
  return Math.floor(minTicks + Math.random() * (maxTicks - minTicks));
}

function moveToward(pos: { x: number; y: number; z: number; rotation: number }, tx: number, tz: number, speed: number, dt: number): boolean {
  const dx = tx - pos.x;
  const dz = tz - pos.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < 0.35 * 0.35) return true;
  const d = Math.sqrt(d2);
  const step = Math.min(d, speed * dt);
  pos.x += (dx / d) * step;
  pos.z += (dz / d) * step;
  pos.y = getTerrainHeight(pos.x, pos.z);
  pos.rotation = Math.atan2(dx, dz);
  return false;
}

function minutesFromStart(): number {
  return (gameState.gameTime.day - 1) * 24 * 60 + gameState.gameTime.hour * 60 + gameState.gameTime.minute - 8 * 60;
}

function scorePlayerPower(): number {
  const soldiers = Array.from(gameState.military.soldiers.values()).filter((s) => s.state !== 'dead').length;
  const population = gameState.population;
  let walls = 0;
  for (const w of gameState.walls) if (w.hp > 0) walls++;
  let militaryBuildings = 0;
  gameState.buildings.forEach((b) => {
    if (b.state === 'active' && (b.type === 'barracks' || b.type === 'tower' || b.type === 'guard_post')) militaryBuildings++;
  });
  return soldiers * 2.0 + population * 0.35 + walls * 0.08 + militaryBuildings * 1.4 + gameState.gameTime.day * 0.45;
}

function buildVisual(type: 'town_center' | 'house' | 'farm_field' | 'barracks' | 'tower', x: number, z: number): void {
  const ef = gameState.enemyFaction;
  const hpByType: Record<'town_center' | 'house' | 'farm_field' | 'barracks' | 'tower', number> = {
    town_center: ef.baseMaxHp,
    house: 240,
    farm_field: 180,
    barracks: 420,
    tower: 360,
  };
  const maxHp = hpByType[type];
  ef.visualStructures.push({ id: ef.nextStructureId++, type, x, z, hp: maxHp, maxHp, state: 'active' });
}

function spawnWorker(x: number, z: number): void {
  const ef = gameState.enemyFaction;
  const id = ef.nextWorkerId++;
  ef.workerEntities.set(id, {
    id,
    x,
    y: getTerrainHeight(x, z),
    z,
    rotation: 0,
    speed: 2.6 + Math.random() * 0.6,
    state: 'idle',
    task: 'idle',
    targetResourceId: null,
    targetBuildType: null,
    targetX: null,
    targetZ: null,
    carryType: null,
    carryAmount: 0,
    gatherTimer: 0,
  });
  ef.workers.add(id);
}

function spawnEnemyUnit(type: EnemyType, x: number, z: number, behavior: 'scout' | 'combat' = 'combat'): number {
  const { military } = gameState;
  const def = ENEMY_DEFS[type];
  const eid = ++military.enemyIdCounter;
  const spawnSide = inferSpawnSide(gameState.enemyFaction.basePosition.x, gameState.enemyFaction.basePosition.z);
  military.enemies.set(eid, {
    enemyType: type,
    hp: def.hp,
    maxHp: def.hp,
    attack: def.attack,
    attackRange: def.attackRange,
    attackCooldown: def.attackCooldown,
    attackTimer: 0,
    speed: def.speed,
    state: 'marching',
    targetId: null,
    spawnSide,
    animTimer: 0,
    spawnTick: gameState.tick,
    behavior,
  });
  military.enemyTransforms.set(eid, { x, z, y: getTerrainHeight(x, z), rotation: 0 });
  EventBus.emit('EnemySpawned', { enemyId: eid, enemyType: type });
  return eid;
}

function spawnFormation(composition: EnemyType[], originX: number, originZ: number, behavior: 'scout' | 'combat'): number[] {
  const ids: number[] = [];
  const heading = Math.atan2(-originX, -originZ);
  const rightX = Math.sin(heading + Math.PI / 2);
  const rightZ = Math.cos(heading + Math.PI / 2);
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const rowSize = Math.max(2, Math.ceil(Math.sqrt(composition.length)));

  composition.forEach((type, i) => {
    const row = Math.floor(i / rowSize);
    const col = i % rowSize;
    const lateral = (col - (rowSize - 1) * 0.5) * 2.4;
    const depth = row * 2.1;
    const jitterX = (Math.random() - 0.5) * 1.1;
    const jitterZ = (Math.random() - 0.5) * 1.1;
    const x = originX + rightX * lateral - forwardX * depth + jitterX;
    const z = originZ + rightZ * lateral - forwardZ * depth + jitterZ;
    ids.push(spawnEnemyUnit(type, x, z, behavior));
  });
  return ids;
}

export function launchEnemyWave(composition: EnemyType[], reason: string): boolean {
  const ef = gameState.enemyFaction;
  if (ef.destroyed || composition.length === 0) return false;
  const isScout = reason === 'scout';
  if (isScout && !ef.progress.scoutPostBuilt) return false;
  if (!isScout && !ef.progress.barracksBuilt) return false;

  const spawnPoint = ef.barracksPosition ?? ef.basePosition;
  const ids = spawnFormation(composition, spawnPoint.x, spawnPoint.z, isScout ? 'scout' : 'combat');
  ids.forEach((id) => ef.militaryUnits.add(id));
  if (isScout) {
    ids.forEach((id) => ef.scoutUnitIds.add(id));
    gameState.pressure.scoutSent = true;
    EventBus.emit('PressureEventStarted', { id: 'scout', message: 'Enemy scout reported near your realm.' });
    pushNotification('Enemy scout patrol detected near your borders.', 'warning');
  } else {
    ef.lastAttackTick = gameState.tick;
    ef.progress.firstAttackLaunched = true;
    gameState.pressure.firstHarassSent = true;
  }
  EventBus.emit('EnemyWaveLaunched', { composition, reason });
  return true;
}

function scheduleScoutWindow(): void {
  const ef = gameState.enemyFaction;
  const diff = DIFF[ef.difficulty];
  ef.ai.nextScoutTick = gameState.tick + randTick(15 * 60 * diff.minScoutMinute, 15 * 60 * diff.maxScoutMinute);
}

function initEnemyFactionIfNeeded(): void {
  const ef = gameState.enemyFaction;
  if (ef.baseEntityId !== null) return;
  ef.baseEntityId = -1;
  ef.basePosition = { x: 86, z: -86 };
  ef.difficulty = ef.difficulty ?? 'standard';
  ef.ai.seededVariance = Math.random();
  ef.ai.nextAttackDecisionTick = gameState.tick + randTick(15 * 120, 15 * 210);
  ef.ai.nextExpansionTick = gameState.tick + randTick(15 * 220, 15 * 420);
  buildVisual('town_center', ef.basePosition.x, ef.basePosition.z);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spawnWorker(ef.basePosition.x + Math.cos(a) * 2.8, ef.basePosition.z + Math.sin(a) * 2.8);
  }

  EventBus.emit('EnemyBaseSpawned', { x: ef.basePosition.x, z: ef.basePosition.z });
  pushNotification('Scouts report an enemy settlement to the northeast.', 'warning');
}

function findNearestResource(workerX: number, workerZ: number, kind: 'wood' | 'stone'): { id: number; x: number; z: number } | null {
  let best: { id: number; x: number; z: number; d2: number } | null = null;
  gameState.resourceNodes.forEach((n, id) => {
    if (n.depleted) return;
    if (n.resourceType !== kind) return;
    const t = gameState.transforms.get(id);
    if (!t) return;
    const dx = t.x - workerX;
    const dz = t.z - workerZ;
    const d2 = dx * dx + dz * dz;
    if (!best || d2 < best.d2) best = { id, x: t.x, z: t.z, d2 };
  });
  return best ? { id: best.id, x: best.x, z: best.z } : null;
}

function currentBuildSite(type: 'house' | 'farm' | 'tower' | 'barracks'): { x: number; z: number } {
  const b = gameState.enemyFaction.basePosition;
  if (type === 'house') return { x: b.x + 8, z: b.z - 3 };
  if (type === 'farm') return { x: b.x + 5, z: b.z + 10 };
  if (type === 'tower') return { x: b.x - 10, z: b.z - 2 };
  return { x: b.x - 8, z: b.z + 6 };
}

function assignLabourPlan(): void {
  const ef = gameState.enemyFaction;
  const total = Math.max(1, ef.workerEntities.size);
  if (!ef.progress.houseBuilt) ef.labour.assignments = { wood: Math.max(1, total - 1), food: 1, stone: 0, builder: 0 };
  else if (!ef.progress.farmBuilt) ef.labour.assignments = { wood: Math.max(1, total - 2), food: 1, stone: 1, builder: 0 };
  else if (!ef.progress.scoutPostBuilt) ef.labour.assignments = { wood: Math.max(1, total - 2), food: 1, stone: 1, builder: 0 };
  else if (!ef.progress.barracksBuilt) ef.labour.assignments = { wood: Math.max(1, total - 2), food: 1, stone: 1, builder: 0 };
  else ef.labour.assignments = { wood: Math.max(1, total - 3), food: 2, stone: 1, builder: 0 };
}

function chooseTask(workerId: number): 'wood' | 'food' | 'stone' | 'build' {
  const ef = gameState.enemyFaction;
  if (ef.buildQueue.length > 0) {
    const builders = Array.from(ef.workerEntities.values()).filter((w) => w.task === 'build' && w.state !== 'idle').length;
    if (builders < Math.min(2, ef.workerEntities.size)) return 'build';
  }

  const counters = { wood: 0, food: 0, stone: 0 };
  ef.workerEntities.forEach((w) => {
    if (w.task === 'wood') counters.wood++;
    else if (w.task === 'food') counters.food++;
    else if (w.task === 'stone') counters.stone++;
  });
  const want = ef.labour.assignments;
  if (counters.wood < want.wood) return 'wood';
  if (counters.food < want.food) return 'food';
  return 'stone';
}

function updateWorker(workerId: number, dt: number): void {
  const ef = gameState.enemyFaction;
  const diff = DIFF[ef.difficulty];
  const w = ef.workerEntities.get(workerId);
  if (!w) return;

  if (w.state === 'idle') {
    w.task = chooseTask(workerId);
    if (w.task === 'build' && ef.buildQueue.length > 0) {
      const buildType = ef.buildQueue[0].type;
      const site = currentBuildSite(buildType);
      w.targetBuildType = buildType;
      w.targetX = site.x;
      w.targetZ = site.z;
      w.state = 'moving_to_build';
      return;
    }
    if (w.task === 'food') {
      const farm = ef.visualStructures.find((s) => s.type === 'farm_field');
      const site = farm ? { x: farm.x, z: farm.z } : { x: ef.basePosition.x + 5, z: ef.basePosition.z + 10 };
      w.targetX = site.x;
      w.targetZ = site.z;
      w.targetResourceId = null;
      w.state = 'moving_to_resource';
      return;
    }
    const res = findNearestResource(w.x, w.z, w.task === 'wood' ? 'wood' : 'stone');
    if (!res) return;
    w.targetResourceId = res.id;
    w.targetX = res.x;
    w.targetZ = res.z;
    w.state = 'moving_to_resource';
    return;
  }

  if (w.state === 'moving_to_resource') {
    if (w.targetX === null || w.targetZ === null) {
      w.state = 'idle';
      return;
    }
    const arrived = moveToward(w, w.targetX, w.targetZ, w.speed, dt);
    if (arrived) {
      w.gatherTimer = 0;
      w.state = 'gathering';
    }
    return;
  }

  if (w.state === 'gathering') {
    const gatherDur = w.task === 'food' ? 3.8 : 4.6;
    w.gatherTimer += dt * diff.gather;
    if (w.gatherTimer < gatherDur) return;
    w.gatherTimer = 0;
    const amount = w.task === 'food' ? 2 : 1;
    if (w.task === 'wood' || w.task === 'stone') {
      if (w.targetResourceId !== null) {
        const node = gameState.resourceNodes.get(w.targetResourceId);
        if (node && !node.depleted && node.amount > 0) {
          node.amount = Math.max(0, node.amount - amount);
          if (node.amount <= 0) node.depleted = true;
          w.carryAmount = amount;
          w.carryType = w.task;
        } else {
          w.state = 'idle';
          return;
        }
      }
    } else {
      w.carryAmount = amount;
      w.carryType = 'food';
    }
    w.state = 'returning';
    return;
  }

  if (w.state === 'returning') {
    const base = ef.basePosition;
    const arrived = moveToward(w, base.x, base.z, w.speed * 1.05, dt);
    if (!arrived) return;
    if (w.carryType) {
      ef.resources[w.carryType] += w.carryAmount;
    }
    w.carryType = null;
    w.carryAmount = 0;
    w.targetResourceId = null;
    w.targetX = null;
    w.targetZ = null;
    w.state = 'idle';
    return;
  }

  if (w.state === 'moving_to_build') {
    if (ef.buildQueue.length === 0) {
      w.state = 'idle';
      return;
    }
    const q = ef.buildQueue[0];
    const site = currentBuildSite(q.type);
    w.targetBuildType = q.type;
    w.targetX = site.x;
    w.targetZ = site.z;
    const arrived = moveToward(w, site.x, site.z, w.speed * 0.95, dt);
    if (arrived) w.state = 'building';
    return;
  }

  if (w.state === 'building') {
    if (ef.buildQueue.length === 0) {
      w.state = 'idle';
      return;
    }
    const q = ef.buildQueue[0];
    const site = currentBuildSite(q.type);
    const dx = site.x - w.x;
    const dz = site.z - w.z;
    if (dx * dx + dz * dz > 1.6 * 1.6) {
      w.state = 'moving_to_build';
      return;
    }
    q.timeRemaining -= dt * (0.9 + diff.gather * 0.3);
  }
}

function queueBuildIfAffordable(type: 'house' | 'farm' | 'tower' | 'barracks', wood: number, stone: number, baseTime: number): boolean {
  const ef = gameState.enemyFaction;
  const diff = DIFF[ef.difficulty];
  if (ef.resources.wood < wood || ef.resources.stone < stone) return false;
  if (ef.buildQueue.some((b) => b.type === type)) return false;
  ef.resources.wood -= wood;
  ef.resources.stone -= stone;
  const site = currentBuildSite(type);
  ef.buildQueue.push({
    type,
    cost: { wood, stone },
    timeRemaining: baseTime * diff.buildTime * (0.92 + Math.random() * 0.2),
    x: site.x,
    z: site.z,
  });
  return true;
}

function updateBuildOrders(): void {
  const ef = gameState.enemyFaction;
  if (ef.buildQueue.length > 0) return;
  if (!ef.progress.houseBuilt) {
    queueBuildIfAffordable('house', 30, 0, 70);
    return;
  }
  if (!ef.progress.farmBuilt) {
    queueBuildIfAffordable('farm', 46, 0, 80);
    return;
  }
  if (!ef.progress.scoutPostBuilt) {
    queueBuildIfAffordable('tower', 34, 16, 95);
    return;
  }
  if (!ef.progress.barracksBuilt) {
    queueBuildIfAffordable('barracks', 65, 45, 120);
    return;
  }

  if (gameState.tick >= ef.ai.nextExpansionTick) {
    ef.ai.nextExpansionTick = gameState.tick + randTick(15 * 230, 15 * 420);
    if (Math.random() < 0.62) queueBuildIfAffordable('house', 40, 0, 85);
    else queueBuildIfAffordable('farm', 45, 0, 88);
  }
}

function finishBuilding(type: 'house' | 'farm' | 'barracks' | 'tower'): void {
  const ef = gameState.enemyFaction;
  if (type === 'house') {
    ef.progress.houseBuilt = true;
    buildVisual('house', ef.basePosition.x + 8, ef.basePosition.z - 3);
  } else if (type === 'farm') {
    ef.progress.farmBuilt = true;
    buildVisual('farm_field', ef.basePosition.x + 5, ef.basePosition.z + 10);
  } else if (type === 'tower') {
    ef.progress.scoutPostBuilt = true;
    buildVisual('tower', ef.basePosition.x - 10, ef.basePosition.z - 2);
    scheduleScoutWindow();
  } else if (type === 'barracks') {
    ef.progress.barracksBuilt = true;
    ef.barracksBuiltTick = gameState.tick;
    ef.barracksPosition = { x: ef.basePosition.x - 8, z: ef.basePosition.z + 6 };
    buildVisual('barracks', ef.barracksPosition.x, ef.barracksPosition.z);
    if (!ef.progress.wallsBuilt) {
      const cx = ef.basePosition.x;
      const cz = ef.basePosition.z;
      const r = 14;
      const pts: Array<[number, number]> = [[cx - r, cz - r], [cx + r, cz - r], [cx + r, cz + r], [cx - r, cz + r]];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        gameState.walls.push({
          id: gameState.nextWallId++,
          startX: a[0],
          startZ: a[1],
          endX: b[0],
          endZ: b[1],
          hp: 220,
          maxHp: 220,
          isGate: i === 0,
          gateOpen: i === 0,
        });
      }
      ef.progress.wallsBuilt = true;
    }
    pushNotification('Enemy barracks completed. Military production detected.', 'warning');
  }
  EventBus.emit('EnemyBuildingPlaced', { type, x: ef.basePosition.x, z: ef.basePosition.z });
}

function updateConstructionAndQueues(dt: number): void {
  const ef = gameState.enemyFaction;
  if (ef.buildQueue.length > 0 && ef.buildQueue[0].timeRemaining <= 0) {
    const done = ef.buildQueue.shift()!;
    finishBuilding(done.type);
  }
  const diff = DIFF[ef.difficulty];
  ef.trainQueue.forEach((t) => (t.timeRemaining -= dt * (1 / diff.trainTime)));
}

function maybeGrowWorkers(): void {
  const ef = gameState.enemyFaction;
  const diff = DIFF[ef.difficulty];
  if (!ef.progress.houseBuilt) return;
  if (ef.workerEntities.size >= 16) return;
  if (gameState.tick - ef.labour.lastGrowthTick < diff.workerSpawnTicks) return;
  if (ef.resources.food < 12) return;
  ef.resources.food -= 12;
  ef.labour.lastGrowthTick = gameState.tick;
  const a = Math.random() * Math.PI * 2;
  spawnWorker(ef.basePosition.x + Math.cos(a) * 3.1, ef.basePosition.z + Math.sin(a) * 3.1);
}

function updateMilitaryProduction(): void {
  const ef = gameState.enemyFaction;
  if (!ef.progress.barracksBuilt) return;
  const ready = ef.trainQueue.filter((q) => q.timeRemaining <= 0).slice(0, 2);
  if (ready.length > 0) {
    ef.trainQueue = ef.trainQueue.filter((q) => q.timeRemaining > 0);
    launchEnemyWave(ready.map((r) => r.type), 'enemy-trained');
  }

  const currentArmy = Array.from(ef.militaryUnits.values()).filter((id) => {
    const e = gameState.military.enemies.get(id);
    return !!e && e.state !== 'dead';
  }).length;
  const playerPower = scorePlayerPower();
  const desiredArmy = Math.min(24, Math.max(4, Math.floor(playerPower * (ef.difficulty === 'hard' ? 0.95 : ef.difficulty === 'easy' ? 0.55 : 0.75))));
  const need = Math.max(0, desiredArmy - currentArmy - ef.trainQueue.length);
  if (need <= 0) return;

  const trainNow = Math.min(need, 2);
  for (let i = 0; i < trainNow; i++) {
    const roll = Math.random();
    let type: EnemyType = 'raider';
    if (ef.difficulty === 'hard' && roll > 0.78 && ef.resources.stone >= 45) type = 'siege_archer';
    else if (roll > 0.66) type = 'berserker';

    const foodCost = type === 'raider' ? 18 : type === 'berserker' ? 22 : 20;
    const woodCost = type === 'siege_archer' ? 8 : 5;
    const stoneCost = type === 'siege_archer' ? 45 : 0;
    if (ef.resources.food < foodCost || ef.resources.wood < woodCost || ef.resources.stone < stoneCost) break;
    ef.resources.food -= foodCost;
    ef.resources.wood -= woodCost;
    ef.resources.stone -= stoneCost;
    ef.trainQueue.push({ type, timeRemaining: type === 'raider' ? 14 : type === 'berserker' ? 19 : 22 });
  }
}

function maybeLaunchScout(): void {
  const ef = gameState.enemyFaction;
  if (!ef.progress.scoutPostBuilt || ef.progress.scoutCompleted) return;
  if (gameState.tick < ef.ai.nextScoutTick) return;
  if (!launchEnemyWave(['raider'], 'scout')) {
    ef.ai.nextScoutTick = gameState.tick + randTick(15 * 50, 15 * 95);
  }
}

function maybeLaunchAttackPulse(): void {
  const ef = gameState.enemyFaction;
  if (!ef.progress.barracksBuilt || !ef.progress.scoutCompleted) return;
  const diff = DIFF[ef.difficulty];
  if (minutesFromStart() < diff.minAttackMinute) return;
  if (gameState.tick < ef.ai.nextAttackDecisionTick) return;
  if (gameState.military.enemies.size > 42) {
    ef.ai.nextAttackDecisionTick = gameState.tick + randTick(15 * 50, 15 * 90);
    return;
  }

  const playerPower = scorePlayerPower();
  const enemyArmy = Array.from(ef.militaryUnits.values()).filter((id) => {
    const e = gameState.military.enemies.get(id);
    return !!e && e.state !== 'dead';
  }).length;
  const aggression = ef.difficulty === 'hard' ? 1.05 : ef.difficulty === 'easy' ? 0.72 : 0.86;
  const shouldAttack = enemyArmy >= Math.max(2, Math.floor(playerPower * 0.18 * aggression)) && Math.random() < (0.52 + aggression * 0.2);
  if (shouldAttack) {
    const comp: EnemyType[] = [];
    const count = enemyArmy >= 10 ? 4 : enemyArmy >= 6 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      if (r > 0.86 && ef.difficulty !== 'easy') comp.push('siege_archer');
      else if (r > 0.58) comp.push('berserker');
      else comp.push('raider');
    }
    launchEnemyWave(comp, 'pressure-pulse');
  }
  const [cMin, cMax] = diff.attackCadenceTicks;
  ef.ai.nextAttackDecisionTick = gameState.tick + randTick(cMin, cMax);
}

function applyBaseDamageFromPlayerPresence(dt: number): void {
  const ef = gameState.enemyFaction;
  if (ef.destroyed) return;
  let nearbySoldiers = 0;
  gameState.military.soldierTransforms.forEach((t, id) => {
    const s = gameState.military.soldiers.get(id);
    if (!s || s.state === 'dead') return;
    const dx = t.x - ef.basePosition.x;
    const dz = t.z - ef.basePosition.z;
    if (dx * dx + dz * dz < 12 * 12) nearbySoldiers++;
  });
  if (nearbySoldiers <= 0) return;
  ef.baseHp = Math.max(0, ef.baseHp - nearbySoldiers * 5.2 * dt);
  if (ef.baseHp > 0) return;
  ef.destroyed = true;
  ef.trainQueue = [];
  ef.buildQueue = [];
  pushNotification('Enemy faction destroyed. Frontline pressure collapsed.', 'success');
  EventBus.emit('EnemyFactionDestroyed', {});
}

export function runEnemyFactionSystem(dt: number): void {
  if (gameState.paused || gameState.military.gameOver) return;
  const eff = dt * gameState.timeScale;
  const ef = gameState.enemyFaction;
  initEnemyFactionIfNeeded();
  if (ef.destroyed) return;

  ef.militaryUnits.forEach((id) => {
    const e = gameState.military.enemies.get(id);
    if (!e || e.state === 'dead') ef.militaryUnits.delete(id);
  });
  ef.scoutUnitIds.forEach((id) => {
    const e = gameState.military.enemies.get(id);
    if (!e || e.state === 'dead') ef.scoutUnitIds.delete(id);
  });
  if (gameState.pressure.scoutSent && !ef.progress.scoutCompleted && ef.scoutUnitIds.size === 0) {
    ef.progress.scoutCompleted = true;
  }

  const dayPressure = 1 + Math.floor(gameState.gameTime.day / 4);
  const playerPressure = Math.floor(scorePlayerPower() / 12);
  ef.threatLevel = Math.min(8, Math.max(1, dayPressure + playerPressure));

  assignLabourPlan();
  ef.workerEntities.forEach((_, workerId) => updateWorker(workerId, eff));
  updateBuildOrders();
  updateConstructionAndQueues(eff);
  maybeGrowWorkers();
  maybeLaunchScout();
  updateMilitaryProduction();
  maybeLaunchAttackPulse();
  applyBaseDamageFromPlayerPresence(eff);
}
