// ──────────────────────────────────────────────
//  Global game state singleton
// ──────────────────────────────────────────────

import type { BuildingType, ResourceType } from './EventBus';
import { World, ComponentStore } from './ECS';
import type {
  TransformComponent,
  MovementComponent,
  PathComponent,
  JobComponent,
  InventoryComponent,
  CitizenComponent,
  BuildingComponent,
  ResourceNodeComponent,
  RenderComponent,
  SelectableComponent,
  IsCitizen,
  IsBuilding,
  IsResourceNode,
} from './Components';
import type { SoldierComponent, EnemyComponent, TrainingQueueItem } from './MilitaryTypes';

export interface ResourceStore {
  wood: number;
  food: number;
  stone: number;
}

export interface EnemyBuildOrderItem {
  type: 'house' | 'farm' | 'barracks' | 'tower';
  cost: Partial<ResourceStore>;
  timeRemaining: number;
  x?: number;
  z?: number;
}

export interface EnemyTrainOrderItem {
  type: 'raider' | 'berserker' | 'siege_archer';
  timeRemaining: number;
}

export interface EnemyWorkerState {
  id: number;
  x: number;
  y: number;
  z: number;
  rotation: number;
  speed: number;
  state: 'idle' | 'moving_to_resource' | 'gathering' | 'returning' | 'moving_to_build' | 'building';
  task: 'wood' | 'food' | 'stone' | 'build' | 'idle';
  targetResourceId: number | null;
  targetBuildType: 'house' | 'farm' | 'tower' | 'barracks' | null;
  targetX: number | null;
  targetZ: number | null;
  carryType: 'wood' | 'food' | 'stone' | null;
  carryAmount: number;
  gatherTimer: number;
}

export interface EnemyFactionState {
  baseEntityId: number | null;
  basePosition: { x: number; z: number };
  baseHp: number;
  baseMaxHp: number;
  workers: Set<number>;
  militaryUnits: Set<number>;
  resources: ResourceStore;
  buildQueue: EnemyBuildOrderItem[];
  trainQueue: EnemyTrainOrderItem[];
  threatLevel: number;
  lastAttackTick: number;
  difficulty: 'easy' | 'standard' | 'hard';
  destroyed: boolean;
  barracksPosition: { x: number; z: number } | null;
  barracksBuiltTick: number | null;
  progress: {
    houseBuilt: boolean;
    farmBuilt: boolean;
    scoutPostBuilt: boolean;
    barracksBuilt: boolean;
    wallsBuilt: boolean;
    scoutCompleted: boolean;
    firstAttackLaunched: boolean;
  };
  scoutUnitIds: Set<number>;
  visualStructures: Array<{
    id: number;
    type: Extract<BuildingType, 'town_center' | 'house' | 'farm_field' | 'barracks' | 'tower'>;
    x: number;
    z: number;
    hp: number;
    maxHp: number;
    state: 'planned' | 'active';
  }>;
  nextStructureId: number;
  labour: {
    assignments: { wood: number; food: number; stone: number; builder: number };
    gatherEfficiency: number;
    lastGrowthTick: number;
  };
  workerEntities: Map<number, EnemyWorkerState>;
  nextWorkerId: number;
  ai: {
    seededVariance: number;
    nextScoutTick: number;
    nextAttackDecisionTick: number;
    nextExpansionTick: number;
  };
}

export interface PressureState {
  scoutSent: boolean;
  scoutResolved: boolean;
  firstHarassSent: boolean;
  firstObjectiveSpawned: boolean;
}

export interface MapObjective {
  id: number;
  type: 'relic' | 'watchpoint' | 'supply_cache';
  owner: 'player' | 'enemy' | 'neutral';
  captureProgress: number;
  position: { x: number; z: number };
  bonus: { key: 'morale' | 'vision' | 'resource_tick' | 'tech_speed'; value: number };
}

export interface TerrainGameplayModifiers {
  movement: Record<'plain' | 'forest' | 'marsh' | 'slope' | 'highground' | 'shore', number>;
  damageHighgroundBonus: number;
  rangedForestMitigation: number;
}

