// ──────────────────────────────────────────────
//  ObjectivesPanel – sequential player objectives
//  + Welcome splash + Warnings system
// ──────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { gameState, pushNotification, addResource } from '../core/GameState';
import type { ResourceType } from '../core/EventBus';

// ── Objectives data ────────────────────────────────────────────────────────

interface Objective {
  id: string;
  title: string;
  description: string;
  condition: () => boolean;
  reward: Partial<Record<ResourceType, number>>;
}

const OBJECTIVES: Objective[] = [
  {
    id: 'build_woodcutter',
    title: "Build a Woodcutter's Hut",
    description: "Your settlement needs wood to grow. Build a Woodcutter's Hut to start gathering.",
    condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'woodcutter_hut' && b.state === 'active'),
    reward: { wood: 5 },
  },
  {
    id: 'gather_20_wood',
    title: 'Gather 20 Wood',
    description: "Let your woodcutter do their work. You need 20 wood in storage.",
    condition: () => gameState.resources.wood >= 20,
    reward: {},
  },
  {
    id: 'build_house',
    title: 'Build a House',
    description: 'Attract new settlers by building housing. More people = more workers.',
    condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'house' && b.state === 'active'),
    reward: { food: 10 },
  },
  {
    id: 'reach_10_pop',
    title: 'Reach 10 Population',
    description: 'A growing settlement needs more hands. Build more houses.',
    condition: () => gameState.population >= 10,
    reward: { wood: 15, stone: 5 },
  },
  {
    id: 'build_farm',
    title: 'Build a Farm Field',
    description: 'Your people need food. Establish a farm before food runs out.',
    condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'farm_field' && b.state === 'active'),
    reward: { food: 20 },
  },
  {
    id: 'build_quarry',
    title: 'Build a Quarry',
    description: 'Stone is needed for stronger buildings. Find and mine stone deposits.',
    condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'quarry' && b.state === 'active'),
    reward: {},
  },
  {
    id: 'build_barracks',
    title: 'Build a Barracks',
    description: 'Raiders will come on Day 5. Build a Barracks and train soldiers to defend your realm.',
    condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'barracks' && b.state === 'active'),
    reward: { wood: 10, stone: 5 },
  },
  {
    id: 'train_soldier',
    title: 'Train Your First Soldier',
    description: 'A barracks without soldiers is useless. Train at least one soldier to defend your settlement.',
    condition: () => gameState.military.soldiersTrainedTotal >= 1,
    reward: {},
  },
  {
    id: 'repel_first_raid',
    title: 'Repel the First Raid',
    description: 'Raiders are coming! Defeat the first raid to prove your realm can survive.',
    condition: () => gameState.military.raidsRepelled >= 1,
    reward: { stone: 15, food: 10 },
  },
  {
    id: 'build_storage',
    title: 'Build a Storage Barn',
    description: 'Your default storage is nearly full. Build a barn to expand capacity.',
    condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'storage_barn' && b.state === 'active'),
    reward: {},
  },
  {
    id: 'reach_20_pop',
    title: 'Reach 20 Population',
    description: 'A true settlement is forming. Keep building houses and gathering food.',
    condition: () => gameState.population >= 20,
    reward: { wood: 30, stone: 10, food: 20 },
  },
  {
    id: 'build_smithy',
    title: 'Build a Smithy',
    description: 'Equip your soldiers with proper weapons. Build a Smithy to craft swords, spears, and bows.',
    condition: () => gameState.buildings.toArray().some(([, b]) => b.type === 'smithy' && b.state === 'active'),
    reward: { stone: 10 },
  },
  {
    id: 'survive_30_days',
    title: 'Survive 30 Days',
    description: 'Your ultimate goal: survive 30 in-game days without losing your Town Center. You can do it!',
    condition: () => gameState.gameTime.day >= 30,
    reward: {},
  },
];

// ── Welcome Splash ─────────────────────────────────────────────────────────

