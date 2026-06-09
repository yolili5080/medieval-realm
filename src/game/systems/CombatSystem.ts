import { gameState, pushNotification } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import type { EnemyComponent, SoldierComponent } from '../core/MilitaryTypes';
import { BUILDING_MAX_HP, SOLDIER_DEFS } from '../core/MilitaryTypes';
import { getTerrainHeight } from '../core/Noise';
import { awardKillXP } from './UnitExperienceSystem';
import { getDamageMultiplier } from './TerrainGameplaySystem';

const SOLDIER_DETECT_RANGE = 12;
const ARRIVAL_THRESHOLD = 1.2;
const ENEMY_SEPARATION_RADIUS = 1.6;
const ENEMY_SEPARATION_STRENGTH = 5.0;
const ENEMY_SOLDIER_SEPARATION_RADIUS = 0.9;

function moveUnitToward(
  transform: { x: number; z: number; y: number; rotation: number },
  tx: number,
  tz: number,
  speed: number,
  dt: number
): boolean {
  const dx = tx - transform.x;
  const dz = tz - transform.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < ARRIVAL_THRESHOLD) return true;

  const ratio = Math.min((speed * dt) / dist, 1.0);
  transform.x += dx * ratio;
  transform.z += dz * ratio;
  transform.y = getTerrainHeight(transform.x, transform.z);
  transform.rotation = Math.atan2(dx, dz);
  return false;
}

function applyEnemySeparation(enemyId: number, et: { x: number; z: number; y: number; rotation: number }, dt: number): void {
  let pushX = 0;
  let pushZ = 0;
  const r2 = ENEMY_SEPARATION_RADIUS * ENEMY_SEPARATION_RADIUS;
  const rs2 = ENEMY_SOLDIER_SEPARATION_RADIUS * ENEMY_SOLDIER_SEPARATION_RADIUS;

  gameState.military.enemyTransforms.forEach((ot, oid) => {
    if (oid === enemyId) return;
    const oe = gameState.military.enemies.get(oid);
    if (!oe || oe.state === 'dead') return;
    const dx = et.x - ot.x;
    const dz = et.z - ot.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= 0.0001 || d2 > r2) return;
    const inv = 1 / Math.sqrt(d2);
    const weight = (ENEMY_SEPARATION_RADIUS - Math.sqrt(d2)) / ENEMY_SEPARATION_RADIUS;
    pushX += dx * inv * weight;
    pushZ += dz * inv * weight;
  });

  gameState.military.soldierTransforms.forEach((st, sid) => {
    const s = gameState.military.soldiers.get(sid);
    if (!s || s.state === 'dead') return;
    const dx = et.x - st.x;
    const dz = et.z - st.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= 0.0001 || d2 > rs2) return;
    const inv = 1 / Math.sqrt(d2);
    const weight = (ENEMY_SOLDIER_SEPARATION_RADIUS - Math.sqrt(d2)) / ENEMY_SOLDIER_SEPARATION_RADIUS;
    pushX += dx * inv * weight * 0.7;
    pushZ += dz * inv * weight * 0.7;
  });

  if (pushX === 0 && pushZ === 0) return;
  et.x += pushX * ENEMY_SEPARATION_STRENGTH * dt;
  et.z += pushZ * ENEMY_SEPARATION_STRENGTH * dt;
  et.y = getTerrainHeight(et.x, et.z);
}

function findNearestEnemy(sx: number, sz: number, range: number): number | null {
  let bestId: number | null = null;
  let bestDist = range * range;
  gameState.military.enemies.forEach((e, id) => {
    if (e.state === 'dead') return;
    const et = gameState.military.enemyTransforms.get(id);
    if (!et) return;
    const dx = et.x - sx;
    const dz = et.z - sz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDist) {
      bestDist = d2;
      bestId = id;
    }
  });
  return bestId;
}

