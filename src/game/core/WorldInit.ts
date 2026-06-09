// ──────────────────────────────────────────────
//  World Initializer – spawns default entities
// ──────────────────────────────────────────────

import { gameState } from './GameState';
import { BUILDING_DEFS } from '../data/buildings';
import { PRNG, getTerrainHeight } from './Noise';
import { markObstacle } from './Pathfinding';

export function initializeWorld(seed = 42): void {
  const rng = new PRNG(seed);
  const state = gameState;
  const w = state.world;

  // ── Town Center ────────────────────────────────────────────────────────────
  const tcId = w.createEntity();
  const def = BUILDING_DEFS.town_center;
  state.transforms.set(tcId, { x: 0, z: 0, y: getTerrainHeight(0, 0), rotation: 0 });
  state.buildings.set(tcId, {
    type: 'town_center',
    state: 'active',
    workerSlots: def.workerSlots,
    assignedWorkers: [],
    storageCapacity: def.storageCapacity,
    storage: { wood: 20, food: 20, stone: 10 },
    constructionCost: {},
    constructionDelivered: {},
    constructionProgress: 100,
    productionRate: 0,
    produces: null,
    occupationTimer: 0,
    dailyProduced: 0,
    cropProgress: 0,
    cropTimer: 0,
  });
  state.renders.set(tcId, { meshUUID: null, modelId: 'town_center', dirty: true, lodLevel: 0 });
  state.selectables.set(tcId, { isSelected: false, label: 'Town Center' });
  state.isBuilding.set(tcId, { _tag: 'building' });
  markObstacle(0, 0, def.footprintX, def.footprintZ);
  state.maxPopulation += 10; // Town center supports 10 people

  // ── Resource Nodes: Trees (spread across full 400×400 world) ─────────────
  for (let i = 0; i < 120; i++) {
    let tx: number, tz: number;
    // First 40: ring near center (easy access), rest: full world spread
    if (i < 40) {
      const angle = rng.range(0, Math.PI * 2);
      const dist = rng.range(18, 80);
      tx = Math.cos(angle) * dist;
      tz = Math.sin(angle) * dist;
    } else {
      tx = rng.range(-175, 175);
      tz = rng.range(-175, 175);
      // Skip if too close to center (building area)
      if (Math.sqrt(tx * tx + tz * tz) < 14) { tx += 30; tz += 30; }
    }
    const treeId = w.createEntity();
    state.transforms.set(treeId, { x: tx, z: tz, y: getTerrainHeight(tx, tz), rotation: rng.range(0, Math.PI * 2) });
    state.resourceNodes.set(treeId, {
      resourceType: 'wood',
      amount: rng.int(3, 8),
      maxAmount: 8,
      regenRate: 0.001,
      isBeingHarvested: false,
      harvesterId: null,
      depleted: false,
      respawnTimer: 0,
    });
    state.renders.set(treeId, { meshUUID: null, modelId: `tree_${rng.int(1, 3)}`, dirty: true, lodLevel: 0 });
    state.selectables.set(treeId, { isSelected: false, label: 'Oak Tree' });
    state.isResourceNode.set(treeId, { _tag: 'resource_node' });
  }

  // ── Resource Nodes: Stone outcrops (spread across full world) ─────────────
  for (let i = 0; i < 50; i++) {
    let sx: number, sz: number;
    if (i < 12) {
      const angle = rng.range(0, Math.PI * 2);
      const dist = rng.range(22, 80);
      sx = Math.cos(angle) * dist;
      sz = Math.sin(angle) * dist;
    } else {
      sx = rng.range(-170, 170);
      sz = rng.range(-170, 170);
      if (Math.sqrt(sx * sx + sz * sz) < 16) { sx += 35; sz += 25; }
    }
    const stoneId = w.createEntity();
    state.transforms.set(stoneId, { x: sx, z: sz, y: getTerrainHeight(sx, sz), rotation: rng.range(0, Math.PI * 2) });
    state.resourceNodes.set(stoneId, {
      resourceType: 'stone',
      amount: rng.int(5, 12),
      maxAmount: 12,
      regenRate: 0,
      isBeingHarvested: false,
      harvesterId: null,
      depleted: false,
      respawnTimer: 0,
    });
    state.renders.set(stoneId, { meshUUID: null, modelId: 'stone_outcrop', dirty: true, lodLevel: 0 });
    state.selectables.set(stoneId, { isSelected: false, label: 'Stone Outcrop' });
    state.isResourceNode.set(stoneId, { _tag: 'resource_node' });
  }

  // ── Initial Citizens ──────────────────────────────────────────────────────
  const citizenNames = ['Aldric', 'Brunhilda', 'Conrad', 'Dagmar', 'Edmund', 'Freya'];
  const jobs = ['woodcutter', 'woodcutter', 'quarryman', 'idle', 'woodcutter', 'quarryman'] as const;

  for (let i = 0; i < 6; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(4, 10);
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;

    const citizenId = w.createEntity();
    state.transforms.set(citizenId, { x: cx, z: cz, y: getTerrainHeight(cx, cz), rotation: 0 });
    state.movements.set(citizenId, {
      speed: 3 + rng.range(-0.5, 0.5),
      turnSpeed: Math.PI * 2,
      velocity: { x: 0, z: 0 },
      targetX: null,
      targetZ: null,
      arrived: true,
      radius: 0.5,
      avoidanceWeight: 0.6,
    });
    state.paths.set(citizenId, { waypoints: [], currentWaypoint: 0, done: true });
    state.jobs.set(citizenId, {
      jobType: jobs[i],
      actionState: 'idle',
      targetEntityId: null,
      gatherTimer: 0,
      gatherDuration: 3 + rng.range(-0.5, 0.5),
      assignedBuildingId: null,
      buildMaterialTarget: null,
      previousJobType: null,
      previousBuildingId: null,
    });
    state.inventories.set(citizenId, {
      items: {},
      capacity: 1,
      carrying: false,
      carryType: null,
    });
    const wanderSeed = Math.random();
    state.citizens.set(citizenId, {
      name: citizenNames[i],
      age: rng.int(18, 45),
      happiness: 80,
      homeId: tcId,
      workplaceId: null,
      animState: 'idle',
      wanderSeed,
      baseSpeed: 2.6 + wanderSeed * 0.8,
    });
    state.renders.set(citizenId, { meshUUID: null, modelId: 'citizen_male', dirty: true, lodLevel: 0 });
    state.selectables.set(citizenId, { isSelected: false, label: citizenNames[i] });
    state.isCitizen.set(citizenId, { _tag: 'citizen' });
  }

  state.population = 6;
}
