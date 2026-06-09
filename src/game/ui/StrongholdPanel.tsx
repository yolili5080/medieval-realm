// ──────────────────────────────────────────────
//  StrongholdPanel – selection panel for the Stronghold building
// ──────────────────────────────────────────────

import React from 'react';
import {
  getStrongholdState,
  STRONGHOLD_TIER_REQUIREMENTS,
  STRONGHOLD_UPGRADES,
  canUpgradeStrongholdTier,
  startTierUpgrade,
  canResearchUpgrade,
  startStrongholdUpgrade,
} from '../systems/StrongholdSystem';
import { gameState } from '../core/GameState';

const TIER_ICONS: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' };

interface StrongholdPanelProps {
  tick: number;
}

const StrongholdPanel: React.FC<StrongholdPanelProps> = ({ tick: _tick }) => {
  const sh = getStrongholdState();
  const tierReq = STRONGHOLD_TIER_REQUIREMENTS[sh.tier];
  const nextTier = sh.tier < 3 ? (sh.tier + 1) as 1 | 2 | 3 : null;
  const upgradeCheck = canUpgradeStrongholdTier();

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
      {/* Tier badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'hsla(38,35%,14%,0.8)',
        border: '1px solid hsl(38 40% 26%)',
        borderRadius: 6, padding: '5px 10px', marginBottom: 8,
      }}>
        <span style={{ fontSize: 18 }}>🏰</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'hsl(42 65% 78%)' }}>
            Stronghold — Tier {TIER_ICONS[sh.tier]}
          </div>
          <div style={{ fontSize: 9, color: 'hsl(42 20% 50%)' }}>
            HP: {Math.ceil(sh.hp)}/{sh.maxHp}
          </div>
        </div>
      </div>

      {/* Tier upgrade timer */}
      {sh.isUpgradingTier && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'hsl(42 30% 62%)', marginBottom: 3 }}>
            ⬆️ Upgrading to Tier {TIER_ICONS[(sh.tier + 1) as 1|2|3]}…
          </div>
          <div style={{ height: 5, background: 'hsl(38 15% 14%)', borderRadius: 3 }}>
            <div style={{
              width: `${((sh.tierUpgradeTotalTime - sh.tierUpgradeTimeRemaining) / sh.tierUpgradeTotalTime) * 100}%`,
              height: '100%', background: 'hsl(38 60% 42%)', borderRadius: 3, transition: 'width 0.4s',
            }} />
          </div>
          <div style={{ fontSize: 9, color: 'hsl(42 15% 45%)', marginTop: 2 }}>
            {Math.ceil(sh.tierUpgradeTimeRemaining)}s remaining
          </div>
        </div>
      )}

      {/* Upgrade to next tier */}
      {!sh.isUpgradingTier && nextTier && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'hsl(42 15% 40%)', marginBottom: 4 }}>
            UPGRADE TO TIER {TIER_ICONS[nextTier]}
          </div>
          {upgradeCheck.missingBuildings.length > 0 && (
            <div style={{ fontSize: 9, color: 'hsl(0 50% 55%)', marginBottom: 3 }}>
              Missing: {upgradeCheck.missingBuildings.map(b => b.replace(/_/g, ' ')).join(', ')}
            </div>
          )}
          {upgradeCheck.missingResources.length > 0 && (
            <div style={{ fontSize: 9, color: 'hsl(38 60% 55%)', marginBottom: 3 }}>
              Need: {upgradeCheck.missingResources.join(' ')}
            </div>
          )}
          {upgradeCheck.canUpgrade && (
            <div style={{ fontSize: 9, color: 'hsl(42 20% 48%)', marginBottom: 4 }}>
              Cost: {Object.entries(STRONGHOLD_TIER_REQUIREMENTS[nextTier].cost)
                .map(([r, a]) => `${r === 'wood' ? '🪵' : r === 'stone' ? '🪨' : '🌾'}${a}`)
                .join(' ')}
              {' · '}{STRONGHOLD_TIER_REQUIREMENTS[nextTier].upgradeTimeSec}s
            </div>
          )}
          <button
            onClick={() => startTierUpgrade()}
            disabled={!upgradeCheck.canUpgrade}
            style={{
              width: '100%', padding: '5px', fontSize: 10, fontWeight: 700,
              background: upgradeCheck.canUpgrade ? 'hsla(38,40%,16%,0.9)' : 'hsla(0,10%,10%,0.5)',
              border: `1px solid ${upgradeCheck.canUpgrade ? 'hsl(38 50% 32%)' : 'hsl(0 10% 16%)'}`,
              borderRadius: 5, color: upgradeCheck.canUpgrade ? 'hsl(42 55% 72%)' : 'hsl(42 10% 35%)',
              cursor: upgradeCheck.canUpgrade ? 'pointer' : 'not-allowed',
            }}
          >
            ⬆️ Upgrade Tier ({STRONGHOLD_TIER_REQUIREMENTS[nextTier].upgradeTimeSec}s)
          </button>
        </div>
      )}

      {nextTier === null && (
        <div style={{ marginBottom: 8, fontSize: 10, color: 'hsl(38 60% 60%)', textAlign: 'center' }}>
          🏆 Maximum Tier Reached!
        </div>
      )}

      {/* Active research */}
      {sh.upgradeQueue && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'hsl(42 15% 40%)', marginBottom: 3 }}>
            RESEARCHING
          </div>
          <div style={{ fontSize: 10, color: 'hsl(42 30% 70%)', marginBottom: 3 }}>
            {STRONGHOLD_UPGRADES.find(u => u.id === sh.upgradeQueue!.upgradeId)?.icon}{' '}
            {STRONGHOLD_UPGRADES.find(u => u.id === sh.upgradeQueue!.upgradeId)?.name}
          </div>
          <div style={{ height: 5, background: 'hsl(38 15% 14%)', borderRadius: 3 }}>
            <div style={{
              width: `${((sh.upgradeQueue.totalTime - sh.upgradeQueue.timeRemaining) / sh.upgradeQueue.totalTime) * 100}%`,
              height: '100%', background: 'hsl(38 60% 42%)', borderRadius: 3, transition: 'width 0.4s',
            }} />
          </div>
          <div style={{ fontSize: 9, color: 'hsl(42 15% 45%)', marginTop: 2 }}>
            {Math.ceil(sh.upgradeQueue.timeRemaining)}s remaining
          </div>
        </div>
      )}

      {/* Available upgrades */}
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'hsl(42 15% 40%)', marginBottom: 4 }}>
        UPGRADES
      </div>
      {STRONGHOLD_UPGRADES.map(upgrade => {
        const completed = sh.completedUpgrades.has(upgrade.id);
        const { canResearch, reason } = canResearchUpgrade(upgrade);
        const lockedByTier = upgrade.tier > sh.tier;
        const costStr = Object.entries(upgrade.cost)
          .map(([r, a]) => `${r === 'wood' ? '🪵' : r === 'stone' ? '🪨' : '🌾'}${a}`)
          .join(' ');

        return (
          <div key={upgrade.id} style={{
            ...rowStyle,
            opacity: completed ? 0.5 : lockedByTier ? 0.4 : 1,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{upgrade.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 600,
                color: completed ? 'hsl(120 40% 52%)' : 'hsl(42 35% 68%)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {upgrade.name}
                {completed && <span>✅</span>}
                {lockedByTier && !completed && (
                  <span style={{ fontSize: 8, color: 'hsl(38 40% 45%)' }}>Tier {upgrade.tier}</span>
                )}
              </div>
              <div style={{ fontSize: 8, color: 'hsl(42 10% 42%)' }}>{upgrade.description}</div>
              {!completed && !lockedByTier && (
                <div style={{ fontSize: 8, color: 'hsl(42 20% 50%)' }}>{costStr} · {upgrade.timeSec}s</div>
              )}
              {!canResearch && reason && !completed && !lockedByTier && (
                <div style={{ fontSize: 8, color: 'hsl(0 45% 50%)' }}>{reason}</div>
              )}
            </div>
            {!completed && !lockedByTier && (
              <button
                onClick={() => startStrongholdUpgrade(upgrade.id)}
                disabled={!canResearch}
                style={{
                  padding: '2px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0,
                  background: canResearch ? 'hsla(38,30%,16%,0.9)' : 'hsla(0,10%,10%,0.5)',
                  border: `1px solid ${canResearch ? 'hsl(38 35% 26%)' : 'hsl(0 10% 16%)'}`,
                  borderRadius: 4,
                  color: canResearch ? 'hsl(42 50% 72%)' : 'hsl(42 10% 35%)',
                  cursor: canResearch ? 'pointer' : 'not-allowed',
                }}
              >
                +
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StrongholdPanel;
