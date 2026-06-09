// ──────────────────────────────────────────────
//  Notifications – stacked toast system
//  Max 3 visible, auto-dismiss after 4s
// ──────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { gameState } from '../core/GameState';

interface NotificationsProps {
  tick: number;
}

interface NotifDisplay {
  id: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  ts: number;
  dying: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  info: 'hsl(220 50% 55%)',
  success: 'hsl(120 45% 45%)',
  warning: 'hsl(38 70% 52%)',
  error: 'hsl(0 60% 55%)',
};

const TYPE_BG: Record<string, string> = {
  info: 'hsla(220,30%,12%,0.97)',
  success: 'hsla(120,20%,10%,0.97)',
  warning: 'hsla(38,30%,10%,0.97)',
  error: 'hsla(0,30%,12%,0.97)',
};

const TYPE_ICONS: Record<string, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
};

const Notifications: React.FC<NotificationsProps> = ({ tick }) => {
  const [displayed, setDisplayed] = useState<NotifDisplay[]>([]);
  const seenIds = React.useRef(new Set<number>());

  useEffect(() => {
    const now = Date.now();
    // Pick up new notifications from gameState
    const newOnes: NotifDisplay[] = [];
    for (const n of gameState.notifications) {
      if (!seenIds.current.has(n.id)) {
        seenIds.current.add(n.id);
        newOnes.push({ ...n, dying: false });
      }
    }

    if (newOnes.length > 0) {
      setDisplayed(prev => {
        const combined = [...prev, ...newOnes];
        return combined.slice(-3); // max 3 visible
      });
    }

    // Age out old ones
    setDisplayed(prev =>
      prev.map(d => {
        const age = (now - d.ts) / 1000;
        return age > 3.5 ? { ...d, dying: true } : d;
      }).filter(d => (now - d.ts) / 1000 < 5)
    );
  }, [tick]);

  if (displayed.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 68,
      right: 12,
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      pointerEvents: 'none',
    }}>
      {displayed.map(n => (
        <div
          key={n.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px',
            background: TYPE_BG[n.type],
            border: `1px solid ${TYPE_COLORS[n.type]}44`,
            borderLeft: `3px solid ${TYPE_COLORS[n.type]}`,
            borderRadius: 6,
            backdropFilter: 'blur(6px)',
            fontSize: 12,
            color: 'hsl(42 30% 82%)',
            minWidth: 200,
            maxWidth: 300,
            opacity: n.dying ? 0 : 1,
            transform: n.dying ? 'translateX(20px)' : 'translateX(0)',
            transition: 'opacity 0.5s, transform 0.5s',
          }}
        >
          <span style={{ fontSize: 14 }}>{TYPE_ICONS[n.type]}</span>
          <span>{n.message}</span>
        </div>
      ))}
    </div>
  );
};

export default Notifications;
