// ──────────────────────────────────────────────
//  JobSystem – woodcutter / farmer / quarryman loop
//  Resources only increment on ResourceDelivered event.
//  Citizens: idle → moving_to_resource → gathering → 
//            moving_to_storage → delivering → idle
// ──────────────────────────────────────────────

import { gameState } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import type { ResourceType } from '../core/EventBus';
import { findPath } from '../core/Pathfinding';

// ── Helpers ────────────────────────────────────────────────────────────────

export function findNearestResource(fromX: number, fromZ: number, resourceType: ResourceType): number | null {
  const { resourceNodes, transforms } = gameState;
  let bestId: number | null = null;
  let bestDist = Infinity;

  resourceNodes.forEach((node, id) => {
    if (node.resourceType !== resourceType) return;
    if (resourceType === 'food') {
      const b = gameState.buildings.get(id);
      if (!b || b.type !== 'farm_field' || b.state !== 'active') return;
    }
    if (node.amount <= 0) return;
    if (node.depleted) return;
    // Allow sharing nodes (don't exclude nodes being harvested by others)
    const t = transforms.get(id);
    if (!t) return;
    const dx = t.x - fromX;
    const dz = t.z - fromZ;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) { bestDist = dist; bestId = id; }
  });

  return bestId;
}

// Find nearest active storage (Town Center or Storage Barn)
export function findNearestStorage(fromX: number, fromZ: number): number | null {
  const { buildings, transforms } = gameState;
  let bestId: number | null = null;
  let bestDist = Infinity;

  buildings.forEach((b, id) => {
    if (b.state !== 'active') return;
    if (b.type !== 'town_center' && b.type !== 'storage_barn') return;
    const t = transforms.get(id);
    if (!t) return;
    const dx = t.x - fromX;
    const dz = t.z - fromZ;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) { bestDist = dist; bestId = id; }
  });

  return bestId;
}

export function setPath(entityId: number, toX: number, toZ: number): void {
  const t = gameState.transforms.get(entityId);
  if (!t) return;
  const m = gameState.movements.get(entityId);
  const waypoints = findPath(t.x, t.z, toX, toZ, 2200, {
    unitRadius: m?.radius ?? 0.55,
    avoidDynamic: true,
    groupId: m?.formationSlot !== undefined ? `f${m.formationSlot}` : undefined,
  });
  const path = gameState.paths.get(entityId);
  if (!path) return;
  path.waypoints = waypoints;
  path.currentWaypoint = 0;
  path.done = waypoints.length === 0;
  const mov = gameState.movements.get(entityId);
  if (mov) mov.arrived = false;
}

// ── Curved path generation ─────────────────────────────────────────────────
// Returns intermediate waypoints that arc slightly off the straight line,
// giving each citizen a unique feel. Each citizen has a stable wanderSeed.
export function generateCurvedPath(
  fromX: number, fromZ: number,
  toX: number, toZ: number,
  citizenId: number
): Array<{ x: number; z: number }> {
  const cit = gameState.citizens.get(citizenId);
  const jitter = cit?.wanderSeed !== undefined ? (0.5 + cit.wanderSeed * 1.5) : 1.0;

  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Very short moves — go direct
  if (dist < 3) return [{ x: toX, z: toZ }];

  // Perpendicular direction
  const perpX = -dz / dist;
  const perpZ = dx / dist;

  const offsetSign = (cit?.wanderSeed ?? 0.5) > 0.5 ? 1 : -1;
  const offsetAmount = jitter * (0.25 + Math.random() * 0.35) * offsetSign;

  const midX = fromX + dx * 0.5 + perpX * offsetAmount;
  const midZ = fromZ + dz * 0.5 + perpZ * offsetAmount;

  const noise = () => (Math.random() - 0.5) * 0.3;

  return [
    { x: midX + noise(), z: midZ + noise() },
    { x: toX + noise() * 0.5, z: toZ + noise() * 0.5 },
  ];
}

// ── Set path with curve variation ──────────────────────────────────────────
export function setPathCurved(entityId: number, toX: number, toZ: number): void {
  const t = gameState.transforms.get(entityId);
  if (!t) return;
  // Generate arc waypoints then run A* between each segment
  const arcPts = generateCurvedPath(t.x, t.z, toX, toZ, entityId);
  const allWaypoints: Array<{ x: number; z: number }> = [];

  let prevX = t.x, prevZ = t.z;
  for (const pt of arcPts) {
    const m = gameState.movements.get(entityId);
    const segment = findPath(prevX, prevZ, pt.x, pt.z, 1600, {
      unitRadius: m?.radius ?? 0.55,
      avoidDynamic: true,
      groupId: m?.formationSlot !== undefined ? `f${m.formationSlot}` : undefined,
    });
    allWaypoints.push(...segment);
    prevX = pt.x;
    prevZ = pt.z;
  }
  if (allWaypoints.length === 0) allWaypoints.push({ x: toX, z: toZ });

  const path = gameState.paths.get(entityId);
  if (!path) return;
  path.waypoints = allWaypoints;
  path.currentWaypoint = 0;
  path.done = false;
  const mov = gameState.movements.get(entityId);
  if (mov) mov.arrived = false;
}

