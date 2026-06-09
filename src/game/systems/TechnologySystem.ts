// ──────────────────────────────────────────────
//  TechnologySystem – research tree + age progression
// ──────────────────────────────────────────────

import { gameState, pushNotification, addResource } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import type { ResourceType } from '../core/EventBus';

export type Age = 'dark_age' | 'feudal_age' | 'castle_age';

export interface Technology {
  id: string;
  name: string;
  icon: string;
  description: string;
  age: Age;
  researchBuilding: string; // building type
  cost: Partial<Record<ResourceType, number>>;
  researchTime: number; // seconds
}

// ── Global research state ──────────────────────────────────────────────────────
export interface ResearchState {
  currentAge: Age;
  researchedTechs: Set<string>;
  activeResearch: Map<number, { techId: string; timeRemaining: number; totalTime: number }>; // buildingId → active
  unlockedBuildings: Set<string>;
  globalModifiers: {
    woodcutterSpeed: number;
    minerSpeed: number;
    farmProduction: number;
    stoneCarryCapacity: number;
    soldierAttackBonus: number;
    soldierHpBonus: number;
    archerRangeBonus: number;
    wellFedSpeedBonus: number;
  };
}

export function createResearchState(): ResearchState {
  return {
    currentAge: 'dark_age',
    researchedTechs: new Set(),
    activeResearch: new Map(),
    unlockedBuildings: new Set(),
    globalModifiers: {
      woodcutterSpeed: 1.0,
      minerSpeed: 1.0,
      farmProduction: 1.0,
      stoneCarryCapacity: 0,
      soldierAttackBonus: 0,
      soldierHpBonus: 0,
      archerRangeBonus: 0,
      wellFedSpeedBonus: 1.0,
    },
  };
}

// ── Technology definitions ─────────────────────────────────────────────────────
export const TECHNOLOGIES: Technology[] = [
  {
    id: 'double_bit_axe',
    name: 'Double-Bit Axe',
    icon: '🪓',
    description: 'Woodcutters gather +25% faster',
    age: 'dark_age',
    researchBuilding: 'woodcutter_hut',
    cost: { wood: 25 },
    researchTime: 30,
  },
  {
    id: 'pickaxe',
    name: 'Pickaxe',
    icon: '⛏️',
    description: 'Miners gather +25% faster',
    age: 'dark_age',
    researchBuilding: 'quarry',
    cost: { wood: 20, stone: 10 },
    researchTime: 30,
  },
  {
    id: 'horse_collar',
    name: 'Horse Collar',
    icon: '🌾',
    description: 'Farms produce +33% more food',
    age: 'feudal_age',
    researchBuilding: 'farm_field',
    cost: { wood: 30 },
    researchTime: 40,
  },
  {
    id: 'stone_mining',
    name: 'Stone Mining',
    icon: '🪨',
    description: 'Quarry workers carry +1 stone per trip',
    age: 'feudal_age',
    researchBuilding: 'quarry',
    cost: { wood: 30 },
    researchTime: 35,
  },
  {
    id: 'forging',
    name: 'Forging',
    icon: '🔥',
    description: 'All soldiers +3 attack damage',
    age: 'feudal_age',
    researchBuilding: 'smithy',
    cost: { stone: 30, food: 20 },
    researchTime: 45,
  },
  {
    id: 'scale_armor',
    name: 'Scale Armor',
    icon: '🛡️',
    description: 'All soldiers +20 max HP',
    age: 'feudal_age',
    researchBuilding: 'barracks',
    cost: { stone: 40 },
    researchTime: 50,
  },
  {
    id: 'fletching',
    name: 'Fletching',
    icon: '🏹',
    description: 'Archers +2 attack range',
    age: 'feudal_age',
    researchBuilding: 'barracks',
    cost: { wood: 25, food: 15 },
    researchTime: 40,
  },
  {
    id: 'town_watch',
    name: 'Town Watch',
    icon: '👁️',
    description: '+10 happiness to all citizens',
    age: 'feudal_age',
    researchBuilding: 'town_center',
    cost: { food: 35 },
    researchTime: 25,
  },
];

// ── Age requirements ───────────────────────────────────────────────────────────
export const AGE_REQUIREMENTS: Record<Age, { resources: Partial<Record<ResourceType, number>>; buildings: string[]; label: string }> = {
  dark_age: { resources: {}, buildings: [], label: 'Dark Age' },
  feudal_age: {
    resources: { wood: 50, food: 50 },
    buildings: ['woodcutter_hut', 'farm_field'],
    label: 'Feudal Age',
  },
  castle_age: {
    resources: { wood: 100, stone: 50, food: 75 },
    buildings: ['barracks', 'smithy'],
    label: 'Castle Age',
  },
};

