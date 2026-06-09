// ──────────────────────────────────────────────
//  BottomActionBar – unified context-sensitive bottom bar
//  States: nothing, citizen, soldier, building, multi-select
// ──────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import { gameState, pushNotification } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import type { BuildingType, SoldierType } from '../core/EventBus';
import { commandState, enterCommandMode } from '../core/CommandState';
import { SOLDIER_DEFS, BUILDING_MAX_HP } from '../core/MilitaryTypes';
import { BUILDING_DEFS } from '../data/buildings';
import {
  unassignCitizen, manuallyAssignCitizen,
} from '../systems/JobAssignmentSystem';
import { enqueueSoldierTraining } from '../systems/RaidSystem';
import { armory, queueSmithyCraft, SMITHY_RECIPES, smithyCrafting, smithyQueue } from '../systems/SmithySystem';
import { garrisonMap, GARRISON_CAPACITY, ungarrisonAll } from '../systems/GarrisonSystem';
import { getSoldierXP, RANK_ICONS } from '../systems/UnitExperienceSystem';
import {
  getBuildingLevel, canUpgradeBuilding, startBuildingUpgrade,
  getUpgradeCost, buildingUpgradeTimers, LEVEL_BENEFITS,
} from '../systems/BuildingUpgradeSystem';

// ── Building data ──────────────────────────────────────────────────────────

const BUILDING_ICONS: Record<string, string> = {
  town_center: '🏛', house: '🏠', storage_barn: '🏚',
  woodcutter_hut: '🪓', farm_field: '🌾', quarry: '⛏',
  barracks: '⚔️', tower: '🗼', smithy: '🔨', guard_post: '🏴', market: '🏪',
  stronghold: '🏰', dock: '⚓',
};

const ACTION_LABELS: Record<string, string> = {
  idle: 'Idle', sleeping: 'Sleeping',
  moving_to_resource: 'Walking to resource', gathering: 'Gathering',
  moving_to_storage: 'Carrying to storage', delivering: 'Delivering',
  moving_to_site: 'Walking to build site', building: 'Building',
  moving_to_storage_for_build: 'Fetching materials',
};

const CIVILIAN_BUILDINGS: BuildingType[] = ['house', 'storage_barn', 'woodcutter_hut', 'farm_field', 'quarry', 'market', 'dock'];
const MILITARY_BUILDINGS: BuildingType[] = ['barracks', 'smithy', 'tower', 'guard_post'];
const LEGENDARY_BUILDINGS: BuildingType[] = ['stronghold'];

// ── Shared command button ──────────────────────────────────────────────────

interface CmdBtnProps {
  icon: string;
  label: string;
  hotkey?: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  delay?: number;
}

const CmdBtn: React.FC<CmdBtnProps> = ({ icon, label, hotkey, onClick, active, danger, disabled, delay = 0 }) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label + (hotkey ? ` [${hotkey}]` : '')}
      style={{
        position: 'relative',
        width: 52, height: 52,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2,
        background: active
          ? 'hsla(38 50% 24% / 0.95)'
          : danger
          ? 'hsla(0 30% 14% / 0.9)'
          : disabled
          ? 'hsla(0 0% 10% / 0.5)'
          : 'hsla(28 20% 14% / 0.9)',
        border: `1px solid ${active ? 'hsl(38 55% 40%)' : danger ? 'hsl(0 40% 28%)' : disabled ? 'hsl(0 0% 18%)' : 'hsl(38 20% 24%)'}`,
        borderRadius: 8,
        color: disabled ? 'hsl(42 10% 35%)' : active ? 'hsl(42 70% 80%)' : danger ? 'hsl(0 55% 62%)' : 'hsl(42 45% 72%)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 20,
        transition: 'all 0.12s',
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        opacity: visible ? 1 : 0,
        boxShadow: active ? '0 0 8px hsla(38,55%,40%,0.3)' : 'none',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.borderColor = active ? 'hsl(38 65% 50%)' : 'hsl(38 45% 36%)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = active ? 'hsl(38 55% 40%)' : danger ? 'hsl(0 40% 28%)' : disabled ? 'hsl(0 0% 18%)' : 'hsl(38 20% 24%)'; }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 8, letterSpacing: '0.03em', opacity: 0.75 }}>{label}</span>
      {hotkey && (
        <span style={{
          position: 'absolute', bottom: 2, right: 3,
          fontSize: 8, background: 'hsla(0,0%,0%,0.5)',
          borderRadius: 2, padding: '0 2px',
          color: 'hsl(42 30% 55%)',
          fontFamily: 'monospace',
        }}>{hotkey}</span>
      )}
    </button>
  );
};

// ── HP Bar ──────────────────────────────────────────────────────────────────

const HpBar: React.FC<{ current: number; max: number }> = ({ current, max }) => {
  const pct = Math.max(0, Math.min(1, current / max)) * 100;
  const color = pct > 60 ? 'hsl(120 50% 40%)' : pct > 30 ? 'hsl(38 65% 42%)' : 'hsl(0 60% 38%)';
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ height: 4, background: 'hsl(0 20% 12%)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontSize: 9, color, marginTop: 1 }}>{Math.ceil(current)}/{max}</div>
    </div>
  );
};

// ── Portrait zone ───────────────────────────────────────────────────────────

