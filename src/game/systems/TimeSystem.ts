// ──────────────────────────────────────────────
//  TimeSystem – advances game time, emits DayChanged
// ──────────────────────────────────────────────

import { gameState } from '../core/GameState';
import { EventBus } from '../core/EventBus';

// 1 real second = 1 game minute (configurable)
const REAL_SECS_PER_GAME_MINUTE = 1;

export function runTimeSystem(dt: number): void {
  if (gameState.paused) return;
  const effectiveDt = dt * gameState.timeScale;

  const gt = gameState.gameTime;
  const prevDay = gt.day;

  // Advance total minutes
  gt.totalMinutes += effectiveDt / REAL_SECS_PER_GAME_MINUTE;

  // Derive day/hour/minute
  const totalMins = Math.floor(gt.totalMinutes);
  gt.minute = totalMins % 60;
  gt.hour = Math.floor(totalMins / 60) % 24;
  gt.day = Math.floor(gt.totalMinutes / (24 * 60)) + 1;

  if (gt.day !== prevDay) {
    EventBus.emit('DayChanged', { day: gt.day });
    // Reset daily counters
    gameState.buildings.forEach((b) => { b.dailyProduced = 0; });
  }
}