export type GraphicsQualityTier = 'ultra' | 'high' | 'medium' | 'low';

export interface GraphicsSettings {
  qualityTier: GraphicsQualityTier;
  shadows: boolean;
  ao: boolean;
  bloom: boolean;
  dof: boolean;
  ssrWater: boolean;
  volumetrics: boolean;
  renderScale: number;
  anisotropy: number;
}

export interface RenderBudgetMetrics {
  frameMs: number;
  cpuMs: number;
  gpuMs: number;
  drawCalls: number;
  triangles: number;
  postMs: number;
}

export interface OceanRenderSettings {
  wavePreset: 'calm' | 'normal' | 'storm';
  ssrSteps: number;
  foamQuality: 'low' | 'medium' | 'high';
  causticsQuality: 'low' | 'medium' | 'high';
  shoreBlendDistance: number;
}

export interface PlayerCharacterState {
  controlActive: boolean;
  aiMode: boolean;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  vy: number;
  hp: number;
  maxHp: number;
}

export type ColorblindMode = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export type MotionMode = 'normal' | 'reduced' | 'minimal';
export type RightPanelType = 'none' | 'military' | 'market' | 'tech' | 'stronghold';
export type HudDensity = 'compact' | 'balanced' | 'dense';
export type UtilityDrawer = 'none' | 'left' | 'right';
export type ControlGroupSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ControlGroups = Record<ControlGroupSlot, number[]>;

export interface UIState {
  uiScale: 1 | 1.25 | 1.5 | 1.75;
  colorblindMode: ColorblindMode;
  highContrastUI: boolean;
  motionMode: MotionMode;
  hudDensity: HudDensity;
  drawerAutoCollapseMs: number;
  minimapPosition: 'bottom-left';
  utilityDrawer: UtilityDrawer;
  activeRightPanel: RightPanelType;
  leftColumnCollapsed: { objectives: boolean; eventLog: boolean };
  tutorialHintsEnabled: boolean;
}

// ── Wall segment ──────────────────────────────────────────────────────────────
export interface WallSegment {
  id: number;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  hp: number;
  maxHp: number;
  isGate: boolean;
  gateOpen: boolean;
}


export interface GameTime {
  day: number;
  hour: number;
  minute: number;
  totalMinutes: number;
}

// ── Military state ────────────────────────────────────────────────────────────
export interface MilitaryState {
  soldiers: Map<number, SoldierComponent>;       // soldierId → component
  soldierTransforms: Map<number, TransformComponent>;
  enemies: Map<number, EnemyComponent>;           // enemyId → component
  enemyTransforms: Map<number, TransformComponent>;
  trainingQueues: Map<number, TrainingQueueItem[]>; // barracksId → queue
  buildingHp: Map<number, number>;               // buildingId → current HP
  raidSchedule: number[];                         // game days for next raids
  nextRaidDay: number;
  raidWarningShown: boolean;
  raidsRepelled: number;
  raidsDefeated: number;
  activeRaid: boolean;
  soldierIdCounter: number;
  enemyIdCounter: number;
  selectedSoldierId: number | null;
  gameOver: boolean;
  gameWon: boolean;
  soldiersTrainedTotal: number;
  citizenHp: Map<number, number>;
}

export interface GameState {
  world: World;
  transforms: ComponentStore<TransformComponent>;

