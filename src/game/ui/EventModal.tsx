// ──────────────────────────────────────────────
//  EventModal – player-choice event dialog
// ──────────────────────────────────────────────

import React from 'react';
import { getActiveEvent, resolveChoice } from '../systems/RandomEventSystem';
import { gameState } from '../core/GameState';

interface EventModalProps {
  tick: number;
}

const EventModal: React.FC<EventModalProps> = ({ tick: _tick }) => {
  const event = getActiveEvent();
  if (!event) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'hsla(0 0% 0% / 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'hsl(28 20% 10%)',
        border: '2px solid hsl(38 45% 28%)',
        borderRadius: 12,
        padding: '20px 24px',
        maxWidth: 420,
        width: '90vw',
        boxShadow: '0 20px 60px hsla(0 0% 0% / 0.7)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 36 }}>{event.icon}</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'hsl(42 70% 78%)' }}>{event.title}</div>
            <div style={{ fontSize: 10, color: 'hsl(42 20% 50%)', marginTop: 2 }}>
              Day {gameState.gameTime.day}
            </div>
          </div>
        </div>

        {/* Description */}
        <p style={{
          fontSize: 13, color: 'hsl(42 35% 65%)',
          lineHeight: 1.5, marginBottom: 16,
          background: 'hsl(28 15% 13%)',
          borderRadius: 6, padding: '8px 12px',
          border: '1px solid hsl(38 15% 18%)',
        }}>
          {event.description}
        </p>

        {/* Choices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {event.choices.map((choice, i) => {
            const costEntries = Object.entries(choice.cost ?? {});
            const canAfford = costEntries.every(([res, amt]) =>
              (gameState.resources as any)[res] >= (amt as number)
            );

            return (
              <button
                key={i}
                onClick={() => resolveChoice(i)}
                disabled={!canAfford}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 3,
                  padding: '10px 14px',
                  background: canAfford ? 'hsl(38 20% 15%)' : 'hsl(28 10% 10%)',
                  border: `1px solid ${canAfford ? 'hsl(38 35% 28%)' : 'hsl(28 10% 18%)'}`,
                  borderRadius: 7,
                  cursor: canAfford ? 'pointer' : 'not-allowed',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (canAfford) (e.currentTarget as HTMLElement).style.background = 'hsl(38 25% 20%)'; }}
                onMouseLeave={e => { if (canAfford) (e.currentTarget as HTMLElement).style.background = 'hsl(38 20% 15%)'; }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: canAfford ? 'hsl(42 60% 72%)' : 'hsl(42 10% 35%)' }}>
                  {choice.label}
                </div>
                <div style={{ fontSize: 11, color: 'hsl(42 25% 55%)' }}>{choice.description}</div>
                {costEntries.length > 0 && (
                  <div style={{ fontSize: 10, color: canAfford ? 'hsl(100 40% 50%)' : 'hsl(0 50% 45%)' }}>
                    Cost: {costEntries.map(([res, amt]) =>
                      `${res === 'wood' ? '🪵' : res === 'stone' ? '🪨' : '🌾'}${amt}`
                    ).join(' ')}
                    {!canAfford && ' (Not enough!)'}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default EventModal;
