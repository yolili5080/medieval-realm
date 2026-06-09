// ──────────────────────────────────────────────
//  BuildingPlacementSystem
// ──────────────────────────────────────────────

import { gameState, pushNotification } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import type { BuildingType } from '../core/EventBus';
import { BUILDING_DEFS } from '../data/buildings';
import { getTerrainHeight, getTerrainClass, type TerrainGameplayClass } from '../core/Noise';
import { markObstacle } from '../core/Pathfinding';
import { consumeResource } from '../core/GameState';
import { registerStrongholdBuilding, hasStronghold } from './StrongholdSystem';
import { registerDock } from './OceanSystem';

// ── Terrain classification helpers ────────────────────────────────────────────
// getTerrainHeight returns a raw value. We classify it into terrain types:
//   < 0.15  → water (deep/shallow)
//   0.15–0.5 → shore (transition)
//   > 0.5   → land
type TerrainCell = 'deep' | 'shallow' | 'shore' | 'land';

export function classifyTerrain(worldX: number, worldZ: number): TerrainCell {
  const h = getTerrainHeight(worldX, worldZ);
  if (h < 0.05) return 'deep';
  if (h < 0.18) return 'shallow';
  if (h < 0.5) return 'shore';
  return 'land';
}

export function classifyPlacementTerrain(worldX: number, worldZ: number): TerrainGameplayClass {
  return getTerrainClass(worldX, worldZ);
}

export function isWalkableLand(worldX: number, worldZ: number): boolean {
  const t = classifyTerrain(worldX, worldZ);
  return t === 'land' || t === 'shore';
}

// ── Dock placement validation ─────────────────────────────────────────────────
export function validateDockPlacement(cx: number, cz: number): { ok: boolean; reason?: string } {
  // Dock orientation: forward = +Z direction (pier extends into water)
  // We test a fan of rotations and pass if ANY valid orientation works,
  // but the actual check is per the default rotation = 0 (user can't rotate in basic mode).
  // Test multiple forward directions to be generous with shoreline detection.
  const rotations = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

  for (const rot of rotations) {
    const fwdX = Math.sin(rot);
    const fwdZ = Math.cos(rot);
    const rightX = -fwdZ;
    const rightZ = fwdX;

    const backOff = -2.2;
    const frontOff = 2.5;
    const hw = 1.5;

    const backSamples = [
      { x: cx + fwdX * backOff, z: cz + fwdZ * backOff },
      { x: cx + fwdX * backOff + rightX * hw, z: cz + fwdZ * backOff + rightZ * hw },
      { x: cx + fwdX * backOff - rightX * hw, z: cz + fwdZ * backOff - rightZ * hw },
    ];
    const frontSamples = [
      { x: cx + fwdX * frontOff, z: cz + fwdZ * frontOff },
      { x: cx + fwdX * frontOff + rightX * hw, z: cz + fwdZ * frontOff + rightZ * hw },
      { x: cx + fwdX * frontOff - rightX * hw, z: cz + fwdZ * frontOff - rightZ * hw },
    ];

    // Back samples must all be on land
    const backOk = backSamples.every(p => {
      const t = classifyTerrain(p.x, p.z);
      return t === 'land' || t === 'shore';
    });

    // Front samples: at least 2 of 3 must be water
    const waterCount = frontSamples.filter(p => {
      const t = classifyTerrain(p.x, p.z);
      return t === 'deep' || t === 'shallow';
    }).length;

    if (backOk && waterCount >= 2) {
      // Center should be near water
      const centerT = classifyTerrain(cx, cz);
      if (centerT !== 'land') return { ok: true };
    }
  }

  // Check center terrain for a more informative message
  const ct = classifyTerrain(cx, cz);
  if (ct === 'land') return { ok: false, reason: 'Dock must be placed on shoreline, not inland' };
  if (ct === 'deep' || ct === 'shallow') return { ok: false, reason: 'Dock must connect to land — place closer to shore' };
  return { ok: false, reason: 'Dock must face water — ensure water is adjacent' };
}

export function placeBuilding(type: BuildingType, worldX: number, worldZ: number): number | null {
  // Stronghold is limited to 1
  if (type === 'stronghold' && hasStronghold()) {
    pushNotification('A Stronghold is already built! Only one allowed.', 'error');
    return null;
  }

  // Dock must be on shoreline with water access
  if (type === 'dock') {
    const result = validateDockPlacement(worldX, worldZ);
    if (!result.ok) {
      pushNotification(`⚓ ${result.reason ?? 'Dock must be placed on shoreline'}`, 'error');
      return null;
    }
  }

  const def = BUILDING_DEFS[type];

  // Check resources
  for (const [res, cost] of Object.entries(def.constructionCost) as [keyof typeof def.constructionCost, number][]) {
    if (gameState.resources[res] < cost) {
      pushNotification(`Not enough ${res} to place ${def.label}!`, 'error');
      return null;
    }
  }

  // Consume resources immediately
  for (const [res, cost] of Object.entries(def.constructionCost) as [keyof typeof def.constructionCost, number][]) {
    consumeResource(res, cost);
  }

  const y = getTerrainHeight(worldX, worldZ);
  const buildingId = gameState.world.createEntity();

  const totalCost = Object.values(def.constructionCost).reduce((a, b) => a + (b ?? 0), 0);
  const initialState = totalCost === 0 ? 'active' : 'under_construction';

  gameState.transforms.set(buildingId, { x: worldX, z: worldZ, y, rotation: 0 });
  gameState.buildings.set(buildingId, {
    type,
    state: initialState,
    workerSlots: def.workerSlots,
    assignedWorkers: [],
    storageCapacity: def.storageCapacity,
    storage: {},
    constructionCost: { ...def.constructionCost },
    constructionDelivered: {},
    constructionProgress: totalCost === 0 ? 100 : 0,
    productionRate: def.productionRate,
    produces: def.produces,
    occupationTimer: 0,
    dailyProduced: 0,
    cropProgress: 0,
    cropTimer: 0,
  });
  gameState.renders.set(buildingId, { meshUUID: null, modelId: type, dirty: true, lodLevel: 0 });
  gameState.selectables.set(buildingId, { isSelected: false, label: def.label });
  gameState.isBuilding.set(buildingId, { _tag: 'building' });

  markObstacle(worldX, worldZ, def.footprintX, def.footprintZ);

  // Register special buildings
  if (type === 'stronghold') registerStrongholdBuilding(buildingId);
  if (type === 'dock') registerDock(worldX, worldZ);

  // Add house bonus population
  if (type === 'house' && initialState === 'active') {
    gameState.maxPopulation += 4;
  }

  EventBus.emit('BuildingPlaced', { buildingId, type, position: [worldX, worldZ] });

  if (initialState === 'active') {
    EventBus.emit('BuildingCompleted', { buildingId, type });
  }

  return buildingId;
}
