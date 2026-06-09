// ──────────────────────────────────────────────
//  DockPanel – selection panel for the Dock building
// ──────────────────────────────────────────────

import React from 'react';
import {
  getOceanState,
  spawnBoat,
  BOAT_DEFS,
  commandFishingBoat,
  type BoatType,
} from '../systems/OceanSystem';
import { gameState } from '../core/GameState';

interface DockPanelProps {
  buildingId: number;
  tick: number;
}

const DockPanel: React.FC<DockPanelProps> = ({ buildingId, tick: _tick }) => {
  const ocean = getOceanState();
  const transform = gameState.transforms.get(buildingId);
  const nearX = transform?.x ?? 0;
  const nearZ = transform?.z ?? 0;

  const myBoats = Array.from(ocean.boats.values()).filter(b => b.state !== 'dead');
  const fishNodes = ocean.fishNodes.filter(n => !n.isDepleted);

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 6px',
    background: 'hsla(28,15%,11%,0.7)',
    borderRadius: 4,
    border: '1px solid hsl(28 15% 18%)',
    marginBottom: 3,
  };

  return (
    <div style={{ fontSize: 11, color: 'hsl(42 35% 65%)' }}>
      {/* Build boats */}
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 1,
        color: 'hsl(42 15% 40%)', marginBottom: 4,
      }}>
        BUILD BOATS
      </div>
      {(Object.entries(BOAT_DEFS) as [BoatType, typeof BOAT_DEFS[BoatType]][]).map(([type, def]) => {
        const costEntries = Object.entries(def.cost) as [string, number][];
        const canAfford = costEntries.every(([r, a]) => (gameState.resources as any)[r] >= a);
        const costStr = costEntries.map(([r, a]) => `${r === 'wood' ? '🪵' : '🪨'}${a}`).join(' ');
        return (
          <div key={type} style={rowStyle}>
            <span style={{ fontSize: 16 }}>{def.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: 'hsl(42 30% 72%)' }}>{def.name}</div>
              <div style={{ fontSize: 8, color: 'hsl(42 10% 42%)' }}>{def.description}</div>
              <div style={{ fontSize: 8, color: 'hsl(42 20% 50%)' }}>{costStr} · {def.trainSec}s</div>
            </div>
            <button
              onClick={() => spawnBoat(type, nearX, nearZ)}
              disabled={!canAfford}
              style={{
                padding: '2px 8px', fontSize: 11, fontWeight: 700,
                background: canAfford ? 'hsla(200,30%,16%,0.9)' : 'hsla(0,10%,10%,0.5)',
                border: `1px solid ${canAfford ? 'hsl(200 35% 26%)' : 'hsl(0 10% 16%)'}`,
                borderRadius: 4,
                color: canAfford ? 'hsl(42 50% 72%)' : 'hsl(42 10% 35%)',
                cursor: canAfford ? 'pointer' : 'not-allowed',
              }}
            >+</button>
          </div>
        );
      })}

      {/* Active boats */}
      {myBoats.length > 0 && (
        <>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 1,
            color: 'hsl(42 15% 40%)', marginTop: 8, marginBottom: 4,
          }}>
            FLEET ({myBoats.length})
          </div>
          {myBoats.map(boat => {
            const def = BOAT_DEFS[boat.boatType];
            const hpRatio = boat.hp / boat.maxHp;
            const hpColor = hpRatio > 0.6 ? 'hsl(120 50% 40%)' : hpRatio > 0.3 ? 'hsl(38 65% 42%)' : 'hsl(0 60% 38%)';
            return (
              <div key={boat.id} style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{def.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'hsl(42 30% 72%)' }}>
                      {def.name} #{boat.id - 50000 + 1}
                    </div>
                    <div style={{ fontSize: 8, color: 'hsl(42 15% 48%)' }}>
                      {boat.state}{boat.cargo ? ` · 🐟 ${Math.floor(boat.cargo.amount)}/${10}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 8, color: hpColor }}>{Math.ceil(boat.hp)}/{boat.maxHp}</div>
                </div>
                {/* HP bar */}
                <div style={{ height: 3, background: 'hsl(0 20% 12%)', borderRadius: 2 }}>
                  <div style={{ width: `${hpRatio * 100}%`, height: '100%', background: hpColor, borderRadius: 2 }} />
                </div>
                {/* Send to fish node */}
                {boat.boatType === 'fishing_boat' && fishNodes.length > 0 && boat.state === 'idle' && (
                  <select
                    defaultValue=""
                    onChange={e => {
                      const nodeId = e.target.value;
                      if (nodeId) commandFishingBoat(boat.id, nodeId);
                      e.target.value = '';
                    }}
                    style={{
                      width: '100%', padding: '2px 4px', fontSize: 9,
                      background: 'hsla(200,25%,12%,0.9)', border: '1px solid hsl(200 30% 22%)',
                      borderRadius: 3, color: 'hsl(42 35% 68%)', cursor: 'pointer',
                    }}
                  >
                    <option value="">🎣 Send to fish node…</option>
                    {fishNodes.map(n => (
                      <option key={n.id} value={n.id}>
                        Fish Node ({Math.floor(n.remaining)}/{n.maxAmount} remaining)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Fish node status */}
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 1,
        color: 'hsl(42 15% 40%)', marginTop: 8, marginBottom: 4,
      }}>
        FISH NODES ({fishNodes.length}/{ocean.fishNodes.length})
      </div>
      {ocean.fishNodes.map(n => (
        <div key={n.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: 10 }}>{n.isDepleted ? '💤' : '🐟'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ height: 3, background: 'hsl(200 15% 14%)', borderRadius: 2 }}>
              <div style={{
                width: `${(n.remaining / n.maxAmount) * 100}%`,
                height: '100%', background: n.isDepleted ? 'hsl(0 30% 30%)' : 'hsl(200 55% 42%)',
                borderRadius: 2,
              }} />
            </div>
          </div>
          <span style={{ fontSize: 8, color: 'hsl(42 15% 45%)', width: 36, textAlign: 'right' }}>
            {n.isDepleted ? 'depleted' : `${Math.floor(n.remaining)}`}
          </span>
        </div>
      ))}
    </div>
  );
};

export default DockPanel;
