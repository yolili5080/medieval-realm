// ──────────────────────────────────────────────
//  Main Game Loop – orchestrates all systems
// ──────────────────────────────────────────────

import { gameState } from './core/GameState';
import { runMovementSystem } from './systems/MovementSystem';
import { runJobSystem } from './systems/JobSystem';
import { runResourceRegenSystem } from './systems/ResourceRegenSystem';
import { runSaveSystem } from './systems/SaveSystem';
import { initResourceStoreSystem } from './systems/ResourceStoreSystem';
import { runConstructionSystem } from './systems/ConstructionSystem';
import { runTimeSystem } from './systems/TimeSystem';
import { runFoodSystem } from './systems/FoodSystem';
import { runCombatSystem } from './systems/CombatSystem';
import { runRaidSystem } from './systems/RaidSystem';
import { runSmithySystem } from './systems/SmithySystem';
import { runTechnologySystem } from './systems/TechnologySystem';
import { runRandomEventSystem, setEventModalCallback } from './systems/RandomEventSystem';
import { runGarrisonSystem } from './systems/GarrisonSystem';
import { runStrongholdSystem } from './systems/StrongholdSystem';
import { runOceanSystem, initOceanFishNodes } from './systems/OceanSystem';
import { runHappinessSystem } from './systems/HappinessSystem';
import { runBuildingUpgradeSystem } from './systems/BuildingUpgradeSystem';
import { runEnemyFactionSystem } from './systems/EnemyFactionSystem';
import { runPressureSystem } from './systems/PressureSystem';
import { runMapObjectiveSystem } from './systems/MapObjectiveSystem';
import { runTerrainGameplaySystem } from './systems/TerrainGameplaySystem';
import { initializeWorld } from './core/WorldInit';
import './systems/JobAssignmentSystem';

const FIXED_STEP = 1 / 15;

let lastTime = 0;
let rafId: number | null = null;
let onTickCallback: (() => void) | null = null;

export function setOnTickCallback(cb: () => void): void {
  onTickCallback = cb;
  setEventModalCallback(cb);
}

function gameLoop(timestamp: number): void {
  if (!lastTime) lastTime = timestamp;
  const delta = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  gameState.accumulator += delta;
  while (gameState.accumulator >= FIXED_STEP) {
    runTimeSystem(FIXED_STEP);
    runJobSystem(FIXED_STEP);
    runConstructionSystem(FIXED_STEP);
    runMovementSystem(FIXED_STEP);
    runTerrainGameplaySystem(FIXED_STEP);
    runEnemyFactionSystem(FIXED_STEP);
    runPressureSystem(FIXED_STEP);
    runMapObjectiveSystem(FIXED_STEP);
    runResourceRegenSystem(FIXED_STEP);
    runFoodSystem(FIXED_STEP);
    runCombatSystem(FIXED_STEP);
    runRaidSystem(FIXED_STEP);
    runSmithySystem(FIXED_STEP);
    runTechnologySystem(FIXED_STEP);
    runRandomEventSystem(FIXED_STEP);
    runGarrisonSystem(FIXED_STEP);
    runStrongholdSystem(FIXED_STEP);
    runOceanSystem(FIXED_STEP);
    runHappinessSystem(FIXED_STEP);
    runBuildingUpgradeSystem(FIXED_STEP);
    runSaveSystem(FIXED_STEP);
    gameState.tick++;
    gameState.accumulator -= FIXED_STEP;
  }

  onTickCallback?.();
  rafId = requestAnimationFrame(gameLoop);
}

export function startGameLoop(): void {
  initResourceStoreSystem();
  initializeWorld(gameState.seed);
  initOceanFishNodes(gameState.seed);
  rafId = requestAnimationFrame(gameLoop);
}

export function stopGameLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
    lastTime = 0;
  }
}