const JOB_TO_RESOURCE: Partial<Record<string, ResourceType>> = {
  woodcutter: 'wood',
  quarryman: 'stone',
  farmer: 'food',
};

// ── Is it night time? ──────────────────────────────────────────────────────
function isNightTime(): boolean {
  const { hour } = gameState.gameTime;
  return hour >= 21 || hour < 6;
}

// ── Idle wander — citizens with no job meander around ─────────────────────
const wanderTimers = new Map<number, number>();

function updateIdleWander(citizenId: number, dt: number, effectiveDt: number): void {
  const timer = (wanderTimers.get(citizenId) ?? 0) - effectiveDt;
  wanderTimers.set(citizenId, timer);

  const cit = gameState.citizens.get(citizenId);
  const t = gameState.transforms.get(citizenId);
  const path = gameState.paths.get(citizenId);
  const mov = gameState.movements.get(citizenId);
  if (!t || !path || !mov || !cit) return;

  if (timer <= 0) {
    const angle = Math.random() * Math.PI * 2;
    const wanderDist = 2 + Math.random() * 5;
    const tx = Math.max(-85, Math.min(85, t.x + Math.cos(angle) * wanderDist));
    const tz = Math.max(-85, Math.min(85, t.z + Math.sin(angle) * wanderDist));

    setPathCurved(citizenId, tx, tz);
    // Random pause: 4–10 seconds (modulated by wander seed)
    wanderTimers.set(citizenId, 4 + cit.wanderSeed * 6 + Math.random() * 3);
    cit.animState = path.done ? 'idle' : 'walk';
  }

  // Sync anim state with movement
  if (!path.done && !mov.arrived) {
    cit.animState = 'walk';
  } else if (path.done) {
    cit.animState = 'idle';
  }
}

// ── Main job loop ──────────────────────────────────────────────────────────

