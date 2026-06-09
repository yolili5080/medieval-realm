// ──────────────────────────────────────────────
//  Ocean System – boats, fishing, currents
// ──────────────────────────────────────────────

import { gameState, pushNotification } from '../core/GameState';
import { getTerrainHeight } from '../core/Noise';
import { PRNG } from '../core/Noise';

export type BoatType = 'fishing_boat' | 'transport_boat' | 'war_galley';
export type BoatState = 'idle' | 'moving' | 'fishing' | 'returning' | 'dead';

export interface Boat {
  id: number;
  boatType: BoatType;
  hp: number;
  maxHp: number;
  position: { x: number; z: number };
  rotation: number;
  speed: number;
  cargo: { type: 'fish'; amount: number } | null;
  state: BoatState;
  target: { x: number; z: number } | null;
  fishNodeId: string | null;
  attackCooldown: number;
}

export interface FishNode {
  id: string;
  position: { x: number; z: number };
  remaining: number;
  maxAmount: number;
  regenPerDay: number;
  isDepleted: boolean;
  respawnTimer: number;
}

export interface OceanState {
  boats: Map<number, Boat>;
  fishNodes: FishNode[];
  waveTime: number;
  nextBoatId: number;
  dockPositions: Array<{ x: number; z: number }>; // registered docks
}

export const BOAT_DEFS: Record<BoatType, {
  name: string; icon: string;
  cost: Partial<Record<string, number>>;
  trainSec: number; hp: number; speed: number; description: string;
}> = {
  fishing_boat: {
    name: 'Fishing Boat', icon: '🎣',
    cost: { wood: 35 },
    trainSec: 45, hp: 80, speed: 4.0,
    description: 'Collects fish from nodes. Deposits at Dock.',
  },
  transport_boat: {
    name: 'Transport Boat', icon: '⛵',
    cost: { wood: 50 },
    trainSec: 60, hp: 120, speed: 4.5,
    description: 'Carries units across water.',
  },
  war_galley: {
    name: 'War Galley', icon: '🚤',
    cost: { wood: 45, stone: 20 },
    trainSec: 75, hp: 140, speed: 5.0,
    description: 'Combat vessel. Attacks enemy boats.',
  },
};

const FISH_CARGO_MAX = 10;

// Singleton
let _ocean: OceanState = {
  boats: new Map(),
  fishNodes: [],
  waveTime: 0,
  nextBoatId: 50000,
  dockPositions: [],
};

export function getOceanState(): OceanState { return _ocean; }
export function resetOceanState(): void {
  _ocean = { boats: new Map(), fishNodes: [], waveTime: 0, nextBoatId: 50000, dockPositions: [] };
}

export function initOceanFishNodes(seed: number) {
  const rng = new PRNG(seed + 999);
  _ocean.fishNodes = [];

  // Spawn fish nodes in water areas (far from center, where terrain is low)
  for (let i = 0; i < 8; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(55, 90);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const h = getTerrainHeight(x, z);

    // Only place on water (low terrain)
    if (h < 0.15) {
      _ocean.fishNodes.push({
        id: `fish_${i}`,
        position: { x, z },
        remaining: rng.range(30, 60),
        maxAmount: 60,
        regenPerDay: rng.range(5, 12),
        isDepleted: false,
        respawnTimer: 0,
      });
    } else {
      // Fallback – push further out
      const fx = Math.cos(angle + 0.5) * 88;
      const fz = Math.sin(angle + 0.5) * 88;
      _ocean.fishNodes.push({
        id: `fish_${i}_b`,
        position: { x: fx, z: fz },
        remaining: rng.range(25, 50),
        maxAmount: 50,
        regenPerDay: rng.range(4, 10),
        isDepleted: false,
        respawnTimer: 0,
      });
    }
  }
}

export function registerDock(x: number, z: number) {
  _ocean.dockPositions.push({ x, z });
}

export function spawnBoat(boatType: BoatType, nearX: number, nearZ: number): Boat | null {
  const def = BOAT_DEFS[boatType];
  // Check resources
  for (const [res, amt] of Object.entries(def.cost)) {
    if ((gameState.resources as any)[res] < (amt ?? 0)) {
      pushNotification(`Not enough resources to build ${def.name}`, 'error');
      return null;
    }
  }
  for (const [res, amt] of Object.entries(def.cost)) {
    (gameState.resources as any)[res] -= (amt ?? 0);
  }

  const boat: Boat = {
    id: _ocean.nextBoatId++,
    boatType,
    hp: def.hp,
    maxHp: def.hp,
    position: { x: nearX + (Math.random() - 0.5) * 4, z: nearZ + 6 },
    rotation: 0,
    speed: def.speed,
    cargo: null,
    state: 'idle',
    target: null,
    fishNodeId: null,
    attackCooldown: 0,
  };
  _ocean.boats.set(boat.id, boat);
  pushNotification(`⛵ ${def.name} launched!`, 'success');
  return boat;
}