function findNearestEnemyWorker(sx: number, sz: number, range: number): number | null {
  let bestId: number | null = null;
  let bestDist = range * range;
  gameState.enemyFaction.workerEntities.forEach((w, id) => {
    const dx = w.x - sx;
    const dz = w.z - sz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDist) {
      bestDist = d2;
      bestId = id;
    }
  });
  return bestId;
}

function findNearestEnemyStructure(sx: number, sz: number, range: number): number | null {
  let bestId: number | null = null;
  let bestDist = range * range;
  gameState.enemyFaction.visualStructures.forEach((s) => {
    if (s.state !== 'active' || (s.hp ?? s.maxHp ?? 1) <= 0) return;
    const dx = s.x - sx;
    const dz = s.z - sz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDist) {
      bestDist = d2;
      bestId = s.id;
    }
  });
  return bestId;
}

function findNearestSoldier(ex: number, ez: number, range: number): number | null {
  let bestId: number | null = null;
  let bestDist = range * range;
  gameState.military.soldiers.forEach((s, id) => {
    if (s.state === 'dead') return;
    const st = gameState.military.soldierTransforms.get(id);
    if (!st) return;
    const dx = st.x - ex;
    const dz = st.z - ez;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDist) {
      bestDist = d2;
      bestId = id;
    }
  });
  return bestId;
}

function findNearestCitizen(ex: number, ez: number, range: number): number | null {
  let bestId: number | null = null;
  let bestDist = range * range;
  gameState.citizens.forEach((_, id) => {
    const t = gameState.transforms.get(id);
    if (!t) return;
    const dx = t.x - ex;
    const dz = t.z - ez;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDist) {
      bestDist = d2;
      bestId = id;
    }
  });
  return bestId;
}

function getBuildingHp(buildingId: number): number {
  const { buildingHp } = gameState.military;
  if (!buildingHp.has(buildingId)) {
    const b = gameState.buildings.get(buildingId);
    const maxHp = BUILDING_MAX_HP[b?.type ?? ''] ?? 200;
    buildingHp.set(buildingId, maxHp);
  }
  return buildingHp.get(buildingId)!;
}

function damageBuildingById(buildingId: number, damage: number): void {
  const currentHp = getBuildingHp(buildingId);
  const newHp = Math.max(0, currentHp - damage);
  gameState.military.buildingHp.set(buildingId, newHp);
  EventBus.emit('BuildingDamaged', { buildingId, damage, hp: newHp });

  if (newHp > 0) return;

  EventBus.emit('BuildingDestroyed', { buildingId });
  const b = gameState.buildings.get(buildingId);
  if (b?.type === 'town_center') {
    gameState.military.gameOver = true;
    EventBus.emit('GameOver', { won: false, day: gameState.gameTime.day });
    pushNotification('Your Town Center has been destroyed.', 'error');
    return;
  }

  const def = b?.type ?? 'building';
  gameState.buildings.delete(buildingId);
  gameState.resourceNodes.delete(buildingId);
  gameState.isResourceNode.delete(buildingId);
  gameState.transforms.delete(buildingId);
  gameState.renders.delete(buildingId);
  gameState.selectables.delete(buildingId);
  gameState.isBuilding.delete(buildingId);
  gameState.military.buildingHp.delete(buildingId);
  pushNotification(`${def} destroyed by enemies.`, 'error');
}

function getCitizenHp(citizenId: number): number {
  const map = gameState.military.citizenHp;
  if (!map.has(citizenId)) map.set(citizenId, 38);
  return map.get(citizenId)!;
}

