// ──────────────────────────────────────────────
//  Selection Panel – compact right sidebar (220px)
//  Never blocks the center playfield.
// ──────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import { gameState, pushNotification } from '../core/GameState';
import { unassignCitizen, manuallyAssignCitizen } from '../systems/JobAssignmentSystem';
import { EventBus } from '../core/EventBus';
import { enqueueSoldierTraining } from '../systems/RaidSystem';
import { SOLDIER_DEFS, BUILDING_MAX_HP } from '../core/MilitaryTypes';
import { armory, queueSmithyCraft, SMITHY_RECIPES, smithyCrafting, smithyQueue } from '../systems/SmithySystem';
import type { SoldierType } from '../core/EventBus';
import { commandState, enterCommandMode } from '../core/CommandState';
import { setPath } from '../systems/JobSystem';
import TechPanel from './TechPanel';
import MarketPanel from './MarketPanel';
import StrongholdPanel from './StrongholdPanel';
import DockPanel from './DockPanel';
import { garrisonUnit, ungarrisonAll, garrisonMap, GARRISON_CAPACITY } from '../systems/GarrisonSystem';
import { getSoldierXP, RANK_ICONS } from '../systems/UnitExperienceSystem';
import {
  getBuildingLevel, canUpgradeBuilding, startBuildingUpgrade,
  getUpgradeCost, buildingUpgradeTimers, LEVEL_BENEFITS,
} from '../systems/BuildingUpgradeSystem';

interface SelectionPanelProps {
  selectedEntity: number | null;
  selectedSoldierId?: number | null;
  tick: number;
}

const JOB_ICONS: Record<string, string> = {
  idle: '😴', woodcutter: '🪓', farmer: '🌾', quarryman: '⛏', builder: '🔨', hauler: '📦',
};

const ACTION_LABELS: Record<string, string> = {
  idle: 'Standing idle',
  sleeping: 'Sleeping',
  moving_to_resource: 'Walking to resource',
  gathering: 'Gathering',
  moving_to_storage: 'Carrying to storage',
  delivering: 'Delivering goods',
  moving_to_site: 'Walking to build site',
  building: 'Building…',
  moving_to_storage_for_build: 'Fetching materials',
};

const BUILDING_ICONS: Record<string, string> = {
  town_center: '🏛', house: '🏠', storage_barn: '🏚',
  woodcutter_hut: '🪓', farm_field: '🌾', quarry: '⛏',
  barracks: '⚔️', tower: '🗼', smithy: '🔨', guard_post: '🏴', market: '🏪',
  stronghold: '🏰', dock: '⚓',
};

// ── Shared panel container ────────────────────────────────────────────────────
const PanelContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    position: 'absolute',
    right: 12,
    top: 90,
    width: 220,
    maxWidth: 220,
    maxHeight: 'calc(100vh - 160px)',
    overflowY: 'auto',
    overflowX: 'hidden',
    zIndex: 200,
    background: 'hsla(28 22% 9% / 0.97)',
    border: '1px solid hsl(38 28% 20%)',
    borderRadius: 10,
    boxSizing: 'border-box',
    scrollbarWidth: 'thin',
  }}>
    {children}
  </div>
);

// ── Compact button ────────────────────────────────────────────────────────────
const CBtn: React.FC<{
  icon: string; label: string; onClick: () => void;
  color?: string; disabled?: boolean;
}> = ({ icon, label, onClick, color = '38 20% 14%', disabled = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '4px 6px', fontSize: 10, fontWeight: 600,
      background: disabled ? 'hsla(0,10%,10%,0.4)' : `hsla(${color}, 0.9)`,
      border: `1px solid hsl(${disabled ? '0 10% 18%' : '38 20% 22%'})`,
      borderRadius: 5, color: disabled ? 'hsl(42 10% 35%)' : 'hsl(42 45% 68%)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      whiteSpace: 'nowrap', boxSizing: 'border-box',
    }}
  >
    <span>{icon}</span>{label}
  </button>
);

