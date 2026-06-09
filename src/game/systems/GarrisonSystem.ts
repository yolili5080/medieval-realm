// ──────────────────────────────────────────────
//  GarrisonSystem – hide units inside buildings
// ──────────────────────────────────────────────

import { gameState, pushNotification } from '../core/GameState';

export interface GarrisonData {
  buildingId: number;
  maxCapacity: number;
  garrisonedUnitIds: number[];
}

export const garrisonMap = new Map<number, GarrisonData>(); // buildingId → data

export const GARRISON_CAPACITY: Partial<Record<string, number>> = {
  town_center: 15,
  tower: 5,
  barracks: 8,
  house: 3,
};

export function getGarrison(buildingId: number): GarrisonData | null {
  return garrisonMap.get(buildingId) ?? null;
}

export function garrisonUnit(unitId: number, buildingId: number): boolean {
  const building = gameState.buildings.get(buildingId);
  if (!building) return false;

  const maxCap = GARRISON_CAPACITY[building.type];
  if (!maxCap) {
    pushNotification('This building cannot garrison units.', 'error');
    return false;
  }

  let data = garrisonMap.get(buildingId);
  if (!data) {
    data = { buildingId, maxCapacity: maxCap, garrisonedUnitIds: [] };
    garrisonMap.set(buildingId, data);
  }

  if (data.garrisonedUnitIds.includes(unitId)) return false; // already garrisoned

  if (data.garrisonedUnitIds.length >= data.maxCapacity) {
    pushNotification('Building is full!', 'error');
    return false;
  }

  data.garrisonedUnitIds.push(unitId);

  // Mark citizen job as garrisoned (hidden)
  const job = gameState.jobs.get(unitId);
  if (job) {
    job.actionState = 'sleeping' as any; // repurpose sleeping = hidden
    job.targetEntityId = buildingId;
    // Clear path
    const path = gameState.paths.get(unitId);
    if (path) { path.waypoints = []; path.done = true; }
    const mov = gameState.movements.get(unitId);
    if (mov) { mov.arrived = true; mov.velocity = { x: 0, z: 0 }; }
  }

  // Mark soldier as garrisoned
  const soldier = gameState.military.soldiers.get(unitId);
  if (soldier) {
    soldier.state = 'garrisoned';
    soldier.garrisonBuildingId = buildingId;
  }

  const citizen = gameState.citizens.get(unitId);
  const soldier2 = gameState.military.soldiers.get(unitId);
  const name = citizen?.name ?? (soldier2 ? soldier2.soldierType : `Unit ${unitId}`);
  const def = building.type.replace(/_/g, ' ');
  pushNotification(`🏰 ${name} garrisoned in ${def}`, 'info');
  return true;
}

export function ungarrisonAll(buildingId: number): void {
  const data = garrisonMap.get(buildingId);
  if (!data || data.garrisonedUnitIds.length === 0) {
    pushNotification('No units garrisoned here.', 'info');
    return;
  }

  const bTransform = gameState.transforms.get(buildingId);

  data.garrisonedUnitIds.forEach((unitId, i) => {
    // Eject in a ring around the building
    const angle = (i / Math.max(1, data!.garrisonedUnitIds.length)) * Math.PI * 2;
    const radius = 4;

    const t = gameState.transforms.get(unitId);
    if (t && bTransform) {
      t.x = bTransform.x + Math.cos(angle) * radius;
      t.z = bTransform.z + Math.sin(angle) * radius;
    }

    const job = gameState.jobs.get(unitId);
    if (job) {
      job.actionState = 'idle';
      job.targetEntityId = null;
    }

    const soldier = gameState.military.soldiers.get(unitId);
    if (soldier) {
      soldier.state = 'idle';
      soldier.garrisonBuildingId = null;
    }
  });

  const count = data.garrisonedUnitIds.length;
  data.garrisonedUnitIds = [];
  pushNotification(`🏃 ${count} unit${count !== 1 ? 's' : ''} ungarrisoned!`, 'info');
}

// Heal garrisoned units over time
export function runGarrisonSystem(dt: number): void {
  if (gameState.paused) return;
  const effectiveDt = dt * gameState.timeScale;

  garrisonMap.forEach((data) => {
    data.garrisonedUnitIds.forEach(unitId => {
      const soldier = gameState.military.soldiers.get(unitId);
      if (soldier) {
        soldier.hp = Math.min(soldier.maxHp, soldier.hp + 3 * effectiveDt);
      }
      const citizen = gameState.citizens.get(unitId);
      if (citizen) {
        citizen.happiness = Math.min(100, citizen.happiness + 1 * effectiveDt);
      }
    });
  });
}