export function runJobSystem(dt: number): void {
  if (gameState.paused) return;
  const effectiveDt = dt * gameState.timeScale;
  const { jobs, inventories, transforms, paths, movements, citizens, resourceNodes } = gameState;

  jobs.forEach((job, id) => {
    // Skip builder/hauler – handled by ConstructionSystem
    if (job.jobType === 'builder' || job.jobType === 'hauler') return;

    const inv = inventories.get(id);
    const transform = transforms.get(id);
    const path = paths.get(id);
    const mov = movements.get(id);
    if (!inv || !transform || !path || !mov) return;

    const resourceType = JOB_TO_RESOURCE[job.jobType];

    // Night: return to idle (sleep)
    if (isNightTime() && job.actionState !== 'idle' && job.actionState !== 'sleeping') {
      // Release any harvesting lock
      if (job.targetEntityId !== null) {
        const node = resourceNodes.get(job.targetEntityId);
        if (node && node.harvesterId === id) {
          node.isBeingHarvested = false;
          node.harvesterId = null;
        }
      }
      // Deliver whatever is being carried before sleeping
      if (inv.carrying && inv.carryType) {
        const storageId = findNearestStorage(transform.x, transform.z);
        if (storageId !== null) {
          const amount = inv.items[inv.carryType] ?? 0;
          if (amount > 0) {
            EventBus.emit('ResourceDelivered', {
              entityId: id,
              resourceType: inv.carryType,
              amount,
              destinationBuildingId: storageId,
            });
          }
          inv.items[inv.carryType] = 0;
          inv.carrying = false;
          inv.carryType = null;
        }
      }
      changeJobState(job, id, 'idle');
      const cit = citizens.get(id);
      if (cit) cit.animState = 'sleep';
      return;
    }

    switch (job.actionState) {
      case 'idle':
      case 'sleeping': {
        if (isNightTime()) {
          const cit = citizens.get(id);
          if (cit) cit.animState = 'sleep';
          return;
        }

        // Idle citizens with no job type — do idle wander
        if (!resourceType) {
          updateIdleWander(id, dt, effectiveDt);
          return;
        }

        // If carrying, deliver first
        const carried = inv.carryType ? (inv.items[inv.carryType] ?? 0) : 0;
        if (inv.carrying && carried > 0) {
          const storageId = findNearestStorage(transform.x, transform.z);
          if (storageId !== null) {
            const st = transforms.get(storageId);
            if (st) {
              setPathCurved(id, st.x, st.z);
              job.targetEntityId = storageId;
              changeJobState(job, id, 'moving_to_storage');
            }
          }
        } else {
          // Farmers prioritize active farm fields (food node lives on farm entity id).
          let nodeId: number | null = null;
          if (resourceType === 'food') {
            const assigned = job.assignedBuildingId;
            if (assigned !== null) {
              const b = gameState.buildings.get(assigned);
              const n = gameState.resourceNodes.get(assigned);
              if (b?.type === 'farm_field' && b.state === 'active' && n && !n.depleted && n.amount > 0) {
                nodeId = assigned;
              }
            }
            if (nodeId === null) {
              nodeId = findNearestResource(transform.x, transform.z, 'food');
            }
          } else {
            // Find nearest resource node
            nodeId = findNearestResource(transform.x, transform.z, resourceType);
          }

          if (nodeId !== null) {
            const nt = transforms.get(nodeId);
            if (nt) {
              setPathCurved(id, nt.x, nt.z);
              job.targetEntityId = nodeId;
              changeJobState(job, id, 'moving_to_resource');
              const node = resourceNodes.get(nodeId);
              if (node && !node.isBeingHarvested) {
                node.isBeingHarvested = true;
                node.harvesterId = id;
              }
            }
          }
          // If no resource found, citizen stays idle (not stuck)
        }
        break;
      }

      case 'moving_to_resource': {
        if (path.done && mov.arrived) {
          const node = job.targetEntityId !== null ? resourceNodes.get(job.targetEntityId) : null;
          if (node && node.amount > 0 && !node.depleted) {
            job.gatherTimer = job.gatherDuration;
            changeJobState(job, id, 'gathering');
            const cit = citizens.get(id);
            if (cit) cit.animState = 'work';
          } else {
            // Resource depleted or gone; reset to find another
            if (node && node.harvesterId === id) {
              node.isBeingHarvested = false;
              node.harvesterId = null;
            }
            job.targetEntityId = null;
            changeJobState(job, id, 'idle');
          }
        }
        break;
      }

      case 'gathering': {
        job.gatherTimer -= effectiveDt;
        if (job.gatherTimer <= 0) {
          const node = job.targetEntityId !== null ? resourceNodes.get(job.targetEntityId) : null;
          if (node && node.amount > 0 && resourceType) {
            const pickup = Math.min(1, node.amount, inv.capacity - (inv.items[resourceType] ?? 0));
            if (pickup > 0) {
              node.amount -= pickup;
              inv.items[resourceType] = (inv.items[resourceType] ?? 0) + pickup;
              inv.carrying = true;
              inv.carryType = resourceType;

              EventBus.emit('ResourcePickedUp', {
                entityId: id,
                resourceType,
                amount: pickup,
                sourceId: job.targetEntityId!,
              });
              EventBus.emit('InventoryChanged', { entityId: id, diff: { [resourceType]: pickup } });

              if (node.amount <= 0) {
                node.isBeingHarvested = false;
                node.harvesterId = null;
                node.depleted = true;
                node.respawnTimer = resourceType === 'wood' ? 120 : 0;
                EventBus.emit('NodeDepleted', { nodeId: job.targetEntityId!, resourceType });
              }
            }
          }

          const carried2 = inv.carryType ? (inv.items[inv.carryType] ?? 0) : 0;
          const isFull = carried2 >= inv.capacity;
          const nodeEmpty = !node || node.amount <= 0 || node.depleted;

          if (isFull || nodeEmpty) {
            // Release harvesting lock if still held
            if (node && node.harvesterId === id && !node.depleted) {
              node.isBeingHarvested = false;
              node.harvesterId = null;
            }
            // Head to storage (curved path so each citizen takes slightly different route)
            if (carried2 > 0) {
              const storageId = findNearestStorage(transform.x, transform.z);
              if (storageId !== null) {
                const st = transforms.get(storageId);
                if (st) {
                  setPathCurved(id, st.x, st.z);
                  job.targetEntityId = storageId;
                  changeJobState(job, id, 'moving_to_storage');
                  const cit = citizens.get(id);
                  if (cit) cit.animState = 'carry';
                }
              } else {
                changeJobState(job, id, 'idle');
              }
            } else {
              changeJobState(job, id, 'idle');
            }
          } else {
            // Continue gathering
            job.gatherTimer = job.gatherDuration;
          }

          const cit = citizens.get(id);
          if (cit && job.actionState === 'gathering') cit.animState = 'work';
        }
        break;
      }

      case 'moving_to_storage': {
        if (path.done && mov.arrived) {
          changeJobState(job, id, 'delivering');
        }
        break;
      }

      case 'delivering': {
        const storageId = job.targetEntityId;
        if (storageId !== null && inv.carrying && inv.carryType) {
          const amount = inv.items[inv.carryType] ?? 0;
          if (amount > 0) {
            // THIS IS THE ONLY PLACE GLOBAL RESOURCES INCREMENT
            EventBus.emit('ResourceDelivered', {
              entityId: id,
              resourceType: inv.carryType,
              amount,
              destinationBuildingId: storageId,
            });

            // Track daily production on the worker's assigned building
            const wBld = job.assignedBuildingId !== null ? gameState.buildings.get(job.assignedBuildingId) : null;
            if (wBld) wBld.dailyProduced += amount;

            inv.items[inv.carryType] = 0;
            inv.carrying = false;
            inv.carryType = null;
          }
        }
        changeJobState(job, id, 'idle');
        job.targetEntityId = null;
        const cit = citizens.get(id);
        if (cit) cit.animState = 'idle';
        break;
      }
    }
  });
}

function changeJobState(job: { actionState: string }, id: number, newState: string): void {
  const prev = job.actionState;
  if (prev === newState) return;
  job.actionState = newState as any;
  EventBus.emit('CitizenStateChanged', { entityId: id, from: prev, to: newState });
}