export function canAdvanceAge(research: ResearchState): { canAdvance: boolean; missingResources: string[]; missingBuildings: string[] } {
  const nextAge: Age | null = research.currentAge === 'dark_age' ? 'feudal_age' : research.currentAge === 'feudal_age' ? 'castle_age' : null;
  if (!nextAge) return { canAdvance: false, missingResources: [], missingBuildings: [] };

  const reqs = AGE_REQUIREMENTS[nextAge];
  const missingResources: string[] = [];
  const missingBuildings: string[] = [];

  for (const [res, amt] of Object.entries(reqs.resources) as [ResourceType, number][]) {
    if (gameState.resources[res] < amt) {
      missingResources.push(`${res === 'wood' ? '🪵' : res === 'stone' ? '🪨' : '🌾'} ${amt}`);
    }
  }

  for (const bType of reqs.buildings) {
    let found = false;
    gameState.buildings.forEach(b => { if (b.type === bType && b.state === 'active') found = true; });
    if (!found) missingBuildings.push(bType.replace(/_/g, ' '));
  }

  return { canAdvance: missingResources.length === 0 && missingBuildings.length === 0, missingResources, missingBuildings };
}

export function advanceAge(research: ResearchState): boolean {
  const { canAdvance } = canAdvanceAge(research);
  if (!canAdvance) return false;

  const nextAge: Age = research.currentAge === 'dark_age' ? 'feudal_age' : 'castle_age';
  const reqs = AGE_REQUIREMENTS[nextAge];

  // Deduct resources
  for (const [res, amt] of Object.entries(reqs.resources) as [ResourceType, number][]) {
    gameState.resources[res] -= amt;
  }

  research.currentAge = nextAge;
  const label = AGE_REQUIREMENTS[nextAge].label;
  pushNotification(`🏰 Entered the ${label}! New buildings and technologies unlocked.`, 'success');
  EventBus.emit('DayChanged', { day: gameState.gameTime.day }); // refresh UI
  return true;
}

export function canResearch(tech: Technology, research: ResearchState): boolean {
  if (research.researchedTechs.has(tech.id)) return false;
  // Check age
  const ageOrder: Age[] = ['dark_age', 'feudal_age', 'castle_age'];
  if (ageOrder.indexOf(tech.age) > ageOrder.indexOf(research.currentAge)) return false;
  // Check active research (only 1 per building)
  let alreadyResearching = false;
  gameState.buildings.forEach((b, id) => {
    if (b.type === tech.researchBuilding && research.activeResearch.has(id)) {
      alreadyResearching = true;
    }
  });
  if (alreadyResearching) return false;
  // Check cost
  for (const [res, amt] of Object.entries(tech.cost) as [ResourceType, number][]) {
    if (gameState.resources[res] < amt) return false;
  }
  return true;
}

export function startResearch(techId: string, buildingId: number, research: ResearchState): boolean {
  const tech = TECHNOLOGIES.find(t => t.id === techId);
  if (!tech || !canResearch(tech, research)) return false;
  if (research.activeResearch.has(buildingId)) {
    pushNotification('This building is already researching something!', 'error');
    return false;
  }

  // Deduct cost
  for (const [res, amt] of Object.entries(tech.cost) as [ResourceType, number][]) {
    gameState.resources[res] -= amt;
  }

  research.activeResearch.set(buildingId, { techId, timeRemaining: tech.researchTime, totalTime: tech.researchTime });
  pushNotification(`🔬 Researching: ${tech.name} (${tech.researchTime}s)`, 'info');
  return true;
}

function applyTechEffect(techId: string, research: ResearchState): void {
  const mods = research.globalModifiers;
  switch (techId) {
    case 'double_bit_axe':  mods.woodcutterSpeed *= 1.25; break;
    case 'pickaxe':         mods.minerSpeed *= 1.25; break;
    case 'horse_collar':    mods.farmProduction *= 1.33; break;
    case 'stone_mining':    mods.stoneCarryCapacity += 1; break;
    case 'forging':         mods.soldierAttackBonus += 3; gameState.military.soldiers.forEach(s => { s.attack += 3; }); break;
    case 'scale_armor':     mods.soldierHpBonus += 20; gameState.military.soldiers.forEach(s => { s.maxHp += 20; s.hp = Math.min(s.hp + 20, s.maxHp); }); break;
    case 'fletching':       mods.archerRangeBonus += 2; gameState.military.soldiers.forEach(s => { if (s.soldierType === 'archer') s.attackRange += 2; }); break;
    case 'town_watch':      gameState.citizens.forEach(c => { c.happiness = Math.min(100, c.happiness + 10); }); break;
  }
}

// Singleton research state attached to gameState via extension
let _research: ResearchState | null = null;
export function getResearchState(): ResearchState {
  if (!_research) _research = createResearchState();
  return _research;
}
export function resetResearchState(): void { _research = createResearchState(); }

export function runTechnologySystem(dt: number): void {
  if (gameState.paused) return;
  const research = getResearchState();
  const effectiveDt = dt * gameState.timeScale;

  research.activeResearch.forEach((active, buildingId) => {
    active.timeRemaining -= effectiveDt;
    if (active.timeRemaining <= 0) {
      research.activeResearch.delete(buildingId);
      research.researchedTechs.add(active.techId);
      const tech = TECHNOLOGIES.find(t => t.id === active.techId);
      if (tech) {
        applyTechEffect(active.techId, research);
        pushNotification(`✅ Research complete: ${tech.name}! ${tech.description}`, 'success');
      }
    }
  });
}