  movements: ComponentStore<MovementComponent>;
  paths: ComponentStore<PathComponent>;
  jobs: ComponentStore<JobComponent>;
  inventories: ComponentStore<InventoryComponent>;
  citizens: ComponentStore<CitizenComponent>;
  buildings: ComponentStore<BuildingComponent>;
  resourceNodes: ComponentStore<ResourceNodeComponent>;
  renders: ComponentStore<RenderComponent>;
  selectables: ComponentStore<SelectableComponent>;
  isCitizen: ComponentStore<IsCitizen>;
  isBuilding: ComponentStore<IsBuilding>;
  isResourceNode: ComponentStore<IsResourceNode>;
  resources: ResourceStore;
  population: number;
  maxPopulation: number;
  timeScale: number;
  paused: boolean;
  tick: number;
  accumulator: number;
  gameTime: GameTime;
  seed: number;
  selectedEntity: number | null;
  selectedGroupIds: number[];
  controlGroups: ControlGroups;
  buildMode: string | null;
  saveVersion: number;
  notifications: Array<{ id: number; message: string; type: 'info' | 'success' | 'warning' | 'error'; ts: number }>;
  nextNotificationId: number;
  resourceDeltas: Partial<Record<ResourceType, number>>;
  military: MilitaryState;
  walls: WallSegment[];
  nextWallId: number;
  graphics: GraphicsSettings;
  renderMetrics: RenderBudgetMetrics;
  oceanRender: OceanRenderSettings;
  playerCharacter: PlayerCharacterState;
  ui: UIState;
  enemyFaction: EnemyFactionState;
  pressure: PressureState;
  mapObjectives: Map<number, MapObjective>;
  terrainGameplay: TerrainGameplayModifiers;
}


function createMilitaryState(): MilitaryState {
  return {
    soldiers: new Map(),
    soldierTransforms: new Map(),
    enemies: new Map(),
    enemyTransforms: new Map(),
    trainingQueues: new Map(),
    buildingHp: new Map(),
    raidSchedule: [9, 15, 22, 30],
    nextRaidDay: 9,
    raidWarningShown: false,
    raidsRepelled: 0,
    raidsDefeated: 0,
    activeRaid: false,
    soldierIdCounter: 10000,
    enemyIdCounter: 20000,
    selectedSoldierId: null,
    gameOver: false,
    gameWon: false,
    soldiersTrainedTotal: 0,
    citizenHp: new Map(),
  };
}

function createControlGroups(): ControlGroups {
  return {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
    8: [],
    9: [],
  };
}

export function createInitialGameState(): GameState {
  return {
    world: new World(),
    transforms: new ComponentStore(),
    movements: new ComponentStore(),
    paths: new ComponentStore(),
    jobs: new ComponentStore(),
    inventories: new ComponentStore(),
    citizens: new ComponentStore(),
    buildings: new ComponentStore(),
    resourceNodes: new ComponentStore(),
    renders: new ComponentStore(),
    selectables: new ComponentStore(),
    isCitizen: new ComponentStore(),
    isBuilding: new ComponentStore(),
    isResourceNode: new ComponentStore(),
    resources: { wood: 20, food: 20, stone: 10 },
    population: 0,
    maxPopulation: 0,
    timeScale: 1,
    paused: false,
    tick: 0,
    accumulator: 0,
    gameTime: { day: 1, hour: 8, minute: 0, totalMinutes: 8 * 60 },
    seed: 42,
    selectedEntity: null,
    selectedGroupIds: [],
    controlGroups: createControlGroups(),
    buildMode: null,
    saveVersion: 1,
    notifications: [],
    nextNotificationId: 0,
    resourceDeltas: {},
    military: createMilitaryState(),
    walls: [],
    nextWallId: 1,
    graphics: {
      qualityTier: 'high',
      shadows: true,
      ao: true,
      bloom: true,
      dof: true,
      ssrWater: false,
      volumetrics: true,
      renderScale: 1,
      anisotropy: 8,
    },
    renderMetrics: {
      frameMs: 0,
      cpuMs: 0,
      gpuMs: 0,
      drawCalls: 0,
      triangles: 0,
      postMs: 0,
    },
    oceanRender: {
      wavePreset: 'normal',
      ssrSteps: 20,
      foamQuality: 'high',
      causticsQuality: 'high',
      shoreBlendDistance: 18,
    },
    playerCharacter: {
      controlActive: false,
      aiMode: true,
      x: 3,
      y: 0,
      z: 3,
      rotationY: 0,
      vy: 0,
      hp: 120,
      maxHp: 120,
    },
    ui: {
      uiScale: 1,
      colorblindMode: 'off',
      highContrastUI: false,
      motionMode: 'normal',
      hudDensity: 'compact',
      drawerAutoCollapseMs: 8000,
      minimapPosition: 'bottom-left',
      utilityDrawer: 'none',
      activeRightPanel: 'none',
      leftColumnCollapsed: { objectives: false, eventLog: false },
      tutorialHintsEnabled: true,
    },
    enemyFaction: {
      baseEntityId: null,
      basePosition: { x: 86, z: -86 },
      baseHp: 2200,
      baseMaxHp: 2200,
      workers: new Set(),
      militaryUnits: new Set(),
      resources: { wood: 20, food: 20, stone: 10 },
      buildQueue: [],
      trainQueue: [],
      threatLevel: 1,
      lastAttackTick: 0,
      difficulty: 'standard',
      destroyed: false,
      barracksPosition: null,
      barracksBuiltTick: null,
      progress: {
        houseBuilt: false,
        farmBuilt: false,
        scoutPostBuilt: false,
        barracksBuilt: false,
        wallsBuilt: false,
        scoutCompleted: false,
        firstAttackLaunched: false,
      },
      scoutUnitIds: new Set(),
      visualStructures: [],
      nextStructureId: 1,
      labour: {
        assignments: { wood: 2, food: 1, stone: 1, builder: 0 },
        gatherEfficiency: 1,
        lastGrowthTick: 0,
      },
      workerEntities: new Map(),
      nextWorkerId: 1,
      ai: {
        seededVariance: 0.5,
        nextScoutTick: 0,
        nextAttackDecisionTick: 0,
        nextExpansionTick: 0,
      },
    },
    pressure: {
      scoutSent: false,
      scoutResolved: false,
      firstHarassSent: false,
      firstObjectiveSpawned: false,
    },
    mapObjectives: new Map(),
    terrainGameplay: {
      movement: {
        plain: 1.0,
        forest: 0.86,
        marsh: 0.72,
        slope: 0.83,
        highground: 0.95,
        shore: 0.9,
      },
      damageHighgroundBonus: 0.12,
      rangedForestMitigation: 0.1,
    },
  };
}


