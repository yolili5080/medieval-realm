import React, { useEffect, useRef, useState } from 'react';
import { EventBus } from '../core/EventBus';

interface LogEntry {
  id: number;
  icon: string;
  message: string;
  timestamp: string;
  createdAt: number;
  type: 'build' | 'combat' | 'resource' | 'social' | 'event';
}

let logId = 0;
const globalLog: LogEntry[] = [];
type LogListener = () => void;
const logListeners = new Set<LogListener>();

export function pushLogEntry(icon: string, message: string, type: LogEntry['type'] = 'event') {
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  globalLog.push({ id: logId++, icon, message, timestamp: ts, createdAt: Date.now(), type });
  if (globalLog.length > 20) globalLog.shift();
  logListeners.forEach((l) => l());
}

interface EventLogPanelProps {
  tick: number;
  embedded?: boolean;
  maxEntries?: number;
  showHeader?: boolean;
}

const EventLogPanel: React.FC<EventLogPanelProps> = ({ tick: _tick, embedded = false, maxEntries, showHeader = true }) => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => setEntries([...globalLog]);
    refresh();
    logListeners.add(refresh);
    return () => {
      logListeners.delete(refresh);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current && !collapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, collapsed]);

  useEffect(() => {
    const unsubs = [
      EventBus.on('BuildingPlaced', ({ type }) => pushLogEntry('🔨', `Construction started: ${type.replace(/_/g, ' ')}`, 'build')),
      EventBus.on('BuildingCompleted', () => pushLogEntry('✅', 'Building completed', 'build')),
      EventBus.on('RaidStarted', () => pushLogEntry('⚔️', 'RAID IN PROGRESS - defend your settlement!', 'combat')),
      EventBus.on('SoldierTrained', ({ soldierType }) => pushLogEntry('⭐', `New ${soldierType} trained`, 'combat')),
      EventBus.on('ResourcePickedUp', ({ resourceType, amount }) => pushLogEntry('📦', `+${amount} ${resourceType} collected`, 'resource')),
      EventBus.on('ItemCrafted', ({ itemType }) => pushLogEntry('🛠', `Item crafted: ${itemType}`, 'social')),
      EventBus.on('SaveRequested', () => pushLogEntry('💾', 'Game saved', 'event')),
      EventBus.on('EnemyBaseSpawned', ({ x, z }) => pushLogEntry('🏰', `Enemy base discovered at (${Math.round(x)}, ${Math.round(z)})`, 'combat')),
      EventBus.on('EnemyWaveLaunched', ({ composition, reason }) => pushLogEntry('⚠', `Enemy wave launched (${composition.join(', ')}) · ${reason}`, 'combat')),
      EventBus.on('ObjectiveSpawned', ({ type }) => pushLogEntry('🎯', `Objective available: ${type}`, 'event')),
      EventBus.on('ObjectiveCaptured', ({ objectiveId, owner }) => pushLogEntry(owner === 'player' ? '✅' : '❌', `Objective ${objectiveId} captured by ${owner}`, 'event')),
      EventBus.on('ObjectiveLost', ({ objectiveId }) => pushLogEntry('↔', `Objective ${objectiveId} returned to neutral`, 'event')),
      EventBus.on('EnemyFactionDestroyed', () => pushLogEntry('🏆', 'Enemy faction destroyed', 'combat')),
      EventBus.on('PressureEventStarted', ({ message }) => pushLogEntry('📢', message, 'event')),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const typeColor: Record<LogEntry['type'], string> = {
    build: 'hsl(38 60% 55%)',
    combat: 'hsl(0 60% 60%)',
    resource: 'hsl(120 45% 55%)',
    social: 'hsl(200 55% 60%)',
    event: 'hsl(42 30% 60%)',
  };

  const now = Date.now();
  const visibleEntries = maxEntries ? entries.slice(-maxEntries) : entries;

  return (
    <div
      style={{
        position: embedded ? 'relative' : 'absolute',
        bottom: embedded ? undefined : 16,
        left: embedded ? undefined : 16,
        zIndex: embedded ? undefined : 200,
        width: embedded ? '100%' : 290,
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
    >
      {showHeader && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 10px',
            background: 'hsla(28,26%,8%,0.97)',
            border: '1px solid hsl(38 25% 20%)',
            borderRadius: collapsed ? 8 : '8px 8px 0 0',
            color: 'hsl(42 35% 65%)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
            transition: 'all 0.12s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'hsl(38 50% 32%)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'hsl(38 25% 20%)')}
        >
          <span>📜 EVENT LOG</span>
          <span style={{ fontSize: 8, opacity: 0.6 }}>{collapsed ? '▲' : '▼'} {entries.length} entries</span>
        </button>
      )}

      {!collapsed && (
        <div
          ref={scrollRef}
          style={{
            background: 'hsla(28,22%,7%,0.96)',
            border: '1px solid hsl(38 22% 18%)',
            borderTop: showHeader ? 'none' : '1px solid hsl(38 22% 18%)',
            borderRadius: showHeader ? '0 0 8px 8px' : 8,
            height: embedded ? 96 : 110,
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarWidth: 'thin',
            scrollbarColor: 'hsl(38 20% 22%) transparent',
          }}
        >
          {visibleEntries.length === 0 && (
            <div style={{ padding: '20px 12px', fontSize: 10, color: 'hsl(42 15% 38%)', textAlign: 'center' }}>
              No events yet...
            </div>
          )}
          {visibleEntries.map((entry, idx) => {
            const age = (now - entry.createdAt) / 1000;
            const isRecent = idx >= visibleEntries.length - 5;
            const opacity = isRecent ? 1 : Math.max(0.4, 1 - age / 30);
            return (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '4px 10px',
                  borderBottom: '1px solid hsla(38,15%,14%,0.6)',
                  opacity,
                  transition: 'opacity 0.5s',
                }}
              >
                <span style={{ fontSize: 11, flexShrink: 0, marginTop: 1 }}>{entry.icon}</span>
                <span
                  style={{
                    fontSize: 9,
                    color: 'hsl(42 10% 42%)',
                    flexShrink: 0,
                    marginTop: 2,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {entry.timestamp}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: typeColor[entry.type],
                    flex: 1,
                    lineHeight: 1.35,
                  }}
                >
                  {entry.message}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EventLogPanel;
