// ──────────────────────────────────────────────
//  Save / Load system (JSON, versioned)
// ──────────────────────────────────────────────

import { gameState, setGameState, createInitialGameState } from '../core/GameState';
import { initializeWorld } from '../core/WorldInit';
import { EventBus } from '../core/EventBus';

interface SaveData {
  version: number;
  seed: number;
  tick: number;
  resources: { wood: number; food: number; stone: number };
  population: number;
}

const SAVE_KEY = 'medieval_city_builder_save_v1';

export function saveGame(): void {
  const data: SaveData = {
    version: gameState.saveVersion,
    seed: gameState.seed,
    tick: gameState.tick,
    resources: { ...gameState.resources },
    population: gameState.population,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    console.log('Game saved.', data);
  } catch (e) {
    console.error('Failed to save game', e);
  }
}

export function loadGame(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data: SaveData = JSON.parse(raw);
    if (data.version !== 1) return false;

    // Restore resources
    gameState.resources.wood = data.resources.wood;
    gameState.resources.food = data.resources.food;
    gameState.resources.stone = data.resources.stone;
    gameState.tick = data.tick;
    gameState.population = data.population;

    EventBus.emit('GameLoaded', {});
    console.log('Game loaded.', data);
    return true;
  } catch (e) {
    console.error('Failed to load game', e);
    return false;
  }
}

export function hasSave(): boolean {
  return !!localStorage.getItem(SAVE_KEY);
}

// Auto-save every 60 seconds
let autoSaveTimer = 0;
export function runSaveSystem(dt: number): void {
  if (gameState.paused) return;
  autoSaveTimer += dt;
  if (autoSaveTimer >= 60) {
    autoSaveTimer = 0;
    saveGame();
  }
}

EventBus.on('SaveRequested', () => saveGame());
EventBus.on('LoadRequested', () => loadGame());
