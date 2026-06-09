// ──────────────────────────────────────────────
//  UnitExperienceSystem – soldiers gain XP, rank up
// ──────────────────────────────────────────────

import { gameState, pushNotification } from '../core/GameState';
import { SOLDIER_DEFS } from '../core/MilitaryTypes';
import type { EnemyType } from '../core/EventBus';

export type SoldierRank = 'recruit' | 'veteran' | 'elite' | 'champion';

export interface SoldierExperience {
  xp: number;
  rank: SoldierRank;
  killCount: number;
}

// XP map: soldierId → experience
export const soldierXP = new Map<number, SoldierExperience>();

const XP_THRESHOLDS: Record<SoldierRank, number> = {
  recruit: 0,
  veteran: 10,
  elite: 30,
  champion: 60,
};

const XP_PER_KILL: Record<EnemyType, number> = {
  raider: 2,
  berserker: 4,
  siege_archer: 3,
};

export const RANK_ICONS: Record<SoldierRank, string> = {
  recruit: '',
  veteran: '⭐',
  elite: '⭐⭐',
  champion: '🌟',
};

const RANK_BONUSES: Record<string, { attackDelta: number; hpDelta: number; speedDelta: number }> = {
  veteran:  { attackDelta: 3,  hpDelta: 15, speedDelta: 0.1 },
  elite:    { attackDelta: 5,  hpDelta: 20, speedDelta: 0.1 },
  champion: { attackDelta: 8,  hpDelta: 30, speedDelta: 0.2 },
};

function getRankForXp(xp: number): SoldierRank {
  if (xp >= XP_THRESHOLDS.champion) return 'champion';
  if (xp >= XP_THRESHOLDS.elite)    return 'elite';
  if (xp >= XP_THRESHOLDS.veteran)  return 'veteran';
  return 'recruit';
}

export function getSoldierXP(soldierId: number): SoldierExperience {
  let xp = soldierXP.get(soldierId);
  if (!xp) {
    xp = { xp: 0, rank: 'recruit', killCount: 0 };
    soldierXP.set(soldierId, xp);
  }
  return xp;
}

export function awardKillXP(soldierId: number, enemyType: EnemyType): void {
  const soldier = gameState.military.soldiers.get(soldierId);
  if (!soldier || soldier.state === 'dead') return;

  const exp = getSoldierXP(soldierId);
  exp.xp += XP_PER_KILL[enemyType] ?? 2;
  exp.killCount++;

  const newRank = getRankForXp(exp.xp);
  if (newRank !== exp.rank) {
    exp.rank = newRank;
    const bonuses = RANK_BONUSES[newRank];
    if (bonuses) {
      soldier.attack += bonuses.attackDelta;
      soldier.maxHp += bonuses.hpDelta;
      soldier.hp = Math.min(soldier.maxHp, soldier.hp + bonuses.hpDelta);
      soldier.speed += bonuses.speedDelta;
    }
    const def = SOLDIER_DEFS[soldier.soldierType];
    pushNotification(`${RANK_ICONS[newRank]} ${def.label} ranked up to ${newRank.toUpperCase()}! (+ATK +HP)`, 'success');
  }
}

export function getNextRankXP(rank: SoldierRank): number {
  const order: SoldierRank[] = ['recruit', 'veteran', 'elite', 'champion'];
  const idx = order.indexOf(rank);
  if (idx >= order.length - 1) return XP_THRESHOLDS.champion;
  return XP_THRESHOLDS[order[idx + 1]];
}
