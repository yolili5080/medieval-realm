// ──────────────────────────────────────────────
//  MarketPanel – trade resources at the Market building
// ──────────────────────────────────────────────

import React from 'react';
import { gameState } from '../core/GameState';
import { executeTrade, getTradeRate } from '../systems/TradeSystem';
import type { ResourceType } from '../core/EventBus';

interface MarketPanelProps {
  tick: number;
}

type TradeRow = { from: ResourceType; to: ResourceType; fromIcon: string; toIcon: string };

const TRADE_ROWS: TradeRow[] = [
  { from: 'wood',  to: 'food',  fromIcon: '🪵', toIcon: '🌾' },
  { from: 'wood',  to: 'stone', fromIcon: '🪵', toIcon: '🪨' },
  { from: 'food',  to: 'wood',  fromIcon: '🌾', toIcon: '🪵' },
  { from: 'food',  to: 'stone', fromIcon: '🌾', toIcon: '🪨' },
  { from: 'stone', to: 'wood',  fromIcon: '🪨', toIcon: '🪵' },
  { from: 'stone', to: 'food',  fromIcon: '🪨', toIcon: '🌾' },
];

const MarketPanel: React.FC<MarketPanelProps> = ({ tick: _tick }) => {
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'hsl(42 15% 40%)', marginBottom: 6 }}>
        RESOURCE TRADING
      </div>
      <div style={{ fontSize: 10, color: 'hsl(42 15% 45%)', marginBottom: 8 }}>
        Rates degrade with each trade.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {TRADE_ROWS.map(({ from, to, fromIcon, toIcon }) => {
          const rate = getTradeRate(from, to);
          const canAfford1 = gameState.resources[from] >= rate.give;
          const canAfford5 = gameState.resources[from] >= rate.give * 5;

          return (
            <div key={`${from}-${to}`} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 6px',
              background: 'hsl(28 14% 12%)',
              border: '1px solid hsl(28 14% 18%)',
              borderRadius: 5,
            }}>
              <span style={{ fontSize: 12, width: 16 }}>{fromIcon}</span>
              <span style={{ fontSize: 10, color: 'hsl(42 20% 50%)', flex: 1 }}>
                →{toIcon} Give {rate.give} Get {rate.receive}
              </span>
              <button
                onClick={() => executeTrade(from, to, 1)}
                disabled={!canAfford1}
                style={tradeBtn(canAfford1)}
              >×1</button>
              <button
                onClick={() => executeTrade(from, to, 5)}
                disabled={!canAfford5}
                style={tradeBtn(canAfford5)}
              >×5</button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

function tradeBtn(enabled: boolean): React.CSSProperties {
  return {
    padding: '2px 6px', fontSize: 10, fontWeight: 700,
    background: enabled ? 'hsl(38 30% 16%)' : 'hsl(28 10% 10%)',
    border: `1px solid ${enabled ? 'hsl(38 35% 26%)' : 'hsl(28 10% 16%)'}`,
    borderRadius: 4,
    color: enabled ? 'hsl(42 50% 70%)' : 'hsl(42 10% 33%)',
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}

export default MarketPanel;
