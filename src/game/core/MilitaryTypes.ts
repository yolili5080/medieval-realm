// ──────────────────────────────────────────────
//  Military types: Soldiers, Enemies, Combat
// ──────────────────────────────────────────────

import type { SoldierType, EnemyType } from './EventBus';

// ── Soldier ───────────────────────────────────────────────────────────────────
export type SoldierState = 'idle' | 'patrolling' | 'engaging' | 'attacking' | 'retreating' | 'garrisoned' | 'dead';

export interface SoldierEquipment {
  weapon: 'fists' | 'spear' | 'sword' | 'bow' | null;
  armor: 'none' | 'leather' | 'chainmail' | null;
  shield: boolean;
}

export interface SoldierComponent {
  soldierType: SoldierType;
  hp: number;
  maxHp: number;
  attack: number;
  attackRange: number;  // 0 = melee
  attackCooldown: number;  // seconds between attacks
  attackTimer: number;     // current cooldown remaining
  speed: number;
  state: SoldierState;
  targetEnemyId: number | null;
  targetEnemyWorkerId: number | null;
  targetEnemyStructureId: number | null;
  garrisonBuildingId: number | null;
  patrolWaypoints: { x: number; z: number }[];
  patrolIndex: number;
  selected: boolean;
  animTimer: number;
  equipment: SoldierEquipment;
}


export const SOLDIER_DEFS: Record<SoldierType, {
  label: string;
  icon: string;
  hp: number;
  attack: number;
  attackRange: number;
  speed: number;
  trainTime: number;  // seconds
  cost: { wood?: number; stone?: number; food?: number };
}> = {
  spearman: { label: 'Spearman', icon: '⚔️', hp: 80, attack: 12, attackRange: 0, speed: 3.0, trainTime: 30, cost: { wood: 5, food: 2 } },
  swordsman: { label: 'Swordsman', icon: '🗡️', hp: 120, attack: 20, attackRange: 0, speed: 2.8, trainTime: 45, cost: { wood: 8, stone: 5 } },
  archer: { label: 'Archer', icon: '🏹', hp: 60, attack: 25, attackRange: 12, speed: 2.5, trainTime: 40, cost: { wood: 10, food: 3 } },
  knight: { label: 'Knight', icon: '🛡️', hp: 200, attack: 35, attackRange: 0, speed: 3.5, trainTime: 90, cost: { wood: 15, stone: 10, food: 10 } },
};

// ── Enemy ─────────────────────────────────────────────────────────────────────
export type EnemyState =
  | 'marching'
  | 'attacking_wall'
  | 'attacking_building'
  | 'attacking_citizen'
  | 'attacking_soldier'
  | 'attacking_hero'
  | 'retreating'
  | 'dead';

export interface EnemyComponent {
  enemyType: EnemyType;
  hp: number;
  maxHp: number;
  attack: number;
  attackRange: number;
  attackCooldown: number;
  attackTimer: number;
  speed: number;
  state: EnemyState;
  targetId: number | null;  // building, soldier, or citizen id
  spawnSide: 'north' | 'south' | 'east' | 'west';
  animTimer: number;
  spawnTick?: number;
  behavior?: 'scout' | 'combat';
}

export const ENEMY_DEFS: Record<EnemyType, {
  label: string;
  hp: number;
  attack: number;
  attackRange: number;
  speed: number;
  attackCooldown: number;
}> = {
  raider:       { label: 'Raider',       hp: 60,  attack: 10, attackRange: 0, speed: 3.5, attackCooldown: 1.5 },
  berserker:    { label: 'Berserker',    hp: 120, attack: 20, attackRange: 0, speed: 4.0, attackCooldown: 1.0 },
  siege_archer: { label: 'Siege Archer', hp: 40,  attack: 15, attackRange: 10, speed: 2.0, attackCooldown: 2.5 },
};

// ── Building HP ───────────────────────────────────────────────────────────────
export const BUILDING_MAX_HP: Partial<Record<string, number>> = {
  town_center: 500,
  house: 150,
  storage_barn: 200,
  woodcutter_hut: 120,
  farm_field: 100,
  quarry: 130,
  barracks: 300,
  tower: 400,
  smithy: 250,
  guard_post: 120,
  stronghold: 800,
  dock: 200,
};

// ── Training Queue ────────────────────────────────────────────────────────────
export interface TrainingQueueItem {
  soldierType: SoldierType;
  timeRemaining: number;
  totalTime: number;
}
