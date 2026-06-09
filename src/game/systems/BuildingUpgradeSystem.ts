// ──────────────────────────────────────────────
//  BuildingUpgradeSystem
//  Manages building levels 1-5, upgrade costs,
//  benefits, and upgrade timers.
// ──────────────────────────────────────────────

import { gameState, pushNotification } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import type { ResourceType } from '../core/EventBus';

export type BuildingLevel = 1 | 2 | 3 | 4 | 5;

export interface BuildingUpgradeDef {
  woodMultiplier: number;
  stoneMultiplier: number;
  productionBonus: number;   // multiplier on productionRate
  workerSlotsBonus: number;  // added to base
  storageBonus: number;      // added to base storageCapacity
  hpBonus: number;           // added to base maxHp
  upgradeTimeSec: number;
  populationBonus: number;   // for town_center only
}

// Per-level upgrade cost base (multiplied by building's constructionCost × level factor)
const LEVEL_COST_SCALE: Record<BuildingLevel, number> = {
  1: 0,    // already built
  2: 1.0,
  3: 1.8,
  4: 3.0,
  5: 5.0,
};

// Benefits per level (cumulative — level 3 gives all level 2 + level 3 bonuses)
export const LEVEL_BENEFITS: Record<BuildingLevel, BuildingUpgradeDef> = {
  1: { woodMultiplier: 1.0, stoneMultiplier: 1.0, productionBonus: 1.0, workerSlotsBonus: 0, storageBonus: 0, hpBonus: 0, upgradeTimeSec: 0, populationBonus: 0 },
  2: { woodMultiplier: 1.0, stoneMultiplier: 1.0, productionBonus: 1.15, workerSlotsBonus: 0, storageBonus: 25, hpBonus: 50, upgradeTimeSec: 20, populationBonus: 5 },
  3: { woodMultiplier: 1.0, stoneMultiplier: 1.0, productionBonus: 1.35, workerSlotsBonus: 1, storageBonus: 60, hpBonus: 120, upgradeTimeSec: 35, populationBonus: 10 },
  4: { woodMultiplier: 1.0, stoneMultiplier: 1.0, productionBonus: 1.60, workerSlotsBonus: 1, storageBonus: 110, hpBonus: 220, upgradeTimeSec: 55, populationBonus: 20 },
  5: { woodMultiplier: 1.0, stoneMultiplier: 1.0, productionBonus: 2.00, workerSlotsBonus: 2, storageBonus: 200, hpBonus: 400, upgradeTimeSec: 90, populationBonus: 35 },
};

// Per-building override costs (null = use constructionCost × scale)
const UPGRADE_COST_OVERRIDE: Partial<Record<string, Array<Partial<Record<ResourceType, number>>>>> = {
  town_center:    [{}, { wood: 20, stone: 10 }, { wood: 30, stone: 15 }, { wood: 50, stone: 30 }, { wood: 80, stone: 50 }],
  house:          [{}, { wood: 10, stone: 2  }, { wood: 18, stone: 5  }, { wood: 28, stone: 10 }, { wood: 45, stone: 20 }],
  woodcutter_hut: [{}, { wood: 8,  stone: 2  }, { wood: 14, stone: 4  }, { wood: 22, stone: 8  }, { wood: 35, stone: 14 }],
  farm_field:     [{}, { wood: 6,  stone: 2  }, { wood: 10, stone: 4  }, { wood: 18, stone: 8  }, { wood: 30, stone: 12 }],
  quarry:         [{}, { wood: 8,  stone: 4  }, { wood: 14, stone: 8  }, { wood: 24, stone: 14 }, { wood: 38, stone: 22 }],
  barracks:       [{}, { wood: 18, stone: 10 }, { wood: 28, stone: 18 }, { wood: 45, stone: 30 }, { wood: 70, stone: 50 }],
  smithy:         [{}, { wood: 14, stone: 12 }, { wood: 24, stone: 20 }, { wood: 38, stone: 32 }, { wood: 60, stone: 50 }],
  storage_barn:   [{}, { wood: 14, stone: 5  }, { wood: 22, stone: 9  }, { wood: 35, stone: 15 }, { wood: 55, stone: 25 }],
  tower:          [{}, { wood: 8,  stone: 14 }, { wood: 14, stone: 22 }, { wood: 22, stone: 36 }, { wood: 36, stone: 58 }],
  market:         [{}, { wood: 28, stone: 6  }, { wood: 45, stone: 10 }, { wood: 70, stone: 18 }, { wood: 110, stone: 28 }],
  stronghold:     [{}, { wood: 80, stone: 60 }, { wood: 120, stone: 90 }, { wood: 180, stone: 140 }, { wood: 280, stone: 220 }],
};

