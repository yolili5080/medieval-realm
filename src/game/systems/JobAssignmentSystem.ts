// ──────────────────────────────────────────────
//  JobAssignmentSystem
//  Auto-assigns idle citizens to open worker
//  slots when a building completes construction.
// ──────────────────────────────────────────────

import { gameState } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import { BUILDING_DEFS } from '../data/buildings';
import type { JobType } from '../core/EventBus';

// Map building type to the job type workers get
const BUILDING_JOB_MAP: Partial<Record<string, JobType>> = {
  woodcutter_hut: 'woodcutter',
  farm_field: 'farmer',
  quarry: 'quarryman',
  storage_barn: 'hauler',
};

// Auto-assign idle citizens to a building's open slots
export function assignWorkersToBuilding(buildingId: number): void {
  const building = gameState.buildings.get(buildingId);
  if (!building || building.state !== 'active') return;
  if (building.workerSlots === 0) return;

  const jobType = BUILDING_JOB_MAP[building.type];
  if (!jobType) return;

  const openSlots = building.workerSlots - building.assignedWorkers.length;
  if (openSlots <= 0) return;

  let assigned = 0;
  gameState.jobs.forEach((job, citizenId) => {
    if (assigned >= openSlots) return;
    if (job.jobType !== 'idle' && job.actionState !== 'idle') return;
    // Skip builders in the middle of construction
    if (job.jobType === 'builder') return;
    // Check not already assigned elsewhere
    if (building.assignedWorkers.includes(citizenId)) return;

    // Remove from old building if any
    if (job.assignedBuildingId !== null) {
      const oldBuilding = gameState.buildings.get(job.assignedBuildingId);
      if (oldBuilding) {
        oldBuilding.assignedWorkers = oldBuilding.assignedWorkers.filter(w => w !== citizenId);
      }
    }

    job.jobType = jobType;
    job.actionState = 'idle';
    job.assignedBuildingId = buildingId;
    building.assignedWorkers.push(citizenId);

    const cit = gameState.citizens.get(citizenId);
    if (cit) cit.workplaceId = buildingId;

    EventBus.emit('CitizenAssignedJob', { entityId: citizenId, jobType });
    assigned++;
  });
}

// Manually assign citizen to a building
export function manuallyAssignCitizen(citizenId: number, buildingId: number): void {
  const job = gameState.jobs.get(citizenId);
  const building = gameState.buildings.get(buildingId);
  if (!job || !building || building.state !== 'active') return;

  const jobType = BUILDING_JOB_MAP[building.type];
  if (!jobType) return;

  const openSlots = building.workerSlots - building.assignedWorkers.length;
  if (openSlots <= 0) return;

  // Remove from old assignment
  if (job.assignedBuildingId !== null) {
    const oldBuilding = gameState.buildings.get(job.assignedBuildingId);
    if (oldBuilding) {
      oldBuilding.assignedWorkers = oldBuilding.assignedWorkers.filter(w => w !== citizenId);
    }
  }

  job.jobType = jobType;
  job.actionState = 'idle';
  job.targetEntityId = null;
  job.assignedBuildingId = buildingId;
  building.assignedWorkers.push(citizenId);

  const cit = gameState.citizens.get(citizenId);
  if (cit) cit.workplaceId = buildingId;

  EventBus.emit('CitizenAssignedJob', { entityId: citizenId, jobType });
}

// Unassign a citizen from their job (returns to idle)
export function unassignCitizen(citizenId: number): void {
  const job = gameState.jobs.get(citizenId);
  if (!job) return;

  if (job.assignedBuildingId !== null) {
    const building = gameState.buildings.get(job.assignedBuildingId);
    if (building) {
      building.assignedWorkers = building.assignedWorkers.filter(w => w !== citizenId);
    }
  }

  job.jobType = 'idle';
  job.actionState = 'idle';
  job.targetEntityId = null;
  job.assignedBuildingId = null;

  const cit = gameState.citizens.get(citizenId);
  if (cit) {
    cit.workplaceId = null;
    cit.animState = 'idle';
  }
}

// Listen to BuildingCompleted events
EventBus.on('BuildingCompleted', ({ buildingId }) => {
  assignWorkersToBuilding(buildingId);
});