const Portrait: React.FC<{
  icon: string; name: string; subtitle: string;
  hp?: { current: number; max: number };
  iconColor?: string;
}> = ({ icon, name, subtitle, hp, iconColor }) => (
  <div style={{
    width: 80, flexShrink: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '0 8px',
    borderRight: '1px solid hsl(38 18% 18%)',
    gap: 4,
  }}>
    <div style={{
      width: 52, height: 52, borderRadius: 10,
      background: 'hsla(28 18% 12% / 0.9)',
      border: `2px solid hsl(38 35% 28%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 28,
      color: iconColor,
    }}>{icon}</div>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'hsl(42 55% 78%)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 76 }}>{name}</div>
      <div style={{ fontSize: 9, color: 'hsl(42 20% 48%)' }}>{subtitle}</div>
    </div>
    {hp && <HpBar current={hp.current} max={hp.max} />}
  </div>
);

// ── Info strip ──────────────────────────────────────────────────────────────

const InfoStrip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    flex: 1, minWidth: 0,
    borderLeft: '1px solid hsl(38 18% 18%)',
    padding: '4px 10px',
    fontSize: 10, color: 'hsl(42 25% 55%)',
    display: 'flex', flexDirection: 'column', gap: 4,
    overflow: 'hidden',
  }}>
    {children}
  </div>
);

// ── Build hotbar (default state) ───────────────────────────────────────────

interface BuildHotbarProps {
  buildMode: BuildingType | null;
  wallDrawMode: boolean;
  onSelectBuild: (type: BuildingType | null) => void;
  onWallDrawMode: (active: boolean) => void;
  tick: number;
}

const BuildHotbar: React.FC<BuildHotbarProps> = ({ buildMode, wallDrawMode, onSelectBuild, onWallDrawMode, tick }) => {
  const [activeTab, setActiveTab] = useState<'build' | 'military' | 'walls'>('build');
  const [expanded, setExpanded] = useState(false);

  const allBuildings = [...CIVILIAN_BUILDINGS, ...LEGENDARY_BUILDINGS];
  const quickBuildings = activeTab === 'build' ? CIVILIAN_BUILDINGS.slice(0, 7)
    : activeTab === 'military' ? MILITARY_BUILDINGS
    : [];

  const renderQuickBtn = (type: BuildingType, i: number) => {
    const def = BUILDING_DEFS[type];
    const isActive = buildMode === type;
    const costEntries = Object.entries(def.constructionCost) as [string, number][];
    const canAfford = costEntries.every(([res, cost]) => (gameState.resources as any)[res] >= cost);
    let alreadyBuilt = false;
    if (type === 'stronghold') gameState.buildings.forEach(b => { if (b.type === 'stronghold') alreadyBuilt = true; });

    return (
      <div key={type} style={{ position: 'relative' }}>
        <button
          disabled={alreadyBuilt}
          onClick={() => { onWallDrawMode(false); onSelectBuild(isActive ? null : type); }}
          title={`${def.label}: ${costEntries.map(([r, c]) => `${r === 'wood' ? '🪵' : r === 'stone' ? '🪨' : '🌾'}${c}`).join(' ') || 'Free'}\n${def.description}`}
          style={{
            width: 48, height: 48,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 2,
            background: isActive ? 'hsla(38 50% 22% / 0.95)' : canAfford ? 'hsla(28 20% 14% / 0.9)' : 'hsla(0 15% 10% / 0.9)',
            border: `1px solid ${isActive ? 'hsl(38 55% 42%)' : canAfford ? 'hsl(38 18% 22%)' : 'hsl(0 20% 20%)'}`,
            borderRadius: 8, cursor: alreadyBuilt ? 'not-allowed' : 'pointer',
            fontSize: 22,
            transition: 'all 0.12s',
            filter: !canAfford && !isActive ? 'saturate(0.3) brightness(0.65)' : 'none',
            animation: `fadeSlideUp ${0.08 + i * 0.02}s ease-out both`,
          }}
          onMouseEnter={e => { if (!alreadyBuilt) (e.currentTarget as HTMLElement).style.borderColor = 'hsl(38 45% 38%)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = isActive ? 'hsl(38 55% 42%)' : canAfford ? 'hsl(38 18% 22%)' : 'hsl(0 20% 20%)'; }}
        >
          <span style={{ fontSize: 18 }}>{BUILDING_ICONS[type] || '🏛'}</span>
          <span style={{ fontSize: 7, color: 'hsl(42 20% 50%)', letterSpacing: 0 }}>
            {def.label.split(' ')[0]}
          </span>
        </button>
        {/* Cost overlay */}
        {!canAfford && (
          <div style={{
            position: 'absolute', top: 1, right: 1,
            fontSize: 7, background: 'hsla(0,50%,20%,0.85)',
            borderRadius: '0 7px 0 4px', padding: '1px 3px',
            color: 'hsl(0 60% 62%)',
          }}>✕</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      {/* Tab selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginRight: 2 }}>
        {(['build', 'military', 'walls'] as const).map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setExpanded(false); }}
            style={{
              width: 36, height: 20, fontSize: 8, fontWeight: 700, letterSpacing: '0.02em',
              background: activeTab === tab ? 'hsla(38 40% 18% / 0.9)' : 'hsla(28 15% 11% / 0.9)',
              border: `1px solid ${activeTab === tab ? 'hsl(38 50% 35%)' : 'hsl(38 15% 18%)'}`,
              borderRadius: 4, color: activeTab === tab ? 'hsl(42 60% 72%)' : 'hsl(42 20% 45%)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {tab === 'build' ? '🏘' : tab === 'military' ? '⚔' : '🧱'}
          </button>
        ))}
      </div>

      {/* Building buttons */}
      {activeTab === 'walls' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => { onSelectBuild(null); onWallDrawMode(!wallDrawMode); }}
            style={{
              width: 48, height: 48, fontSize: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              background: wallDrawMode ? 'hsla(38 50% 22% / 0.95)' : 'hsla(28 20% 14% / 0.9)',
              border: `1px solid ${wallDrawMode ? 'hsl(38 55% 42%)' : 'hsl(38 18% 22%)'}`,
              borderRadius: 8, cursor: 'pointer',
            }}
          >
            🧱<span style={{ fontSize: 7, color: 'hsl(42 20% 50%)' }}>Wall</span>
          </button>
          {wallDrawMode && (
            <div style={{ fontSize: 10, color: 'hsl(38 60% 60%)', maxWidth: 180, lineHeight: 1.5 }}>
              Click 2 terrain points to place wall segment<br />
              <span style={{ color: 'hsl(42 20% 45%)' }}>🪨3 per segment · Right-click to cancel</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {quickBuildings.map((t, i) => renderQuickBtn(t, i))}
          {activeTab === 'build' && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                width: 48, height: 48, fontSize: 20,
                background: expanded ? 'hsla(38 40% 18% / 0.9)' : 'hsla(28 18% 12% / 0.9)',
                border: `1px solid ${expanded ? 'hsl(38 45% 35%)' : 'hsl(38 15% 20%)'}`,
                borderRadius: 8, cursor: 'pointer', color: 'hsl(42 35% 60%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              }}
              title="More buildings"
            >
              {expanded ? '▼' : '▲'}
              <span style={{ fontSize: 7, color: 'hsl(42 20% 50%)' }}>More</span>
            </button>
          )}
        </div>
      )}

      {/* Expanded row for legendary */}
      {expanded && activeTab === 'build' && (
        <div style={{ display: 'flex', gap: 4 }}>
          {LEGENDARY_BUILDINGS.map((t, i) => renderQuickBtn(t, i))}
        </div>
      )}

      {/* Cancel button */}
      {(buildMode || wallDrawMode) && (
        <button
          onClick={() => { onSelectBuild(null); onWallDrawMode(false); }}
          style={{
            padding: '6px 10px', fontSize: 11, fontWeight: 700,
            background: 'hsla(0 35% 14% / 0.9)',
            border: '1px solid hsl(0 40% 28%)',
            borderRadius: 8, color: 'hsl(0 60% 62%)', cursor: 'pointer',
            marginLeft: 4,
          }}
        >✕ Cancel</button>
      )}
    </div>
  );
};

// ── Citizen bar ─────────────────────────────────────────────────────────────

const CitizenBar: React.FC<{ entityId: number; tick: number; onClose: () => void }> = ({ entityId, tick, onClose }) => {
  const citizen = gameState.citizens.get(entityId);
  const job = gameState.jobs.get(entityId);
  const transform = gameState.transforms.get(entityId);
  const inv = gameState.inventories.get(entityId);

  if (!citizen || !transform) return null;

  const JOB_ICONS: Record<string, string> = {
    idle: '😴', woodcutter: '🪓', farmer: '🌾', quarryman: '⛏', builder: '🔨', hauler: '📦',
  };

  const actionStatus = job?.actionState
    ? (ACTION_LABELS[job.actionState] ?? job.actionState)
    : 'Idle';

  const handleQuickJob = (jobType: string) => {
    if (!job) return;
    job.jobType = jobType as any;
    job.actionState = 'idle'; job.targetEntityId = null; job.assignedBuildingId = null;
  };

  const jobBtns = [
    { icon: '🪓', label: 'Chop', job: 'woodcutter' },
    { icon: '⛏', label: 'Mine', job: 'quarryman' },
    { icon: '🌾', label: 'Farm', job: 'farmer' },
    { icon: '🔨', label: 'Build', job: 'builder' },
    { icon: '😴', label: 'Idle', job: 'idle' },
  ];

  const cmdBtns = [
    { icon: '📍', label: 'Move', hotkey: 'M', action: () => enterCommandMode('awaiting_move_target', entityId, 'citizen', 'Click terrain to move citizen') },
    { icon: '🏠', label: 'Home', action: () => { const h = gameState.citizens.get(entityId)?.homeId; if (h) { const ht = gameState.transforms.get(h); if (ht) { const path = gameState.paths.get(entityId); if (path) { path.waypoints = [{ x: ht.x, z: ht.z }]; path.currentWaypoint = 0; path.done = false; } } } } },
    { icon: '❌', label: 'Dismiss', danger: true, action: () => { if (job) { unassignCitizen(entityId); } } },
  ];

  return (
    <>
      <Portrait
        icon={JOB_ICONS[job?.jobType ?? 'idle']}
        name={citizen.name}
        subtitle={`Age ${citizen.age} · ❤️ ${citizen.happiness}%`}
      />

      {/* Commands */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0 8px', borderRight: '1px solid hsl(38 18% 18%)' }}>
        {cmdBtns.map((b, i) => (
          <CmdBtn key={b.label} icon={b.icon} label={b.label} hotkey={(b as any).hotkey}
            onClick={b.action} danger={(b as any).danger} delay={i * 30} />
        ))}
        <div style={{ width: 1, height: 32, background: 'hsl(38 15% 22%)', margin: '0 2px' }} />
        {jobBtns.map((b, i) => (
          <CmdBtn key={b.label} icon={b.icon} label={b.label}
            active={job?.jobType === b.job}
            onClick={() => handleQuickJob(b.job)} delay={(i + 3) * 30} />
        ))}
      </div>

      {/* Info strip */}
      <InfoStrip>
        <div style={{ fontWeight: 600, color: 'hsl(42 45% 68%)' }}>{actionStatus}</div>
        <div>Job: <span style={{ color: 'hsl(42 40% 75%)' }}>{job?.jobType ?? 'idle'}</span></div>
        {inv?.carrying && inv.carryType && (
          <div>Carrying: {inv.carryType === 'wood' ? '🪵' : inv.carryType === 'stone' ? '🪨' : '🌾'} {inv.carryType}</div>
        )}
        {job?.assignedBuildingId != null && (
          <div>Workplace: {gameState.selectables.get(job.assignedBuildingId)?.label ?? `#${job.assignedBuildingId}`}</div>
        )}
      </InfoStrip>

      <button onClick={onClose} style={{ alignSelf: 'flex-start', padding: '6px 8px', background: 'none', border: 'none', color: 'hsl(42 20% 42%)', cursor: 'pointer', fontSize: 14 }}>✕</button>
    </>
  );
};

