// ──────────────────────────────────────────────
//  MilitaryStrip – compact military badge in right strip
//  Click to expand full military panel
// ──────────────────────────────────────────────

import React, { useState } from 'react';
import { gameState, pushNotification } from '../core/GameState';
import { SOLDIER_DEFS, BUILDING_MAX_HP } from '../core/MilitaryTypes';
import { enqueueSoldierTraining } from '../systems/RaidSystem';
import type { SoldierType } from '../core/EventBus';
import { EventBus } from '../core/EventBus';
import { armory, queueSmithyCraft, SMITHY_RECIPES, smithyCrafting, smithyQueue } from '../systems/SmithySystem';

interface MilitaryStripProps { tick: number; }

const SOLDIER_ICONS: Record<SoldierType, string> = {
  spearman: '⚔️', swordsman: '🗡️', archer: '🏹', knight: '🛡️',
};

const MilitaryStrip: React.FC<MilitaryStripProps> = ({ tick }) => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'army' | 'smithy'>('army');
  const { military, gameTime } = gameState;

  const soldiers = Array.from(military.soldiers.entries()).filter(([, s]) => s.state !== 'dead');
  const enemies = Array.from(military.enemies.entries()).filter(([, e]) => e.state !== 'dead');
  const daysUntilRaid = military.nextRaidDay - gameTime.day;
  const threat = military.activeRaid ? 'RAID' : daysUntilRaid <= 0 ? 'IMMINENT' : daysUntilRaid <= 1 ? 'HIGH' : daysUntilRaid <= 3 ? 'MOD' : 'SAFE';
  const threatColor = { SAFE: 'hsl(120 50% 42%)', MOD: 'hsl(60 70% 48%)', HIGH: 'hsl(30 80% 52%)', IMMINENT: 'hsl(0 70% 55%)', RAID: 'hsl(0 75% 60%)' }[threat];

  let barracksId: number | null = null;
  gameState.buildings.forEach((b, id) => { if (b.type === 'barracks' && b.state === 'active' && barracksId === null) barracksId = id; });
  const trainingQueue = barracksId !== null ? (military.trainingQueues.get(barracksId) ?? []) : [];

  let smithyId: number | null = null;
  gameState.buildings.forEach((b, id) => { if (b.type === 'smithy' && b.state === 'active' && smithyId === null) smithyId = id; });
  const activeCraft = smithyId !== null ? smithyCrafting.get(smithyId) : null;
  const craftQueue = smithyId !== null ? (smithyQueue.get(smithyId) ?? []) : [];

  const handleDefend = () => {
    let tcX = 0, tcZ = 0;
    gameState.buildings.forEach((b, id) => { if (b.type === 'town_center') { const t = gameState.transforms.get(id); if (t) { tcX = t.x; tcZ = t.z; } } });
    soldiers.forEach(([id, s], i) => {
      const angle = (i / Math.max(soldiers.length, 1)) * Math.PI * 2;
      const st = military.soldierTransforms.get(id);
      if (st) { st.x = tcX + Math.cos(angle) * 6; st.z = tcZ + Math.sin(angle) * 6; }
      s.state = 'idle'; s.patrolWaypoints = [];
    });
    pushNotification(`🛡️ ${soldiers.length} soldiers defending!`, 'info');
  };

  const handlePatrol = () => {
    let tcX = 0, tcZ = 0;
    gameState.buildings.forEach((b, id) => { if (b.type === 'town_center') { const t = gameState.transforms.get(id); if (t) { tcX = t.x; tcZ = t.z; } } });
    let count = 0;
    military.soldiers.forEach((s, id) => {
      if (s.state === 'dead') return;
      const st = military.soldierTransforms.get(id);
      if (st) { s.patrolWaypoints = [{ x: st.x, z: st.z }, { x: tcX + (Math.random() - 0.5) * 6, z: tcZ + (Math.random() - 0.5) * 6 }]; s.patrolIndex = 0; s.state = 'patrolling'; count++; }
    });
    pushNotification(`🚶 ${count} soldiers patrolling`, 'info');
  };

  const btnS: React.CSSProperties = {
    padding: '3px 7px', fontSize: 10, borderRadius: 4,
    background: 'hsla(0,30%,14%,0.8)', border: '1px solid hsl(0 30% 24%)',
    color: 'hsl(42 35% 70%)', cursor: 'pointer',
  };

  return (
    <>
      {/* Compact badge */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          position: 'absolute',
          bottom: 88, right: 8,
          zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 10px',
          background: military.activeRaid ? 'hsla(0 40% 12% / 0.97)' : 'hsla(28 22% 9% / 0.97)',
          border: `1px solid ${military.activeRaid ? 'hsl(0 50% 30%)' : 'hsl(38 25% 20%)'}`,
          borderRadius: 16,
          color: threatColor,
          fontSize: 11, fontWeight: 700,
          cursor: 'pointer', backdropFilter: 'blur(6px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          animation: military.activeRaid ? 'warningPulse 2s infinite' : 'none',
          transition: 'all 0.12s',
        }}
        title="Military Command"
      >
        <span>⚔️</span>
        <span style={{ color: 'hsl(42 35% 65%)' }}>{soldiers.length}</span>
        <span style={{ fontSize: 9, color: 'hsl(42 15% 45%)' }}>·</span>
        <span style={{ fontSize: 9, color: threatColor }}>{threat}</span>
        {daysUntilRaid > 0 && !military.activeRaid && (
          <span style={{ fontSize: 9, color: 'hsl(42 15% 42%)' }}>· {daysUntilRaid}d</span>
        )}
        <span style={{ fontSize: 8, opacity: 0.5 }}>{expanded ? '▼' : '▲'}</span>
      </button>

      {/* Full panel */}
      {expanded && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 399 }} onClick={() => setExpanded(false)} />
          <div style={{
            position: 'absolute', bottom: 116, right: 8, zIndex: 400,
            width: 280,
            background: 'hsla(28,22%,9%,0.98)', border: '1px solid hsl(0 35% 25%)',
            borderRadius: 12, backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            overflow: 'hidden',
            animation: 'panelSlideIn 0.15s ease-out both',
          }}>
            <div style={{ padding: '9px 12px', background: 'hsla(0,25%,13%,0.7)', borderBottom: '1px solid hsl(0 22% 20%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'hsl(0 55% 65%)', letterSpacing: '0.1em' }}>⚔️ MILITARY</span>
              <span style={{ fontSize: 11, color: threatColor, fontWeight: 700 }}>{threat}</span>
            </div>

            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'hsl(42 25% 60%)' }}>
                <span>⚔️ {soldiers.length} soldiers · {enemies.length} enemies</span>
                <span>{military.raidsRepelled} repelled</span>
              </div>
              {military.activeRaid && (
                <div style={{ fontSize: 11, color: 'hsl(0 70% 60%)', fontWeight: 700 }}>🔴 RAID IN PROGRESS — {enemies.length} enemies!</div>
              )}
              {!military.activeRaid && daysUntilRaid > 0 && (
                <div style={{ fontSize: 10, color: 'hsl(42 15% 42%)' }}>Next raid: Day {military.nextRaidDay} (in {daysUntilRaid}d)</div>
              )}

              {/* Tabs */}
              {(barracksId !== null || smithyId !== null) && (
                <div style={{ display: 'flex', gap: 3 }}>
                  {barracksId !== null && <button onClick={() => setActiveTab('army')} style={{ ...btnS, flex: 1, borderColor: activeTab === 'army' ? 'hsl(0 40% 30%)' : 'hsl(0 20% 18%)', color: activeTab === 'army' ? 'hsl(42 50% 72%)' : 'hsl(42 20% 45%)' }}>⚔️ Army</button>}
                  {smithyId !== null && <button onClick={() => setActiveTab('smithy')} style={{ ...btnS, flex: 1, borderColor: activeTab === 'smithy' ? 'hsl(0 40% 30%)' : 'hsl(0 20% 18%)', color: activeTab === 'smithy' ? 'hsl(42 50% 72%)' : 'hsl(42 20% 45%)' }}>🔨 Smithy</button>}
                </div>
              )}

              {/* Army tab */}
              {activeTab === 'army' && (
                <>
                  {soldiers.length > 0 && (
                    <div style={{ maxHeight: 90, overflowY: 'auto' }}>
                      {soldiers.slice(0, 6).map(([id, s]) => (
                        <div key={id} onClick={() => { military.selectedSoldierId = id; EventBus.emit('SoldierSelected', { soldierId: id }); setExpanded(false); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 4px', fontSize: 10, color: 'hsl(42 25% 68%)', cursor: 'pointer', borderRadius: 3, background: military.selectedSoldierId === id ? 'hsla(38,25%,16%,0.6)' : 'transparent' }}>
                          <span>{SOLDIER_ICONS[s.soldierType]}</span>
                          <span style={{ flex: 1 }}>{SOLDIER_DEFS[s.soldierType].label}</span>
                          <span style={{ fontSize: 9, color: 'hsl(42 12% 40%)' }}>{s.state}</span>
                          <div style={{ width: 40, height: 3, background: 'hsl(0 20% 18%)', borderRadius: 2 }}>
                            <div style={{ width: `${(s.hp / s.maxHp) * 100}%`, height: '100%', background: s.hp / s.maxHp > 0.5 ? 'hsl(120 50% 40%)' : 'hsl(30 70% 45%)', borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                      {soldiers.length > 6 && <div style={{ fontSize: 9, color: 'hsl(42 12% 38%)', textAlign: 'center' }}>+{soldiers.length - 6} more</div>}
                    </div>
                  )}
                  {soldiers.length > 0 && (
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button style={{ ...btnS, flex: 1 }} onClick={handlePatrol}>🚶 Patrol</button>
                      <button style={{ ...btnS, flex: 1 }} onClick={handleDefend}>🛡️ Defend</button>
                    </div>
                  )}
                  {barracksId !== null && (
                    <>
                      <div style={{ fontSize: 9, color: 'hsl(42 12% 38%)', borderTop: '1px solid hsl(38 12% 16%)', paddingTop: 4 }}>TRAIN</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {(Object.entries(SOLDIER_DEFS) as [SoldierType, typeof SOLDIER_DEFS[SoldierType]][]).map(([type, def]) => {
                          const costStr = Object.entries(def.cost).map(([r, a]) => `${a}${r[0].toUpperCase()}`).join(' ');
                          const canAfford = Object.entries(def.cost).every(([r, a]) => (gameState.resources as any)[r] >= (a ?? 0));
                          return (
                            <button key={type} onClick={() => enqueueSoldierTraining(barracksId!, type)}
                              style={{ ...btnS, background: canAfford ? 'hsla(0,30%,14%,0.8)' : 'hsla(0,10%,10%,0.4)', color: canAfford ? 'hsl(42 40% 72%)' : 'hsl(42 10% 38%)', cursor: canAfford ? 'pointer' : 'not-allowed' }}
                            >{def.icon} {def.label} ({costStr})</button>
                          );
                        })}
                      </div>
                      {trainingQueue.length > 0 && (
                        <div style={{ fontSize: 9, color: 'hsl(42 18% 50%)' }}>
                          Queue: {trainingQueue.map((q, i) => `${SOLDIER_DEFS[q.soldierType].icon} ${Math.ceil(q.timeRemaining)}s${i < trainingQueue.length - 1 ? ' →' : ''}`).join(' ')}
                        </div>
                      )}
                    </>
                  )}
                  {soldiers.length === 0 && barracksId === null && (
                    <div style={{ fontSize: 10, color: 'hsl(42 12% 38%)', textAlign: 'center' }}>Build a Barracks to train soldiers.</div>
                  )}
                </>
              )}

              {/* Smithy tab */}
              {activeTab === 'smithy' && smithyId !== null && (
                <>
                  {activeCraft ? (
                    <div>
                      <div style={{ fontSize: 10, color: 'hsl(42 30% 68%)' }}>{activeCraft.recipe.icon} {activeCraft.recipe.label}</div>
                      <div style={{ height: 4, background: 'hsl(38 12% 16%)', borderRadius: 2, marginTop: 2 }}>
                        <div style={{ width: `${((activeCraft.totalTime - activeCraft.timeRemaining) / activeCraft.totalTime) * 100}%`, height: '100%', background: 'hsl(38 55% 42%)', borderRadius: 2 }} />
                      </div>
                    </div>
                  ) : <div style={{ fontSize: 10, color: 'hsl(42 12% 40%)' }}>Smithy idle</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {SMITHY_RECIPES.map(recipe => {
                      const canAfford = Object.entries(recipe.inputs).every(([r, a]) => (gameState.resources as any)[r] >= (a ?? 0));
                      return (
                        <button key={recipe.output} onClick={() => queueSmithyCraft(smithyId!, recipe.output)}
                          style={{ ...btnS, background: canAfford ? 'hsla(38,22%,13%,0.8)' : 'hsla(38,10%,10%,0.4)', color: canAfford ? 'hsl(42 40% 72%)' : 'hsl(42 10% 38%)', cursor: canAfford ? 'pointer' : 'not-allowed', borderColor: canAfford ? 'hsl(38 28% 22%)' : 'hsl(38 10% 16%)' }}
                        >{recipe.icon} {recipe.label}</button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {SMITHY_RECIPES.map(r => <span key={r.output} style={{ fontSize: 10, color: (armory as any)[r.output] > 0 ? 'hsl(42 35% 65%)' : 'hsl(42 10% 35%)' }}>{r.icon}{(armory as any)[r.output]}</span>)}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default MilitaryStrip;
