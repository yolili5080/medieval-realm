// ──────────────────────────────────────────────
//  RaidWarningBanner – pulsing alert when raid is imminent or active
// ──────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { gameState } from '../core/GameState';

interface RaidWarningBannerProps {
  tick: number;
}

const RaidWarningBanner: React.FC<RaidWarningBannerProps> = ({ tick }) => {
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setPulse(v => !v), 500);
    return () => clearInterval(interval);
  }, []);

  const { military, gameTime } = gameState;
  const enemies = Array.from(military.enemies.values()).filter(e => e.state !== 'dead');

  if (military.gameOver) return null;

  // Active raid banner
  if (military.activeRaid && enemies.length > 0) {
    // Find Town Center HP
    let tcHp = 500, tcMaxHp = 500;
    gameState.buildings.forEach((b, id) => {
      if (b.type === 'town_center') {
        tcMaxHp = 500;
        tcHp = military.buildingHp.get(id) ?? 500;
      }
    });

    return (
      <div style={{
        position: 'absolute',
        top: 72, left: '50%', transform: 'translateX(-50%)',
        background: 'hsla(0, 75%, 10%, 0.97)',
        border: `2px solid hsl(0 70% ${pulse ? '50%' : '35%'})`,
        borderRadius: 8, padding: '7px 20px',
        color: `hsl(0 80% ${pulse ? '78%' : '60%'})`,
        transition: 'border-color 0.2s, color 0.2s',
        textAlign: 'center', zIndex: 500,
        fontSize: 13, fontWeight: 700,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>
        🔴 RAID IN PROGRESS — {enemies.length} {enemies.length === 1 ? 'enemy' : 'enemies'} remaining — Town Center: {Math.ceil(tcHp)}/{tcMaxHp} HP
      </div>
    );
  }

  // Warning banner: raid coming today
  const daysUntil = military.nextRaidDay - gameTime.day;
  const isImminentDay = daysUntil <= 0 && !military.activeRaid;
  const isWarningDay = daysUntil <= 1 && daysUntil > 0;

  if (!isImminentDay && !isWarningDay) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 72, left: '50%', transform: 'translateX(-50%)',
      background: isImminentDay ? 'hsla(0, 70%, 12%, 0.97)' : 'hsla(30, 60%, 10%, 0.97)',
      border: `2px solid hsl(${isImminentDay ? '0 65%' : '30 55%'} ${pulse ? '48%' : '30%'})`,
      borderRadius: 8, padding: '7px 20px',
      color: `hsl(${isImminentDay ? '0 75% 72%' : '38 70% 65%'})`,
      transition: 'border-color 0.2s, color 0.2s',
      textAlign: 'center', zIndex: 500,
      fontSize: 12, fontWeight: 700,
      pointerEvents: 'none',
    }}>
      {isImminentDay
        ? `🔴 RAIDERS APPROACHING — Attack expected at noon! Prepare your defenses!`
        : `⚠️ Raiders will attack tomorrow (Day ${military.nextRaidDay}) — Train soldiers · Build walls · Close gates`}
      <div style={{ fontSize: 10, fontWeight: 400, color: 'hsl(42 40% 55%)', marginTop: 2 }}>
        Train soldiers · Build walls · Garrison towers
      </div>
    </div>
  );
};

export default RaidWarningBanner;
