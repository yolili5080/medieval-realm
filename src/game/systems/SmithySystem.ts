// ──────────────────────────────────────────────
//  SmithySystem – weapon & armor crafting
// ──────────────────────────────────────────────

import { gameState, pushNotification } from '../core/GameState';
import { EventBus } from '../core/EventBus';

export type EquipmentType = 'spear' | 'sword' | 'bow' | 'armor' | 'shield';

export interface SmithyCraft {
  output: EquipmentType;
  label: string;
  icon: string;
  inputs: Partial<Record<'wood' | 'food' | 'stone', number>>;
  time: number; // seconds
}

export const SMITHY_RECIPES: SmithyCraft[] = [
  { output: 'spear',  label: 'Spear',  icon: '⚔️', inputs: { wood: 2, stone: 1 }, time: 20 },
  { output: 'sword',  label: 'Sword',  icon: '🗡️', inputs: { stone: 4 },           time: 35 },
  { output: 'bow',    label: 'Bow',    icon: '🏹', inputs: { wood: 3 },             time: 25 },
  { output: 'armor',  label: 'Armor',  icon: '🛡️', inputs: { stone: 6 },            time: 50 },
  { output: 'shield', label: 'Shield', icon: '🔰', inputs: { wood: 3, stone: 2 },   time: 30 },
];

// Armory: global stock of crafted items
export const armory: Record<EquipmentType, number> = {
  spear: 0, sword: 0, bow: 0, armor: 0, shield: 0,
};

// Active crafting: smithyId → { recipe, timer }
export const smithyCrafting = new Map<number, { recipe: SmithyCraft; timeRemaining: number; totalTime: number }>();
// Queue per smithy
export const smithyQueue = new Map<number, EquipmentType[]>();

export function queueSmithyCraft(smithyId: number, output: EquipmentType): boolean {
  const recipe = SMITHY_RECIPES.find(r => r.output === output);
  if (!recipe) return false;

  // Check resources
  for (const [res, amt] of Object.entries(recipe.inputs) as [keyof typeof recipe.inputs, number][]) {
    if ((gameState.resources as any)[res] < (amt ?? 0)) {
      pushNotification(`Not enough ${res} to craft ${recipe.label}!`, 'error');
      return false;
    }
  }

  // Deduct resources immediately
  for (const [res, amt] of Object.entries(recipe.inputs) as [keyof typeof recipe.inputs, number][]) {
    (gameState.resources as any)[res] = Math.max(0, (gameState.resources as any)[res] - (amt ?? 0));
  }

  if (!smithyQueue.has(smithyId)) smithyQueue.set(smithyId, []);
  smithyQueue.get(smithyId)!.push(output);

  pushNotification(`🔨 Queued crafting: ${recipe.label}`, 'info');
  return true;
}

export function runSmithySystem(dt: number): void {
  if (gameState.paused) return;
  const effectiveDt = dt * gameState.timeScale;

  gameState.buildings.forEach((b, smithyId) => {
    if (b.type !== 'smithy' || b.state !== 'active') return;

    let active = smithyCrafting.get(smithyId);

    // Start next in queue if idle
    if (!active) {
      const queue = smithyQueue.get(smithyId) ?? [];
      if (queue.length === 0) return;
      const nextOutput = queue.shift()!;
      const recipe = SMITHY_RECIPES.find(r => r.output === nextOutput);
      if (!recipe) return;
      active = { recipe, timeRemaining: recipe.time, totalTime: recipe.time };
      smithyCrafting.set(smithyId, active);
    }

    // Tick
    active.timeRemaining -= effectiveDt;
    if (active.timeRemaining <= 0) {
      armory[active.recipe.output]++;
      pushNotification(`⚒️ ${active.recipe.label} crafted! Armory: ${armory[active.recipe.output]}`, 'success');
      EventBus.emit('ItemCrafted', { smithyId, itemType: active.recipe.output });
      smithyCrafting.delete(smithyId);
    }
  });
}