function killCitizen(citizenId: number): void {
  const cit = gameState.citizens.get(citizenId);
  const name = cit?.name ?? 'A citizen';
  gameState.citizens.delete(citizenId);
  gameState.transforms.delete(citizenId);
  gameState.movements.delete(citizenId);
  gameState.paths.delete(citizenId);
  gameState.jobs.delete(citizenId);
  gameState.inventories.delete(citizenId);
  gameState.renders.delete(citizenId);
  gameState.selectables.delete(citizenId);
  gameState.isCitizen.delete(citizenId);
  gameState.military.citizenHp.delete(citizenId);
  gameState.population = Math.max(0, gameState.population - 1);
  if (gameState.selectedEntity === citizenId) {
    gameState.selectedEntity = null;
    EventBus.emit('EntitySelected', { entityId: null });
  }
  pushNotification(`${name} was slain by enemy raiders.`, 'error');
  EventBus.emit('PopulationChanged', { delta: -1 });
}

function damageCitizenById(citizenId: number, damage: number): void {
  if (!gameState.citizens.has(citizenId)) return;
  const hp = Math.max(0, getCitizenHp(citizenId) - damage);
  gameState.military.citizenHp.set(citizenId, hp);
  if (hp <= 0) killCitizen(citizenId);
}

function findTownCenterPosition(): { x: number; z: number } | null {
  let pos: { x: number; z: number } | null = null;
  gameState.buildings.forEach((b, id) => {
    if (pos || b.type !== 'town_center') return;
    const t = gameState.transforms.get(id);
    if (t) pos = { x: t.x, z: t.z };
  });
  return pos;
}

function damageHero(damage: number): void {
  const pc = gameState.playerCharacter;
  pc.hp = Math.max(0, pc.hp - damage);
  if (pc.hp > 0) return;

  const tc = findTownCenterPosition();
  pc.hp = pc.maxHp;
  pc.controlActive = false;
  pc.aiMode = true;
  if (tc) {
    pc.x = tc.x + 2;
    pc.z = tc.z + 2;
    pc.y = getTerrainHeight(pc.x, pc.z);
  }
  pushNotification('Hero was downed and retreated to town center.', 'warning');
}

function damageEnemyWorkerById(workerId: number, damage: number): void {
  const w = gameState.enemyFaction.workerEntities.get(workerId);
  if (!w) return;
  const hp = ((w as any).hp ?? 38) - damage;
  (w as any).hp = hp;
  if (hp > 0) return;
  gameState.enemyFaction.workerEntities.delete(workerId);
  gameState.enemyFaction.workers.delete(workerId);
}

function damageEnemyStructureById(structureId: number, damage: number): void {
  const ef = gameState.enemyFaction;
  const s = ef.visualStructures.find((v) => v.id === structureId);
  if (!s || s.state !== 'active') return;
  const hp = Number.isFinite(s.hp as number) ? (s.hp as number) : (s.maxHp || 320);
  const maxHp = Number.isFinite(s.maxHp as number) ? (s.maxHp as number) : hp;
  s.maxHp = maxHp;
  s.hp = Math.max(0, hp - damage);
  if (s.hp > 0) return;

  s.state = 'planned';
  if (s.type === 'town_center') {
    ef.destroyed = true;
    ef.baseHp = 0;
    EventBus.emit('EnemyFactionDestroyed', {});
    pushNotification('Enemy base destroyed.', 'success');
    return;
  }
  if (s.type === 'barracks') {
    ef.progress.barracksBuilt = false;
    ef.barracksPosition = null;
  } else if (s.type === 'tower') {
    ef.progress.scoutPostBuilt = false;
  } else if (s.type === 'house') {
    ef.progress.houseBuilt = false;
  } else if (s.type === 'farm_field') {
    ef.progress.farmBuilt = false;
  }
}

function findNearestBuilding(ex: number, ez: number): { id: number; x: number; z: number; d2: number } | null {
  let bestId: number | null = null;
  let bestDist = Infinity;
  let bestX = 0;
  let bestZ = 0;
  gameState.buildings.forEach((b, id) => {
    if (b.state !== 'active' && b.state !== 'under_construction') return;
    const t = gameState.transforms.get(id);
    if (!t) return;
    const dx = t.x - ex;
    const dz = t.z - ez;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDist) {
      bestDist = d2;
      bestId = id;
      bestX = t.x;
      bestZ = t.z;
    }
  });
  return bestId !== null ? { id: bestId, x: bestX, z: bestZ, d2: bestDist } : null;
}

