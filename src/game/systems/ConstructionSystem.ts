// ──────────────────────────────────────────────
//  ConstructionSystem
//  Builder loop: idle → walk_to_storage → 
//    pick_material → walk_to_site → deliver →
//    repeat until done → idle
//  Auto-assigns up to MIN_BUILDERS_PER_SITE workers
//  from any active workers (interrupting their job).
//  On completion: restores previous job, keeps ≥2 farmers.
// ──────────────────────────────────────────────

import { gameState, pushNotification } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import type { ResourceType, JobType } from '../core/EventBus';
import { setPath, findNearestStorage } from './JobSystem';
import { BUILDING_DEFS } from '../data/buildings';
import { getTerrainHeight } from '../core/Noise';

// ── Min guaranteed builders per site (overrides BUILDER_SLOTS minimum) ─────
const MIN_BUILDERS_PER_SITE = 2;

// ── Max builders per building type ────────────────────────────────────────
const BUILDER_SLOTS: Record<string, number> = {
  house:          2,
  woodcutter_hut: 2,
  farm_field:     2,
  storage_barn:   2,
  barracks:       3,
  smithy:         2,
  tower:          2,
  quarry:         2,
  guard_post:     2,
};

// ── Count current builders on a site ─────────────────────────────────────
function countBuilders(siteId: number): number {
  let count = 0;
  gameState.jobs.forEach((j) => {
    if (j.jobType === 'builder' && j.assignedBuildingId === siteId) count++;
  });
  return count;
}

// ── Count active farmers across all citizens ─────────────────────────────
function countFarmers(): number {
  let count = 0;
  gameState.jobs.forEach((j) => {
    if (j.jobType === 'farmer') count++;
  });
  return count;
}

// ── Release any harvesting lock held by a citizen ────────────────────────
function releaseHarvestLock(citizenId: number): void {
  const job = gameState.jobs.get(citizenId);
  if (!job || job.targetEntityId === null) return;
  const node = gameState.resourceNodes.get(job.targetEntityId);
  if (node && node.harvesterId === citizenId) {
    node.isBeingHarvested = false;
    node.harvesterId = null;
  }
}

// ── Drop carried items back to global resources ──────────────────────────
function dropCarriedItems(citizenId: number): void {
  const inv = gameState.inventories.get(citizenId);
  if (!inv || !inv.carrying || !inv.carryType) return;
  const amt = inv.items[inv.carryType] ?? 0;
  if (amt > 0) {
    gameState.resources[inv.carryType] = (gameState.resources[inv.carryType] ?? 0) + amt;
  }
  inv.items[inv.carryType] = 0;
  inv.carrying = false;
  inv.carryType = null;
}

// ── Try to assign one citizen as builder for siteId ──────────────────────
// Picks nearest eligible citizen:
//   1. idle citizens (preferred)
//   2. active workers (woodcutter/quarryman/farmer) – interrupted
// Does NOT pull soldiers or other builders.
function tryAssignOneBuilder(siteId: number): number | null {
  const b = gameState.buildings.get(siteId);
  if (!b || b.state !== 'under_construction') return null;

  const maxBuilders = Math.max(MIN_BUILDERS_PER_SITE, BUILDER_SLOTS[b.type] ?? MIN_BUILDERS_PER_SITE);
  if (countBuilders(siteId) >= maxBuilders) return null;

  const siteT = gameState.transforms.get(siteId);
  const alreadyAssigned = new Set<number>();
  gameState.jobs.forEach((j, cId) => {
    if (j.jobType === 'builder' && j.assignedBuildingId === siteId) alreadyAssigned.add(cId);
  });

  let chosen: number | null = null;
  let bestDist = Infinity;
  let chosenIsIdle = false;

  const INTERRUPTIBLE: JobType[] = ['idle', 'woodcutter', 'quarryman', 'farmer', 'hauler'];

  gameState.jobs.forEach((job, id) => {
    if (alreadyAssigned.has(id)) return;
    if (!INTERRUPTIBLE.includes(job.jobType as JobType)) return;
    if (!gameState.citizens.get(id)) return;

    const isIdle = job.jobType === 'idle';

    // Prefer idle over working; don't replace idle choice with working one
    if (!isIdle && chosenIsIdle) return;

    if (siteT) {
      const t = gameState.transforms.get(id);
      if (t) {
        const dx = t.x - siteT.x, dz = t.z - siteT.z;
        const dist = dx * dx + dz * dz;
        if (isIdle && !chosenIsIdle) {
          // First idle candidate beats any working candidate
          bestDist = dist; chosen = id; chosenIsIdle = true;
        } else if (dist < bestDist) {
          bestDist = dist; chosen = id; chosenIsIdle = isIdle;
        }
        return;
      }
    }
    if (chosen === null) { chosen = id; chosenIsIdle = isIdle; }
  });

  if (chosen === null) return null;

  const job = gameState.jobs.get(chosen)!;

  // Save previous job so we can restore it after construction
  job.previousJobType = job.jobType as JobType;
  job.previousBuildingId = job.assignedBuildingId;

  // Release any resource harvesting lock
  releaseHarvestLock(chosen);

  // Drop any carried items back to global pool
  dropCarriedItems(chosen);

  // Remove from old building's assignedWorkers list
  if (job.assignedBuildingId !== null) {
    const oldB = gameState.buildings.get(job.assignedBuildingId);
    if (oldB) {
      oldB.assignedWorkers = oldB.assignedWorkers.filter(w => w !== chosen);
    }
  }

  job.jobType = 'builder';
  job.actionState = 'idle';
  job.assignedBuildingId = siteId;
  job.targetEntityId = null;
  job.buildMaterialTarget = null;

  const cit = gameState.citizens.get(chosen);
  if (cit) { cit.workplaceId = null; cit.animState = 'walk'; }

  const def = BUILDING_DEFS[b.type];
  pushNotification(`🔨 ${cit?.name ?? 'Citizen'} is building ${def?.label ?? '...'}`, 'info');
  EventBus.emit('CitizenAssignedJob', { entityId: chosen, jobType: 'builder' });
  return chosen;
}

