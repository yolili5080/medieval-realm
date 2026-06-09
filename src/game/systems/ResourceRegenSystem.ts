// ──────────────────────────────────────────────
//  ResourceNodeRegenSystem – tree respawn timers only
//  Does NOT increment resources on timers.
//  Only wood nodes respawn (stone does not regenerate).
// ──────────────────────────────────────────────

import { gameState } from '../core/GameState';

export function runResourceRegenSystem(dt: number): void {
  if (gameState.paused) return;
  const effectiveDt = dt * gameState.timeScale;

  gameState.resourceNodes.forEach((node) => {
    // Respawn timer for depleted wood nodes only
    if (node.depleted && node.resourceType === 'wood' && node.respawnTimer > 0) {
      node.respawnTimer -= effectiveDt;
      if (node.respawnTimer <= 0) {
        node.respawnTimer = 0;
        node.depleted = false;
        node.amount = node.maxAmount;
        node.isBeingHarvested = false;
        node.harvesterId = null;
      }
    }
    // NOTE: Do NOT increment node.amount on a timer — resources only change
    // when citizens physically gather them (JobSystem) or nodes respawn.
  });
}