function updateSoldier(soldierId: number, soldier: SoldierComponent, dt: number): void {
  const st = gameState.military.soldierTransforms.get(soldierId);
  if (!st || soldier.state === 'dead') return;
  if (soldier.attackTimer > 0) soldier.attackTimer -= dt;

  if (soldier.state !== 'garrisoned') {
    const nearestEnemyId = findNearestEnemy(st.x, st.z, SOLDIER_DETECT_RANGE);
    if (nearestEnemyId !== null) {
      soldier.targetEnemyId = nearestEnemyId;
      soldier.targetEnemyWorkerId = null;
      soldier.targetEnemyStructureId = null;
      soldier.state = 'engaging';
    } else if (soldier.targetEnemyId === null && soldier.targetEnemyWorkerId === null && soldier.targetEnemyStructureId === null) {
      const workerId = findNearestEnemyWorker(st.x, st.z, SOLDIER_DETECT_RANGE * 0.8);
      if (workerId !== null) {
        soldier.targetEnemyWorkerId = workerId;
        soldier.state = 'engaging';
      } else {
        const structureId = findNearestEnemyStructure(st.x, st.z, SOLDIER_DETECT_RANGE * 0.75);
        if (structureId !== null) {
          soldier.targetEnemyStructureId = structureId;
          soldier.state = 'engaging';
        }
      }
    }
  }

  switch (soldier.state) {
    case 'idle':
      break;
    case 'patrolling': {
      if (soldier.patrolWaypoints.length === 0) {
        soldier.state = 'idle';
        break;
      }
      const wp = soldier.patrolWaypoints[soldier.patrolIndex];
      const arrived = moveUnitToward(st, wp.x, wp.z, soldier.speed, dt);
      if (arrived) soldier.patrolIndex = (soldier.patrolIndex + 1) % soldier.patrolWaypoints.length;
      break;
    }
    case 'engaging': {
      if (soldier.targetEnemyId !== null) {
        const enemy = gameState.military.enemies.get(soldier.targetEnemyId);
        const et = gameState.military.enemyTransforms.get(soldier.targetEnemyId);
        if (!enemy || enemy.state === 'dead' || !et) {
          soldier.targetEnemyId = null;
          if (soldier.targetEnemyWorkerId === null && soldier.targetEnemyStructureId === null) soldier.state = 'idle';
          break;
        }
        const dx = et.x - st.x;
        const dz = et.z - st.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const engageRange = soldier.attackRange > 0 ? soldier.attackRange - 1 : 1.5;
        if (dist <= engageRange) soldier.state = 'attacking';
        else moveUnitToward(st, et.x, et.z, soldier.speed, dt);
        break;
      }

      if (soldier.targetEnemyWorkerId !== null) {
        const w = gameState.enemyFaction.workerEntities.get(soldier.targetEnemyWorkerId);
        if (!w) {
          soldier.targetEnemyWorkerId = null;
          if (soldier.targetEnemyStructureId === null) soldier.state = 'idle';
          break;
        }
        const dx = w.x - st.x;
        const dz = w.z - st.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const engageRange = soldier.attackRange > 0 ? soldier.attackRange - 1 : 1.5;
        if (dist <= engageRange) soldier.state = 'attacking';
        else moveUnitToward(st, w.x, w.z, soldier.speed, dt);
        break;
      }

      if (soldier.targetEnemyStructureId !== null) {
        const s = gameState.enemyFaction.visualStructures.find((v) => v.id === soldier.targetEnemyStructureId && v.state === 'active' && (v.hp ?? v.maxHp ?? 1) > 0);
        if (!s) {
          soldier.targetEnemyStructureId = null;
          soldier.state = 'idle';
          break;
        }
        const dx = s.x - st.x;
        const dz = s.z - st.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const engageRange = soldier.attackRange > 0 ? soldier.attackRange - 0.8 : 2.2;
        if (dist <= engageRange) soldier.state = 'attacking';
        else moveUnitToward(st, s.x, s.z, soldier.speed, dt);
        break;
      }

      soldier.state = 'idle';
      break;
    }
    case 'attacking': {
      if (soldier.targetEnemyId !== null) {
        const enemy = gameState.military.enemies.get(soldier.targetEnemyId);
        const et = gameState.military.enemyTransforms.get(soldier.targetEnemyId);
        if (!enemy || enemy.state === 'dead' || !et) {
          soldier.targetEnemyId = null;
          if (soldier.targetEnemyWorkerId === null && soldier.targetEnemyStructureId === null) soldier.state = 'idle';
          break;
        }
        const dx = et.x - st.x;
        const dz = et.z - st.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const attackDist = soldier.attackRange > 0 ? soldier.attackRange : 2.0;
        if (dist > attackDist + 1) {
          soldier.state = 'engaging';
          break;
        }
        st.rotation = Math.atan2(dx, dz);
        if (soldier.attackTimer <= 0) {
          soldier.attackTimer = 1.0;
          soldier.animTimer = 0.3;
          const dmgMul = getDamageMultiplier(st.x, st.z, et.x, et.z, soldier.attackRange > 0);
          enemy.hp -= soldier.attack * dmgMul;
          if (enemy.hp <= 0) {
            enemy.state = 'dead';
            awardKillXP(soldierId, enemy.enemyType);
            EventBus.emit('EnemyDied', { enemyId: soldier.targetEnemyId });
            soldier.targetEnemyId = null;
            if (soldier.targetEnemyWorkerId === null && soldier.targetEnemyStructureId === null) soldier.state = 'idle';
          }
        }
        break;
      }

      if (soldier.targetEnemyWorkerId !== null) {
        const w = gameState.enemyFaction.workerEntities.get(soldier.targetEnemyWorkerId);
        if (!w) {
          soldier.targetEnemyWorkerId = null;
          if (soldier.targetEnemyStructureId === null) soldier.state = 'idle';
          break;
        }
        const dx = w.x - st.x;
        const dz = w.z - st.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const attackDist = soldier.attackRange > 0 ? soldier.attackRange : 2.0;
        if (dist > attackDist + 1) {
          soldier.state = 'engaging';
          break;
        }
        st.rotation = Math.atan2(dx, dz);
        if (soldier.attackTimer <= 0) {
          soldier.attackTimer = 1.0;
          soldier.animTimer = 0.3;
          damageEnemyWorkerById(soldier.targetEnemyWorkerId, soldier.attack);
          if (!gameState.enemyFaction.workerEntities.has(soldier.targetEnemyWorkerId)) {
            soldier.targetEnemyWorkerId = null;
            if (soldier.targetEnemyStructureId === null) soldier.state = 'idle';
          }
        }
        break;
      }

      if (soldier.targetEnemyStructureId !== null) {
        const s = gameState.enemyFaction.visualStructures.find((v) => v.id === soldier.targetEnemyStructureId && v.state === 'active' && (v.hp ?? v.maxHp ?? 1) > 0);
        if (!s) {
          soldier.targetEnemyStructureId = null;
          soldier.state = 'idle';
          break;
        }
        const dx = s.x - st.x;
        const dz = s.z - st.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const attackDist = soldier.attackRange > 0 ? soldier.attackRange : 2.4;
        if (dist > attackDist + 1) {
          soldier.state = 'engaging';
          break;
        }
        st.rotation = Math.atan2(dx, dz);
        if (soldier.attackTimer <= 0) {
          soldier.attackTimer = 1.0;
          soldier.animTimer = 0.3;
          damageEnemyStructureById(soldier.targetEnemyStructureId, soldier.attack);
          const stillAlive = gameState.enemyFaction.visualStructures.some((v) => v.id === soldier.targetEnemyStructureId && v.state === 'active' && (v.hp ?? v.maxHp ?? 1) > 0);
          if (!stillAlive) {
            soldier.targetEnemyStructureId = null;
            soldier.state = 'idle';
          }
        }
        break;
      }

      soldier.state = 'idle';
      break;
    }
    case 'retreating': {
      let barracksT: { x: number; z: number } | null = null;
      gameState.buildings.forEach((b, id) => {
        if (barracksT || b.type !== 'barracks' || b.state !== 'active') return;
        const t = gameState.transforms.get(id);
        if (t) barracksT = { x: t.x, z: t.z };
      });
      if (barracksT) {
        const arrived = moveUnitToward(st, barracksT.x, barracksT.z, soldier.speed, dt);
        if (arrived) soldier.state = 'idle';
      }
      break;
    }
    case 'garrisoned':
      break;
  }
}

