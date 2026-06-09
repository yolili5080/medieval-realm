// ──────────────────────────────────────────────
//  RandomEventSystem – daily events with player choices
//  Checks once per in-game day at midnight (hour 0).
// ──────────────────────────────────────────────

import { gameState, pushNotification, addResource } from '../core/GameState';
import type { ResourceType } from '../core/EventBus';
import { launchEnemyWave } from './EnemyFactionSystem';

export interface EventChoice {
  label: string;
  cost?: Partial<Record<ResourceType, number>>;
  description: string;
  effect: () => void;
}

export interface ActiveEventModal {
  title: string;
  icon: string;
  description: string;
  choices: EventChoice[];
}

// Singleton modal state — read by UI
let _activeEvent: ActiveEventModal | null = null;
let _modalCallback: (() => void) | null = null;

export function getActiveEvent(): ActiveEventModal | null { return _activeEvent; }
export function clearActiveEvent(): void { _activeEvent = null; _modalCallback?.(); }
export function setEventModalCallback(cb: () => void): void { _modalCallback = cb; }

function showEventModal(modal: ActiveEventModal): void {
  _activeEvent = modal;
  gameState.paused = true; // pause while choice shown
  _modalCallback?.();
}

function resolveChoice(index: number): void {
  if (!_activeEvent) return;
  const choice = _activeEvent.choices[index];
  if (!choice) return;

  // Check costs
  if (choice.cost) {
    for (const [res, amt] of Object.entries(choice.cost) as [ResourceType, number][]) {
      if (gameState.resources[res] < amt) {
        pushNotification(`Not enough ${res}!`, 'error');
        return;
      }
    }
    for (const [res, amt] of Object.entries(choice.cost) as [ResourceType, number][]) {
      gameState.resources[res] -= amt;
    }
  }

  choice.effect();
  _activeEvent = null;
  gameState.paused = false;
  _modalCallback?.();
}

export { resolveChoice };

// ── Occurrence tracking ────────────────────────────────────────────────────────
const eventOccurrences: Record<string, number> = {};
let lastCheckedDay = -1;

interface RandomEvent {
  id: string;
  probability: number;
  minDay: number;
  maxOccurrences: number;
  build: () => void;
}

function spawnCitizenNearTC(): void {
  // Spawn near town center
  let tcX = 0, tcZ = 0;
  gameState.buildings.forEach((b, id) => {
    if (b.type === 'town_center') {
      const t = gameState.transforms.get(id);
      if (t) { tcX = t.x; tcZ = t.z; }
    }
  });

  const angle = Math.random() * Math.PI * 2;
  const dist = 5 + Math.random() * 5;
  const cx = tcX + Math.cos(angle) * dist;
  const cz = tcZ + Math.sin(angle) * dist;
  const { getTerrainHeight } = require('../core/Noise');

  const citizenId = gameState.world.createEntity();
  const NAMES = ['Wilhelm', 'Ida', 'Oskar', 'Marta', 'Ulf', 'Sigrid', 'Klaus', 'Hilde'];
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];

  gameState.transforms.set(citizenId, { x: cx, z: cz, y: getTerrainHeight(cx, cz), rotation: 0 });
  gameState.movements.set(citizenId, { speed: 2.8, turnSpeed: Math.PI * 2, velocity: { x: 0, z: 0 }, targetX: null, targetZ: null, arrived: true, radius: 0.5, avoidanceWeight: 0.6 });
  gameState.paths.set(citizenId, { waypoints: [], currentWaypoint: 0, done: true });
  gameState.jobs.set(citizenId, { jobType: 'idle', actionState: 'idle', targetEntityId: null, gatherTimer: 0, gatherDuration: 3, assignedBuildingId: null, buildMaterialTarget: null, previousJobType: null, previousBuildingId: null });
  gameState.inventories.set(citizenId, { items: {}, capacity: 1, carrying: false, carryType: null });
  const ws = Math.random();
  gameState.citizens.set(citizenId, { name, age: 20 + Math.floor(Math.random() * 20), happiness: 75, homeId: null, workplaceId: null, animState: 'idle', wanderSeed: ws, baseSpeed: 2.6 + ws * 0.8 });
  gameState.renders.set(citizenId, { meshUUID: null, modelId: 'citizen_male', dirty: true, lodLevel: 0 });
  gameState.selectables.set(citizenId, { isSelected: false, label: name });
  gameState.isCitizen.set(citizenId, { _tag: 'citizen' });
  gameState.population += 1;
}

