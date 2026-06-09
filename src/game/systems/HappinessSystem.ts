// ──────────────────────────────────────────────
//  Happiness System
//  Recalculates happiness score once per in-game day
//  and applies speed modifiers to workers
// ──────────────────────────────────────────────

import { gameState, pushNotification } from '../core/GameState';

// Happiness is stored on gameState as a loose field
// We initialize it lazily
function getHappiness(): number {
  return (gameState as any).happiness ?? 60;
}

function setHappiness(v: number) {
  (gameState as any).happiness = Math.max(0, Math.min(100, v));
}

// Track last day we updated
let _lastHappinessDay = -1;
let _starvationDaysClean = 0;
let _starvationThisWeek = 0;

export function getHappinessScore(): number {
  return getHappiness();
}

export function getHappinessEmoji(): string {
  const h = getHappiness();
  if (h > 75) return '😀';
  if (h > 50) return '😐';
  if (h > 25) return '😟';
  return '😡';
}

export function getHappinessColor(): string {
  const h = getHappiness();
  if (h > 75) return 'hsl(120 55% 55%)';
  if (h > 50) return 'hsl(60 55% 55%)';
  if (h > 25) return 'hsl(30 65% 55%)';
  return 'hsl(0 65% 55%)';
}

export function getHappinessModifiers(): Array<{ label: string; value: number }> {
  const { resources, population, maxPopulation, buildings, military, gameTime } = gameState;
  const relics = (gameState as any).relicsCollected ?? 0;
  const techs = (gameState as any).researchedTechs?.size ?? 0;
  const mods: Array<{ label: string; value: number }> = [];

  // Count active houses
  let houseCount = 0;
  let hasFarm = false;
  let hasMarket = false;
  let housedCitizens = 0;

  buildings.forEach(b => {
    if (b.state !== 'active') return;
    if (b.type === 'house') { houseCount++; housedCitizens += b.assignedWorkers.length; }
    if (b.type === 'farm_field') hasFarm = true;
    if (b.type === 'market') hasMarket = true;
  });

  const minHouses = Math.ceil(population / 4);
  const extraHouses = houseCount - minHouses;
  if (extraHouses > 0) mods.push({ label: 'Extra housing', value: Math.min(extraHouses * 10, 30) });
  if (_starvationDaysClean >= 3) mods.push({ label: 'Well-fed', value: 15 });
  if (resources.food < 5 && population > 0) mods.push({ label: 'Food shortage', value: -20 });
  if (military.activeRaid) mods.push({ label: 'Under attack', value: -20 });
  if (relics > 0) mods.push({ label: `Relics (×${relics})`, value: relics * 5 });
  const tcHp = military.buildingHp.get(0); // town center hp — approximate
  if (tcHp !== undefined && tcHp < 100) mods.push({ label: 'Town Center damaged', value: -15 });
  if (hasMarket) mods.push({ label: 'Market present', value: 8 });
  if (_starvationThisWeek > 0) mods.push({ label: `Deaths this week (×${_starvationThisWeek})`, value: _starvationThisWeek * -5 });
  const unsheltered = Math.max(0, population - housedCitizens);
  if (unsheltered > 0) mods.push({ label: `Unsheltered (×${unsheltered})`, value: unsheltered * -10 });
  if (techs > 0) mods.push({ label: `Technologies (×${techs})`, value: techs * 5 });
  if (population >= maxPopulation && maxPopulation > 0) mods.push({ label: 'Overcrowded', value: -5 });

  return mods;
}

export function runHappinessSystem(dt: number) {
  const { gameTime } = gameState;
  if (gameTime.day === _lastHappinessDay) return;
  _lastHappinessDay = gameTime.day;

  // Update starvation tracking
  if (gameState.resources.food > 5) {
    _starvationDaysClean++;
  } else {
    _starvationDaysClean = 0;
  }

  // Reset weekly starvation counter
  if (gameTime.day % 7 === 0) _starvationThisWeek = 0;

  // Recalculate happiness
  const base = 50;
  const mods = getHappinessModifiers();
  const total = mods.reduce((sum, m) => sum + m.value, 0);
  const newHappiness = Math.max(0, Math.min(100, base + total));
  const prev = getHappiness();
  setHappiness(newHappiness);

  // Significant change notification
  if (Math.abs(newHappiness - prev) >= 10) {
    const delta = newHappiness - prev;
    pushNotification(
      `${getHappinessEmoji()} Happiness ${delta > 0 ? '+' : ''}${Math.round(delta)} → ${Math.round(newHappiness)}`,
      delta > 0 ? 'success' : 'warning'
    );
  }

  // Effects
  if (newHappiness < 40) {
    (gameState as any).happinessSpeedMult = 0.85;
  } else if (newHappiness > 80) {
    (gameState as any).happinessSpeedMult = 1.1;
  } else {
    (gameState as any).happinessSpeedMult = 1.0;
  }

  // Desertion (below 20)
  if (newHappiness < 20 && gameState.military.soldiers.size > 0) {
    const soldierIds = Array.from(gameState.military.soldiers.keys());
    const deserter = soldierIds[Math.floor(Math.random() * soldierIds.length)];
    if (deserter !== undefined) {
      gameState.military.soldiers.delete(deserter);
      gameState.military.soldierTransforms.delete(deserter);
      pushNotification('😡 A soldier deserted due to low morale!', 'error');
    }
  }

  // Migration event (above 90)
  if (newHappiness > 90 && Math.random() < 0.3) {
    pushNotification('😀 High morale! A new settler has arrived (+1 pop capacity)', 'success');
    gameState.maxPopulation++;
  }
}

export function recordStarvationDeath() {
  _starvationThisWeek++;
}
