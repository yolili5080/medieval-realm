// ──────────────────────────────────────────────
//  GameOverScreen – Victory and Defeat screens
// ──────────────────────────────────────────────

import React from 'react';
import { gameState, createInitialGameState, setGameState } from '../core/GameState';
import { stopGameLoop, startGameLoop } from '../GameLoop';

interface GameOverScreenProps {
  won: boolean;
  onRestart: () => void;
  onContinue?: () => void;
}

const GameOverScreen: React.FC<GameOverScreenProps> = ({ won, onRestart, onContinue }) => {
  const { military, gameTime, population } = gameState;

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 2000,
    background: won ? 'rgba(8,14,8,0.92)' : 'rgba(14,6,6,0.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(6px)',
  };

  const box: React.CSSProperties = {
    background: won
      ? 'linear-gradient(160deg, hsl(120 15% 10%), hsl(120 10% 7%))'
      : 'linear-gradient(160deg, hsl(0 20% 10%), hsl(0 15% 7%))',
    border: `1px solid ${won ? 'hsl(120 40% 28%)' : 'hsl(0 40% 28%)'}`,
    borderRadius: 16, padding: '44px 52px',
    maxWidth: 480, width: '90vw', textAlign: 'center',
    boxShadow: `0 24px 80px hsla(${won ? '120' : '0'},30%,5%,0.9)`,
  };

  return (
    <div style={overlay}>
      <div style={box}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>{won ? '⚔️' : '💀'}</div>
        <h1 style={{
          fontSize: 22, fontWeight: 800, letterSpacing: '0.18em',
          color: `hsl(${won ? '120' : '0'} 50% 65%)`,
          textShadow: `0 0 20px hsla(${won ? '120' : '0'},50%,50%,0.4)`,
          marginBottom: 8,
        }}>
          {won ? 'YOUR REALM STANDS' : 'YOUR REALM HAS FALLEN'}
        </h1>
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, hsl(${won ? '120' : '0'} 30% 30%), transparent)`, margin: '12px 0' }} />

        <div style={{ fontSize: 13, color: 'hsl(42 25% 65%)', lineHeight: 1.8, marginBottom: 24 }}>
          {won ? (
            <>
              <div>You have ruled for <strong style={{ color: 'hsl(42 60% 70%)' }}>30 days</strong>.</div>
              <div>Population reached: <strong>{population}</strong></div>
              <div>Raids repelled: <strong>{military.raidsRepelled}</strong></div>
              <div>Soldiers trained: <strong>{military.soldiersTrainedTotal}</strong></div>
            </>
          ) : (
            <>
              <div>Survived: <strong style={{ color: 'hsl(30 60% 65%)' }}>Day {gameTime.day}</strong></div>
              <div>Killed by: <strong>Raider assault</strong></div>
              <br />
              <div style={{ fontSize: 12, color: 'hsl(42 15% 45%)', background: 'hsla(0,20%,10%,0.6)', borderRadius: 6, padding: '8px 12px' }}>
                💡 Tip: Build walls and train soldiers before Day 5 to survive the first raid.
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={onRestart}
            style={{
              padding: '12px 28px', fontSize: 14, fontWeight: 700,
              background: `linear-gradient(135deg, hsl(${won ? '120' : '0'} 40% 28%), hsl(${won ? '120' : '0'} 35% 20%))`,
              border: `1px solid hsl(${won ? '120' : '0'} 40% 38%)`,
              borderRadius: 8, color: 'hsl(42 40% 92%)', cursor: 'pointer',
            }}
          >
            {won ? '🔄 Play Again' : '🔄 Try Again'}
          </button>
          {won && onContinue && (
            <button
              onClick={onContinue}
              style={{
                padding: '12px 28px', fontSize: 14, fontWeight: 700,
                background: 'hsla(120,20%,12%,0.8)',
                border: '1px solid hsl(120 25% 25%)',
                borderRadius: 8, color: 'hsl(42 40% 80%)', cursor: 'pointer',
              }}
            >
              Continue Ruling
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameOverScreen;
