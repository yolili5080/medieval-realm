import React, { useMemo, useState } from 'react';
import ChapterPill from '../ChapterPill';
import EventLogPanel from '../EventLogPanel';
import { gameState } from '../../core/GameState';

interface LeftSidebarProps {
  tick: number;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({ tick }) => {
  const [objectivesExpanded, setObjectivesExpanded] = useState(false);
  const [showFullLog, setShowFullLog] = useState(false);

  const objectives = useMemo(() => Array.from(gameState.mapObjectives.values()).slice(0, 4), [tick]);
  const pressure = gameState.pressure;

  const contestedCount = objectives.filter((o) => o.owner !== 'player').length;
  const urgency = gameState.military.activeRaid ? 'raid' : contestedCount > 0 ? 'contested' : 'stable';

  return (
    <div className="rts-drawer-content rts-left-drawer-content">
      <div className="rts-left-block rts-chapter-inline">
        <ChapterPill tick={tick} embedded />
      </div>

      <div className="rts-left-block rts-objectives-card">
        <button className="rts-drawer-header" onClick={() => setObjectivesExpanded((v) => !v)}>
          <span>Objectives</span>
          <span className={`rts-urgency-badge ${urgency}`}>{urgency === 'raid' ? 'RAID' : contestedCount > 0 ? `${contestedCount} contested` : 'stable'}</span>
        </button>

        {objectivesExpanded && (
          <div className="rts-objectives-list">
            {!pressure.scoutSent && <div className="rts-goal-row">Enemy scouting is intelligence-driven. Fortify and watch minimap activity.</div>}
            {pressure.scoutSent && !pressure.scoutResolved && <div className="rts-goal-row">Enemy scout active. Deny vision and secure workers.</div>}
            {pressure.scoutResolved && !pressure.firstHarassSent && <div className="rts-goal-row">Scout phase ended. Enemy military buildup likely after barracks.</div>}
            {pressure.firstHarassSent && <div className="rts-goal-row">Enemy assault phase active. Counter pressure and secure map control.</div>}
            {objectives.length === 0 && <div className="rts-goal-row">No map objectives are currently active.</div>}
            {objectives.map((o) => (
              <div className="rts-goal-row" key={o.id}>
                {o.type === 'relic' ? 'Relic' : o.type === 'watchpoint' ? 'Watchpoint' : 'Supply Cache'}: {o.owner} ({Math.round(Math.abs(o.captureProgress) * 100)}%)
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rts-left-block">
        <div className="rts-drawer-header rts-static-head">
          <span>Event Log</span>
          <button className="rts-inline-link" onClick={() => setShowFullLog((v) => !v)}>{showFullLog ? 'Show Latest' : 'Expand'}</button>
        </div>
        <EventLogPanel tick={tick} embedded maxEntries={showFullLog ? undefined : 3} showHeader={false} />
      </div>
    </div>
  );
};

export default LeftSidebar;
