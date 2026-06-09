// ──────────────────────────────────────────────
//  MilitaryPanel – army overview + training + commands
// ──────────────────────────────────────────────

import React, { useState } from 'react';
import { gameState, pushNotification } from '../core/GameState';
import { SOLDIER_DEFS, BUILDING_MAX_HP } from '../core/MilitaryTypes';
import { enqueueSoldierTraining } from '../systems/RaidSystem';
import type { SoldierType } from '../core/EventBus';
import { EventBus } from '../core/EventBus';
import { armory, queueSmithyCraft, SMITHY_RECIPES, smithyCrafting, smithyQueue } from '../systems/SmithySystem';

interface MilitaryPanelProps {
  tick: number;
  embedded?: boolean;
}

const SOLDIER_ICONS: Record<SoldierType, string> = {
  spearman: '⚔️', swordsman: '🗡️', archer: '🏹', knight: '🛡️',
};

const MilitaryPanel: React.FC<MilitaryPanelProps> = ({ tick, embedded = false }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'army' | 'smithy'>('army');
  const { military, gameTime } = gameState;

  const soldiers = Array.from(military.soldiers.entries());
  const enemies = Array.from(military.enemies.entries()).filter(([, e]) => e.state !== 'dead');
  const daysUntilRaid = military.nextRaidDay - gameTime.day;
  const threat = military.activeRaid ? 'IMMINENT' : daysUntilRaid <= 0 ? 'IMMINENT' : daysUntilRaid <= 1 ? 'HIGH' : daysUntilRaid <= 3 ? 'MODERATE' : 'SAFE';
  const threatColors: Record<string, string> = { SAFE: '🟢', MODERATE: '🟡', HIGH: '🟠', IMMINENT: '🔴' };

  // Find active barracks
  let barracksId: number | null = null;
  gameState.buildings.forEach((b, id) => {
    if (b.type === 'barracks' && b.state === 'active' && barracksId === null) barracksId = id;
  });
  const trainingQueue = barracksId !== null ? (military.trainingQueues.get(barracksId) ?? []) : [];

  // Find active smithy
  let smithyId: number | null = null;
  gameState.buildings.forEach((b, id) => {
    if (b.type === 'smithy' && b.state === 'active' && smithyId === null) smithyId = id;
  });
  const activeCraft = smithyId !== null ? smithyCrafting.get(smithyId) : null;
  const craftQueue = smithyId !== null ? (smithyQueue.get(smithyId) ?? []) : [];

  // ── Commands ─────────────────────────────────────────────────────────────

  const handleSelectAll = () => {
    const aliveSoldiers = soldiers.filter(([, s]) => s.state !== 'dead');
    if (aliveSoldiers.length === 0) {
      pushNotification('No soldiers to select', 'info');
      return;
    }
    // Select first soldier and emit notification (multi-select limited by current infra)
    const [id] = aliveSoldiers[0];
    military.selectedSoldierId = id;
    EventBus.emit('SoldierSelected', { soldierId: id });
    pushNotification(`⚔️ Selected all ${aliveSoldiers.length} soldiers`, 'info');
  };

  const handleDefend = () => {
    let tcX = 0, tcZ = 0;
    gameState.buildings.forEach((b, id) => {
      if (b.type === 'town_center') {
        const t = gameState.transforms.get(id);
        if (t) { tcX = t.x; tcZ = t.z; }
      }
    });
    const aliveSoldiers = soldiers.filter(([, s]) => s.state !== 'dead');
    aliveSoldiers.forEach(([id, s], i) => {
      const angle = (i / Math.max(aliveSoldiers.length, 1)) * Math.PI * 2;
      const radius = 6;
      const tx = tcX + Math.cos(angle) * radius;
      const tz = tcZ + Math.sin(angle) * radius;
      const st = military.soldierTransforms.get(id);
      if (st) { st.x = tx; st.z = tz; }
      s.state = 'idle';
      s.patrolWaypoints = [];
    });
    pushNotification(`🛡️ ${aliveSoldiers.length} soldiers defending Town Center!`, 'info');
  };

  const handlePatrol = () => {
    let tcX = 0, tcZ = 0;
    gameState.buildings.forEach((b, id) => {
      if (b.type === 'town_center') {
        const t = gameState.transforms.get(id);
        if (t) { tcX = t.x; tcZ = t.z; }
      }
    });
    let patrolled = 0;
    military.soldiers.forEach((s, id) => {
      if (s.state === 'dead') return;
      const st = military.soldierTransforms.get(id);
      if (st) {
        s.patrolWaypoints = [
          { x: st.x, z: st.z },
          { x: tcX + (Math.random() - 0.5) * 4, z: tcZ + (Math.random() - 0.5) * 4 },
        ];
        s.patrolIndex = 0;
        s.state = 'patrolling';
        patrolled++;
      }
    });
    pushNotification(`🚶 ${patrolled} soldiers now patrolling`, 'info');
  };


  const btnStyle: React.CSSProperties = {
    flex: 1, padding: '4px 0', fontSize: 10,
    background: 'hsla(0,30%,15%,0.8)',
    border: '1px solid hsl(0 30% 25%)', borderRadius: 4,
    color: 'hsl(42 40% 75%)', cursor: 'pointer',
  };

  const tabBtn = (tab: 'army' | 'smithy') => ({
    flex: 1, padding: '4px 0', fontSize: 10, fontWeight: 600,
    background: activeTab === tab ? 'hsla(0,40%,18%,0.9)' : 'hsla(0,20%,10%,0.7)',
    border: `1px solid ${activeTab === tab ? 'hsl(0 40% 30%)' : 'hsl(0 15% 20%)'}`,
    borderRadius: 4, color: activeTab === tab ? 'hsl(38 60% 70%)' : 'hsl(42 20% 50%)',
    cursor: 'pointer',
  } as React.CSSProperties);

  const panel: React.CSSProperties = {
    position: embedded ? 'relative' : 'absolute',
    bottom: embedded ? undefined : 12,
    right: embedded ? undefined : 12,
    zIndex: embedded ? undefined : 150,
    width: embedded ? '100%' : 268,
    background: 'hsla(28,22%,9%,0.97)',
    border: '1px solid hsl(0 40% 25%)', borderRadius: 10,
    backdropFilter: 'blur(8px)', overflow: 'hidden', userSelect: 'none',
  };

  return (
    <div style={panel}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '8px 12px',
          background: 'hsla(0,30%,14%,0.8)', border: 'none',
          borderBottom: collapsed ? 'none' : '1px solid hsl(0 25% 20%)',
          color: 'hsl(0 60% 65%)', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.12em', cursor: 'pointer',
        }}
      >
        <span>⚔️ MILITARY COMMAND</span>
        <span>{threatColors[threat]} {collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Status bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'hsl(42 25% 65%)' }}>
            <span>Army: {soldiers.length} soldiers</span>
            <span>{threatColors[threat]} {threat}</span>
          </div>

          {/* Raid info */}
          <div style={{ fontSize: 10, color: 'hsl(42 15% 45%)', borderTop: '1px solid hsl(38 15% 16%)', paddingTop: 4 }}>
            {military.activeRaid
              ? <span style={{ color: 'hsl(0 70% 60%)', fontWeight: 700 }}>🔴 RAID IN PROGRESS — {enemies.length} enemies remaining</span>
              : daysUntilRaid > 0
              ? `Next raid: Day ${military.nextRaidDay} (in ${daysUntilRaid} day${daysUntilRaid !== 1 ? 's' : ''})`
              : 'No raid scheduled'}
            <br />Raids repelled: {military.raidsRepelled} · Soldiers trained: {military.soldiersTrainedTotal}
          </div>

          {/* Tabs: Army / Smithy */}
          {(barracksId !== null || smithyId !== null) && (
            <div style={{ display: 'flex', gap: 4 }}>
              {barracksId !== null && <button style={tabBtn('army')} onClick={() => setActiveTab('army')}>⚔️ Army</button>}
              {smithyId !== null && <button style={tabBtn('smithy')} onClick={() => setActiveTab('smithy')}>🔨 Smithy</button>}
            </div>
          )}

          {/* ── ARMY TAB ── */}
          {activeTab === 'army' && (
            <>
              {/* Soldier list */}
              {soldiers.length > 0 && (
                <div style={{ maxHeight: 100, overflowY: 'auto' }}>
                  {soldiers.slice(0, 6).map(([id, s]) => (
                    <div
                      key={id}
                      onClick={() => { military.selectedSoldierId = id; EventBus.emit('SoldierSelected', { soldierId: id }); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '3px 4px', fontSize: 11, color: 'hsl(42 25% 72%)',
                        cursor: 'pointer', borderRadius: 4,
                        background: military.selectedSoldierId === id ? 'hsla(38,30%,18%,0.7)' : 'transparent',
                      }}
                    >
                      <span>{SOLDIER_ICONS[s.soldierType]}</span>
                      <span style={{ flex: 1 }}>{SOLDIER_DEFS[s.soldierType].label}</span>
                      <span style={{ fontSize: 9, color: 'hsl(42 15% 45%)' }}>{s.state}</span>
                      <div style={{ width: 44, height: 4, background: 'hsl(0 20% 20%)', borderRadius: 2 }}>
                        <div style={{
                          width: `${(s.hp / s.maxHp) * 100}%`, height: '100%',
                          background: s.hp / s.maxHp > 0.5 ? 'hsl(120 50% 45%)' : 'hsl(30 70% 50%)',
                          borderRadius: 2,
                        }} />
                      </div>
                    </div>
                  ))}
                  {soldiers.length > 6 && (
                    <div style={{ fontSize: 10, color: 'hsl(42 15% 40%)', textAlign: 'center' }}>+{soldiers.length - 6} more</div>
                  )}
                </div>
              )}

              {/* Command buttons */}
              {soldiers.length > 0 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={btnStyle} onClick={handleSelectAll}>👆 Select All</button>
                  <button style={btnStyle} onClick={handlePatrol}>🚶 Patrol</button>
                  <button style={btnStyle} onClick={handleDefend}>🛡️ Defend</button>
                </div>
              )}

              {/* Training section */}
              {barracksId !== null && (
                <>
                  <div style={{ fontSize: 10, color: 'hsl(42 15% 40%)', borderTop: '1px solid hsl(38 15% 16%)', paddingTop: 4 }}>
                    TRAIN SOLDIERS
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(Object.entries(SOLDIER_DEFS) as [SoldierType, typeof SOLDIER_DEFS[SoldierType]][]).map(([type, def]) => {
                      const costStr = Object.entries(def.cost).map(([r, a]) => `${a}${r[0].toUpperCase()}`).join(' ');
                      const canAfford = Object.entries(def.cost).every(([r, a]) => (gameState.resources as any)[r] >= (a ?? 0));
                      return (
                        <button
                          key={type}
                          onClick={() => enqueueSoldierTraining(barracksId!, type)}
                          title={`${def.label}: ${costStr}, ${def.trainTime}s`}
                          style={{
                            padding: '3px 6px', fontSize: 10,
                            background: canAfford ? 'hsla(0,30%,15%,0.8)' : 'hsla(0,10%,12%,0.5)',
                            border: `1px solid ${canAfford ? 'hsl(0 30% 25%)' : 'hsl(0 15% 18%)'}`,
                            borderRadius: 4,
                            color: canAfford ? 'hsl(42 40% 75%)' : 'hsl(42 10% 40%)', cursor: canAfford ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {def.icon} {def.label} <span style={{ opacity: 0.7 }}>({costStr})</span>
                        </button>
                      );
                    })}
                  </div>

                  {trainingQueue.length > 0 && (
                    <div style={{ fontSize: 10, color: 'hsl(42 20% 55%)' }}>
                      Queue: {trainingQueue.map((q, i) => (
                        <span key={i} style={{ marginRight: 4 }}>
                          {SOLDIER_DEFS[q.soldierType].icon} {SOLDIER_DEFS[q.soldierType].label} ({Math.ceil(q.timeRemaining)}s)
                          {i < trainingQueue.length - 1 ? ' →' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}

              {soldiers.length === 0 && barracksId === null && (
                <div style={{ fontSize: 11, color: 'hsl(42 15% 40%)', textAlign: 'center', padding: '4px 0' }}>
                  Build a Barracks to train soldiers.
                </div>
              )}
            </>
          )}

          {/* ── SMITHY TAB ── */}
          {activeTab === 'smithy' && smithyId !== null && (
            <>
              {/* Active craft */}
              {activeCraft ? (
                <div style={{ fontSize: 11, color: 'hsl(42 30% 70%)' }}>
                  Crafting: {activeCraft.recipe.icon} {activeCraft.recipe.label}
                  <div style={{ marginTop: 4, height: 6, background: 'hsl(38 15% 18%)', borderRadius: 3 }}>
                    <div style={{
                      width: `${((activeCraft.totalTime - activeCraft.timeRemaining) / activeCraft.totalTime) * 100}%`,
                      height: '100%', background: 'hsl(38 60% 45%)', borderRadius: 3,
                    }} />
                  </div>
                  <span style={{ fontSize: 9, color: 'hsl(42 15% 45%)' }}>{Math.ceil(activeCraft.timeRemaining)}s remaining</span>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'hsl(42 15% 45%)' }}>Smithy idle</div>
              )}

              {/* Queue display */}
              {craftQueue.length > 0 && (
                <div style={{ fontSize: 10, color: 'hsl(42 20% 55%)' }}>
                  Queue: {craftQueue.join(', ')}
                </div>
              )}

              {/* Craft buttons */}
              <div style={{ fontSize: 10, color: 'hsl(42 15% 40%)', borderTop: '1px solid hsl(38 15% 16%)', paddingTop: 4 }}>
                CRAFT EQUIPMENT
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {SMITHY_RECIPES.map(recipe => {
                  const costStr = Object.entries(recipe.inputs).map(([r, a]) => `${a}${r[0].toUpperCase()}`).join(' ');
                  const canAfford = Object.entries(recipe.inputs).every(([r, a]) => (gameState.resources as any)[r] >= (a ?? 0));
                  return (
                    <button
                      key={recipe.output}
                      onClick={() => queueSmithyCraft(smithyId!, recipe.output)}
                      title={`${recipe.label}: ${costStr}, ${recipe.time}s`}
                      style={{
                        padding: '3px 6px', fontSize: 10,
                        background: canAfford ? 'hsla(38,25%,14%,0.8)' : 'hsla(38,10%,10%,0.5)',
                        border: `1px solid ${canAfford ? 'hsl(38 30% 22%)' : 'hsl(38 10% 16%)'}`,
                        borderRadius: 4,
                        color: canAfford ? 'hsl(42 40% 75%)' : 'hsl(42 10% 40%)', cursor: canAfford ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {recipe.icon} {recipe.label} <span style={{ opacity: 0.7 }}>({costStr})</span>
                    </button>
                  );
                })}
              </div>

              {/* Armory stock */}
              <div style={{ fontSize: 10, color: 'hsl(42 15% 40%)', borderTop: '1px solid hsl(38 15% 16%)', paddingTop: 4 }}>
                ARMORY STOCK
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SMITHY_RECIPES.map(r => (
                  <span key={r.output} style={{ fontSize: 11, color: armory[r.output] > 0 ? 'hsl(42 40% 72%)' : 'hsl(42 10% 38%)' }}>
                    {r.icon} {armory[r.output]}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MilitaryPanel;
