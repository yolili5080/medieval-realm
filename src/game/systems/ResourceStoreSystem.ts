// ──────────────────────────────────────────────
//  ResourceStoreSystem
//  Listens to ResourceDelivered events and
//  updates global resource totals ONLY via event.
//  Resources never change on timers.
// ──────────────────────────────────────────────

import { EventBus } from '../core/EventBus';
import { addResource, gameState } from '../core/GameState';

let initialized = false;

export function initResourceStoreSystem(): void {
  if (initialized) return;
  initialized = true;

  EventBus.on('ResourceDelivered', ({ resourceType, amount, destinationBuildingId }) => {
    addResource(resourceType, amount);

    // Also add to building's local storage if it has capacity
    const building = gameState.buildings.get(destinationBuildingId);
    if (building) {
      building.storage[resourceType] = (building.storage[resourceType] ?? 0) + amount;
    }
  });
}

export function resetResourceStoreSystem(): void {
  initialized = false;
}
