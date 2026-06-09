// ──────────────────────────────────────────────
//  EventBus – typed publish/subscribe event system
// ──────────────────────────────────────────────

export type ResourceType = 'wood' | 'food' | 'stone';
export type JobType = 'idle' | 'woodcutter' | 'farmer' | 'quarryman' | 'builder' | 'hauler';
export type BuildingType =
  | 'town_center'
  | 'house'
  | 'storage_barn'
  | 'woodcutter_hut'
  | 'farm_field'
  | 'quarry'
  | 'barracks'
  | 'tower'
  | 'smithy'
  | 'guard_post'
  | 'market'
  | 'stronghold'
  | 'dock';

export type SoldierType = 'spearman' | 'swordsman' | 'archer' | 'knight';
export type EnemyType = 'raider' | 'berserker' | 'siege_archer';

export interface GameEvents {
  ResourcePickedUp: { entityId: number; resourceType: ResourceType; amount: number; sourceId: number };
  ResourceDelivered: { entityId: number; resourceType: ResourceType; amount: number; destinationBuildingId: number };
  InventoryChanged: { entityId: number; diff: Partial<Record<ResourceType, number>> };
  BuildingPlaced: { buildingId: number; type: BuildingType; position: [number, number] };
  BuildingCompleted: { buildingId: number; type: BuildingType };
  ConstructionProgress: { buildingId: number; progress: number };
  CitizenAssignedJob: { entityId: number; jobType: JobType };
  CitizenStateChanged: { entityId: number; from: string; to: string };
  EntitySelected: { entityId: number | null };
  TimeScaleChanged: { scale: number };
  SaveRequested: Record<string, never>;
  LoadRequested: Record<string, never>;
  GameLoaded: Record<string, never>;
  TreeHarvested: { treeId: number };
  StoneHarvested: { stoneId: number };
  FoodHarvested: { farmId: number };
  NodeDepleted: { nodeId: number; resourceType: ResourceType };
  NodeRespawned: { nodeId: number; resourceType: ResourceType };
  PopulationChanged: { delta: number };
  DayChanged: { day: number };
  BuildingDemolished: { buildingId: number };
  // Military events
  SoldierTrained: { soldierId: number; soldierType: SoldierType };
  SoldierDied: { soldierId: number };
  EnemySpawned: { enemyId: number; enemyType: EnemyType };
  EnemyDied: { enemyId: number };
  RaidStarted: { day: number; enemyCount: number };
  RaidDefeated: { day: number; raidsRepelled: number };
  BuildingDamaged: { buildingId: number; damage: number; hp: number };
  BuildingDestroyed: { buildingId: number };
  GameOver: { won: boolean; day: number };
  SoldierSelected: { soldierId: number | null };
  ItemCrafted: { smithyId: number; itemType: string };
  BuildingUpgraded: { buildingId: number; level: number };
  PlayerControlToggled: { active: boolean };
  UISettingsChanged: {
    uiScale: 1 | 1.25 | 1.5 | 1.75;
    colorblindMode: 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';
    highContrastUI: boolean;
    motionMode: 'normal' | 'reduced' | 'minimal';
    hudDensity: 'compact' | 'balanced' | 'dense';
    drawerAutoCollapseMs: number;
    minimapPosition: 'bottom-left';
  };
  UIPanelChanged: { panel: 'none' | 'military' | 'market' | 'tech' | 'stronghold' };
  CommandCardActionHovered: { actionId: string | null };
  CommandCardActionInvoked: { actionId: string };
  TutorialHintDismissed: { hintId: string };
  EnemyBaseSpawned: { x: number; z: number };
  EnemyBuildingPlaced: { type: 'house' | 'farm' | 'barracks' | 'tower'; x: number; z: number };
  EnemyWaveLaunched: { composition: Array<'raider' | 'berserker' | 'siege_archer'>; reason: string };
  EnemyFactionDestroyed: Record<string, never>;
  PressureEventStarted: { id: 'scout' | 'harass' | 'objective'; message: string };
  PressureEventResolved: { id: 'scout' | 'harass' | 'objective'; outcome: 'success' | 'partial' | 'fail' };
  PathReplanRequested: { entityId: number; reason: string };
  ObjectiveSpawned: { objectiveId: number; type: 'relic' | 'watchpoint' | 'supply_cache' };
  ObjectiveCaptured: { objectiveId: number; owner: 'player' | 'enemy' | 'neutral' };
  ObjectiveLost: { objectiveId: number; previousOwner: 'player' | 'enemy' | 'neutral' };
  MoveCommandIssued: { x: number; z: number };
  ControlGroupAssigned: { group: number; ids: number[] };
  ControlGroupRecalled: { group: number; ids: number[] };
}


type EventHandler<T> = (payload: T) => void;

class EventBusImpl {
  private listeners: Map<string, Set<EventHandler<unknown>>> = new Map();

  on<K extends keyof GameEvents>(event: K, handler: EventHandler<GameEvents[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler as EventHandler<unknown>);
    return () => this.off(event, handler);
  }

  off<K extends keyof GameEvents>(event: K, handler: EventHandler<GameEvents[K]>): void {
    this.listeners.get(event)?.delete(handler as EventHandler<unknown>);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    this.listeners.get(event)?.forEach((h) => h(payload));
  }

  clear(): void { this.listeners.clear(); }
}

export const EventBus = new EventBusImpl();