function updateEnemy(enemyId: number, enemy: EnemyComponent, dt: number): void {
  const et = gameState.military.enemyTransforms.get(enemyId);
  if (!et || enemy.state === 'dead') return;
  if (enemy.attackTimer > 0) enemy.attackTimer -= dt;
  const isScout = enemy.behavior === 'scout' || gameState.enemyFaction.scoutUnitIds.has(enemyId);

  if (isScout) {
    const home = gameState.enemyFaction.basePosition;
    const tc = findTownCenterPosition();
    const scoutAge = gameState.tick - (enemy.spawnTick ?? gameState.tick);
    if (tc && scoutAge < 15 * 55) {
      const arrived = moveUnitToward(et, tc.x + 10, tc.z + 6, enemy.speed * 1.05, dt);
      applyEnemySeparation(enemyId, et, dt);
      if (arrived || scoutAge > 15 * 38) {
        enemy.state = 'retreating';
      } else {
        enemy.state = 'marching';
      }
      return;
    }
    enemy.state = 'retreating';
    const retreatDone = moveUnitToward(et, home.x, home.z, enemy.speed * 1.1, dt);
    if (retreatDone || scoutAge > 15 * 90) {
      enemy.state = 'dead';
      gameState.enemyFaction.scoutUnitIds.delete(enemyId);
    }
    return;
  }

  switch (enemy.state) {
    case 'marching': {
      const nearSoldier = findNearestSoldier(et.x, et.z, 7);
      if (nearSoldier !== null) {
        enemy.targetId = nearSoldier;
        enemy.state = 'attacking_soldier';
        break;
      }

      const nearCitizen = findNearestCitizen(et.x, et.z, 7);
      if (nearCitizen !== null) {
        enemy.targetId = nearCitizen;
        enemy.state = 'attacking_citizen';
        break;
      }

      const heroDx = gameState.playerCharacter.x - et.x;
      const heroDz = gameState.playerCharacter.z - et.z;
      if (heroDx * heroDx + heroDz * heroDz <= 7 * 7) {
        enemy.targetId = -1;
        enemy.state = 'attacking_hero';
        break;
      }

      const target = findNearestBuilding(et.x, et.z);
      if (!target) break;
      const arrived = moveUnitToward(et, target.x, target.z, enemy.speed, dt);
      applyEnemySeparation(enemyId, et, dt);
      if (arrived) {
        enemy.targetId = target.id;
        enemy.state = 'attacking_building';
      }
      break;
    }

    case 'attacking_building': {
      if (enemy.targetId === null) {
        enemy.state = 'marching';
        break;
      }
      const b = gameState.buildings.get(enemy.targetId);
      const bt = gameState.transforms.get(enemy.targetId);
      if (!b || !bt) {
        enemy.targetId = null;
        enemy.state = 'marching';
        break;
      }

      const dx = bt.x - et.x;
      const dz = bt.z - et.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const attackDist = enemy.attackRange > 0 ? enemy.attackRange : 2.2;
      if (dist > attackDist + 0.6) {
        moveUnitToward(et, bt.x, bt.z, enemy.speed, dt);
        applyEnemySeparation(enemyId, et, dt);
      } else {
        et.rotation = Math.atan2(dx, dz);
        if (enemy.attackTimer <= 0) {
          enemy.attackTimer = enemy.attackCooldown;
          damageBuildingById(enemy.targetId, enemy.attack);
          if (!gameState.buildings.get(enemy.targetId)) {
            enemy.targetId = null;
            enemy.state = 'marching';
          }
        }
      }
      break;
    }

    case 'attacking_soldier': {
      if (enemy.targetId === null) {
        enemy.state = 'marching';
        break;
      }
      const s = gameState.military.soldiers.get(enemy.targetId);
      const st = gameState.military.soldierTransforms.get(enemy.targetId);
      if (!s || s.state === 'dead' || !st) {
        enemy.targetId = null;
        enemy.state = 'marching';
        break;
      }
      const dx = st.x - et.x;
      const dz = st.z - et.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const attackDist = enemy.attackRange > 0 ? enemy.attackRange : 2.0;

      if (dist > attackDist + 0.5) {
        moveUnitToward(et, st.x, st.z, enemy.speed, dt);
        applyEnemySeparation(enemyId, et, dt);
      } else if (enemy.attackTimer <= 0) {
        et.rotation = Math.atan2(dx, dz);
        enemy.attackTimer = enemy.attackCooldown;
        const dmgMul = getDamageMultiplier(et.x, et.z, st.x, st.z, enemy.attackRange > 0);
        s.hp -= enemy.attack * dmgMul;
        if (s.hp <= 0) {
          s.state = 'dead';
          EventBus.emit('SoldierDied', { soldierId: enemy.targetId });
          enemy.targetId = null;
          enemy.state = 'marching';
        }
      }
      break;
    }

    case 'attacking_citizen': {
      if (enemy.targetId === null) {
        enemy.state = 'marching';
        break;
      }
      if (!gameState.citizens.has(enemy.targetId)) {
        enemy.targetId = null;
        enemy.state = 'marching';
        break;
      }
      const ct = gameState.transforms.get(enemy.targetId);
      if (!ct) {
        enemy.targetId = null;
        enemy.state = 'marching';
        break;
      }
      const dx = ct.x - et.x;
      const dz = ct.z - et.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const attackDist = enemy.attackRange > 0 ? enemy.attackRange : 1.8;
      if (dist > attackDist + 0.5) {
        moveUnitToward(et, ct.x, ct.z, enemy.speed, dt);
        applyEnemySeparation(enemyId, et, dt);
      } else if (enemy.attackTimer <= 0) {
        et.rotation = Math.atan2(dx, dz);
        enemy.attackTimer = enemy.attackCooldown;
        damageCitizenById(enemy.targetId, enemy.attack);
        if (!gameState.citizens.has(enemy.targetId)) {
          enemy.targetId = null;
          enemy.state = 'marching';
        }
      }
      break;
    }

    case 'attacking_hero': {
      const hx = gameState.playerCharacter.x;
      const hz = gameState.playerCharacter.z;
      const dx = hx - et.x;
      const dz = hz - et.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const attackDist = enemy.attackRange > 0 ? enemy.attackRange : 2.0;
      if (dist > attackDist + 0.6) {
        moveUnitToward(et, hx, hz, enemy.speed, dt);
        applyEnemySeparation(enemyId, et, dt);
      } else if (enemy.attackTimer <= 0) {
        et.rotation = Math.atan2(dx, dz);
        enemy.attackTimer = enemy.attackCooldown;
        damageHero(enemy.attack);
        if (!gameState.playerCharacter.controlActive && gameState.playerCharacter.aiMode) {
          enemy.targetId = null;
          enemy.state = 'marching';
        }
      }
      break;
    }

    case 'retreating': {
      const spawnX = enemy.spawnSide === 'east' ? 100 : enemy.spawnSide === 'west' ? -100 : et.x;
      const spawnZ = enemy.spawnSide === 'north' ? -100 : enemy.spawnSide === 'south' ? 100 : et.z;
      const arrived = moveUnitToward(et, spawnX, spawnZ, enemy.speed, dt);
      if (arrived) enemy.state = 'dead';
      break;
    }

    case 'attacking_wall':
      break;
  }
}

