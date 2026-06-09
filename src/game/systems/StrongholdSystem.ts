// ──────────────────────────────────────────────
//  Stronghold System – hero building, tiers, upgrades
// ──────────────────────────────────────────────

import { gameState, pushNotification } from '../core/GameState';
import type { ResourceType } from '../core/EventBus';

export type StrongholdTier = 1 | 2 | 3;

export interface StrongholdUpgrade {
  id: string;
  name: string;
  icon: string;
  tier: StrongholdTier;
  cost: Partial<Record<ResourceType, number>>;
  timeSec: number;
  description: string;
}

export interface StrongholdState {
  buildingId: number | null;
  tier: StrongholdTier;
  hp: number;
  maxHp: number;
  upgradeQueue: { upgradeId: string; timeRemaining: number; totalTime: number } | null;
  completedUpgrades: Set<string>;
  isUpgradingTier: boolean;
  tierUpgradeTimeRemaining: number;
  tierUpgradeTotalTime: number;
}

export const STRONGHOLD_TIER_REQUIREMENTS: Record<StrongholdTier, {
  cost: Partial<Record<ResourceType, number>>;
  requires: string[];
  upgradeTimeSec: number;
  label: string;
  maxHp: number;
}> = {
  1: { cost: {}, requires: [], upgradeTimeSec: 0, label: 'Tier I', maxHp: 800 },
  2: {
    cost: { wood: 120, stone: 90, food: 60 },
    requires: ['barracks', 'smithy'],
    upgradeTimeSec: 90,
    label: 'Tier II',
    maxHp: 1400,
  },
  3: {
    cost: { wood: 200, stone: 160, food: 120 },
    requires: ['market', 'tower'],
    upgradeTimeSec: 150,
    label: 'Tier III',
    maxHp: 2000,
  },
};

export const STRONGHOLD_UPGRADES: StrongholdUpgrade[] = [
  {
    id: 'kings_taxation',
    name: "King's Taxation",
    icon: '💰',
    tier: 1,
    cost: { food: 40, wood: 30 },
    timeSec: 45,
    description: 'Passive +0.5 food per minute from taxes',
  },
  {
    id: 'militia_training',
    name: 'Militia Training',
    icon: '⚔️',
    tier: 1,
    cost: { food: 50 },
    timeSec: 35,
    description: 'Soldier training -15% faster',
  },
  {
    id: 'surplus_storage',
    name: 'Surplus Storage',
    icon: '🏚',
    tier: 1,
    cost: { wood: 40, stone: 20 },
    timeSec: 40,
    description: 'All storage capacity +100',
  },
  {
    id: 'reinforced_gates',
    name: 'Reinforced Gates',
    icon: '🚪',
    tier: 2,
    cost: { stone: 80 },
    timeSec: 60,
    description: 'All wall segments +50% HP',
  },
  {
    id: 'war_drums',
    name: 'War Drums',
    icon: '🥁',
    tier: 2,
    cost: { wood: 60, food: 40 },
    timeSec: 55,
    description: 'Soldiers move +20% faster in combat',
  },
  {
    id: 'master_builder',
    name: 'Master Builder',
    icon: '🔨',
    tier: 2,
    cost: { wood: 70, stone: 30 },
    timeSec: 65,
    description: 'Construction speed +30%',
  },
  {
    id: 'elite_armory',
    name: 'Elite Armory',
    icon: '🛡️',
    tier: 3,
    cost: { stone: 120, food: 80 },
    timeSec: 90,
    description: 'All soldiers +25 max HP and +4 attack',
  },
  {
    id: 'royal_decree',
    name: 'Royal Decree',
    icon: '📜',
    tier: 3,
    cost: { food: 100, wood: 60 },
    timeSec: 100,
    description: 'All citizens +20% work speed and +15 happiness',
  },
  {
    id: 'siege_mastery',
    name: 'Siege Mastery',
    icon: '🏹',
    tier: 3,
    cost: { stone: 100, wood: 80 },
    timeSec: 120,
    description: 'Unlocks Catapult training at Barracks',
  },
];

