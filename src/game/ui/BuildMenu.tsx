// ──────────────────────────────────────────────
//  Build Menu – tabbed panel (Buildings / Military / Fortifications)
// ──────────────────────────────────────────────

import React, { useState } from 'react';
import { BUILDING_DEFS } from '../data/buildings';
import { gameState, pushNotification, consumeResource } from '../core/GameState';
import type { BuildingType } from '../core/EventBus';

interface BuildMenuProps {
  buildMode: string | null;
  onSelectBuild: (type: BuildingType | null) => void;
  /** Called when wall draw-mode is toggled */
  onWallDrawMode?: (active: boolean) => void;
  wallDrawMode?: boolean;
}

type BuildTab = 'buildings' | 'military' | 'fortifications';

const BUILDING_ICONS: Record<string, string> = {
  house: '🏠', storage_barn: '🏚', woodcutter_hut: '🪓',
  farm_field: '🌾', quarry: '⛏', barracks: '⚔️',
  tower: '🗼', smithy: '🔨', guard_post: '🏴', market: '🏪',
  stronghold: '🏰', dock: '⚓',
};

const CIVILIAN_BUILDINGS: BuildingType[] = ['house', 'storage_barn', 'woodcutter_hut', 'farm_field', 'quarry', 'market', 'dock'];
const MILITARY_BUILDINGS: BuildingType[] = ['barracks', 'smithy', 'tower', 'guard_post'];
const LEGENDARY_BUILDINGS: BuildingType[] = ['stronghold'];

const BuildMenu: React.FC<BuildMenuProps> = ({ buildMode, onSelectBuild, onWallDrawMode, wallDrawMode }) => {
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<BuildTab>('buildings');

  const renderBuildingButton = (type: BuildingType) => {
    const def = BUILDING_DEFS[type];
    const isActive = buildMode === type;
    const costEntries = Object.entries(def.constructionCost) as [string, number][];
    const canAfford = costEntries.every(([res, cost]) =>
      (gameState.resources as any)[res] >= cost
    );

    return (
      <button
        key={type}
        className={`build-item ${isActive ? 'active' : ''} ${!canAfford ? 'unaffordable' : ''}`}
        onClick={() => {
          onWallDrawMode?.(false);
          onSelectBuild(isActive ? null : type);
        }}
        title={def.description}
      >
        <span className="build-item-icon">{BUILDING_ICONS[type] || '🏛'}</span>
        <div className="build-item-info">
          <span className="build-item-name">{def.label}</span>
          <div className="build-item-cost">
            {costEntries.map(([res, cost]) => (
              <span
                key={res}
                className={`cost-badge ${(gameState.resources as any)[res] < cost ? 'insufficient' : ''}`}
              >
                {res === 'wood' ? '🪵' : res === 'stone' ? '🪨' : '🌾'}{cost}
              </span>
            ))}
            {costEntries.length === 0 && <span className="cost-badge free">Free</span>}
          </div>
        </div>
      </button>
    );
  };

  const tabBtnStyle = (tab: BuildTab): React.CSSProperties => ({
    flex: 1,
    padding: '5px 2px',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.04em',
    background: activeTab === tab ? 'hsla(38,35%,18%,0.95)' : 'hsla(28,15%,10%,0.7)',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid hsl(38 55% 48%)' : '2px solid transparent',
    color: activeTab === tab ? 'hsl(42 60% 75%)' : 'hsl(42 15% 45%)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  return (
    <div className="build-menu">
      <button className="build-menu-toggle" onClick={() => setExpanded((e) => !e)}>
        {expanded ? '◀ Build' : '▶'}
      </button>
      {expanded && (
        <div className="build-menu-items" style={{ paddingTop: 0 }}>
          {/* Tab Bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid hsl(38 20% 16%)', marginBottom: 6 }}>
            <button style={tabBtnStyle('buildings')} onClick={() => setActiveTab('buildings')}>🏘️ Build</button>
            <button style={tabBtnStyle('military')} onClick={() => setActiveTab('military')}>⚔️ Military</button>
            <button style={tabBtnStyle('fortifications')} onClick={() => setActiveTab('fortifications')}>🏰 Walls</button>
          </div>

          {/* Buildings Tab */}
          {activeTab === 'buildings' && (
            <>
              <div className="build-menu-header">BUILD</div>
              {CIVILIAN_BUILDINGS.map(renderBuildingButton)}
              <div style={{ marginTop: 8 }}>
                <div className="build-menu-header" style={{ color: 'hsl(38 60% 55%)' }}>⚜️ LEGENDARY</div>
                {LEGENDARY_BUILDINGS.map(type => {
                  let alreadyBuilt = false;
                  gameState.buildings.forEach(b => { if ((b as any).type === type) alreadyBuilt = true; });
                  const btn = renderBuildingButton(type);
                  return alreadyBuilt
                    ? <div key={type} style={{ fontSize: 9, color: 'hsl(38 40% 45%)', padding: '4px 8px' }}>🏰 Stronghold already built</div>
                    : btn;
                })}
              </div>
            </>
          )}

          {/* Military Tab */}
          {activeTab === 'military' && (
            <>
              <div className="build-menu-header">⚔️ MILITARY</div>
              {MILITARY_BUILDINGS.map(renderBuildingButton)}
              <div style={{ marginTop: 6, fontSize: 9, color: 'hsl(42 15% 38%)', padding: '0 6px', lineHeight: 1.4 }}>
                Build a Barracks first, then train soldiers from the Military Command panel.
              </div>
            </>
          )}

          {/* Fortifications Tab */}
          {activeTab === 'fortifications' && (
            <>
              <div className="build-menu-header">🏰 FORTIFICATIONS</div>

              {/* Stone Wall draw tool */}
              <button
                className={`build-item ${wallDrawMode ? 'active' : ''}`}
                onClick={() => {
                  onSelectBuild(null);
                  onWallDrawMode?.(!wallDrawMode);
                }}
                title="Click two terrain points to place a stone wall segment between them"
              >
                <span className="build-item-icon">🧱</span>
                <div className="build-item-info">
                  <span className="build-item-name">Stone Wall</span>
                  <div className="build-item-cost">
                    <span className={`cost-badge ${gameState.resources.stone < 3 ? 'insufficient' : ''}`}>🪨3/seg</span>
                  </div>
                </div>
              </button>

              {wallDrawMode && (
                <div style={{ fontSize: 9, color: 'hsl(38 60% 60%)', padding: '4px 8px', background: 'hsla(38,30%,10%,0.8)', borderRadius: 4, margin: '4px 0' }}>
                  🖱 Click 2 points on terrain to place wall segment.<br />
                  Right-click or Escape to cancel.
                </div>
              )}

              <div style={{ marginTop: 6, fontSize: 9, color: 'hsl(42 15% 38%)', padding: '0 6px', lineHeight: 1.4 }}>
                Walls cost 🪨3 per segment and block enemy movement. Gates allow citizens through.
              </div>
            </>
          )}

          {/* Cancel button */}
          {(buildMode || wallDrawMode) && (
            <button className="build-cancel-btn" onClick={() => { onSelectBuild(null); onWallDrawMode?.(false); }}>
              ✕ Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default BuildMenu;
