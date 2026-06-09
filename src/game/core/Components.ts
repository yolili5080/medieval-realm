// ──────────────────────────────────────────────
//  All component definitions (pure data structs)
// ──────────────────────────────────────────────

import type { ResourceType, JobType, BuildingType } from './EventBus';

export interface Vec2 { x: number; z: number }

// ── Transform ────────────────────────────────────────────────────────────────

export interface TransformComponent {
  x: number;
  z: number;
  y: number;         // elevation (terrain height)
  rotation: number;  // Y-axis radians
}

// ── Movement ─────────────────────────────────────────────────────────────────

export interface MovementComponent {
  speed: number;           // units/sec
  turnSpeed: number;       // radians/sec
  velocity: Vec2;
  targetX: number | null;
  targetZ: number | null;
  arrived: boolean;
  radius?: number;         // for local avoidance/collision
  avoidanceWeight?: number;
  formationSlot?: number;
}

// ── Path ─────────────────────────────────────────────────────────────────────

export interface PathComponent {
  waypoints: Vec2[];  // ordered path nodes
  currentWaypoint: number;
  done: boolean;
}

// ── Job ──────────────────────────────────────────────────────────────────────

export type ActionState =
  | 'idle'
  | 'moving_to_resource'
  | 'gathering'
  | 'moving_to_storage'
  | 'delivering'
  | 'moving_to_site'     // builder walking to construction site
  | 'building'           // builder working at site
  | 'moving_to_storage_for_build' // builder going to fetch material
  | 'sleeping';

export interface JobComponent {
  jobType: JobType;
  actionState: ActionState;
  targetEntityId: number | null;   // current resource node or storage or site
  gatherTimer: number;             // seconds until gather complete
  gatherDuration: number;          // configured gather time
  assignedBuildingId: number | null; // the building the citizen works at
  buildMaterialTarget: ResourceType | null; // what material to fetch for construction
  // ── Previous job (saved when interrupted to build) ──────────────────────
  previousJobType: JobType | null;
  previousBuildingId: number | null;
}

// ── Inventory ────────────────────────────────────────────────────────────────

export interface InventoryComponent {
  items: Partial<Record<ResourceType, number>>;
  capacity: number;
  carrying: boolean;
  carryType: ResourceType | null;
}

// ── Citizen ──────────────────────────────────────────────────────────────────

export interface CitizenComponent {
  name: string;
  age: number;
  happiness: number;
  homeId: number | null;
  workplaceId: number | null;
  animState: 'idle' | 'walk' | 'work' | 'carry' | 'sleep';
  wanderSeed: number;   // 0.0–1.0, unique per citizen, set once on spawn
  baseSpeed: number;    // units/sec (2.6–3.4), unique per citizen
}

// ── Building ─────────────────────────────────────────────────────────────────

export type BuildingState = 'planned' | 'under_construction' | 'active' | 'inactive';

export interface BuildingComponent {
  type: BuildingType;
  owner?: 'player' | 'enemy';
  state: BuildingState;
  workerSlots: number;
  assignedWorkers: number[];
  storageCapacity: number;
  storage: Partial<Record<ResourceType, number>>;
  constructionCost: Partial<Record<ResourceType, number>>;
  constructionDelivered: Partial<Record<ResourceType, number>>;
  constructionProgress: number;   // 0-100
  productionRate: number;
  produces: ResourceType | null;
  // For houses: occupation timer
  occupationTimer: number;
  // Wood gathered today / stone mined today counter
  dailyProduced: number;
  // Farm: crop growth progress (0-100)
  cropProgress: number;
  cropTimer: number;
}

// ── Resource Node ────────────────────────────────────────────────────────────

export interface ResourceNodeComponent {
  resourceType: ResourceType;
  amount: number;
  maxAmount: number;
  regenRate: number;  // per second, 0 = no regen
  isBeingHarvested: boolean;
  harvesterId: number | null;
  // For tree respawn
  depleted: boolean;
  respawnTimer: number;
}

// ── Render Object ────────────────────────────────────────────────────────────
// Points to Three.js scene object UUID
export interface RenderComponent {
  meshUUID: string | null;
  modelId: string;        // key for prefab lookup
  dirty: boolean;         // transform needs sync
  lodLevel: number;       // 0 = full, 1 = medium, 2 = low
  lodDistances?: [number, number, number];
  materialVariant?: string;
  castsShadow?: boolean;
  receivesShadow?: boolean;
}

// ── Selection ────────────────────────────────────────────────────────────────

export interface SelectableComponent {
  isSelected: boolean;
  label: string;
}

// ── Tag components (marker types) ────────────────────────────────────────────

export interface IsCitizen { _tag: 'citizen' }
export interface IsBuilding { _tag: 'building' }
export interface IsResourceNode { _tag: 'resource_node' }