// ── Restore builder to their previous job (or idle) ───────────────────────
// Ensures at least MIN_FARMERS farmers remain active.
const MIN_FARMERS = 2;

function restoreBuilderJob(citizenId: number): void {
  const job = gameState.jobs.get(citizenId);
  if (!job) return;

  let restoreType: JobType = job.previousJobType ?? 'idle';
  let restoreBuildingId: number | null = job.previousBuildingId ?? null;

  // Farmer floor: if restoring to non-farmer and we're short, become farmer instead
  if (restoreType !== 'farmer') {
    const currentFarmers = countFarmers();
    if (currentFarmers < MIN_FARMERS) {
      restoreType = 'farmer';
      restoreBuildingId = null; // will be auto-assigned by JobAssignmentSystem
    }
  }

  // If restoring to a specific building, verify it still exists + is active
  if (restoreBuildingId !== null) {
    const b = gameState.buildings.get(restoreBuildingId);
    if (!b || b.state !== 'active') {
      restoreBuildingId = null;
      restoreType = 'idle';
    } else {
      // Re-register worker in that building
      if (!b.assignedWorkers.includes(citizenId)) {
        b.assignedWorkers.push(citizenId);
      }
    }
  }

  job.jobType = restoreType;
  job.actionState = 'idle';
  job.targetEntityId = null;
  job.assignedBuildingId = restoreBuildingId;
  job.buildMaterialTarget = null;
  job.previousJobType = null;
  job.previousBuildingId = null;

  const cit = gameState.citizens.get(citizenId);
  if (cit) { cit.workplaceId = restoreBuildingId; cit.animState = 'idle'; }

  EventBus.emit('CitizenAssignedJob', { entityId: citizenId, jobType: restoreType });
}

// ── Get arrival offset for a builder around the building perimeter ────────
function getBuildingArrivalTarget(siteId: number, citizenId: number): { x: number; z: number } {
  const siteT = gameState.transforms.get(siteId);
  if (!siteT) return { x: 0, z: 0 };

  let builderIndex = 0;
  let idx = 0;
  gameState.jobs.forEach((j, cId) => {
    if (j.jobType === 'builder' && j.assignedBuildingId === siteId) {
      if (cId === citizenId) builderIndex = idx;
      idx++;
    }
  });

  const maxBuilders = Math.max(MIN_BUILDERS_PER_SITE, BUILDER_SLOTS[gameState.buildings.get(siteId)?.type ?? 'house'] ?? MIN_BUILDERS_PER_SITE);
  const angle = (builderIndex / Math.max(1, maxBuilders)) * Math.PI * 2;
  const radius = 1.8;
  return {
    x: siteT.x + Math.cos(angle) * radius,
    z: siteT.z + Math.sin(angle) * radius,
  };
}

// ── Get what material still needs to be delivered ─────────────────────────
function getNeededMaterial(siteId: number): { type: ResourceType; amount: number } | null {
  const b = gameState.buildings.get(siteId);
  if (!b) return null;
  for (const [res, needed] of Object.entries(b.constructionCost) as [ResourceType, number][]) {
    const delivered = b.constructionDelivered[res] ?? 0;
    if (delivered < needed) {
      return { type: res, amount: needed - delivered };
    }
  }
  return null;
}