// ── Soldier bar ─────────────────────────────────────────────────────────────

const SoldierBar: React.FC<{ soldierId: number; tick: number; onClose: () => void }> = ({ soldierId, tick, onClose }) => {
  const { military } = gameState;
  const soldier = military.soldiers.get(soldierId);
  const sTransform = military.soldierTransforms.get(soldierId);
  const def = soldier ? SOLDIER_DEFS[soldier.soldierType] : null;

  if (!soldier || !def) return null;

  const xpData = getSoldierXP(soldierId);
  const rankIcon = RANK_ICONS[xpData.rank] ?? '';

  const handlePatrol = () => {
    let tcX = 0, tcZ = 0;
    gameState.buildings.forEach((b, id) => { if (b.type === 'town_center') { const t = gameState.transforms.get(id); if (t) { tcX = t.x; tcZ = t.z; } } });
    if (sTransform) {
      soldier.patrolWaypoints = [{ x: sTransform.x, z: sTransform.z }, { x: tcX + (Math.random() - 0.5) * 8, z: tcZ + (Math.random() - 0.5) * 8 }];
      soldier.patrolIndex = 0; soldier.state = 'patrolling';
    }
  };

  const handleDefend = () => {
    let tcX = 0, tcZ = 0;
    gameState.buildings.forEach((b, id) => { if (b.type === 'town_center') { const t = gameState.transforms.get(id); if (t) { tcX = t.x; tcZ = t.z; } } });
    if (sTransform) { const angle = Math.random() * Math.PI * 2; sTransform.x = tcX + Math.cos(angle) * 6; sTransform.z = tcZ + Math.sin(angle) * 6; soldier.state = 'idle'; soldier.patrolWaypoints = []; }
  };

  const cmdBtns = [
    { icon: '📍', label: 'Move', hotkey: 'M', action: () => enterCommandMode('awaiting_move_target', soldierId, 'soldier', `Click terrain to move ${def.label}`) },
    { icon: '⚔️', label: 'Attack', hotkey: 'A', danger: true, action: () => enterCommandMode('awaiting_attack_target', soldierId, 'soldier', 'Click an enemy to attack') },
    { icon: '🚶', label: 'Patrol', action: handlePatrol },
    { icon: '🛡️', label: 'Defend', action: handleDefend },
    { icon: '💀', label: 'Dismiss', danger: true, action: () => { soldier.state = 'dead'; military.selectedSoldierId = null; EventBus.emit('SoldierSelected', { soldierId: null }); } },
  ];

  const wp = soldier.equipment?.weapon;
  const ar = soldier.equipment?.armor;
  const sh = soldier.equipment?.shield;

  const handleEquip = (item: string) => {
    if ((armory as any)[item] <= 0) { pushNotification(`No ${item} in armory!`, 'error'); return; }
    (armory as any)[item]--;
    if (['spear', 'sword', 'bow'].includes(item)) soldier.equipment = { ...soldier.equipment, weapon: item as any };
    else if (item === 'armor') { soldier.equipment = { ...soldier.equipment, armor: 'chainmail' }; soldier.maxHp = Math.round(soldier.maxHp * 1.5); soldier.hp = Math.min(soldier.hp + 40, soldier.maxHp); }
    else if (item === 'shield') soldier.equipment = { ...soldier.equipment, shield: true };
    pushNotification(`⚔️ ${def.label} equipped with ${item}!`, 'success');
  };

  return (
    <>
      <Portrait
        icon={def.icon}
        name={`${rankIcon} ${def.label}`}
        subtitle={`${soldier.state} · ⭐${xpData.xp}xp · ${xpData.killCount} kills`}
        hp={{ current: soldier.hp, max: soldier.maxHp }}
        iconColor="hsl(0 55% 62%)"
      />

      <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0 8px', borderRight: '1px solid hsl(38 18% 18%)' }}>
        {cmdBtns.map((b, i) => (
          <CmdBtn key={b.label} icon={b.icon} label={b.label} hotkey={(b as any).hotkey}
            onClick={b.action} danger={(b as any).danger} delay={i * 30} />
        ))}
      </div>

      {/* Equipment */}
      <InfoStrip>
        <div style={{ fontWeight: 600, color: 'hsl(42 45% 68%)' }}>Equipment</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['spear', 'sword', 'bow', 'armor', 'shield'].map(item => {
            const icons: Record<string, string> = { spear: '⚔️', sword: '🗡️', bow: '🏹', armor: '🛡️', shield: '🔰' };
            const equipped = !!(wp === item || (item === 'armor' && ar) || (item === 'shield' && sh));
            const stock = (armory as any)[item] ?? 0;
            return (
              <button key={item}
                onClick={() => !equipped && handleEquip(item)} disabled={equipped || stock === 0}
                title={`${item} (${stock} in armory)`}
                style={{
                  padding: '2px 5px', fontSize: 11, borderRadius: 4,
                  background: equipped ? 'hsla(120,30%,12%,0.8)' : stock > 0 ? 'hsla(38,25%,14%,0.8)' : 'hsla(0,10%,10%,0.4)',
                  border: `1px solid ${equipped ? 'hsl(120 30% 22%)' : stock > 0 ? 'hsl(38 30% 22%)' : 'hsl(0 10% 16%)'}`,
                  color: equipped ? 'hsl(120 50% 55%)' : stock > 0 ? 'hsl(42 40% 72%)' : 'hsl(42 10% 35%)',
                  cursor: equipped || stock === 0 ? 'not-allowed' : 'pointer',
                }}>{icons[item]} {equipped ? '✓' : stock}</button>
            );
          })}
        </div>
        <div style={{ color: 'hsl(42 20% 45%)' }}>
          Rank: {rankIcon} {xpData.rank} · State: {soldier.state}
        </div>
      </InfoStrip>

      <button onClick={onClose} style={{ alignSelf: 'flex-start', padding: '6px 8px', background: 'none', border: 'none', color: 'hsl(42 20% 42%)', cursor: 'pointer', fontSize: 14 }}>✕</button>
    </>
  );
};