export let gameState: GameState = createInitialGameState();

export function setGameState(state: GameState): void {
  gameState = state;
}

export function addResource(type: ResourceType, amount: number): void {
  gameState.resources[type] = Math.max(0, gameState.resources[type] + amount);
  gameState.resourceDeltas[type] = (gameState.resourceDeltas[type] ?? 0) + amount;
}

export function consumeResource(type: ResourceType, amount: number): boolean {
  if (gameState.resources[type] < amount) return false;
  gameState.resources[type] -= amount;
  return true;
}

// ── Notification deduplication ────────────────────────────────────────────────
const NOTIF_DEDUP_MS = 2000;

// Patterns that are too spammy — silently suppressed, only visual effect used
const SUPPRESSED_PATTERNS = [
  /moving \d+ units?/i,
  /\d+ units? (stopped|moving)/i,
  /units? now patrolling/i,
  /soldiers? (attacking|engaging)/i,
  /selected \d+ units?/i,
];

const recentNotifKeys = new Map<string, { time: number; id: number }>();

export function pushNotification(
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info'
): void {
  // Suppress spammy patterns entirely
  if (SUPPRESSED_PATTERNS.some(p => p.test(message))) return;

  const key = message.toLowerCase().trim();
  const now = Date.now();

  // Dedup: same message within 2s → just refresh its timestamp, don't add new
  const recent = recentNotifKeys.get(key);
  if (recent && (now - recent.time) < NOTIF_DEDUP_MS) {
    const existing = gameState.notifications.find(n => n.id === recent.id);
    if (existing) existing.ts = now; // refresh so it stays visible longer
    return;
  }

  const id = gameState.nextNotificationId++;
  gameState.notifications.push({ id, message, type, ts: now });
  if (gameState.notifications.length > 5) gameState.notifications.shift();

  recentNotifKeys.set(key, { time: now, id });

  // Auto-cleanup dedup key after 3s
  setTimeout(() => recentNotifKeys.delete(key), NOTIF_DEDUP_MS + 1000);
}