// ── Complete construction ──────────────────────────────────────────────────
function completeConstruction(siteId: number): void {
  const b = gameState.buildings.get(siteId);
  if (!b) return;
  b.state = 'active';
  b.constructionProgress = 100;

  if (b.type === 'house') {
    gameState.maxPopulation += 4;
    b.occupationTimer = 30;
  }

  // Farm fields are also food resource nodes for farmers.
  if (b.type === 'farm_field' && !gameState.resourceNodes.has(siteId)) {
    gameState.resourceNodes.set(siteId, {
      resourceType: 'food',
      amount: 999999,
      maxAmount: 999999,
      regenRate: 0,
      isBeingHarvested: false,
      harvesterId: null,
      depleted: false,
      respawnTimer: 0,
    });
    gameState.isResourceNode.set(siteId, { _tag: 'resource_node' });
  }

  const def = BUILDING_DEFS[b.type];
  pushNotification(`✅ Construction complete: ${def.label}`, 'success');
  EventBus.emit('BuildingCompleted', { buildingId: siteId, type: b.type });
}

// ── Builder state machine ──────────────────────────────────────────────────

export function runConstructionSystem(dt: number): void {
  if (gameState.paused) return;
  const effectiveDt = dt * gameState.timeScale;
  const { jobs, transforms, paths, movements, citizens, buildings, inventories } = gameState;

  // 1. Look for under-staffed build sites and assign workers (interrupt if needed)
  buildings.forEach((b, siteId) => {
    if (b.state !== 'under_construction') return;
    const maxBuilders = Math.max(MIN_BUILDERS_PER_SITE, BUILDER_SLOTS[b.type] ?? MIN_BUILDERS_PER_SITE);
    let attempts = maxBuilders - countBuilders(siteId);
    while (attempts > 0) {
      const assigned = tryAssignOneBuilder(siteId);
      if (assigned === null) break;
      attempts--;
    }
  });

  // 2. Run builder state machines
  jobs.forEach((job, id) => {
    if (job.jobType !== 'builder') return;

    const siteId = job.assignedBuildingId;
    if (siteId === null) {
      restoreBuilderJob(id);
      return;
    }

    const site = buildings.get(siteId);
    const t = transforms.get(id);
    const path = paths.get(id);
    const mov = movements.get(id);
    const inv = inventories.get(id);
    if (!t || !path || !mov || !inv) return;

    // Site completed or gone — restore previous job
    if (!site || site.state === 'active') {
      restoreBuilderJob(id);
      return;
    }

    switch (job.actionState) {
      case 'idle': {
        if (inv.carrying && inv.carryType) {
          const arrival = getBuildingArrivalTarget(siteId, id);
          setPath(id, arrival.x, arrival.z);
          job.actionState = 'moving_to_site';
          const cit = citizens.get(id);
          if (cit) cit.animState = 'carry';
          break;
        }

        const needed = getNeededMaterial(siteId);
        if (!needed) {
          completeConstruction(siteId);
          restoreBuilderJob(id);
          break;
        }

        const storageId = findNearestStorage(t.x, t.z);
        if (storageId === null) break;

        const storageGlobal = gameState.resources[needed.type];
        if (storageGlobal <= 0) break;

        const st = transforms.get(storageId);
        if (!st) break;

        setPath(id, st.x, st.z);
        job.actionState = 'moving_to_storage_for_build';
        job.buildMaterialTarget = needed.type;
        job.targetEntityId = storageId;
        const cit = citizens.get(id);
        if (cit) cit.animState = 'walk';
        break;
      }

      case 'moving_to_storage_for_build': {
        if (path.done && mov.arrived) {
          const matType = job.buildMaterialTarget;
          if (matType && gameState.resources[matType] > 0) {
            gameState.resources[matType] = Math.max(0, gameState.resources[matType] - 1);
            inv.items[matType] = 1;
            inv.carrying = true;
            inv.carryType = matType;
            EventBus.emit('InventoryChanged', { entityId: id, diff: { [matType]: 1 } });
          }
          const siteT = transforms.get(siteId);
          if (siteT) {
            setPath(id, siteT.x, siteT.z);
            job.actionState = 'moving_to_site';
            const cit = citizens.get(id);
            if (cit) cit.animState = 'carry';
          } else {
            job.actionState = 'idle';
          }
        }
        break;
      }

      case 'moving_to_site': {
        if (path.done && mov.arrived) {
          job.actionState = 'building';
          job.gatherTimer = 2.0;
          const cit = citizens.get(id);
          if (cit) cit.animState = 'work';
        }
        break;
      }

      case 'building': {
        job.gatherTimer -= effectiveDt;
        if (job.gatherTimer <= 0) {
          if (inv.carrying && inv.carryType && site) {
            const matType = inv.carryType;
            site.constructionDelivered[matType] = (site.constructionDelivered[matType] ?? 0) + 1;
            inv.items[matType] = 0;
            inv.carrying = false;
            inv.carryType = null;

            const totalCost = Object.values(site.constructionCost).reduce((a, b) => a + (b ?? 0), 0);
            const totalDelivered = Object.values(site.constructionDelivered).reduce((a, b) => a + (b ?? 0), 0);
            site.constructionProgress = Math.min(100, (totalDelivered / Math.max(1, totalCost)) * 100);

            EventBus.emit('ConstructionProgress', { buildingId: siteId, progress: site.constructionProgress });
          }

          const stillNeeded = getNeededMaterial(siteId);
          if (!stillNeeded) {
            completeConstruction(siteId);
            restoreBuilderJob(id);
          } else {
            job.targetEntityId = null;
            job.buildMaterialTarget = null;
            job.actionState = 'idle';
          }

          const cit = citizens.get(id);
          if (cit && job.jobType === 'builder') cit.animState = 'idle';
        }
        break;
      }
    }
  });

  // 3. House occupation timer (spawn new citizen after 30s)
  buildings.forEach((b, id) => {
    if (b.type !== 'house' || b.state !== 'active') return;
    if (b.occupationTimer <= 0) return;
    b.occupationTimer -= effectiveDt;
    if (b.occupationTimer <= 0) {
      b.occupationTimer = 0;
      if (gameState.population < gameState.maxPopulation) {
        spawnCitizen(id);
      }
    }
  });
}