function updateTrainingQueues(dt: number): void {
  const { trainingQueues, soldiers, soldierTransforms } = gameState.military;
  trainingQueues.forEach((queue, barracksId) => {
    if (queue.length === 0) return;
    const b = gameState.buildings.get(barracksId);
    if (!b || b.state !== 'active') return;
    const item = queue[0];
    item.timeRemaining -= dt;
    if (item.timeRemaining > 0) return;

    queue.shift();
    const def = SOLDIER_DEFS[item.soldierType];
    const bt = gameState.transforms.get(barracksId);
    const sx = (bt?.x ?? 0) + (Math.random() - 0.5) * 4;
    const sz = (bt?.z ?? 0) + (Math.random() - 0.5) * 4;
    const sid = ++gameState.military.soldierIdCounter;
    soldiers.set(sid, {
      soldierType: item.soldierType,
      hp: def.hp,
      maxHp: def.hp,
      attack: def.attack,
      attackRange: def.attackRange,
      attackCooldown: 1.0,
      attackTimer: 0,
      speed: def.speed,
      state: 'idle',
      targetEnemyId: null,
      targetEnemyWorkerId: null,
      targetEnemyStructureId: null,
      garrisonBuildingId: null,
      patrolWaypoints: [],
      patrolIndex: 0,
      selected: false,
      animTimer: 0,
      equipment: { weapon: null, armor: null, shield: false },
    });
    soldierTransforms.set(sid, { x: sx, z: sz, y: getTerrainHeight(sx, sz), rotation: 0 });
    gameState.military.soldiersTrainedTotal++;
    EventBus.emit('SoldierTrained', { soldierId: sid, soldierType: item.soldierType });
    pushNotification(`${def.label} trained and ready.`, 'success');
  });
}