// ── Event definitions ──────────────────────────────────────────────────────────
const EVENTS: RandomEvent[] = [
  {
    id: 'bountiful_harvest',
    probability: 0.18,
    minDay: 3,
    maxOccurrences: 4,
    build: () => {
      addResource('food', 20);
      pushNotification('🌾 Bountiful Harvest! +20 food added to stores.', 'success');
    },
  },
  {
    id: 'merchant_visit',
    probability: 0.14,
    minDay: 4,
    maxOccurrences: -1,
    build: () => {
      showEventModal({
        title: 'Travelling Merchant',
        icon: '🛒',
        description: 'A merchant has arrived at your gates! He offers a trade before moving on.',
        choices: [
          {
            label: 'Buy Food (costs 🪵10)',
            description: '→ Receive 🌾20 Food',
            cost: { wood: 10 },
            effect: () => { addResource('food', 20); pushNotification('🛒 Traded wood for food', 'success'); },
          },
          {
            label: 'Buy Stone (costs 🌾15)',
            description: '→ Receive 🪨10 Stone',
            cost: { food: 15 },
            effect: () => { addResource('stone', 10); pushNotification('🛒 Traded food for stone', 'success'); },
          },
          {
            label: 'Buy Wood (costs 🪨8)',
            description: '→ Receive 🪵15 Wood',
            cost: { stone: 8 },
            effect: () => { addResource('wood', 15); pushNotification('🛒 Traded stone for wood', 'success'); },
          },
          {
            label: 'Decline',
            description: 'Send the merchant on his way.',
            effect: () => { pushNotification('The merchant moved on.', 'info'); },
          },
        ],
      });
    },
  },
  {
    id: 'plague',
    probability: 0.07,
    minDay: 8,
    maxOccurrences: 2,
    build: () => {
      // Slow 3 random citizens for a short time
      let count = 0;
      gameState.citizens.forEach((cit, id) => {
        if (count >= 3) return;
        cit.happiness = Math.max(10, cit.happiness - 20);
        const mov = gameState.movements.get(id);
        if (mov) mov.speed = Math.max(1.0, mov.speed * 0.6);
        count++;
      });
      pushNotification('🤒 Sickness! 3 citizens fell ill — happiness and speed reduced.', 'error');
    },
  },
  {
    id: 'gold_discovery',
    probability: 0.06,
    minDay: 10,
    maxOccurrences: 1,
    build: () => {
      addResource('food', 15);
      addResource('wood', 15);
      addResource('stone', 15);
      pushNotification('✨ Gold discovered in your quarry! +15 of each resource!', 'success');
    },
  },
  {
    id: 'refugee',
    probability: 0.13,
    minDay: 6,
    maxOccurrences: 4,
    build: () => {
      showEventModal({
        title: 'Refugees at the Gate',
        icon: '👥',
        description: 'A family fleeing war has arrived at your gates seeking shelter. Do you accept them?',
        choices: [
          {
            label: 'Accept Refugees',
            description: 'Population +2, Happiness +5',
            effect: () => {
              spawnCitizenNearTC();
              spawnCitizenNearTC();
              gameState.citizens.forEach(c => { c.happiness = Math.min(100, c.happiness + 5); });
              pushNotification('👥 Refugees settled — population +2, happiness +5', 'success');
            },
          },
          {
            label: 'Turn Them Away',
            description: 'Happiness -8',
            effect: () => {
              gameState.citizens.forEach(c => { c.happiness = Math.max(0, c.happiness - 8); });
              pushNotification('😞 Refugees turned away — happiness -8', 'warning');
            },
          },
        ],
      });
    },
  },
  {
    id: 'wolf_attack',
    probability: 0.10,
    minDay: 4,
    maxOccurrences: -1,
    build: () => {
      // Damage a random citizen working in the forest
      let attacked = false;
      gameState.citizens.forEach((cit, id) => {
        if (attacked) return;
        const job = gameState.jobs.get(id);
        if (job?.jobType === 'woodcutter' || job?.jobType === 'quarryman') {
          cit.happiness = Math.max(0, cit.happiness - 25);
          attacked = true;
          pushNotification(`🐺 Wolf attack! ${cit.name} was mauled — happiness -25`, 'error');
        }
      });
      if (!attacked) pushNotification('🐺 A wolf pack was spotted near the forest!', 'warning');
    },
  },
  {
    id: 'windfall',
    probability: 0.09,
    minDay: 5,
    maxOccurrences: 3,
    build: () => {
      showEventModal({
        title: 'Drifting Logs',
        icon: '🪵',
        description: 'A flood upstream washed timber down the river to your shores! Take the free wood?',
        choices: [
          {
            label: 'Collect the Logs',
            description: '+25 Wood, 1 citizen busy for a day',
            effect: () => {
              addResource('wood', 25);
              pushNotification('🪵 Collected 25 drifting logs from the river!', 'success');
            },
          },
          {
            label: 'Ignore',
            description: 'Logs float away.',
            effect: () => { pushNotification('The logs drifted away.', 'info'); },
          },
        ],
      });
    },
  },
  {
    id: 'raiders_demand_tribute',
    probability: 0.08,
    minDay: 7,
    maxOccurrences: 3,
    build: () => {
      showEventModal({
        title: 'Raiders Demand Tribute',
        icon: '⚔️',
        description: 'A raider chieftain approaches with terms: pay tribute or face a raid starting in 30 seconds!',
        choices: [
          {
            label: 'Pay Tribute (🌾20 🪵10)',
            description: 'Avoid raid, keep peace.',
            cost: { food: 20, wood: 10 },
            effect: () => { pushNotification('⚔️ Tribute paid — raiders turned away.', 'success'); },
          },
          {
            label: 'Refuse & Prepare',
            description: 'Rally soldiers now!',
            effect: () => {
              pushNotification('⚔️ Raiders enraged! Prepare your defenses!', 'error');
              // Trigger raid with slight delay
              setTimeout(() => {
                if (gameState.enemyFaction.progress.barracksBuilt && gameState.enemyFaction.progress.scoutCompleted) {
                  const launched = launchEnemyWave(['raider', 'raider'], 'tribute-retaliation');
                  if (launched) gameState.military.activeRaid = true;
                }
              }, 15000);
            },
          },
        ],
      });
    },
  },
];

export function runRandomEventSystem(_dt: number): void {
  if (gameState.paused) return;
  if (_activeEvent) return; // don't trigger while modal open

  const { day, hour } = gameState.gameTime;

  // Only check once per in-game day, at hour 0 (midnight)
  if (hour !== 0 || day === lastCheckedDay) return;
  lastCheckedDay = day;

  // Try to trigger one event per day
  for (const event of EVENTS) {
    if (day < event.minDay) continue;
    const occ = eventOccurrences[event.id] ?? 0;
    if (event.maxOccurrences !== -1 && occ >= event.maxOccurrences) continue;
    if (Math.random() > event.probability) continue;

    // Trigger
    eventOccurrences[event.id] = occ + 1;
    event.build();
    break; // one event per day max
  }
}
