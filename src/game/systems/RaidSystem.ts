import { gameState, pushNotification } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import type { EnemyType, SoldierType } from '../core/EventBus';
import { SOLDIER_DEFS } from '../core/MilitaryTypes';
import { launchEnemyWave } from './EnemyFactionSystem';

function getRaidComposition(day: number): EnemyType[] {
  const enemies: EnemyType[] = [];
  const baseCount = Math.min(4 + Math.floor(day / 3), 12);
  for (let i = 0; i < baseCount; i++) {
    if (day >= 15 && Math.random() < 0.25) enemies.push('siege_archer');
    else if (day >= 10 && Math.random() < 0.3) enemies.push('berserker');
    else enemies.push('raider');
  }
  return enemies;
}

function triggerRaid(day: number): boolean {
  const { military, enemyFaction } = gameState;
  if (military.activeRaid || military.gameOver) return false;
  if (!enemyFaction.progress.barracksBuilt || !enemyFaction.progress.scoutCompleted) return false;
  if (enemyFaction.difficulty === 'easy' && day < 12) return false;
  if (enemyFaction.difficulty !== 'easy' && day < 9) return false;

  const composition = getRaidComposition(day);
  if (!launchEnemyWave(composition, `raid-day-${day}`)) return false;

  military.activeRaid = true;
  military.raidWarningShown = false;
  const nextGap = enemyFaction.difficulty === 'hard' ? 2 : enemyFaction.difficulty === 'easy' ? 5 : 3;
  military.nextRaidDay = day + nextGap + Math.floor(Math.random() * 2);

  pushNotification('Enemy raid launched from their barracks. Defend your settlement!', 'error');
  EventBus.emit('RaidStarted', { day, enemyCount: composition.length });
  return true;
}

export function runRaidSystem(_dt: number): void {
  if (gameState.paused) return;
  const { military, gameTime, enemyFaction } = gameState;
  if (military.gameOver) return;

  const { day, hour, minute } = gameTime;
  if (day > 30 && !military.gameWon && !military.gameOver) {
    military.gameWon = true;
    military.gameOver = true;
    EventBus.emit('GameOver', { won: true, day });
    pushNotification('You have survived 30 days. Your realm stands.', 'success');
    return;
  }

  const canRaidDay = day >= military.nextRaidDay && enemyFaction.progress.barracksBuilt && enemyFaction.progress.scoutCompleted;
  if (canRaidDay) {
    if (!military.activeRaid && !military.raidWarningShown && hour >= 7 && hour < 10) {
      pushNotification('Enemy barracks activity detected. Raiders are massing.', 'warning');
      military.raidWarningShown = true;
    }
    if (!military.activeRaid && hour >= 11 && hour <= 15 && minute < 2) {
      const chance = enemyFaction.difficulty === 'hard' ? 0.55 : enemyFaction.difficulty === 'easy' ? 0.28 : 0.4;
      if (Math.random() > chance) return;
      const launched = triggerRaid(day);
      if (!launched) {
        military.nextRaidDay = day + 1;
        military.raidWarningShown = false;
      }
    }
  }
}

export function enqueueSoldierTraining(barracksId: number, soldierType: SoldierType): boolean {
  const { military } = gameState;
  const def = SOLDIER_DEFS[soldierType];
  if (!def) return false;

  const cost = def.cost as Partial<Record<string, number>>;
  for (const [res, amt] of Object.entries(cost)) {
    if ((gameState.resources as any)[res] < (amt ?? 0)) {
      pushNotification(`Not enough ${res} to train ${def.label}.`, 'error');
      return false;
    }
  }

  for (const [res, amt] of Object.entries(cost)) {
    (gameState.resources as any)[res] = Math.max(0, (gameState.resources as any)[res] - (amt ?? 0));
  }

  if (!military.trainingQueues.has(barracksId)) military.trainingQueues.set(barracksId, []);
  military.trainingQueues.get(barracksId)!.push({
    soldierType,
    timeRemaining: def.trainTime,
    totalTime: def.trainTime,
  });

  pushNotification(`Training ${def.label}...`, 'info');
  return true;
}
