// ──────────────────────────────────────────────
//  Data-driven building definitions
// ──────────────────────────────────────────────

import type { BuildingType, ResourceType, JobType } from '../core/EventBus';

export interface BuildingDef {
  type: BuildingType;
  label: string;
  description: string;
  modelId: string;
  workerSlots: number;
  storageCapacity: number;
  constructionCost: Partial<Record<ResourceType, number>>;
  produces: ResourceType | null;
  productionRate: number;
  requiredJobType: JobType | null;
  footprintX: number;
  footprintZ: number;
}

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  town_center: {
    type: 'town_center', label: 'Town Center',
    description: 'Main hub. Stores all resources. Citizens return here.',
    modelId: 'town_center', workerSlots: 0, storageCapacity: 200,
    constructionCost: {}, produces: null, productionRate: 0,
    requiredJobType: null, footprintX: 6, footprintZ: 6,
  },
  house: {
    type: 'house', label: 'House',
    description: 'Provides shelter. Each house supports 4 citizens.',
    modelId: 'house', workerSlots: 0, storageCapacity: 0,
    constructionCost: { wood: 8, stone: 2 }, produces: null, productionRate: 0,
    requiredJobType: null, footprintX: 4, footprintZ: 4,
  },
  storage_barn: {
    type: 'storage_barn', label: 'Storage Barn',
    description: 'Extended storage for resources.',
    modelId: 'storage_barn', workerSlots: 1, storageCapacity: 100,
    constructionCost: { wood: 12, stone: 4 }, produces: null, productionRate: 0,
    requiredJobType: 'hauler', footprintX: 5, footprintZ: 5,
  },
  woodcutter_hut: {
    type: 'woodcutter_hut', label: "Woodcutter's Hut",
    description: 'Workers chop trees and deliver wood to storage.',
    modelId: 'woodcutter_hut', workerSlots: 2, storageCapacity: 20,
    constructionCost: { wood: 6 }, produces: 'wood', productionRate: 1,
    requiredJobType: 'woodcutter', footprintX: 3, footprintZ: 3,
  },
  farm_field: {
    type: 'farm_field', label: 'Farm Field',
    description: 'Grows crops. Farmers harvest food in season.',
    modelId: 'farm_field', workerSlots: 2, storageCapacity: 30,
    constructionCost: { wood: 4 }, produces: 'food', productionRate: 1,
    requiredJobType: 'farmer', footprintX: 8, footprintZ: 6,
  },
  quarry: {
    type: 'quarry', label: 'Quarry',
    description: 'Workers mine stone from rocky outcrops.',
    modelId: 'quarry', workerSlots: 2, storageCapacity: 20,
    constructionCost: { wood: 5, stone: 3 }, produces: 'stone', productionRate: 1,
    requiredJobType: 'quarryman', footprintX: 4, footprintZ: 4,
  },
  barracks: {
    type: 'barracks', label: 'Barracks',
    description: 'Train soldiers here to defend your realm.',
    modelId: 'barracks', workerSlots: 0, storageCapacity: 0,
    constructionCost: { wood: 15, stone: 8 }, produces: null, productionRate: 0,
    requiredJobType: null, footprintX: 5, footprintZ: 5,
  },
  tower: {
    type: 'tower', label: 'Watchtower',
    description: 'Station archers to automatically attack nearby enemies.',
    modelId: 'tower', workerSlots: 2, storageCapacity: 0,
    constructionCost: { wood: 6, stone: 12 }, produces: null, productionRate: 0,
    requiredJobType: null, footprintX: 4, footprintZ: 4,
  },
  smithy: {
    type: 'smithy', label: 'Blacksmith',
    description: 'Craft weapons and armor to equip your soldiers.',
    modelId: 'smithy', workerSlots: 1, storageCapacity: 0,
    constructionCost: { wood: 12, stone: 10 }, produces: null, productionRate: 0,
    requiredJobType: null, footprintX: 4, footprintZ: 4,
  },
  guard_post: {
    type: 'guard_post', label: 'Guard Post',
    description: 'Station one soldier to watch the surrounding area.',
    modelId: 'guard_post', workerSlots: 1, storageCapacity: 0,
    constructionCost: { wood: 4, stone: 2 }, produces: null, productionRate: 0,
    requiredJobType: null, footprintX: 2, footprintZ: 2,
  },
  market: {
    type: 'market', label: 'Market',
    description: 'Trade resources. Exchange rates worsen with each trade.',
    modelId: 'storage_barn', workerSlots: 1, storageCapacity: 0,
    constructionCost: { wood: 25, stone: 5 }, produces: null, productionRate: 0,
    requiredJobType: null, footprintX: 4, footprintZ: 4,
  },
  stronghold: {
    type: 'stronghold', label: 'Stronghold',
    description: 'Legendary progression hub — tiers, upgrades, kingdom bonuses. Only one allowed.',
    modelId: 'stronghold', workerSlots: 0, storageCapacity: 0,
    constructionCost: { wood: 80, stone: 60 }, produces: null, productionRate: 0,
    requiredJobType: null, footprintX: 7, footprintZ: 7,
  },
  dock: {
    type: 'dock', label: 'Dock',
    description: 'Build fishing and transport boats. Deposit fish for food.',
    modelId: 'dock', workerSlots: 1, storageCapacity: 0,
    constructionCost: { wood: 50, stone: 10 }, produces: null, productionRate: 0,
    requiredJobType: null, footprintX: 5, footprintZ: 5,
  },
};

export const BUILDABLE_BUILDINGS: BuildingType[] = [
  'house', 'storage_barn', 'woodcutter_hut', 'farm_field', 'quarry',
  'barracks', 'tower', 'smithy', 'guard_post', 'market', 'stronghold', 'dock',
];