// Singleton stronghold state
let _stronghold: StrongholdState = {
  buildingId: null,
  tier: 1,
  hp: 800,
  maxHp: 800,
  upgradeQueue: null,
  completedUpgrades: new Set(),
  isUpgradingTier: false,
  tierUpgradeTimeRemaining: 0,
  tierUpgradeTotalTime: 0,
};

export function getStrongholdState(): StrongholdState { return _stronghold; }
export function resetStrongholdState(): void {
  _stronghold = {
    buildingId: null,
    tier: 1,
    hp: 800,
    maxHp: 800,
    upgradeQueue: null,
    completedUpgrades: new Set(),
    isUpgradingTier: false,
    tierUpgradeTimeRemaining: 0,
    tierUpgradeTotalTime: 0,
  };
}

export function hasStronghold(): boolean {
  return _stronghold.buildingId !== null && gameState.buildings.has(_stronghold.buildingId);
}

export function registerStrongholdBuilding(id: number) {
  _stronghold.buildingId = id;
}

export function canUpgradeStrongholdTier(): {
  canUpgrade: boolean;
  nextTier: StrongholdTier | null;
  missingResources: string[];
  missingBuildings: string[];
} {
  const nextTier = (_stronghold.tier + 1) as StrongholdTier;
  if (nextTier > 3) return { canUpgrade: false, nextTier: null, missingResources: [], missingBuildings: [] };

  const reqs = STRONGHOLD_TIER_REQUIREMENTS[nextTier];
  const missingResources: string[] = [];
  const missingBuildings: string[] = [];

  for (const [res, amt] of Object.entries(reqs.cost) as [ResourceType, number][]) {
    if (gameState.resources[res] < amt) {
      const icon = res === 'wood' ? '🪵' : res === 'stone' ? '🪨' : '🌾';
      missingResources.push(`${icon}${amt}`);
    }
  }

  for (const bType of reqs.requires) {
    let found = false;
    gameState.buildings.forEach(b => { if (b.type === bType && b.state === 'active') found = true; });
    if (!found) missingBuildings.push(bType.replace(/_/g, ' '));
  }

  const canUpgrade = missingResources.length === 0 && missingBuildings.length === 0
    && !_stronghold.isUpgradingTier && !_stronghold.upgradeQueue;
  return { canUpgrade, nextTier, missingResources, missingBuildings };
}

export function startTierUpgrade(): boolean {
  const { canUpgrade, nextTier } = canUpgradeStrongholdTier();
  if (!canUpgrade || !nextTier) return false;

  const reqs = STRONGHOLD_TIER_REQUIREMENTS[nextTier];
  for (const [res, amt] of Object.entries(reqs.cost) as [ResourceType, number][]) {
    gameState.resources[res] -= amt;
  }

  _stronghold.isUpgradingTier = true;
  _stronghold.tierUpgradeTotalTime = reqs.upgradeTimeSec;
  _stronghold.tierUpgradeTimeRemaining = reqs.upgradeTimeSec;
  pushNotification(`🏰 Upgrading Stronghold to ${STRONGHOLD_TIER_REQUIREMENTS[nextTier].label}…`, 'info');
  return true;
}

export function canResearchUpgrade(upgrade: StrongholdUpgrade): {
  canResearch: boolean;
  reason?: string;
} {
  if (_stronghold.completedUpgrades.has(upgrade.id)) return { canResearch: false, reason: 'Already researched' };
  if (upgrade.tier > _stronghold.tier) return { canResearch: false, reason: `Requires Tier ${upgrade.tier}` };
  if (_stronghold.upgradeQueue) return { canResearch: false, reason: 'Already researching' };
  if (_stronghold.isUpgradingTier) return { canResearch: false, reason: 'Tier upgrade in progress' };

  for (const [res, amt] of Object.entries(upgrade.cost) as [ResourceType, number][]) {
    if (gameState.resources[res] < amt) {
      return { canResearch: false, reason: `Need more ${res}` };
    }
  }
  return { canResearch: true };
}

