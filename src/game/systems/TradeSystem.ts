// ──────────────────────────────────────────────
//  TradeSystem – Market resource trading
//  Rates degrade with each trade (like AoE2)
// ──────────────────────────────────────────────

import { gameState, pushNotification } from '../core/GameState';
import type { ResourceType } from '../core/EventBus';

export interface TradeState {
  tradeCounts: Record<ResourceType, number>;
  baseRate: number; // 0.7 = 30% market cut
}

let _tradeState: TradeState = {
  tradeCounts: { wood: 0, food: 0, stone: 0 },
  baseRate: 0.7,
};

export function getTradeState(): TradeState { return _tradeState; }
export function resetTradeState(): void {
  _tradeState = { tradeCounts: { wood: 0, food: 0, stone: 0 }, baseRate: 0.7 };
}

export function hasActiveMarket(): boolean {
  let found = false;
  gameState.buildings.forEach(b => { if (b.type === 'market' && b.state === 'active') found = true; });
  return found;
}

export function getTradeRate(
  fromResource: ResourceType,
  toResource: ResourceType
): { give: number; receive: number } {
  const degradation = Math.max(0.35, 1.0 - _tradeState.tradeCounts[fromResource] * 0.04);
  const rate = _tradeState.baseRate * degradation;
  return {
    give: 10,
    receive: Math.max(3, Math.floor(10 * rate)),
  };
}

export function executeTrade(
  from: ResourceType,
  to: ResourceType,
  multiplier: number = 1 // 1, 5, or 10 units of 10
): boolean {
  if (!hasActiveMarket()) {
    pushNotification('Build a Market to trade resources!', 'error');
    return false;
  }

  const rate = getTradeRate(from, to);
  const totalGive = rate.give * multiplier;
  const totalReceive = rate.receive * multiplier;

  if (gameState.resources[from] < totalGive) {
    pushNotification(`Not enough ${from} to trade! Need ${totalGive}.`, 'error');
    return false;
  }

  gameState.resources[from] -= totalGive;
  gameState.resources[to] = (gameState.resources[to] ?? 0) + totalReceive;
  _tradeState.tradeCounts[from]++;

  const fromIcon = from === 'wood' ? '🪵' : from === 'stone' ? '🪨' : '🌾';
  const toIcon = to === 'wood' ? '🪵' : to === 'stone' ? '🪨' : '🌾';
  pushNotification(`📦 Traded ${totalGive}${fromIcon} → ${totalReceive}${toIcon}`, 'success');
  return true;
}