// ── Building bar ─────────────────────────────────────────────────────────────

const BuildingBar: React.FC<{ entityId: number; tick: number; onClose: () => void; subTab: 'overview' | 'train' | 'craft'; setSubTab: React.Dispatch<React.SetStateAction<'overview' | 'train' | 'craft'>> }> = ({ entityId, tick, onClose, subTab, setSubTab }) => {
  const building = gameState.buildings.get(entityId);
  const selectable = gameState.selectables.get(entityId);
  const transform = gameState.transforms.get(entityId);

  if (!building || !transform) return null;

  const maxHp = BUILDING_MAX_HP[building.type] ?? 200;
  const currentHp = gameState.military.buildingHp.get(entityId) ?? maxHp;
  const level = getBuildingLevel(entityId);
  const isBarracks = building.type === 'barracks';
  const isSmithy = building.type === 'smithy';
  const trainingQueue = isBarracks ? (gameState.military.trainingQueues.get(entityId) ?? []) : [];
  const activeCraft = isSmithy ? smithyCrafting.get(entityId) : null;
  const craftQueue = isSmithy ? (smithyQueue.get(entityId) ?? []) : [];

  const stateLabel = building.state === 'under_construction'
    ? `🔨 Building ${Math.round(building.constructionProgress)}%`
    : '✅ Active';

  const handleDemolish = () => {
    pushNotification('Building demolished', 'warning');
    gameState.buildings.delete(entityId);
    gameState.resourceNodes.delete(entityId);
    gameState.isResourceNode.delete(entityId);
    gameState.transforms.delete(entityId);
    gameState.selectables.delete(entityId);
    gameState.isBuilding.delete(entityId);
    gameState.selectedEntity = null;
    EventBus.emit('EntitySelected', { entityId: null });
    EventBus.emit('BuildingDemolished', { buildingId: entityId });
  };

  const upgradeCheck = canUpgradeBuilding(entityId);
  const upgradeCost = getUpgradeCost(entityId);
  const upgradeTimer = buildingUpgradeTimers.get(entityId);
  const nextLevel = Math.min(5, level + 1) as 1|2|3|4|5;
  const ben = LEVEL_BENEFITS[nextLevel];

  // Idle citizens for assignment
  const idleCitizens: Array<{ id: number; name: string }> = [];
  if (building.workerSlots > building.assignedWorkers.length && building.state === 'active') {
    gameState.citizens.forEach((cit, cId) => {
      const j = gameState.jobs.get(cId);
      if (j && (j.jobType === 'idle' || j.actionState === 'idle') && j.jobType !== 'builder') {
        if (!building.assignedWorkers.includes(cId)) idleCitizens.push({ id: cId, name: cit.name });
      }
    });
  }

  return (
    <>
      <Portrait
        icon={BUILDING_ICONS[building.type] ?? '🏛'}
        name={selectable?.label ?? building.type}
        subtitle={`Lv.${level} · ${stateLabel}`}
        hp={{ current: currentHp, max: maxHp }}
      />

      {/* Tab nav for complex buildings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 6px', borderRight: '1px solid hsl(38 18% 18%)', justifyContent: 'center' }}>
        {/* Core commands */}
        <div style={{ display: 'flex', gap: 4 }}>
          <CmdBtn icon="🔥" label="Demolish" danger onClick={handleDemolish} delay={0} />
          {level < 5 && building.state === 'active' && (
            <CmdBtn icon="⬆️" label="Upgrade" onClick={() => startBuildingUpgrade(entityId)}
              disabled={!upgradeCheck.canUpgrade} delay={30}
            />
          )}
          {isBarracks && building.state === 'active' && (
            <CmdBtn icon="⚔️" label="Train" active={subTab === 'train'} onClick={() => setSubTab(s => s === 'train' ? 'overview' : 'train')} delay={60} />
          )}
          {isSmithy && building.state === 'active' && (
            <CmdBtn icon="🔨" label="Craft" active={subTab === 'craft'} onClick={() => setSubTab(s => s === 'craft' ? 'overview' : 'craft')} delay={60} />
          )}
          {(building.workerSlots > 0) && (
            <CmdBtn icon="👷" label="Workers" active={subTab === 'overview'} onClick={() => setSubTab('overview')} delay={90} />
          )}
        </div>
      </div>

      {/* Info strip — context-driven */}
      <InfoStrip>
        {/* Construction progress */}
        {building.state === 'under_construction' && (
          <>
            <div style={{ fontWeight: 600, color: 'hsl(38 65% 60%)' }}>Under Construction</div>
            <div style={{ height: 5, background: 'hsl(38 15% 18%)', borderRadius: 3 }}>
              <div style={{ width: `${building.constructionProgress}%`, height: '100%', background: 'hsl(38 60% 45%)', borderRadius: 3 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(building.constructionCost).map(([res, cost]) => {
                const delivered = building.constructionDelivered[res as keyof typeof building.constructionDelivered] ?? 0;
                return <span key={res} style={{ color: delivered >= (cost as number) ? 'hsl(120 40% 55%)' : 'hsl(42 30% 60%)' }}>
                  {res === 'wood' ? '🪵' : res === 'stone' ? '🪨' : '🌾'}{delivered}/{cost as number}
                </span>;
              })}
            </div>
          </>
        )}

        {/* Workers overview */}
        {building.state === 'active' && subTab === 'overview' && (
          <>
            <div style={{ fontWeight: 600, color: 'hsl(42 45% 68%)' }}>
              Workers: {building.assignedWorkers.length}/{building.workerSlots}
              {building.produces && ` · 📦 Today: ${building.dailyProduced}`}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {building.assignedWorkers.slice(0, 4).map(wId => {
                const wCit = gameState.citizens.get(wId);
                const wJob = gameState.jobs.get(wId);
                return (
                  <button key={wId}
                    onClick={() => { const s = gameState.selectables.get(wId); if (s) s.isSelected = true; gameState.selectedEntity = wId; EventBus.emit('EntitySelected', { entityId: wId }); }}
                    style={{ padding: '2px 6px', fontSize: 9, background: 'hsla(28,18%,14%,0.8)', border: '1px solid hsl(38 15% 20%)', borderRadius: 4, color: 'hsl(42 30% 65%)', cursor: 'pointer' }}
                  >👤 {wCit?.name ?? `#${wId}`}</button>
                );
              })}
              {idleCitizens.length > 0 && (
                <select onChange={e => { const cId = parseInt(e.target.value); if (!isNaN(cId)) manuallyAssignCitizen(cId, entityId); e.target.value = ''; }} defaultValue=""
                  style={{ padding: '2px 4px', fontSize: 9, background: 'hsla(38,25%,13%,0.9)', border: '1px solid hsl(38 30% 24%)', borderRadius: 4, color: 'hsl(42 30% 72%)', cursor: 'pointer' }}>
                  <option value="">+ Add Worker…</option>
                  {idleCitizens.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
              )}
            </div>
            {/* Upgrade status */}
            {upgradeTimer ? (
              <div style={{ color: 'hsl(38 60% 55%)' }}>⬆️ Upgrading to Lv.{upgradeTimer.targetLevel}…
                <div style={{ height: 3, background: 'hsl(38 15% 16%)', borderRadius: 2, marginTop: 2 }}>
                  <div style={{ width: `${((upgradeTimer.totalTime - upgradeTimer.timeRemaining) / upgradeTimer.totalTime) * 100}%`, height: '100%', background: 'hsl(38 60% 42%)', borderRadius: 2 }} />
                </div>
              </div>
            ) : level < 5 && upgradeCost ? (
              <div style={{ color: upgradeCheck.canUpgrade ? 'hsl(42 30% 55%)' : 'hsl(0 45% 48%)' }}>
                Upgrade cost: {Object.entries(upgradeCost).map(([r, a]) => `${r === 'wood' ? '🪵' : r === 'stone' ? '🪨' : '🌾'}${a}`).join(' ')}
                {!upgradeCheck.canUpgrade && ` · ${upgradeCheck.reason}`}
              </div>
            ) : level >= 5 ? <div style={{ color: 'hsl(38 65% 55%)' }}>★ Max Level</div> : null}
          </>
        )}

        {/* Barracks training */}
        {isBarracks && building.state === 'active' && subTab === 'train' && (
          <>
            <div style={{ fontWeight: 600, color: 'hsl(42 45% 68%)' }}>Train Soldiers</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(Object.entries(SOLDIER_DEFS) as [SoldierType, typeof SOLDIER_DEFS[SoldierType]][]).map(([type, def]) => {
                const costStr = Object.entries(def.cost).map(([r, a]) => `${r === 'wood' ? '🪵' : r === 'stone' ? '🪨' : '🌾'}${a}`).join(' ');
                const canAfford = Object.entries(def.cost).every(([r, a]) => (gameState.resources as any)[r] >= (a ?? 0));
                return (
                  <button key={type} onClick={() => enqueueSoldierTraining(entityId, type)} disabled={!canAfford}
                    title={`${def.label}: ${costStr}, ${def.trainTime}s`}
                    style={{ padding: '3px 7px', fontSize: 10, borderRadius: 5, background: canAfford ? 'hsla(0,30%,16%,0.9)' : 'hsla(0,10%,11%,0.5)', border: `1px solid ${canAfford ? 'hsl(0 30% 28%)' : 'hsl(0 10% 16%)'}`, color: canAfford ? 'hsl(42 40% 75%)' : 'hsl(42 10% 35%)', cursor: canAfford ? 'pointer' : 'not-allowed' }}
                  >{def.icon} {def.label} <span style={{ opacity: 0.7 }}>({costStr})</span></button>
                );
              })}
            </div>
            {trainingQueue.length > 0 && (
              <div style={{ color: 'hsl(42 20% 50%)' }}>
                Queue: {trainingQueue.map((q, i) => `${SOLDIER_DEFS[q.soldierType].icon} ${Math.ceil(q.timeRemaining)}s${i < trainingQueue.length - 1 ? ' →' : ''}`).join(' ')}
              </div>
            )}
          </>
        )}

        {/* Smithy crafting */}
        {isSmithy && building.state === 'active' && subTab === 'craft' && (
          <>
            {activeCraft ? (
              <div>
                <span style={{ fontWeight: 600, color: 'hsl(42 45% 68%)' }}>Crafting: {activeCraft.recipe.icon} {activeCraft.recipe.label}</span>
                <div style={{ height: 4, background: 'hsl(38 15% 18%)', borderRadius: 2, marginTop: 2 }}>
                  <div style={{ width: `${((activeCraft.totalTime - activeCraft.timeRemaining) / activeCraft.totalTime) * 100}%`, height: '100%', background: 'hsl(38 60% 45%)', borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 9, color: 'hsl(42 15% 45%)' }}>{Math.ceil(activeCraft.timeRemaining)}s</span>
              </div>
            ) : <div style={{ color: 'hsl(42 20% 45%)' }}>Smithy idle</div>}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {SMITHY_RECIPES.map(recipe => {
                const costStr = Object.entries(recipe.inputs).map(([r, a]) => `${r === 'wood' ? '🪵' : '🪨'}${a}`).join(' ');
                const canAfford = Object.entries(recipe.inputs).every(([r, a]) => (gameState.resources as any)[r] >= (a ?? 0));
                return (
                  <button key={recipe.output} onClick={() => queueSmithyCraft(entityId, recipe.output)} disabled={!canAfford}
                    style={{ padding: '3px 7px', fontSize: 10, borderRadius: 5, background: canAfford ? 'hsla(38,25%,14%,0.9)' : 'hsla(38,10%,11%,0.5)', border: `1px solid ${canAfford ? 'hsl(38 30% 24%)' : 'hsl(38 10% 16%)'}`, color: canAfford ? 'hsl(42 40% 75%)' : 'hsl(42 10% 35%)', cursor: canAfford ? 'pointer' : 'not-allowed' }}
                  >{recipe.icon} {recipe.label} <span style={{ opacity: 0.7 }}>({costStr})</span></button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {SMITHY_RECIPES.map(r => <span key={r.output} style={{ color: (armory as any)[r.output] > 0 ? 'hsl(42 40% 68%)' : 'hsl(42 10% 35%)' }}>{r.icon}{(armory as any)[r.output]}</span>)}
            </div>
          </>
        )}
      </InfoStrip>

      <button onClick={onClose} style={{ alignSelf: 'flex-start', padding: '6px 8px', background: 'none', border: 'none', color: 'hsl(42 20% 42%)', cursor: 'pointer', fontSize: 14 }}>✕</button>
    </>
  );
};

// ── Multi-select bar ─────────────────────────────────────────────────────────

const MultiBar: React.FC<{ selectedIds: number[]; tick: number; onClose: () => void }> = ({ selectedIds, tick, onClose }) => {
  const soldiers = selectedIds.filter(id => gameState.military.soldiers.has(id));
  const workers = selectedIds.filter(id => !gameState.military.soldiers.has(id));

  const handleGroupStop = () => {
    selectedIds.forEach(id => {
      const soldier = gameState.military.soldiers.get(id);
      if (soldier && soldier.state !== 'dead') { soldier.state = 'idle'; soldier.patrolWaypoints = []; soldier.targetEnemyId = null; }
      const path = gameState.paths.get(id);
      if (path) { path.waypoints = []; path.currentWaypoint = 0; path.done = true; }
      const mov = gameState.movements.get(id);
      if (mov) { mov.arrived = true; mov.velocity = { x: 0, z: 0 }; }
      const job = gameState.jobs.get(id);
      if (job) { job.actionState = 'idle'; job.targetEntityId = null; }
    });
    pushNotification('⏸ Units stopped', 'info');
  };

  return (
    <>
      <Portrait icon="⚔️" name={`${selectedIds.length} selected`} subtitle={`${soldiers.length} soldiers · ${workers.length} workers`} />
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0 8px', borderRight: '1px solid hsl(38 18% 18%)' }}>
        <CmdBtn icon="⏸" label="Stop" onClick={handleGroupStop} delay={0} />
        <CmdBtn icon="📍" label="Move" onClick={() => pushNotification('Right-click terrain to move group', 'info')} delay={30} />
        <CmdBtn icon="🛡️" label="Defend" onClick={() => {
          let tcX = 0, tcZ = 0;
          gameState.buildings.forEach((b, id) => { if (b.type === 'town_center') { const t = gameState.transforms.get(id); if (t) { tcX = t.x; tcZ = t.z; } } });
          soldiers.forEach((id, i) => {
            const s = gameState.military.soldiers.get(id); const st = gameState.military.soldierTransforms.get(id);
            if (s && st) { const a = (i / Math.max(soldiers.length, 1)) * Math.PI * 2; st.x = tcX + Math.cos(a) * 7; st.z = tcZ + Math.sin(a) * 7; s.state = 'idle'; s.patrolWaypoints = []; }
          });
        }} delay={60} />
      </div>
      <InfoStrip>
        <div style={{ fontWeight: 600, color: 'hsl(42 45% 68%)' }}>{selectedIds.length} units selected</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {selectedIds.slice(0, 10).map(id => {
            const s = gameState.military.soldiers.get(id);
            const j = gameState.jobs.get(id);
            const icon = s ? '⚔️' : j?.jobType === 'woodcutter' ? '🪓' : j?.jobType === 'quarryman' ? '⛏' : j?.jobType === 'farmer' ? '🌾' : '👤';
            const hp = s ? s.hp / s.maxHp : 1;
            return (
              <div key={id} title={`#${id}`} style={{
                width: 28, height: 28, fontSize: 14, borderRadius: 5,
                background: 'hsl(38 15% 14%)', border: '1px solid hsl(38 18% 22%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              }}>
                {icon}
                <div style={{ position: 'absolute', bottom: 1, left: 2, right: 2, height: 2, background: 'hsl(0 30% 18%)', borderRadius: 1 }}>
                  <div style={{ width: `${hp * 100}%`, height: '100%', background: hp > 0.5 ? 'hsl(120 50% 42%)' : 'hsl(30 65% 48%)', borderRadius: 1 }} />
                </div>
              </div>
            );
          })}
          {selectedIds.length > 10 && <span style={{ fontSize: 10, color: 'hsl(42 20% 45%)', alignSelf: 'center' }}>+{selectedIds.length - 10}</span>}
        </div>
      </InfoStrip>
      <button onClick={onClose} style={{ alignSelf: 'flex-start', padding: '6px 8px', background: 'none', border: 'none', color: 'hsl(42 20% 42%)', cursor: 'pointer', fontSize: 14 }}>✕</button>
    </>
  );
};

// ── Context hint bar ─────────────────────────────────────────────────────────

const ContextHints: React.FC<{ tick: number; buildMode: BuildingType | null; wallDrawMode: boolean; selectedEntity: number | null; selectedSoldierId: number | null; multiSelected: number[] }> = ({
  tick, buildMode, wallDrawMode, selectedEntity, selectedSoldierId, multiSelected
}) => {
  const { military } = gameState;
  const raid = military.activeRaid;
  const daysUntilRaid = military.nextRaidDay - gameState.gameTime.day;

  let hint = 'Right-click terrain to move selected units · Scroll to zoom · Middle-drag to pan';
  let color = 'hsl(42 20% 45%)';

  if (raid) {
    hint = '⚠️ RAID IN PROGRESS — garrison citizens, command soldiers to defend!';
    color = 'hsl(0 65% 60%)';
  } else if (!raid && daysUntilRaid <= 1 && daysUntilRaid > 0 && military.nextRaidDay > 0) {
    hint = `⚔️ Raiders approaching on Day ${military.nextRaidDay}! Train soldiers and garrison your citizens.`;
    color = 'hsl(38 70% 58%)';
  } else if (gameState.resources.food < 10 && gameState.population > 0) {
    hint = '🌾 Citizens are starving — assign workers to Farm Fields or buy food at the Market';
    color = 'hsl(38 65% 55%)';
  } else if (gameState.population >= gameState.maxPopulation && gameState.maxPopulation > 0) {
    hint = '👥 Population cap reached — build more Houses to allow growth';
    color = 'hsl(38 55% 50%)';
  } else if (wallDrawMode) {
    hint = '🧱 Click two terrain points to place wall segment · Right-click or Escape to cancel';
    color = 'hsl(38 60% 58%)';
  } else if (buildMode) {
    hint = `🔨 Placing: ${buildMode.replace(/_/g, ' ')} — Left-click terrain to place · Green = valid · Red = blocked · [Escape] cancel`;
    color = 'hsl(42 55% 60%)';
  } else if (commandState.mode !== 'none' && commandState.hint) {
    hint = commandState.hint + ' · [Escape] to cancel';
    color = 'hsl(38 60% 62%)';
  } else if (selectedSoldierId !== null) {
    hint = 'Right-click terrain to move soldier · A = Attack · P = Patrol · D = Defend';
  } else if (selectedEntity !== null) {
    const cit = gameState.citizens.get(selectedEntity);
    if (cit) hint = 'Right-click a tree to gather · Right-click terrain to move citizen';
  } else if (multiSelected.length > 1) {
    hint = `${multiSelected.length} units selected · Right-click terrain to move in formation · 1-5 to change formation`;
  }

  return (
    <div style={{
      height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderBottom: '1px solid hsl(38 16% 14%)',
      background: 'hsla(28 20% 6% / 0.9)',
      padding: '0 16px',
    }}>
      <span style={{ fontSize: 10, color, fontStyle: 'italic', letterSpacing: '0.01em' }}>{hint}</span>
    </div>
  );
};

// ── Main BottomActionBar ─────────────────────────────────────────────────────

interface BottomActionBarProps {
  tick: number;
  selectedEntity: number | null;
  selectedSoldierId: number | null;
  multiSelected: number[];
  buildMode: BuildingType | null;
  wallDrawMode: boolean;
  onSelectBuild: (type: BuildingType | null) => void;
  onWallDrawMode: (active: boolean) => void;
  onClearSelection: () => void;
}

const BottomActionBar: React.FC<BottomActionBarProps> = ({
  tick, selectedEntity, selectedSoldierId, multiSelected,
  buildMode, wallDrawMode, onSelectBuild, onWallDrawMode, onClearSelection,
}) => {
  // Lifted subTab state so it survives barState transitions
  const [subTab, setSubTab] = useState<'overview' | 'train' | 'craft'>('overview');

  // Determine current bar state
  const hasSoldier = selectedSoldierId !== null && gameState.military.soldiers.has(selectedSoldierId);
  const hasEntity = selectedEntity !== null;
  const hasMulti = multiSelected.length > 1;

  const barState: 'nothing' | 'citizen' | 'building' | 'soldier' | 'multi' =
    hasSoldier ? 'soldier'
    : hasMulti ? 'multi'
    : hasEntity && gameState.citizens.has(selectedEntity!) ? 'citizen'
    : hasEntity && gameState.buildings.has(selectedEntity!) ? 'building'
    : 'nothing';

  // Reset subTab when selected entity changes
  const prevEntityRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedEntity !== prevEntityRef.current) {
      prevEntityRef.current = selectedEntity;
      setSubTab('overview');
    }
  }, [selectedEntity]);

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
      fontFamily: 'inherit',
    }}>
      {/* Contextual hints */}
      <ContextHints
        tick={tick}
        buildMode={buildMode}
        wallDrawMode={wallDrawMode}
        selectedEntity={selectedEntity}
        selectedSoldierId={selectedSoldierId}
        multiSelected={multiSelected}
      />

      {/* Main bar */}
      <div style={{
        height: 80,
        background: 'hsla(28 22% 8% / 0.97)',
        borderTop: '1px solid hsl(38 22% 18%)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px',
        gap: 0,
        overflow: 'hidden',
      }}>
        {/* Left gap for minimap (160px) */}
        <div style={{ width: 168, flexShrink: 0 }} />

        {/* Content area */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', height: '100%', overflow: 'hidden', gap: 0 }}>
          {barState === 'nothing' && (
            <BuildHotbar
              buildMode={buildMode}
              wallDrawMode={wallDrawMode}
              onSelectBuild={onSelectBuild}
              onWallDrawMode={onWallDrawMode}
              tick={tick}
            />
          )}
          {barState === 'citizen' && (
            <CitizenBar entityId={selectedEntity!} tick={tick} onClose={onClearSelection} />
          )}
          {barState === 'soldier' && (
            <SoldierBar soldierId={selectedSoldierId!} tick={tick} onClose={onClearSelection} />
          )}
          {barState === 'building' && (
            <BuildingBar entityId={selectedEntity!} tick={tick} onClose={onClearSelection} subTab={subTab} setSubTab={setSubTab} />
          )}
          {barState === 'multi' && (
            <MultiBar selectedIds={multiSelected} tick={tick} onClose={onClearSelection} />
          )}
        </div>

        {/* Right gap for minimap — right strip */}
        <div style={{ width: 4, flexShrink: 0 }} />
      </div>
    </div>
  );
};

export default BottomActionBar;