export function commandFishingBoat(boatId: number, nodeId: string) {
  const boat = _ocean.boats.get(boatId);
  const node = _ocean.fishNodes.find(n => n.id === nodeId);
  if (!boat || !node || boat.boatType !== 'fishing_boat') return;
  boat.fishNodeId = nodeId;
  boat.target = { ...node.position };
  boat.state = 'moving';
}

function getNearestDock(pos: { x: number; z: number }): { x: number; z: number } | null {
  if (_ocean.dockPositions.length === 0) return null;
  let best = _ocean.dockPositions[0];
  let bestDist = Infinity;
  for (const dp of _ocean.dockPositions) {
    const d = Math.hypot(dp.x - pos.x, dp.z - pos.z);
    if (d < bestDist) { bestDist = d; best = dp; }
  }
  return best;
}

function isNearTarget(pos: { x: number; z: number }, target: { x: number; z: number }, thresh = 3): boolean {
  return Math.hypot(pos.x - target.x, pos.z - target.z) < thresh;
}

function updateFishingBoat(boat: Boat, dt: number) {
  switch (boat.state) {
    case 'idle': break;

    case 'moving': {
      if (!boat.target) { boat.state = 'idle'; break; }
      const dx = boat.target.x - boat.position.x;
      const dz = boat.target.z - boat.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3) {
        // Arrived
        if (boat.fishNodeId) {
          boat.state = 'fishing';
        } else {
          boat.state = 'idle';
        }
      } else {
        const spd = boat.speed * dt;
        boat.position.x += (dx / dist) * spd;
        boat.position.z += (dz / dist) * spd;
        boat.rotation = Math.atan2(dx, dz);
      }
      break;
    }

    case 'fishing': {
      const node = _ocean.fishNodes.find(n => n.id === boat.fishNodeId);
      if (!node || node.isDepleted) {
        boat.state = 'idle';
        boat.fishNodeId = null;
        break;
      }
      if (!boat.cargo) boat.cargo = { type: 'fish', amount: 0 };
      const rate = 1.5 * dt;
      const take = Math.min(rate, node.remaining, FISH_CARGO_MAX - boat.cargo.amount);
      node.remaining -= take;
      boat.cargo.amount += take;
      if (node.remaining <= 0) {
        node.isDepleted = true;
        node.remaining = 0;
      }
      if (boat.cargo.amount >= FISH_CARGO_MAX || node.isDepleted) {
        const dock = getNearestDock(boat.position);
        if (dock) {
          boat.target = dock;
          boat.state = 'returning';
        } else {
          boat.state = 'idle';
        }
      }
      break;
    }

    case 'returning': {
      if (!boat.target) { boat.state = 'idle'; break; }
      const dx = boat.target.x - boat.position.x;
      const dz = boat.target.z - boat.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        // Deposit
        const fish = boat.cargo?.amount ?? 0;
        if (fish > 0) {
          const fishInt = Math.floor(fish);
          gameState.resources.food += fishInt;
          pushNotification(`🎣 Deposited ${fishInt} fish at Dock (+${fishInt} food)`, 'success');
        }
        boat.cargo = null;
        boat.state = 'idle';
        boat.target = null;
      } else {
        const spd = boat.speed * dt;
        boat.position.x += (dx / dist) * spd;
        boat.position.z += (dz / dist) * spd;
        boat.rotation = Math.atan2(dx, dz);
      }
      break;
    }
  }
}

let _dayAccumulator = 0;
let _lastDay = -1;

export function runOceanSystem(dt: number): void {
  if (gameState.paused) return;
  const eff = dt * gameState.timeScale;

  _ocean.waveTime += eff;

  // Update all boats
  _ocean.boats.forEach(boat => {
    if (boat.state === 'dead') return;
    if (boat.boatType === 'fishing_boat') updateFishingBoat(boat, eff);
    // Simple drift for other boat types
    if (boat.boatType !== 'fishing_boat' && boat.target) {
      const dx = boat.target.x - boat.position.x;
      const dz = boat.target.z - boat.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 3) {
        const spd = boat.speed * eff;
        boat.position.x += (dx / dist) * spd;
        boat.position.z += (dz / dist) * spd;
        boat.rotation = Math.atan2(dx, dz);
      } else {
        boat.target = null;
        boat.state = 'idle';
      }
    }
  });

  // Fish node regen (once per in-game day)
  const currentDay = gameState.gameTime.day;
  if (currentDay !== _lastDay) {
    _lastDay = currentDay;
    _ocean.fishNodes.forEach(node => {
      if (node.isDepleted) {
        node.remaining = Math.min(node.maxAmount, node.remaining + node.regenPerDay);
        if (node.remaining > 0) node.isDepleted = false;
      } else {
        node.remaining = Math.min(node.maxAmount, node.remaining + node.regenPerDay * 0.3);
      }
    });
  }
}
