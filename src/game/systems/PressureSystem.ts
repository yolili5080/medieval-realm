import { gameState, pushNotification } from '../core/GameState';
import { EventBus } from '../core/EventBus';

function totalMinutesNow(): number {
  return (gameState.gameTime.day - 1) * 24 * 60 + gameState.gameTime.hour * 60 + gameState.gameTime.minute;
}

function minuteFromStart(min: number): boolean {
  const start = 8 * 60;
  return totalMinutesNow() >= start + min;
}

export function runPressureSystem(_dt: number): void {
  if (gameState.paused || gameState.military.gameOver) return;
  const p = gameState.pressure;
  const ef = gameState.enemyFaction;

  // Objective layer unlock remains time-based.
  if (!p.firstObjectiveSpawned && minuteFromStart(6)) {
    p.firstObjectiveSpawned = true;
    EventBus.emit('PressureEventStarted', { id: 'objective', message: 'Neutral objectives are now contested.' });
  }

  // Scout and harass are now driven by enemy AI state instead of fixed timestamps.
  if (p.scoutSent && !p.scoutResolved && ef.progress.scoutCompleted) {
    p.scoutResolved = true;
    EventBus.emit('PressureEventResolved', { id: 'scout', outcome: 'success' });
    pushNotification('Enemy scouting phase completed. They are assessing your defenses.', 'info');
  }

  if (ef.progress.firstAttackLaunched && !p.firstHarassSent) {
    p.firstHarassSent = true;
    EventBus.emit('PressureEventStarted', { id: 'harass', message: 'Enemy assault groups are active.' });
  }
}