function checkRaidVictory(): void {
  const { military } = gameState;
  if (!military.activeRaid) return;

  let aliveEnemies = 0;
  military.enemies.forEach((e) => {
    if (e.state !== 'dead' && e.state !== 'retreating') aliveEnemies++;
  });
  if (aliveEnemies !== 0) return;

  military.activeRaid = false;
  military.raidsRepelled++;
  military.enemies.clear();
  military.enemyTransforms.clear();
  pushNotification(`Raid defeated. Raids repelled: ${military.raidsRepelled}`, 'success');
  gameState.resources.stone = Math.max(0, gameState.resources.stone + 10);
  EventBus.emit('RaidDefeated', { day: gameState.gameTime.day, raidsRepelled: military.raidsRepelled });
}

export function runCombatSystem(dt: number): void {
  if (gameState.paused || gameState.military.gameOver) return;
  const effectiveDt = dt * gameState.timeScale;

  updateTrainingQueues(effectiveDt);
  gameState.military.soldiers.forEach((soldier, id) => updateSoldier(id, soldier, effectiveDt));

  const deadSoldiers: number[] = [];
  gameState.military.soldiers.forEach((s, id) => {
    if (s.state === 'dead') deadSoldiers.push(id);
  });
  deadSoldiers.forEach((id) => {
    gameState.military.soldiers.delete(id);
    gameState.military.soldierTransforms.delete(id);
    if (gameState.military.selectedSoldierId === id) gameState.military.selectedSoldierId = null;
  });

  if (gameState.military.activeRaid || gameState.military.enemies.size > 0) {
    gameState.military.enemies.forEach((enemy, id) => updateEnemy(id, enemy, effectiveDt));
    if (gameState.military.activeRaid) checkRaidVictory();
  }
}