// ── HP Bar ────────────────────────────────────────────────────────────────────
const HpBar: React.FC<{ current: number; max: number; label?: string }> = ({ current, max, label }) => {
  const ratio = Math.max(0, current / max);
  const color = ratio > 0.6 ? 'hsl(120 50% 40%)' : ratio > 0.3 ? 'hsl(38 65% 42%)' : 'hsl(0 60% 38%)';
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'hsl(42 15% 50%)', marginBottom: 2 }}>
        <span>{label ?? 'HP'}</span>
        <span style={{ color }}>{Math.ceil(current)}/{max}</span>
      </div>
      <div style={{ height: 5, background: 'hsl(0 20% 12%)', borderRadius: 3 }}>
        <div style={{ width: `${ratio * 100}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
};

// ── Panel section label ───────────────────────────────────────────────────────
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'hsl(42 15% 40%)', marginBottom: 4, marginTop: 6 }}>
    {children}
  </div>
);

// ── Panel header ──────────────────────────────────────────────────────────────
const PanelHeader: React.FC<{
  icon: string; title: string; subtitle?: string;
  titleColor?: string; onClose?: () => void;
}> = ({ icon, title, subtitle, titleColor = 'hsl(42 70% 78%)', onClose }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px 8px',
    borderBottom: '1px solid hsl(38 18% 16%)',
  }}>
    <span style={{ fontSize: 20 }}>{icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: titleColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {title}
      </div>
      {subtitle && <div style={{ fontSize: 10, color: 'hsl(42 25% 50%)' }}>{subtitle}</div>}
    </div>
    {onClose && (
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', color: 'hsl(42 20% 45%)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
      >✕</button>
    )}
  </div>
);

const SelectionPanel: React.FC<SelectionPanelProps> = ({ selectedEntity, selectedSoldierId, tick }) => {
  // Snapshot citizen job state once per tick to prevent flicker
  const [citizenSnapshot, setCitizenSnapshot] = useState<{
    jobType: string; actionState: string; assignedBuildingId: number | null;
  } | null>(null);
  const lastTickRef = useRef(-1);

  useEffect(() => {
    if (selectedEntity === null || lastTickRef.current === tick) return;
    lastTickRef.current = tick;
    const job = gameState.jobs.get(selectedEntity);
    if (!job) { setCitizenSnapshot(null); return; }
    setCitizenSnapshot(prev => {
      if (
        prev &&
        prev.jobType === job.jobType &&
        prev.actionState === job.actionState &&
        prev.assignedBuildingId === job.assignedBuildingId
      ) return prev;
      return { jobType: job.jobType, actionState: job.actionState, assignedBuildingId: job.assignedBuildingId };
    });
  }, [tick, selectedEntity]);

  const clearSel = () => {
    gameState.selectables.forEach(s => { s.isSelected = false; });
    gameState.selectedEntity = null;
    gameState.military.selectedSoldierId = null;
    EventBus.emit('EntitySelected', { entityId: null });
    EventBus.emit('SoldierSelected', { soldierId: null });
  };

  // ── Soldier panel ────────────────────────────────────────────────────────
  const { military } = gameState;
  const activeSoldierId = selectedSoldierId ?? military.selectedSoldierId;

  if (activeSoldierId !== null && military.soldiers.has(activeSoldierId)) {
    const soldier = military.soldiers.get(activeSoldierId)!;
    const sTransform = military.soldierTransforms.get(activeSoldierId);
    const def = SOLDIER_DEFS[soldier.soldierType];

    const handleEquip = (item: string) => {
      if ((armory as any)[item] <= 0) { pushNotification(`No ${item} in armory!`, 'error'); return; }
      (armory as any)[item]--;
      if (['spear', 'sword', 'bow'].includes(item)) soldier.equipment = { ...soldier.equipment, weapon: item as any };
      else if (item === 'armor') { soldier.equipment = { ...soldier.equipment, armor: 'chainmail' }; soldier.maxHp = Math.round(soldier.maxHp * 1.5); soldier.hp = Math.min(soldier.hp + 40, soldier.maxHp); }
      else if (item === 'shield') soldier.equipment = { ...soldier.equipment, shield: true };
      pushNotification(`⚔️ ${def.label} equipped with ${item}!`, 'success');
    };

    const handlePatrol = () => {
      let tcX = 0, tcZ = 0;
      gameState.buildings.forEach((b, id) => { if (b.type === 'town_center') { const t = gameState.transforms.get(id); if (t) { tcX = t.x; tcZ = t.z; } } });
      if (sTransform) {
        soldier.patrolWaypoints = [{ x: sTransform.x, z: sTransform.z }, { x: tcX + (Math.random() - 0.5) * 4, z: tcZ + (Math.random() - 0.5) * 4 }];
        soldier.patrolIndex = 0; soldier.state = 'patrolling';
      }
    };

    const handleDefendTC = () => {
      let tcX = 0, tcZ = 0;
      gameState.buildings.forEach((b, id) => { if (b.type === 'town_center') { const t = gameState.transforms.get(id); if (t) { tcX = t.x; tcZ = t.z; } } });
      if (sTransform) { const angle = Math.random() * Math.PI * 2; sTransform.x = tcX + Math.cos(angle) * 6; sTransform.z = tcZ + Math.sin(angle) * 6; soldier.state = 'idle'; soldier.patrolWaypoints = []; }
    };

    const wp = soldier.equipment?.weapon;
    const ar = soldier.equipment?.armor;
    const sh = soldier.equipment?.shield;
    const hpRatio = soldier.hp / soldier.maxHp;

    return (
      <PanelContainer>
        {(() => {
          const xpData = getSoldierXP(activeSoldierId);
          const rankIcon = RANK_ICONS[xpData.rank];
          const nextXp = xpData.rank !== 'champion' ? (() => {
            const order: Array<'recruit'|'veteran'|'elite'|'champion'> = ['recruit','veteran','elite','champion'];
            const thresholds: Record<string, number> = { recruit: 10, veteran: 30, elite: 60, champion: 60 };
            return thresholds[xpData.rank];
          })() : null;
          return (
            <PanelHeader
              icon={def.icon}
              title={`${rankIcon ? rankIcon + ' ' : ''}${def.label}`}
              subtitle={`${soldier.state} · ⚔️ ${xpData.killCount} kills · ${xpData.xp}${nextXp ? `/${nextXp}` : ''} XP`}
              titleColor="hsl(0 60% 72%)"
              onClose={clearSel}
            />
          );
        })()}
        <div style={{ padding: '8px 12px' }}>
          <HpBar current={soldier.hp} max={soldier.maxHp} label="Health" />

          <SectionLabel>COMMANDS</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
            <CBtn icon="📍" label="Move" onClick={() => enterCommandMode('awaiting_move_target', activeSoldierId, 'soldier', `Click terrain to move ${def.label}`)} />
            <CBtn icon="⚔️" label="Attack" color="0 25% 14%" onClick={() => enterCommandMode('awaiting_attack_target', activeSoldierId, 'soldier', 'Click an enemy to attack')} />
            <CBtn icon="🚶" label="Patrol" onClick={handlePatrol} />
            <CBtn icon="🛡️" label="Defend TC" onClick={handleDefendTC} />
            <CBtn icon="❌" label="Dismiss" color="0 20% 12%" onClick={() => { soldier.state = 'dead'; military.selectedSoldierId = null; EventBus.emit('SoldierSelected', { soldierId: null }); }} />
          </div>

          <SectionLabel>EQUIPMENT</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {['spear', 'sword', 'bow', 'armor', 'shield'].map(item => {
              const icon = item === 'spear' ? '⚔️' : item === 'sword' ? '🗡️' : item === 'bow' ? '🏹' : item === 'armor' ? '🛡️' : '🔰';
              const equipped = !!(wp === item || (item === 'armor' && ar) || (item === 'shield' && sh));
              const stock = (armory as any)[item] ?? 0;
              return (
                <button key={item} onClick={() => !equipped && handleEquip(item)} disabled={equipped || stock === 0}
                  style={{ padding: '3px 6px', fontSize: 10, background: equipped ? 'hsla(120,30%,12%,0.8)' : stock > 0 ? 'hsla(38,25%,14%,0.8)' : 'hsla(0,10%,10%,0.4)', border: `1px solid ${equipped ? 'hsl(120 30% 22%)' : stock > 0 ? 'hsl(38 30% 22%)' : 'hsl(0 10% 16%)'}`, borderRadius: 4, color: equipped ? 'hsl(120 50% 55%)' : stock > 0 ? 'hsl(42 40% 72%)' : 'hsl(42 10% 35%)', cursor: equipped || stock === 0 ? 'not-allowed' : 'pointer' }}
                  title={`${item} (${stock} in armory)`}
                >
                  {icon} {equipped ? '✅' : `(${stock})`}
                </button>
              );
            })}
          </div>
        </div>
      </PanelContainer>
    );
  }

  // Nothing selected — hide panel entirely (no empty placeholder blocking view)
  if (selectedEntity === null) return null;

  const building = gameState.buildings.get(selectedEntity);
  const citizen = gameState.citizens.get(selectedEntity);
  const transform = gameState.transforms.get(selectedEntity);
  const selectable = gameState.selectables.get(selectedEntity);
  const resourceNode = gameState.resourceNodes.get(selectedEntity);

  // ── Building panel ──────────────────────────────────────────────────────
  if (building && transform) {
    const workerCount = building.assignedWorkers.length;
    const isStorage = building.type === 'town_center' || building.type === 'storage_barn';
    const isBarracks = building.type === 'barracks';
    const isSmithy = building.type === 'smithy';
    const maxHp = BUILDING_MAX_HP[building.type] ?? 200;
    const currentHp = gameState.military.buildingHp.get(selectedEntity) ?? maxHp;
    const trainingQueue = isBarracks ? (gameState.military.trainingQueues.get(selectedEntity) ?? []) : [];
    const activeCraft = isSmithy ? smithyCrafting.get(selectedEntity) : null;
    const craftQueue = isSmithy ? (smithyQueue.get(selectedEntity) ?? []) : [];

    const idleCitizens: Array<{ id: number; name: string }> = [];
    if (building.workerSlots > workerCount) {
      gameState.citizens.forEach((cit, cId) => {
        const j = gameState.jobs.get(cId);
        if (j && (j.jobType === 'idle' || j.actionState === 'idle') && j.jobType !== 'builder') {
          if (!building.assignedWorkers.includes(cId)) idleCitizens.push({ id: cId, name: cit.name });
        }
      });
    }

    const stateLabel = building.state === 'under_construction'
      ? `🔨 ${Math.round(building.constructionProgress)}%`
      : building.state === 'active' ? '✅ Active' : building.state;

    return (
      <PanelContainer>
        <PanelHeader
          icon={BUILDING_ICONS[building.type] ?? '🏛'}
          title={selectable?.label ?? building.type}
          subtitle={stateLabel}
          onClose={clearSel}
        />
        <div style={{ padding: '8px 12px' }}>

          {/* Construction progress */}
          {building.state === 'under_construction' && (
            <>
              <div style={{ height: 5, background: 'hsl(38 15% 15%)', borderRadius: 3, marginBottom: 4 }}>
                <div style={{ width: `${building.constructionProgress}%`, height: '100%', background: 'hsl(38 60% 45%)', borderRadius: 3, transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 10, color: 'hsl(42 20% 50%)', marginBottom: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(building.constructionCost).map(([res, cost]) => {
                  const delivered = building.constructionDelivered[res as keyof typeof building.constructionDelivered] ?? 0;
                  const done = delivered >= (cost as number);
                  return (
                    <span key={res} style={{ color: done ? 'hsl(120 40% 50%)' : 'hsl(42 30% 60%)' }}>
                      {res === 'wood' ? '🪵' : res === 'stone' ? '🪨' : '🌾'}{delivered}/{cost as number}{done ? '✓' : ''}
                    </span>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: 'hsl(42 15% 45%)', marginBottom: 6 }}>
                {(() => {
                  let builderName: string | null = null;
                  let builderAction = 'idle';
                  gameState.jobs.forEach((j, cId) => {
                    if (j.jobType === 'builder' && j.assignedBuildingId === selectedEntity) {
                      const c = gameState.citizens.get(cId);
                      if (c) { builderName = c.name; builderAction = j.actionState; }
                    }
                  });
                  return builderName ? `👷 ${builderName} — ${ACTION_LABELS[builderAction] ?? builderAction}` : '⏳ Awaiting citizen…';
                })()}
              </div>
            </>
          )}

          {/* Active building stats */}
          {building.state === 'active' && (
            <>
              <HpBar current={currentHp} max={maxHp} label="Structure HP" />
              {building.workerSlots > 0 && (
                <div style={{ fontSize: 11, color: 'hsl(42 35% 60%)', marginBottom: 6 }}>
                  👷 Workers: {workerCount}/{building.workerSlots}
                  {building.produces && `  · 📦 Today: ${building.dailyProduced}`}
                </div>
              )}
            </>
          )}

          {/* Assigned workers list */}
          {building.assignedWorkers.length > 0 && (
            <>
              <SectionLabel>WORKERS</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                {building.assignedWorkers.map(wId => {
                  const wCit = gameState.citizens.get(wId);
                  const wJob = gameState.jobs.get(wId);
                  return (
                    <button key={wId} onClick={() => {
                      gameState.selectables.forEach(s => { s.isSelected = false; });
                      const s = gameState.selectables.get(wId); if (s) s.isSelected = true;
                      gameState.selectedEntity = wId; EventBus.emit('EntitySelected', { entityId: wId });
                    }} style={{ textAlign: 'left', padding: '3px 6px', fontSize: 10, background: 'hsla(28,20%,14%,0.9)', border: '1px solid hsl(38 18% 20%)', borderRadius: 4, color: 'hsl(42 35% 65%)', cursor: 'pointer' }}>
                      👤 {wCit?.name ?? `#${wId}`} — {ACTION_LABELS[wJob?.actionState ?? 'idle'] ?? wJob?.actionState}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Add worker */}
          {building.workerSlots > workerCount && building.state === 'active' && idleCitizens.length > 0 && !isBarracks && !isSmithy && (
            <div style={{ marginBottom: 6 }}>
              <select onChange={e => { const cId = parseInt(e.target.value); if (!isNaN(cId)) manuallyAssignCitizen(cId, selectedEntity); e.target.value = ''; }} defaultValue=""
                style={{ width: '100%', padding: '4px 6px', fontSize: 10, background: 'hsla(38,28%,14%,0.9)', border: '1px solid hsl(38 35% 26%)', borderRadius: 4, color: 'hsl(42 30% 78%)', cursor: 'pointer', boxSizing: 'border-box' }}>
                <option value="">+ Add Worker…</option>
                {idleCitizens.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          )}

          {/* Storage breakdown */}
          {isStorage && Object.keys(building.storage).length > 0 && (
            <>
              <SectionLabel>STORED RESOURCES</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {(Object.entries(building.storage) as [string, number][]).map(([res, amt]) => (
                  <span key={res} style={{ fontSize: 11, color: 'hsl(42 40% 65%)' }}>
                    {res === 'wood' ? '🪵' : res === 'stone' ? '🪨' : '🌾'} {Math.floor(amt)}
                  </span>
                ))}
              </div>
            </>
          )}

          {/* Farm crop progress */}
          {building.type === 'farm_field' && building.state === 'active' && (
            <>
              <SectionLabel>CROP GROWTH</SectionLabel>
              <div style={{ height: 5, background: 'hsl(90 15% 12%)', borderRadius: 3, marginBottom: 3 }}>
                <div style={{ width: `${building.cropProgress}%`, height: '100%', background: 'hsl(100 55% 40%)', borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: 'hsl(42 15% 50%)' }}>{Math.round(building.cropProgress)}%</div>
            </>
          )}

          {/* Barracks training */}
          {isBarracks && building.state === 'active' && (
            <>
              <SectionLabel>TRAIN SOLDIERS</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                {(Object.entries(SOLDIER_DEFS) as [SoldierType, typeof SOLDIER_DEFS[SoldierType]][]).map(([type, def]) => {
                  const costEntries = Object.entries(def.cost) as [string, number][];
                  const canAfford = costEntries.every(([r, a]) => (gameState.resources as any)[r] >= a);
                  const costStr = costEntries.map(([r, a]) => `${r === 'wood' ? '🪵' : r === 'stone' ? '🪨' : '🌾'}${a}`).join(' ');
                  return (
                    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', background: 'hsla(28,15%,12%,0.7)', borderRadius: 4, border: '1px solid hsl(28 15% 18%)' }}>
                      <span style={{ fontSize: 13 }}>{def.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: 'hsl(42 30% 72%)' }}>{def.label}</div>
                        <div style={{ fontSize: 9, color: 'hsl(42 15% 45%)' }}>{costStr}</div>
                      </div>
                      <button onClick={() => enqueueSoldierTraining(selectedEntity, type)} disabled={!canAfford}
                        style={{ padding: '2px 8px', fontSize: 11, fontWeight: 700, background: canAfford ? 'hsla(0,35%,16%,0.9)' : 'hsla(0,10%,10%,0.5)', border: `1px solid ${canAfford ? 'hsl(0 35% 28%)' : 'hsl(0 10% 16%)'}`, borderRadius: 4, color: canAfford ? 'hsl(42 50% 72%)' : 'hsl(42 10% 35%)', cursor: canAfford ? 'pointer' : 'not-allowed' }}>+</button>
                    </div>
                  );
                })}
              </div>
              {trainingQueue.length > 0 && (
                <div style={{ fontSize: 10, color: 'hsl(42 20% 55%)' }}>
                  Queue: {trainingQueue.map((q, i) => `${SOLDIER_DEFS[q.soldierType].icon} ${Math.ceil(q.timeRemaining)}s${i < trainingQueue.length - 1 ? ' → ' : ''}`)}
                </div>
              )}
            </>
          )}

          {/* Smithy crafting */}
          {isSmithy && building.state === 'active' && (
            <>
              {activeCraft && (
                <>
                  <SectionLabel>CRAFTING</SectionLabel>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 11, color: 'hsl(42 30% 70%)', marginBottom: 4 }}>{activeCraft.recipe.icon} {activeCraft.recipe.label}</div>
                    <div style={{ height: 5, background: 'hsl(38 15% 18%)', borderRadius: 3 }}>
                      <div style={{ width: `${((activeCraft.totalTime - activeCraft.timeRemaining) / activeCraft.totalTime) * 100}%`, height: '100%', background: 'hsl(38 60% 45%)', borderRadius: 3, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ fontSize: 9, color: 'hsl(42 15% 45%)', marginTop: 2 }}>{Math.ceil(activeCraft.timeRemaining)}s remaining</div>
                  </div>
                </>
              )}
              <SectionLabel>CRAFT ITEMS</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                {SMITHY_RECIPES.map(recipe => {
                  const costEntries = Object.entries(recipe.inputs) as [string, number][];
                  const canAfford = costEntries.every(([r, a]) => (gameState.resources as any)[r] >= a);
                  const costStr = costEntries.map(([r, a]) => `${r === 'wood' ? '🪵' : '🪨'}${a}`).join(' ');
                  return (
                    <div key={recipe.output} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', background: 'hsla(28,15%,12%,0.7)', borderRadius: 4, border: '1px solid hsl(28 15% 18%)' }}>
                      <span style={{ fontSize: 12 }}>{recipe.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: 'hsl(42 30% 72%)' }}>{recipe.label}</div>
                        <div style={{ fontSize: 9, color: 'hsl(42 15% 45%)' }}>{costStr}</div>
                      </div>
                      <button onClick={() => queueSmithyCraft(selectedEntity, recipe.output)} disabled={!canAfford}
                        style={{ padding: '2px 8px', fontSize: 11, fontWeight: 700, background: canAfford ? 'hsla(38,25%,14%,0.9)' : 'hsla(0,10%,10%,0.5)', border: `1px solid ${canAfford ? 'hsl(38 30% 22%)' : 'hsl(0 10% 16%)'}`, borderRadius: 4, color: canAfford ? 'hsl(42 50% 72%)' : 'hsl(42 10% 35%)', cursor: canAfford ? 'pointer' : 'not-allowed' }}>+</button>
                    </div>
                  );
                })}
              </div>
              <SectionLabel>ARMORY STOCK</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {SMITHY_RECIPES.map(r => (
                  <span key={r.output} style={{ fontSize: 11, color: (armory as any)[r.output] > 0 ? 'hsl(42 40% 72%)' : 'hsl(42 10% 35%)' }}>
                    {r.icon} {(armory as any)[r.output]}
                  </span>
                ))}
              </div>
              {craftQueue.length > 0 && <div style={{ fontSize: 10, color: 'hsl(42 20% 55%)' }}>Queue: {craftQueue.join(' → ')}</div>}
            </>
          )}

          {/* Garrison UI */}
          {GARRISON_CAPACITY[building.type] && building.state === 'active' && (() => {
            const garr = garrisonMap.get(selectedEntity);
            const garrisonedCount = garr?.garrisonedUnitIds.length ?? 0;
            const maxCap = GARRISON_CAPACITY[building.type]!;
            return (
              <>
                <SectionLabel>GARRISON ({garrisonedCount}/{maxCap})</SectionLabel>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                  {garrisonedCount > 0 && (
                    <CBtn icon="🏃" label={`Ungarrison All (${garrisonedCount})`} onClick={() => ungarrisonAll(selectedEntity)} />
                  )}
                  {garrisonedCount === 0 && (
                    <div style={{ fontSize: 10, color: 'hsl(42 15% 42%)' }}>
                      No units inside. Right-click soldiers to garrison them.
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* Market trading panel */}
          {building.type === 'market' && building.state === 'active' && (
            <MarketPanel tick={tick} />
          )}

          {/* Stronghold panel */}
          {building.type === 'stronghold' && building.state === 'active' && (
            <StrongholdPanel tick={tick} />
          )}

          {/* Dock panel */}
          {building.type === 'dock' && building.state === 'active' && (
            <DockPanel buildingId={selectedEntity} tick={tick} />
          )}

          {/* Technology research panel */}
          {building.state === 'active' && (() => {
            const TECH_BUILDINGS = ['town_center', 'woodcutter_hut', 'quarry', 'farm_field', 'smithy', 'barracks'];
            return TECH_BUILDINGS.includes(building.type) ? (
              <TechPanel buildingId={selectedEntity} buildingType={building.type} tick={tick} />
            ) : null;
          })()}

          {/* Building Upgrade Section */}
          {building.state === 'active' && (() => {
            const level = getBuildingLevel(selectedEntity);
            const upgradeTimer = buildingUpgradeTimers.get(selectedEntity);
            const check = canUpgradeBuilding(selectedEntity);
            const cost = getUpgradeCost(selectedEntity);
            const nextLevel = Math.min(5, level + 1) as 1|2|3|4|5;
            const ben = LEVEL_BENEFITS[nextLevel];

            return (
              <>
                <SectionLabel>
                  LEVEL {level}{level >= 5 ? ' ★ MAX' : ` → ${nextLevel}`}
                </SectionLabel>
                {upgradeTimer ? (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: 'hsl(38 60% 55%)', marginBottom: 3 }}>
                      ⬆️ Upgrading to Lv.{upgradeTimer.targetLevel}…
                    </div>
                    <div style={{ height: 4, background: 'hsl(38 12% 16%)', borderRadius: 2 }}>
                      <div style={{
                        width: `${((upgradeTimer.totalTime - upgradeTimer.timeRemaining) / upgradeTimer.totalTime) * 100}%`,
                        height: '100%', borderRadius: 2,
                        background: 'linear-gradient(90deg, hsl(38 55% 38%), hsl(38 75% 56%))',
                        transition: 'width 0.5s',
                      }} />
                    </div>
                  </div>
                ) : level < 5 ? (
                  <>
                    <div style={{ fontSize: 9, color: 'hsl(42 15% 48%)', marginBottom: 4 }}>
                      Bonus: +{Math.round((ben.productionBonus - 1) * 100)}% production
                      {ben.workerSlotsBonus > 0 ? `, +${ben.workerSlotsBonus} workers` : ''}
                      {ben.storageBonus > 0 ? `, +${ben.storageBonus} storage` : ''}
                    </div>
                    {cost && (
                      <div style={{ fontSize: 9, color: check.canUpgrade ? 'hsl(42 30% 60%)' : 'hsl(0 50% 50%)', marginBottom: 4 }}>
                        Cost: {Object.entries(cost).map(([r, a]) => `${r === 'wood' ? '🪵' : r === 'stone' ? '🪨' : '🌾'}${a}`).join(' ')}
                      </div>
                    )}
                    <button
                      disabled={!check.canUpgrade}
                      onClick={() => startBuildingUpgrade(selectedEntity)}
                      style={{
                        width: '100%', padding: '5px', fontSize: 10, fontWeight: 700,
                        background: check.canUpgrade ? 'hsla(38,45%,14%,0.9)' : 'hsla(28,12%,11%,0.7)',
                        border: `1px solid ${check.canUpgrade ? 'hsl(38 50% 32%)' : 'hsl(28 12% 18%)'}`,
                        borderRadius: 5, cursor: check.canUpgrade ? 'pointer' : 'not-allowed',
                        color: check.canUpgrade ? 'hsl(38 75% 65%)' : 'hsl(42 10% 38%)',
                        marginBottom: 6,
                        transition: 'all 0.12s',
                      }}
                      onMouseEnter={e => { if (check.canUpgrade) (e.currentTarget as HTMLElement).style.background = 'hsla(38,50%,18%,0.95)'; }}
                      onMouseLeave={e => { if (check.canUpgrade) (e.currentTarget as HTMLElement).style.background = 'hsla(38,45%,14%,0.9)'; }}
                    >
                      {check.canUpgrade ? `⬆️ Upgrade to Lv.${nextLevel}` : `🔒 ${check.reason}`}
                    </button>
                  </>
                ) : null}
              </>
            );
          })()}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
            <CBtn icon="🔥" label="Demolish" color="0 20% 12%" onClick={() => {
              pushNotification('Building demolished', 'warning');
              gameState.buildings.delete(selectedEntity);
              gameState.resourceNodes.delete(selectedEntity);
              gameState.isResourceNode.delete(selectedEntity);
              gameState.transforms.delete(selectedEntity);
              gameState.selectables.delete(selectedEntity);
              gameState.isBuilding.delete(selectedEntity);
              gameState.selectedEntity = null;
              EventBus.emit('EntitySelected', { entityId: null });
              EventBus.emit('BuildingDemolished', { buildingId: selectedEntity });
            }} />
          </div>
        </div>
      </PanelContainer>
    );
  }

  // ── Citizen panel ───────────────────────────────────────────────────────
  if (citizen && transform) {
    const liveJob = gameState.jobs.get(selectedEntity);
    const stableJob = citizenSnapshot ?? (liveJob ? {
      jobType: liveJob.jobType, actionState: liveJob.actionState, assignedBuildingId: liveJob.assignedBuildingId,
    } : null);
    const inv = gameState.inventories.get(selectedEntity);
    const assignedBuilding = stableJob?.assignedBuildingId !== null && stableJob?.assignedBuildingId !== undefined
      ? gameState.buildings.get(stableJob.assignedBuildingId) : null;
    const assignedLabel = assignedBuilding
      ? (gameState.selectables.get(stableJob!.assignedBuildingId!)?.label ?? assignedBuilding.type)
      : 'None';

    const actionStatus =
      stableJob?.actionState === 'moving_to_resource' ? '🚶 Walking to resource' :
      stableJob?.actionState === 'gathering' ? '⛏️ Gathering' :
      stableJob?.actionState === 'moving_to_storage' ? '📦 Carrying to storage' :
      stableJob?.actionState === 'delivering' ? '✅ Delivering' :
      stableJob?.actionState === 'moving_to_storage_for_build' ? '🔨 Fetching materials' :
      stableJob?.actionState === 'moving_to_site' ? '🏗️ Walking to site' :
      stableJob?.actionState === 'building' ? '🔨 Building' :
      '😴 Idle';

    const JOB_QUICK: Array<{ label: string; icon: string; jobType: string }> = [
      { label: 'Chop', icon: '🪓', jobType: 'woodcutter' },
      { label: 'Mine', icon: '⛏️', jobType: 'quarryman' },
      { label: 'Farm', icon: '🌾', jobType: 'farmer' },
      { label: 'Idle', icon: '😴', jobType: 'idle' },
    ];

    const handleQuickJob = (jobType: string) => {
      const lj = gameState.jobs.get(selectedEntity);
      if (!lj) return;
      lj.jobType = jobType as any;
      lj.actionState = 'idle';
      lj.targetEntityId = null;
      lj.assignedBuildingId = null;
    };

    return (
      <PanelContainer>
        <PanelHeader
          icon={JOB_ICONS[stableJob?.jobType ?? 'idle']}
          title={citizen.name}
          subtitle={`Age ${citizen.age} · ❤️ ${citizen.happiness}%`}
          onClose={clearSel}
        />
        <div style={{ padding: '8px 12px' }}>
          {/* Status strip */}
          <div style={{ fontSize: 11, color: 'hsl(42 40% 65%)', background: 'hsl(38 12% 11%)', borderRadius: 5, padding: '4px 8px', marginBottom: 8 }}>
            {actionStatus}
            {inv?.carrying && inv.carryType && (
              <span> · {inv.carryType === 'wood' ? '🪵' : inv.carryType === 'stone' ? '🪨' : '🌾'}</span>
            )}
          </div>

          {/* Job info */}
          <div style={{ fontSize: 10, color: 'hsl(42 20% 48%)', marginBottom: 6 }}>
            Job: <span style={{ color: 'hsl(42 40% 65%)' }}>{stableJob?.jobType ?? 'idle'}</span>
            {assignedBuilding && <span> · at {assignedLabel}</span>}
          </div>

          <SectionLabel>COMMANDS</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
            <CBtn icon="📍" label="Move" onClick={() => enterCommandMode('awaiting_move_target', selectedEntity, 'citizen', `Click terrain to move ${citizen.name}`)} />
            <CBtn icon="🌲" label="Resource" onClick={() => enterCommandMode('awaiting_work_target', selectedEntity, 'citizen', `Click a resource node to assign ${citizen.name}`)} />
            <CBtn icon="🏠" label="Send Home" onClick={() => {
              let tcX = 0, tcZ = 0;
              gameState.buildings.forEach((b, bid) => { if (b.type === 'town_center') { const tt = gameState.transforms.get(bid); if (tt) { tcX = tt.x; tcZ = tt.z; } } });
              const lj = gameState.jobs.get(selectedEntity);
              if (lj) { lj.jobType = 'idle'; lj.actionState = 'idle'; lj.targetEntityId = null; lj.assignedBuildingId = null; }
              setPath(selectedEntity, tcX, tcZ);
              pushNotification(`🏠 ${citizen.name} heading home`, 'info');
            }} />
            {stableJob?.jobType !== 'idle' && (
              <CBtn icon="🚫" label="Unassign" onClick={() => unassignCitizen(selectedEntity)} />
            )}
          </div>

          <SectionLabel>QUICK JOB</SectionLabel>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {JOB_QUICK.map(({ label, icon, jobType }) => (
              <button key={jobType} onClick={() => handleQuickJob(jobType)} title={jobType}
                style={{ padding: '4px 6px', fontSize: 10, background: stableJob?.jobType === jobType ? 'hsl(38 40% 20%)' : 'hsl(38 15% 13%)', border: `1px solid ${stableJob?.jobType === jobType ? 'hsl(38 50% 35%)' : 'hsl(38 15% 22%)'}`, borderRadius: 5, color: 'hsl(42 40% 65%)', cursor: 'pointer' }}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
      </PanelContainer>
    );
  }

  // ── Resource node panel ─────────────────────────────────────────────────
  if (resourceNode) {
    const rIcon = resourceNode.resourceType === 'wood' ? '🌲' : resourceNode.resourceType === 'stone' ? '🪨' : '🌾';
    return (
      <PanelContainer>
        <PanelHeader
          icon={rIcon}
          title={selectable?.label ?? resourceNode.resourceType}
          subtitle={resourceNode.depleted ? 'Depleted – Regrowing…' : resourceNode.isBeingHarvested ? '⛏ Being harvested' : '✅ Available'}
          onClose={clearSel}
        />
        <div style={{ padding: '8px 12px' }}>
          <div style={{ fontSize: 11, color: 'hsl(42 35% 62%)', marginBottom: 6 }}>
            {Math.floor(resourceNode.amount)} / {resourceNode.maxAmount} remaining
          </div>
          <div style={{ height: 5, background: 'hsl(38 12% 12%)', borderRadius: 3 }}>
            <div style={{ width: `${(resourceNode.amount / resourceNode.maxAmount) * 100}%`, height: '100%', background: 'hsl(100 50% 38%)', borderRadius: 3 }} />
          </div>
        </div>
      </PanelContainer>
    );
  }

  return null;
};

export default SelectionPanel;
