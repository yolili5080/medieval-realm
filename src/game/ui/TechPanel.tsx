// ──────────────────────────────────────────────
//  TechPanel – research UI shown inside building panel
// ──────────────────────────────────────────────

import React from 'react';
import { gameState } from '../core/GameState';
import {
  TECHNOLOGIES, getResearchState, startResearch, canResearch,
  canAdvanceAge, advanceAge, AGE_REQUIREMENTS,
} from '../systems/TechnologySystem';
import type { Age } from '../systems/TechnologySystem';

interface TechPanelProps {
  buildingId: number;
  buildingType: string;
  tick: number;
}

const AGE_LABELS: Record<Age, string> = {
  dark_age: '🌑 Dark Age',
  feudal_age: '⚔️ Feudal Age',
  castle_age: '🏰 Castle Age',
};

const TechPanel: React.FC<TechPanelProps> = ({ buildingId, buildingType, tick: _tick }) => {
  const research = getResearchState();

  // Filter techs for this building
  const availableTechs = TECHNOLOGIES.filter(t => t.researchBuilding === buildingType);
  if (availableTechs.length === 0 && buildingType !== 'town_center') return null;

  const activeResearch = research.activeResearch.get(buildingId);

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'hsl(42 15% 40%)', marginBottom: 4 }}>
        RESEARCH {AGE_LABELS[research.currentAge]}
      </div>

      {/* Age advancement (only in town_center) */}
      {buildingType === 'town_center' && research.currentAge !== 'castle_age' && (() => {
        const nextAge: Age = research.currentAge === 'dark_age' ? 'feudal_age' : 'castle_age';
        const { canAdvance, missingResources, missingBuildings } = canAdvanceAge(research);
        const reqs = AGE_REQUIREMENTS[nextAge];
        return (
          <div style={{
            background: 'hsl(38 15% 12%)',
            border: '1px solid hsl(38 25% 22%)',
            borderRadius: 6,
            padding: '6px 8px',
            marginBottom: 6,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'hsl(42 55% 72%)', marginBottom: 4 }}>
              Advance to {AGE_LABELS[nextAge]}
            </div>
            <div style={{ fontSize: 10, color: 'hsl(42 20% 52%)', marginBottom: 4 }}>
              Requires:{' '}
              {Object.entries(reqs.resources).map(([res, amt]) =>
                `${res === 'wood' ? '🪵' : res === 'stone' ? '🪨' : '🌾'}${amt}`
              ).join(' ')}{' '}
              {reqs.buildings.map(b => b.replace(/_/g, ' ')).join(', ')}
            </div>
            {!canAdvance && (missingResources.length > 0 || missingBuildings.length > 0) && (
              <div style={{ fontSize: 9, color: 'hsl(0 55% 50%)', marginBottom: 4 }}>
                Missing: {[...missingResources, ...missingBuildings].join(', ')}
              </div>
            )}
            <button
              onClick={() => advanceAge(research)}
              disabled={!canAdvance}
              style={{
                padding: '4px 10px', fontSize: 10, fontWeight: 700,
                background: canAdvance ? 'hsl(38 50% 18%)' : 'hsl(28 10% 12%)',
                border: `1px solid ${canAdvance ? 'hsl(38 50% 32%)' : 'hsl(28 10% 18%)'}`,
                borderRadius: 4,
                color: canAdvance ? 'hsl(42 65% 72%)' : 'hsl(42 10% 35%)',
                cursor: canAdvance ? 'pointer' : 'not-allowed',
              }}
            >
              🏰 Advance Age
            </button>
          </div>
        );
      })()}

      {/* Active research bar */}
      {activeResearch && (() => {
        const tech = TECHNOLOGIES.find(t => t.id === activeResearch.techId);
        const progress = (activeResearch.totalTime - activeResearch.timeRemaining) / activeResearch.totalTime;
        return (
          <div style={{ background: 'hsl(38 18% 13%)', border: '1px solid hsl(38 25% 20%)', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: 'hsl(42 45% 68%)', marginBottom: 4 }}>
              🔬 {tech?.icon} {tech?.name}
            </div>
            <div style={{ height: 4, background: 'hsl(38 12% 18%)', borderRadius: 2, marginBottom: 3 }}>
              <div style={{ width: `${progress * 100}%`, height: '100%', background: 'hsl(200 60% 45%)', borderRadius: 2, transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: 9, color: 'hsl(42 15% 45%)' }}>{Math.ceil(activeResearch.timeRemaining)}s remaining</div>
          </div>
        );
      })()}

      {/* Tech list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {availableTechs.map(tech => {
          const done = research.researchedTechs.has(tech.id);
          const active = activeResearch?.techId === tech.id;
          const affordable = canResearch(tech, research);
          const costStr = Object.entries(tech.cost)
            .map(([r, a]) => `${r === 'wood' ? '🪵' : r === 'stone' ? '🪨' : '🌾'}${a}`)
            .join(' ');

          return (
            <div key={tech.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 6px',
              background: done ? 'hsl(120 20% 10%)' : active ? 'hsl(200 20% 12%)' : 'hsl(28 12% 11%)',
              border: `1px solid ${done ? 'hsl(120 25% 18%)' : active ? 'hsl(200 30% 22%)' : 'hsl(28 12% 16%)'}`,
              borderRadius: 4, opacity: done ? 0.7 : 1,
            }}>
              <span style={{ fontSize: 13 }}>{tech.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: done ? 'hsl(120 40% 52%)' : 'hsl(42 30% 72%)' }}>
                  {tech.name} {done ? '✅' : ''}
                </div>
                <div style={{ fontSize: 9, color: 'hsl(42 12% 45%)' }}>
                  {tech.description}
                </div>
                <div style={{ fontSize: 9, color: 'hsl(42 25% 52%)' }}>
                  {costStr} · {tech.researchTime}s
                </div>
              </div>
              {!done && !active && (
                <button
                  onClick={() => startResearch(tech.id, buildingId, research)}
                  disabled={!affordable}
                  style={{
                    padding: '2px 7px', fontSize: 11, fontWeight: 700,
                    background: affordable ? 'hsl(200 35% 18%)' : 'hsl(0 10% 10%)',
                    border: `1px solid ${affordable ? 'hsl(200 40% 28%)' : 'hsl(0 10% 16%)'}`,
                    borderRadius: 4,
                    color: affordable ? 'hsl(200 60% 65%)' : 'hsl(42 10% 35%)',
                    cursor: affordable ? 'pointer' : 'not-allowed',
                  }}
                >▶</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TechPanel;
