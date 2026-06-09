import React from 'react';
import { gameState } from '../../core/GameState';
import { EventBus } from '../../core/EventBus';
import MilitaryPanel from '../MilitaryPanel';
import MarketPanel from '../MarketPanel';
import StrongholdPanel from '../StrongholdPanel';
import TechPanel from '../TechPanel';

interface RightUtilityDockProps {
  tick: number;
  selectedEntity: number | null;
  embedded?: boolean;
}

const RightUtilityDock: React.FC<RightUtilityDockProps> = ({ tick, selectedEntity, embedded = false }) => {
  const active = gameState.ui.activeRightPanel;

  const setPanel = (panel: typeof gameState.ui.activeRightPanel) => {
    gameState.ui.activeRightPanel = gameState.ui.activeRightPanel === panel ? 'none' : panel;
    EventBus.emit('UIPanelChanged', { panel: gameState.ui.activeRightPanel });
  };

  const selectedBuilding = selectedEntity !== null ? gameState.buildings.get(selectedEntity) : null;

  return (
    <div className={`rts-right-dock ${embedded ? 'embedded' : ''}`}>
      <div className="rts-right-tabs">
        <button className={`rts-dock-btn ${active === 'military' ? 'active' : ''}`} onClick={() => setPanel('military')} title="Military">⚔</button>
        <button className={`rts-dock-btn ${active === 'market' ? 'active' : ''}`} onClick={() => setPanel('market')} title="Market">¤</button>
        <button className={`rts-dock-btn ${active === 'tech' ? 'active' : ''}`} onClick={() => setPanel('tech')} title="Tech">✧</button>
        <button className={`rts-dock-btn ${active === 'stronghold' ? 'active' : ''}`} onClick={() => setPanel('stronghold')} title="Stronghold">♜</button>
      </div>

      {active !== 'none' && (
        <div className="rts-right-panel">
          {active === 'military' && <MilitaryPanel tick={tick} embedded />}
          {active === 'market' && <MarketPanel tick={tick} />}
          {active === 'stronghold' && <StrongholdPanel tick={tick} />}
          {active === 'tech' && (
            selectedEntity !== null && selectedBuilding
              ? <TechPanel buildingId={selectedEntity} buildingType={selectedBuilding.type} tick={tick} />
              : <div className="rts-right-empty">Select a building to view available technologies.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default RightUtilityDock;