export const WelcomeSplash: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(10,6,4,0.88)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  }}>
    <div style={{
      background: 'linear-gradient(160deg, hsl(28 22% 11%), hsl(28 18% 8%))',
      border: '1px solid hsl(38 40% 28%)',
      borderRadius: 16,
      padding: '40px 48px',
      maxWidth: 500,
      width: '90vw',
      textAlign: 'center',
      boxShadow: '0 24px 80px hsla(28,30%,5%,0.9)',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚔️</div>
      <h1 style={{
        fontSize: 26, fontWeight: 800, letterSpacing: '0.18em',
        color: 'hsl(38 75% 62%)',
        textShadow: '0 0 20px hsla(38,70%,50%,0.4)',
        marginBottom: 8,
      }}>
        MEDIEVAL REALM
      </h1>
      <div style={{
        height: 1, background: 'linear-gradient(90deg, transparent, hsl(38 40% 30%), transparent)',
        margin: '12px 0',
      }} />
      <p style={{ fontSize: 14, color: 'hsl(42 25% 72%)', lineHeight: 1.7, marginBottom: 12 }}>
        You are the lord of a new settlement.<br />
        Build, gather resources, grow your population,<br />
        and defend against raiders to survive 30 days.
      </p>
      <div style={{
        fontSize: 12, color: 'hsl(0 60% 65%)',
        background: 'hsla(0,30%,10%,0.7)',
        borderRadius: 8, padding: '8px 14px',
        border: '1px solid hsl(0 30% 22%)',
        marginBottom: 12,
      }}>
        ⚠️ Raiders will attack on <strong>Day 5</strong> — build a Barracks and train soldiers before then!
      </div>
      <p style={{
        fontSize: 13, color: 'hsl(38 55% 55%)',
        background: 'hsla(38,40%,12%,0.7)',
        borderRadius: 8, padding: '10px 14px',
        border: '1px solid hsl(38 30% 22%)',
        marginBottom: 28,
      }}>
        ➤ Start with a <strong style={{ color: 'hsl(38 70% 65%)' }}>Woodcutter's Hut</strong> to gather wood for construction.
      </p>
      <button
        onClick={onClose}
        style={{
          padding: '12px 32px',
          background: 'linear-gradient(135deg, hsl(38 70% 42%), hsl(38 60% 32%))',
          border: '1px solid hsl(38 70% 52%)',
          borderRadius: 8,
          color: 'hsl(42 40% 92%)',
          fontSize: 15, fontWeight: 700,
          letterSpacing: '0.06em',
          cursor: 'pointer',
          boxShadow: '0 4px 16px hsla(38,70%,40%,0.4)',
        }}
        onMouseOver={e => (e.currentTarget.style.background = 'linear-gradient(135deg, hsl(38 75% 48%), hsl(38 65% 38%))')}
        onMouseOut={e => (e.currentTarget.style.background = 'linear-gradient(135deg, hsl(38 70% 42%), hsl(38 60% 32%))')}
      >
        Begin Your Reign
      </button>
    </div>
  </div>
);

// ── Warnings system ────────────────────────────────────────────────────────

interface Warning {
  id: string;
  icon: string;
  message: string;
}

function computeWarnings(): Warning[] {
  const warnings: Warning[] = [];
  const { resources, population, maxPopulation, buildings, military, gameTime } = gameState;

  if (resources.food < 10 && population > 0) {
    warnings.push({ id: 'food_low', icon: '🌾', message: 'Food running low! Build a Farm Field.' });
  }

  if (population >= maxPopulation && maxPopulation > 0) {
    warnings.push({ id: 'pop_cap', icon: '👥', message: 'Population cap reached! Build more Houses.' });
  }

  // Raid warning
  if (!military.activeRaid && military.nextRaidDay - gameTime.day <= 1 && military.nextRaidDay > 0) {
    warnings.push({ id: 'raid_soon', icon: '⚔️', message: `Raiders approaching! Day ${military.nextRaidDay} — train soldiers!` });
  }

  if (military.activeRaid) {
    warnings.push({ id: 'raid_active', icon: '🔴', message: 'RAID IN PROGRESS — defend your settlement!' });
  }

  buildings.forEach((b, id) => {
    if (b.state !== 'active') return;
    if (b.workerSlots === 0) return;
    if (b.assignedWorkers.length === 0) {
      const names: Record<string, string> = {
        woodcutter_hut: "Woodcutter's Hut", quarry: 'Quarry', farm_field: 'Farm Field',
      };
      const name = names[b.type];
      if (name) warnings.push({ id: `no_workers_${id}`, icon: '⚠️', message: `${name} has no workers.` });
    }
  });

  return warnings;
}

// ── Objectives + Warnings Panel ────────────────────────────────────────────

interface ObjectivesPanelProps {
  tick: number;
}

const completedObjectives = new Set<string>();

const ObjectivesPanel: React.FC<ObjectivesPanelProps> = ({ tick }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [, forceUpdate] = useState(0);
  const [celebration, setCelebration] = useState<string | null>(null);

  useEffect(() => {
    let changed = false;
    for (let i = 0; i < OBJECTIVES.length; i++) {
      const obj = OBJECTIVES[i];
      if (completedObjectives.has(obj.id)) continue;

      // Only allow completing in order
      const prevCompleted = i === 0 || completedObjectives.has(OBJECTIVES[i - 1].id);
      if (!prevCompleted) break;

      if (obj.condition()) {
        completedObjectives.add(obj.id);
        changed = true;

        for (const [res, amt] of Object.entries(obj.reward) as [ResourceType, number][]) {
          if (amt > 0) addResource(res, amt);
        }

        const rewardStr = Object.entries(obj.reward)
          .filter(([, v]) => (v ?? 0) > 0)
          .map(([k, v]) => `+${v} ${k}`)
          .join(', ');

        pushNotification(`✅ Objective complete: ${obj.title}${rewardStr ? ` (${rewardStr})` : ''}`, 'success');
        setCelebration(obj.id);
        setTimeout(() => setCelebration(null), 3000);
      }
    }
    if (changed) forceUpdate(n => n + 1);
  }, [tick]);

  const warnings = computeWarnings();
  const firstUncompleted = OBJECTIVES.findIndex(o => !completedObjectives.has(o.id));
  const allDone = firstUncompleted < 0;

  const visibleObjectives = allDone
    ? []
    : OBJECTIVES.slice(Math.max(0, firstUncompleted - 1), Math.min(OBJECTIVES.length, firstUncompleted + 2));

  // Survival progress
  const survivalDay = Math.min(gameState.gameTime.day, 30);

  return (
    <div style={{
      position: 'absolute', top: 68, right: 12, zIndex: 150,
      width: 240, display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{
        background: 'hsla(28,22%,9%,0.96)',
        border: '1px solid hsl(38 25% 22%)',
        borderRadius: 10, overflow: 'hidden',
        backdropFilter: 'blur(8px)',
      }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', padding: '8px 12px',
            background: 'hsla(38,20%,12%,0.7)', border: 'none',
            borderBottom: collapsed ? 'none' : '1px solid hsl(38 20% 18%)',
            color: 'hsl(38 70% 62%)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.12em', cursor: 'pointer',
          }}
        >
          <span>🎯 OBJECTIVES</span>
          <span style={{ fontSize: 10 }}>{collapsed ? '▼' : '▲'}</span>
        </button>

        {!collapsed && (
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Survival progress */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'hsl(42 20% 50%)', marginBottom: 2 }}>
                <span>Days Survived</span>
                <span style={{ color: 'hsl(38 60% 65%)', fontWeight: 700 }}>{survivalDay} / 30</span>
              </div>
              <div style={{ height: 5, background: 'hsl(38 15% 18%)', borderRadius: 3 }}>
                <div style={{
                  width: `${(survivalDay / 30) * 100}%`, height: '100%',
                  background: survivalDay >= 25 ? 'hsl(120 50% 40%)' : survivalDay >= 15 ? 'hsl(38 60% 42%)' : 'hsl(38 50% 35%)',
                  borderRadius: 3, transition: 'width 1s',
                }} />
              </div>
            </div>

            {allDone ? (
              <div style={{ fontSize: 12, color: 'hsl(120 50% 60%)', textAlign: 'center', padding: 8 }}>
                🏆 All objectives complete! Survive to Day 30!
              </div>
            ) : (
              visibleObjectives.map((obj) => {
                const isCompleted = completedObjectives.has(obj.id);
                const isCurrent = !isCompleted && OBJECTIVES.indexOf(obj) === firstUncompleted;
                const isCelebrating = celebration === obj.id;

                return (
                  <div
                    key={obj.id}
                    style={{
                      padding: '6px 8px', borderRadius: 6,
                      border: `1px solid ${isCurrent ? 'hsl(38 50% 32%)' : 'hsl(38 15% 18%)'}`,
                      background: isCurrent
                        ? 'hsla(38,40%,14%,0.9)'
                        : isCompleted
                        ? 'hsla(120,20%,10%,0.7)'
                        : 'hsla(28,15%,11%,0.5)',
                      opacity: !isCurrent && !isCompleted ? 0.5 : 1,
                      transition: 'all 0.3s',
                      animation: isCelebrating ? 'celebratePulse 0.5s ease-out' : undefined,
                    }}
                  >
                    <div style={{
                      fontSize: 11, fontWeight: 600,
                      color: isCompleted ? 'hsl(120 50% 60%)' : isCurrent ? 'hsl(42 35% 85%)' : 'hsl(42 20% 55%)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <span>{isCompleted ? '✅' : isCurrent ? '→' : '·'}</span>
                      <span>{obj.title}</span>
                    </div>
                    {isCurrent && (
                      <div style={{ fontSize: 10, color: 'hsl(42 15% 50%)', marginTop: 3, lineHeight: 1.4 }}>
                        {obj.description}
                      </div>
                    )}
                    {isCurrent && Object.entries(obj.reward).filter(([, v]) => (v ?? 0) > 0).length > 0 && (
                      <div style={{ fontSize: 9, color: 'hsl(38 50% 50%)', marginTop: 2 }}>
                        Reward: {Object.entries(obj.reward).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `+${v} ${k}`).join(', ')}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Warnings */}
      {warnings.slice(0, 3).map(w => (
        <div
          key={w.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px',
            background: w.id === 'raid_active' ? 'hsla(0,40%,12%,0.97)' : 'hsla(38,30%,10%,0.96)',
            border: w.id === 'raid_active' ? '1px solid hsl(0 60% 35%)' : '1px solid hsl(38 50% 30%)',
            borderRadius: 8, fontSize: 11,
            color: w.id === 'raid_active' ? 'hsl(0 70% 65%)' : 'hsl(38 70% 68%)',
            backdropFilter: 'blur(6px)',
            animation: 'warningPulse 2s infinite',
          }}
        >
          <span style={{ fontSize: 14 }}>{w.icon}</span>
          <span style={{ flex: 1 }}>{w.message}</span>
        </div>
      ))}
    </div>
  );
};

export default ObjectivesPanel;
