// ──────────────────────────────────────────────
//  FoodSystem – citizen hunger and consumption
//  Food consumed ONLY on game hour tick — never
//  on a timer or deltaTime accumulation.
//  Resources decrement via direct subtraction
//  (not via ResourceDelivered — that's for gains only).
// ──────────────────────────────────────────────

import { gameState, pushNotification } from '../core/GameState';
import { EventBus } from '../core/EventBus';

// 0.5 food per citizen per in-game hour
const FOOD_PER_CITIZEN_PER_HOUR = 0.5;

let starvationHours = 0;
let lastProcessedHour = -1;
let starvationWarningShown = false;

export function runFoodSystem(_dt: number): void {
  if (gameState.paused) return;

  const { hour } = gameState.gameTime;

  // Only process once per in-game hour (integer boundary)
  if (hour === lastProcessedHour) return;
  lastProcessedHour = hour;

  const { population, resources } = gameState;
  if (population === 0) return;

  // Discrete consumption — rounded to 1 decimal to avoid float drift
  const consumed = Math.round(population * FOOD_PER_CITIZEN_PER_HOUR * 10) / 10;

  if (resources.food >= consumed) {
    resources.food = Math.max(0, Math.round((resources.food - consumed) * 100) / 100);
    starvationHours = 0;
    starvationWarningShown = false;

    // Restore movement speed
    gameState.movements.forEach(mov => {
      if (mov.speed < 2.8) mov.speed = Math.min(3.0, mov.speed + 0.3);
    });
  } else {
    resources.food = 0;
    starvationHours += 1;

    if (!starvationWarningShown) {
      pushNotification('🔴 YOUR PEOPLE ARE STARVING', 'error');
      starvationWarningShown = true;
    }

    // Slow citizens to 50%
    gameState.movements.forEach(mov => {
      if (mov.speed > 1.5) mov.speed = Math.max(1.5, mov.speed * 0.7);
    });

    // After 2 game hours at 0 food, kill one citizen
    if (starvationHours >= 2) {
      starvationHours = 0;
      killOneCitizen();
    }
  }
}

function killOneCitizen(): void {
  let victimId: number | null = null;
  gameState.jobs.forEach((job, id) => {
    if (victimId !== null) return;
    if (job.jobType === 'idle') victimId = id;
  });
  if (victimId === null) {
    gameState.citizens.forEach((_, id) => { if (victimId === null) victimId = id; });
  }
  if (victimId === null) return;

  const cit = gameState.citizens.get(victimId);
  const name = cit?.name ?? 'A citizen';

  gameState.citizens.delete(victimId);
  gameState.transforms.delete(victimId);
  gameState.movements.delete(victimId);
  gameState.paths.delete(victimId);
  gameState.jobs.delete(victimId);
  gameState.inventories.delete(victimId);
  gameState.renders.delete(victimId);
  gameState.selectables.delete(victimId);
  gameState.isCitizen.delete(victimId);

  gameState.population = Math.max(0, gameState.population - 1);
  if (gameState.selectedEntity === victimId) {
    gameState.selectedEntity = null;
    EventBus.emit('EntitySelected', { entityId: null });
  }

  pushNotification(`💀 ${name} has perished from starvation.`, 'error');
  EventBus.emit('PopulationChanged', { delta: -1 });
}