// Active upgrade timers: buildingId → { level: target, timeRemaining }
export const buildingUpgradeTimers = new Map<number, { targetLevel: BuildingLevel; timeRemaining: number; totalTime: number }>();

// Current building levels (buildingId → level)
export const buildingLevels = new Map<number, BuildingLevel>();

export function getBuildingLevel(buildingId: number): BuildingLevel {
  return buildingLevels.get(buildingId) ?? 1;
}

export function getUpgradeCost(buildingId: number): Partial<Record<ResourceType, number>> | null {
  const building = gameState.buildings.get(buildingId);
  if (!building || building.state !== 'active') return null;
  const currentLevel = getBuildingLevel(buildingId);
  if (currentLevel >= 5) return null;
  const nextLevel = (currentLevel + 1) as BuildingLevel;
  const override = UPGRADE_COST_OVERRIDE[building.type];
  if (override) return override[nextLevel - 1] ?? null;
  // Fallback: scale construction cost
  const result: Partial<Record<ResourceType, number>> = {};
  const scale = LEVEL_COST_SCALE[nextLevel];
  for (const [res, amt] of Object.entries(building.constructionCost) as [ResourceType, number][]) {
    result[res] = Math.ceil((amt ?? 0) * scale * 1.5);
  }
  return result;
}

export function canUpgradeBuilding(buildingId: number): { canUpgrade: boolean; reason?: string } {
  const building = gameState.buildings.get(buildingId);
  if (!building || building.state !== 'active') return { canUpgrade: false, reason: 'Not active' };
  const currentLevel = getBuildingLevel(buildingId);
  if (currentLevel >= 5) return { canUpgrade: false, reason: 'Max level reached' };
  if (buildingUpgradeTimers.has(buildingId)) return { canUpgrade: false, reason: 'Already upgrading' };
  const cost = getUpgradeCost(buildingId);
  if (!cost) return { canUpgrade: false, reason: 'No upgrade available' };
  for (const [res, amt] of Object.entries(cost) as [ResourceType, number][]) {
    if ((gameState.resources[res] ?? 0) < (amt ?? 0)) {
      return { canUpgrade: false, reason: `Need more ${res}` };
    }
  }
  return { canUpgrade: true };
}

export function startBuildingUpgrade(buildingId: number): boolean {
  const check = canUpgradeBuilding(buildingId);
  if (!check.canUpgrade) {
    pushNotification(`Cannot upgrade: ${check.reason}`, 'error');
    return false;
  }
  const cost = getUpgradeCost(buildingId)!;
  for (const [res, amt] of Object.entries(cost) as [ResourceType, number][]) {
    gameState.resources[res] = Math.max(0, gameState.resources[res] - (amt ?? 0));
  }
  const currentLevel = getBuildingLevel(buildingId);
  const nextLevel = (currentLevel + 1) as BuildingLevel;
  const timeSec = LEVEL_BENEFITS[nextLevel].upgradeTimeSec;
  buildingUpgradeTimers.set(buildingId, { targetLevel: nextLevel, timeRemaining: timeSec, totalTime: timeSec });
  const building = gameState.buildings.get(buildingId);
  pushNotification(`🔨 Upgrading ${building?.type?.replace(/_/g,' ')} to Level ${nextLevel}…`, 'info');
  return true;
}

export function applyLevelBenefits(buildingId: number, level: BuildingLevel): void {
  const building = gameState.buildings.get(buildingId);
  if (!building) return;
  const ben = LEVEL_BENEFITS[level];

  // Apply cumulative benefits
  building.productionRate = (building.productionRate || 1) * ben.productionBonus;
  building.storageCapacity = (building.storageCapacity || 0) + ben.storageBonus;

  // Town Center population bonus
  if (building.type === 'town_center') {
    gameState.maxPopulation += ben.populationBonus;
  }

  EventBus.emit('BuildingUpgraded', { buildingId, level } as any);
}

export function runBuildingUpgradeSystem(dt: number): void {
  if (gameState.paused) return;
  const effectiveDt = dt * gameState.timeScale;
  buildingUpgradeTimers.forEach((timer, buildingId) => {
    timer.timeRemaining -= effectiveDt;
    if (timer.timeRemaining <= 0) {
      buildingUpgradeTimers.delete(buildingId);
      buildingLevels.set(buildingId, timer.targetLevel);
      applyLevelBenefits(buildingId, timer.targetLevel);
      const building = gameState.buildings.get(buildingId);
      pushNotification(`⭐ ${building?.type?.replace(/_/g,' ')} upgraded to Level ${timer.targetLevel}!`, 'success');
    }
  });
}

export function resetBuildingUpgradeSystem(): void {
  buildingUpgradeTimers.clear();
  buildingLevels.clear();
}