// ── Spawn a new citizen near a building ────────────────────────────────────
const CITIZEN_NAMES = [
  'Harald', 'Sigrid', 'Bjorn', 'Ingrid', 'Leif', 'Astrid',
  'Gunnar', 'Ragnhild', 'Olaf', 'Gudrun', 'Erik', 'Helga',
  'Ivar', 'Thora', 'Magnus', 'Bergit', 'Knut', 'Solveig',
];

function spawnCitizen(homeId: number): void {
  const homeT = gameState.transforms.get(homeId);
  if (!homeT) return;

  const cx = homeT.x + (Math.random() - 0.5) * 4;
  const cz = homeT.z + (Math.random() - 0.5) * 4;

  const citizenId = gameState.world.createEntity();
  const name = CITIZEN_NAMES[Math.floor(Math.random() * CITIZEN_NAMES.length)];

  gameState.transforms.set(citizenId, { x: cx, z: cz, y: getTerrainHeight(cx, cz), rotation: 0 });
  gameState.movements.set(citizenId, {
    speed: 2.8 + Math.random() * 0.4,
    turnSpeed: Math.PI * 2,
    velocity: { x: 0, z: 0 },
    targetX: null,
    targetZ: null,
    arrived: true,
    radius: 0.5,
    avoidanceWeight: 0.6,
  });
  gameState.paths.set(citizenId, { waypoints: [], currentWaypoint: 0, done: true });
  gameState.jobs.set(citizenId, {
    jobType: 'idle',
    actionState: 'idle',
    targetEntityId: null,
    gatherTimer: 0,
    gatherDuration: 3,
    assignedBuildingId: null,
    buildMaterialTarget: null,
    previousJobType: null,
    previousBuildingId: null,
  });
  gameState.inventories.set(citizenId, {
    items: {},
    capacity: 1,
    carrying: false,
    carryType: null,
  });
  const wanderSeed = Math.random();
  gameState.citizens.set(citizenId, {
    name,
    age: 18 + Math.floor(Math.random() * 20),
    happiness: 80,
    homeId,
    workplaceId: null,
    animState: 'idle',
    wanderSeed,
    baseSpeed: 2.6 + wanderSeed * 0.8,
  });
  gameState.renders.set(citizenId, { meshUUID: null, modelId: 'citizen_male', dirty: true, lodLevel: 0 });
  gameState.selectables.set(citizenId, { isSelected: false, label: name });
  gameState.isCitizen.set(citizenId, { _tag: 'citizen' });

  gameState.population += 1;
  EventBus.emit('PopulationChanged', { delta: 1 });
  pushNotification(`${name} has joined your village!`, 'info');
}