export function startStrongholdUpgrade(upgradeId: string): boolean {
  const upgrade = STRONGHOLD_UPGRADES.find(u => u.id === upgradeId);
  if (!upgrade) return false;

  const { canResearch, reason } = canResearchUpgrade(upgrade);
  if (!canResearch) {
    pushNotification(reason ?? 'Cannot research', 'error');
    return false;
  }

  for (const [res, amt] of Object.entries(upgrade.cost) as [ResourceType, number][]) {
    gameState.resources[res] -= amt;
  }

  _stronghold.upgradeQueue = {
    upgradeId,
    timeRemaining: upgrade.timeSec,
    totalTime: upgrade.timeSec,
  };
  pushNotification(`🔬 Researching: ${upgrade.name} (${upgrade.timeSec}s)`, 'info');
  return true;
}

function applyUpgradeEffect(upgradeId: string) {
  const gs = gameState as any;
  switch (upgradeId) {
    case 'kings_taxation':
      gs._strongholdPassiveFood = (gs._strongholdPassiveFood ?? 0) + 0.5;
      break;
    case 'militia_training':
      gs._soldierTrainMultiplier = (gs._soldierTrainMultiplier ?? 1.0) * 0.85;
      break;
    case 'surplus_storage':
      gameState.buildings.forEach(b => { b.storageCapacity += 100; });
      break;
    case 'reinforced_gates':
      gameState.walls.forEach(w => { w.maxHp = Math.round(w.maxHp * 1.5); w.hp = Math.round(w.hp * 1.5); });
      break;
    case 'war_drums':
      gameState.military.soldiers.forEach(s => { s.speed = (s.speed ?? 3) * 1.2; });
      break;
    case 'master_builder':
      gs._constructionSpeedBonus = (gs._constructionSpeedBonus ?? 1.0) * 1.3;
      break;
    case 'elite_armory':
      gameState.military.soldiers.forEach(s => { s.maxHp += 25; s.hp += 25; s.attack = (s.attack ?? 10) + 4; });
      break;
    case 'royal_decree':
      gameState.citizens.forEach(c => { c.happiness = Math.min(100, c.happiness + 15); });
      break;
    case 'siege_mastery':
      gs._siegeMasteryUnlocked = true;
      break;
  }
}

export function runStrongholdSystem(dt: number): void {
  if (gameState.paused || !hasStronghold()) return;
  const eff = dt * gameState.timeScale;

  // Tier upgrade timer
  if (_stronghold.isUpgradingTier) {
    _stronghold.tierUpgradeTimeRemaining -= eff;
    if (_stronghold.tierUpgradeTimeRemaining <= 0) {
      _stronghold.isUpgradingTier = false;
      _stronghold.tier = (_stronghold.tier + 1) as StrongholdTier;
      const tierDef = STRONGHOLD_TIER_REQUIREMENTS[_stronghold.tier];
      _stronghold.maxHp = tierDef.maxHp;
      _stronghold.hp = tierDef.maxHp;
      pushNotification(`🏰 Stronghold upgraded to ${tierDef.label}! New upgrades available.`, 'success');
    }
  }

  // Research upgrade timer
  if (_stronghold.upgradeQueue) {
    _stronghold.upgradeQueue.timeRemaining -= eff;
    if (_stronghold.upgradeQueue.timeRemaining <= 0) {
      const id = _stronghold.upgradeQueue.upgradeId;
      _stronghold.completedUpgrades.add(id);
      _stronghold.upgradeQueue = null;
      const upgrade = STRONGHOLD_UPGRADES.find(u => u.id === id);
      if (upgrade) {
        applyUpgradeEffect(id);
        pushNotification(`✅ ${upgrade.icon} ${upgrade.name} complete! ${upgrade.description}`, 'success');
      }
    }
  }

  // Passive food income from King's Taxation
  const gs = gameState as any;
  if (gs._strongholdPassiveFood) {
    // Rate is per minute, so per second = /60, per tick = *dt
    gameState.resources.food = Math.min(
      gameState.resources.food + gs._strongholdPassiveFood / 60 * eff,
      9999,
    );
  }
}
