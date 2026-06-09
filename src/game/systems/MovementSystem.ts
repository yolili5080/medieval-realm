import { gameState } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import { getTerrainHeight } from '../core/Noise';
import { beginNavFrame, addDynamicOccupancy, findPath } from '../core/Pathfinding';
import { getMovementModifierAt } from './TerrainGameplaySystem';

const ARRIVAL_THRESHOLD = 1.0;
const STUCK_THRESHOLD = 0.06;
const STUCK_TICKS = 5;
const MAX_REPLANS_PER_TICK = 8;
const AVOID_RADIUS = 2.4;

const stuckCounters = new Map<number, number>();
const lastPositions = new Map<number, { x: number; z: number }>();

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function runMovementSystem(dt: number): void {
  const { movements, paths, transforms, citizens } = gameState;
  const effectiveDt = dt * gameState.timeScale;
  if (gameState.paused) return;

  beginNavFrame();
  const activeIds: number[] = [];
  movements.forEach((_m, id) => {
    const t = transforms.get(id);
    if (!t) return;
    activeIds.push(id);
    const m = movements.get(id);
    addDynamicOccupancy(t.x, t.z, m?.radius ?? 0.8, 1);
  });

  let replansThisTick = 0;

  movements.forEach((mov, id) => {
    const path = paths.get(id);
    const transform = transforms.get(id);
    if (!transform || !path) return;

    if (path.done || path.waypoints.length === 0) {
      mov.arrived = true;
      mov.velocity = { x: 0, z: 0 };
      const cit = citizens.get(id);
      if (cit) cit.animState = 'idle';
      stuckCounters.delete(id);
      lastPositions.delete(id);
      return;
    }

    const wp = path.waypoints[path.currentWaypoint];
    if (!wp) {
      path.done = true;
      mov.arrived = true;
      return;
    }

    const dx = wp.x - transform.x;
    const dz = wp.z - transform.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < ARRIVAL_THRESHOLD) {
      path.currentWaypoint++;
      if (path.currentWaypoint >= path.waypoints.length) {
        path.done = true;
        mov.arrived = true;
        mov.velocity = { x: 0, z: 0 };
        const cit = citizens.get(id);
        if (cit) cit.animState = 'idle';
        stuckCounters.delete(id);
        lastPositions.delete(id);
      }
      return;
    }

    const nx = dx / dist;
    const nz = dz / dist;
    const cit = citizens.get(id);
    const baseSpeed = cit?.baseSpeed ?? mov.speed;
    const inv = gameState.inventories.get(id);
    const carryMul = inv?.carrying ? 0.7 : 1.0;
    const terrainMul = getMovementModifierAt(transform.x, transform.z);
    const finalSpeed = baseSpeed * carryMul * terrainMul;

    let avoidX = 0;
    let avoidZ = 0;
    for (let i = 0; i < activeIds.length; i++) {
      const otherId = activeIds[i];
      if (otherId === id) continue;
      const ot = transforms.get(otherId);
      if (!ot) continue;
      const ddx = transform.x - ot.x;
      const ddz = transform.z - ot.z;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 <= 0.0001 || d2 > AVOID_RADIUS * AVOID_RADIUS) continue;
      const invD = 1 / Math.sqrt(d2);
      const w = (1 - Math.sqrt(d2) / AVOID_RADIUS);
      avoidX += ddx * invD * w;
      avoidZ += ddz * invD * w;
    }

    const avoidWeight = mov.avoidanceWeight ?? 0.6;
    const desiredX = nx + avoidX * avoidWeight;
    const desiredZ = nz + avoidZ * avoidWeight;
    const mag = Math.max(0.0001, Math.sqrt(desiredX * desiredX + desiredZ * desiredZ));
    const dirX = desiredX / mag;
    const dirZ = desiredZ / mag;

    const targetVx = dirX * finalSpeed;
    const targetVz = dirZ * finalSpeed;
    const steerFactor = Math.min(1, effectiveDt * 6);
    mov.velocity.x += (targetVx - mov.velocity.x) * steerFactor;
    mov.velocity.z += (targetVz - mov.velocity.z) * steerFactor;

    transform.x += mov.velocity.x * effectiveDt;
    transform.z += mov.velocity.z * effectiveDt;
    transform.y = getTerrainHeight(transform.x, transform.z);

    const last = lastPositions.get(id);
    const moved = last ? Math.sqrt((transform.x - last.x) ** 2 + (transform.z - last.z) ** 2) : 999;
    lastPositions.set(id, { x: transform.x, z: transform.z });

    if (moved < STUCK_THRESHOLD * effectiveDt * Math.max(1, mov.speed)) {
      const count = (stuckCounters.get(id) ?? 0) + 1;
      stuckCounters.set(id, count);
      if (count >= STUCK_TICKS && replansThisTick < MAX_REPLANS_PER_TICK) {
        replansThisTick++;
        const goal = path.waypoints[path.waypoints.length - 1] ?? wp;
        const replanned = findPath(transform.x, transform.z, goal.x, goal.z, 1000, {
          unitRadius: mov.radius ?? 0.55,
          avoidDynamic: true,
          groupId: mov.formationSlot !== undefined ? `f${mov.formationSlot}` : undefined,
        });
        if (replanned.length > 0) {
          path.waypoints = replanned;
          path.currentWaypoint = 0;
          path.done = false;
          EventBus.emit('PathReplanRequested', { entityId: id, reason: 'stuck' });
        }
        stuckCounters.set(id, 0);
      }
    } else {
      stuckCounters.set(id, 0);
    }

    if (Math.abs(mov.velocity.x) > 0.1 || Math.abs(mov.velocity.z) > 0.1) {
      const targetRot = Math.atan2(mov.velocity.x, mov.velocity.z);
      const delta = normalizeAngle(targetRot - transform.rotation);
      const maxTurn = mov.turnSpeed * effectiveDt;
      transform.rotation += Math.max(-maxTurn, Math.min(maxTurn, delta));
    }

    mov.arrived = false;
    const citAnim = citizens.get(id);
    if (citAnim) citAnim.animState = citAnim.animState === 'carry' ? 'carry' : 'walk';
  });
}

