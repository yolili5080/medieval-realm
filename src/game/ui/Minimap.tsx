// ──────────────────────────────────────────────
//  Minimap – canvas-based tactical overview
//  10 fps render, fog of war, click-to-move camera
// ──────────────────────────────────────────────

import React, { useRef, useEffect, useCallback } from 'react';
import { gameState } from '../core/GameState';
import { getTerrainHeight } from '../core/Noise';

const MAP_SIZE = 160;   // minimap canvas pixels
const WORLD_HALF = 100; // world extends from -100 to +100

interface MinimapPing {
  id: string;
  wx: number; wz: number;
  icon: string;
  createdMs: number;
  durationMs: number;
}

// Module-level ping list (capped at 20)
const pings: MinimapPing[] = [];
export function pushMinimapPing(wx: number, wz: number, icon: string, durationMs = 4000) {
  if (pings.length >= 20) pings.shift();
  pings.push({ id: `${Date.now()}`, wx, wz, icon, createdMs: Date.now(), durationMs });
}

// Camera move callback – set from Game.tsx
let _cameraMoveCallback: ((wx: number, wz: number) => void) | null = null;
export function setMinimapCameraMoveCallback(cb: (wx: number, wz: number) => void) {
  _cameraMoveCallback = cb;
}

// Baked terrain color grid (built once on first render)
let terrainCache: ImageData | null = null;
function buildTerrainCache(size: number): ImageData {
  const img = new ImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const wx = (px / size) * (WORLD_HALF * 2) - WORLD_HALF;
      const wz = (py / size) * (WORLD_HALF * 2) - WORLD_HALF;
      const h = getTerrainHeight(wx, wz);
      let r: number, g: number, b: number;
      if (h < 0.05) { r = 30; g = 55; b = 90; }          // deep water
      else if (h < 0.3) { r = 55; g = 90; b = 65; }       // grass low
      else if (h < 0.8) { r = 65; g = 105; b = 75; }      // grass mid
      else { r = 90; g = 95; b = 80; }                    // hill
      const i = (py * size + px) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  return img;
}

// Fog grid: 0=undiscovered 1=explored 2=visible  (MAP_SIZE × MAP_SIZE)
const fogGrid = new Uint8Array(MAP_SIZE * MAP_SIZE);
let lastFogUpdateMs = 0;
const FOG_UPDATE_INTERVAL = 250; // ms

function worldToMinimap(wx: number, wz: number): [number, number] {
  const px = Math.round(((wx + WORLD_HALF) / (WORLD_HALF * 2)) * MAP_SIZE);
  const py = Math.round(((wz + WORLD_HALF) / (WORLD_HALF * 2)) * MAP_SIZE);
  return [Math.max(0, Math.min(MAP_SIZE - 1, px)), Math.max(0, Math.min(MAP_SIZE - 1, py))];
}

function minimapToWorld(px: number, py: number): [number, number] {
  const wx = (px / MAP_SIZE) * (WORLD_HALF * 2) - WORLD_HALF;
  const wz = (py / MAP_SIZE) * (WORLD_HALF * 2) - WORLD_HALF;
  return [wx, wz];
}

function revealRadius(px: number, py: number, radius: number) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const nx = px + dx; const ny = py + dy;
      if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) continue;
      const idx = ny * MAP_SIZE + nx;
      if (fogGrid[idx] < 2) fogGrid[idx] = 2; // mark visible
    }
  }
}

function updateFog() {
  const now = performance.now();
  if (now - lastFogUpdateMs < FOG_UPDATE_INTERVAL) return;
  lastFogUpdateMs = now;

  // Step 1: downgrade visible → explored
  for (let i = 0; i < fogGrid.length; i++) {
    if (fogGrid[i] === 2) fogGrid[i] = 1;
  }

  // Step 2: reveal around citizens (radius 6 cells)
  gameState.transforms.forEach((t, id) => {
    if (gameState.isCitizen.has(id)) {
      const [px, py] = worldToMinimap(t.x, t.z);
      revealRadius(px, py, 6);
    }
  });

  // Step 3: reveal around soldiers (radius 7)
  gameState.military.soldierTransforms.forEach(t => {
    const [px, py] = worldToMinimap(t.x, t.z);
    revealRadius(px, py, 7);
  });

  // Step 4: reveal around buildings (radius 9)
  gameState.buildings.forEach((b, id) => {
    if (b.state === 'active' || b.state === 'under_construction') {
      const t = gameState.transforms.get(id);
      if (t) {
        const [px, py] = worldToMinimap(t.x, t.z);
        revealRadius(px, py, 9);
      }
    }
  });
}

let lastRenderMs = 0;
const MINIMAP_FPS = 10;

function renderMinimap(canvas: HTMLCanvasElement) {
  const now = performance.now();
  if (now - lastRenderMs < 1000 / MINIMAP_FPS) return;
  lastRenderMs = now;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Update fog
  updateFog();

  // Draw terrain from cache
  if (!terrainCache) terrainCache = buildTerrainCache(MAP_SIZE);
  ctx.putImageData(terrainCache, 0, 0);

  // Fog overlay
  for (let py = 0; py < MAP_SIZE; py++) {
    for (let px = 0; px < MAP_SIZE; px++) {
      const fog = fogGrid[py * MAP_SIZE + px];
      if (fog === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.92)';
        ctx.fillRect(px, py, 1, 1);
      } else if (fog === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(px, py, 1, 1);
      }
      // fog===2 → clear
    }
  }

  // Draw walls (gray lines)
  ctx.strokeStyle = 'rgba(180,170,140,0.7)';
  ctx.lineWidth = 1.5;
  gameState.walls.forEach(w => {
    const [sx, sy] = worldToMinimap(w.startX, w.startZ);
    const [ex, ey] = worldToMinimap(w.endX, w.endZ);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
  });

  // Draw buildings (gold squares)
  gameState.buildings.forEach((b, id) => {
    const t = gameState.transforms.get(id);
    if (!t) return;
    const [px, py] = worldToMinimap(t.x, t.z);
    const fog = fogGrid[py * MAP_SIZE + px];
    if (fog === 0) return;
    ctx.fillStyle = b.type === 'town_center' ? 'rgba(255,215,60,0.95)' : 'rgba(210,170,80,0.85)';
    ctx.fillRect(px - 2, py - 2, 4, 4);
  });

  // Draw ocean boats (cyan)
  const oceanState = (gameState as any).ocean;
  if (oceanState?.boats) {
    (oceanState.boats as Map<number, any>).forEach(boat => {
      if (boat.state === 'dead') return;
      const [px, py] = worldToMinimap(boat.position.x, boat.position.z);
      const fog = fogGrid[py * MAP_SIZE + px];
      if (fog === 0) return;
      ctx.fillStyle = 'rgba(80,200,220,0.9)';
      ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
    });
  }

  // Draw citizens (white dots)
  gameState.transforms.forEach((t, id) => {
    if (!gameState.isCitizen.has(id)) return;
    const [px, py] = worldToMinimap(t.x, t.z);
    const fog = fogGrid[py * MAP_SIZE + px];
    if (fog === 0) return;
    ctx.fillStyle = 'rgba(220,220,255,0.85)';
    ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill();
  });

  // Draw soldiers (green dots)
  gameState.military.soldierTransforms.forEach((t, id) => {
    const soldier = gameState.military.soldiers.get(id);
    if (!soldier || soldier.state === 'dead') return;
    const [px, py] = worldToMinimap(t.x, t.z);
    const fog = fogGrid[py * MAP_SIZE + px];
    if (fog === 0) return;
    const isSelected = id === gameState.military.selectedSoldierId;
    ctx.fillStyle = isSelected ? 'rgba(100,255,100,0.95)' : 'rgba(80,200,80,0.85)';
    ctx.beginPath(); ctx.arc(px, py, isSelected ? 2.5 : 2, 0, Math.PI * 2); ctx.fill();
  });

  // Draw enemies (red dots) — always visible during active raid
  if (gameState.military.activeRaid || gameState.military.enemies.size > 0) {
    gameState.military.enemyTransforms.forEach((t, id) => {
      const enemy = gameState.military.enemies.get(id);
      if (!enemy || enemy.state === 'dead') return;
      const [px, py] = worldToMinimap(t.x, t.z);
      ctx.fillStyle = 'rgba(255,60,60,0.95)';
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  // Draw map objectives
  gameState.mapObjectives.forEach((obj) => {
    const [px, py] = worldToMinimap(obj.position.x, obj.position.z);
    const fog = fogGrid[py * MAP_SIZE + px];
    if (fog === 0) return;
    const color = obj.owner === 'player' ? 'rgba(90,200,255,0.95)' : obj.owner === 'enemy' ? 'rgba(255,110,90,0.95)' : 'rgba(245,215,120,0.95)';
    ctx.fillStyle = color;
    ctx.fillRect(px - 2, py - 2, 5, 5);
  });

  // Enemy faction base marker
  if (!gameState.enemyFaction.destroyed) {
    const [bx, by] = worldToMinimap(gameState.enemyFaction.basePosition.x, gameState.enemyFaction.basePosition.z);
    ctx.strokeStyle = 'rgba(255,80,80,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.stroke();
  }

  // Camera viewport indicator
  // We'll draw a small crosshair at world center (0,0) as placeholder
  // (actual camera pos would need to be passed via ref)
  const [cx, cy] = worldToMinimap(0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4); ctx.stroke();

  // Draw pings
  const nowMs = Date.now();
  const alivePings = pings.filter(p => nowMs - p.createdMs < p.durationMs);
  while (pings.length > alivePings.length) pings.shift();
  alivePings.forEach(p => {
    const [px, py] = worldToMinimap(p.wx, p.wz);
    const age = (nowMs - p.createdMs) / p.durationMs;
    const alpha = 1 - age;
    const pulse = 2 + Math.sin(nowMs * 0.01) * 1.5;
    ctx.strokeStyle = `rgba(255,80,80,${alpha * 0.9})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, pulse + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(255,150,50,${alpha})`;
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.icon, px, py - 4);
  });
}

interface MinimapProps {
  tick: number;
  onCameraMove?: (wx: number, wz: number) => void;
  embedded?: boolean;
}

export const Minimap: React.FC<MinimapProps> = ({ tick: _tick, onCameraMove, embedded = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Register camera move callback
  useEffect(() => {
    if (onCameraMove) setMinimapCameraMoveCallback(onCameraMove);
  }, [onCameraMove]);

  // Render loop
  useEffect(() => {
    function loop() {
      if (canvasRef.current) renderMinimap(canvasRef.current);
      animRef.current = requestAnimationFrame(loop);
    }
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const scaleX = MAP_SIZE / rect.width;
    const scaleY = MAP_SIZE / rect.height;
    const [wx, wz] = minimapToWorld(px * scaleX, py * scaleY);
    if (_cameraMoveCallback) _cameraMoveCallback(wx, wz);
    else if (onCameraMove) onCameraMove(wx, wz);
  }, [onCameraMove]);

  const handleRightClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const scaleX = MAP_SIZE / rect.width;
    const scaleY = MAP_SIZE / rect.height;
    const [wx, wz] = minimapToWorld(px * scaleX, py * scaleY);
    pushMinimapPing(wx, wz, '🚨', 4000);
  }, []);

  return (
    <div style={{
      position: 'relative',
      zIndex: embedded ? undefined : 260,
      display: 'flex',
      flexDirection: 'column',
      width: embedded ? '100%' : 160,
      maxWidth: embedded ? 230 : undefined,
      background: 'hsla(28, 25%, 6%, 0.97)',
      border: '1px solid hsl(38, 28%, 22%)',
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
      userSelect: 'none',
    }}>
      {/* Header */}
      <div style={{
        padding: '4px 8px',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1,
        color: 'hsl(42, 30%, 55%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid hsl(38, 20%, 16%)',
        flexShrink: 0,
      }}>
        <span>MINIMAP</span>
        <span style={{ fontSize: 7, color: 'hsl(42, 15%, 38%)', fontWeight: 400 }}>LClick: move · RClick: ping</span>
      </div>

      {/* Canvas — fills width, square */}
      <canvas
        ref={canvasRef}
        width={MAP_SIZE}
        height={MAP_SIZE}
        onClick={handleClick}
        onContextMenu={handleRightClick}
        style={{
          display: 'block',
          width: '100%',
          aspectRatio: '1 / 1',
          cursor: 'crosshair',
          flexShrink: 0,
        }}
      />

      {/* Legend */}
      <div style={{
        padding: '4px 8px',
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        borderTop: '1px solid hsl(38, 20%, 16%)',
        flexShrink: 0,
      }}>
        {[
          { color: 'rgba(220,220,255,0.85)', label: 'Citizens' },
          { color: 'rgba(80,200,80,0.85)',   label: 'Soldiers' },
          { color: 'rgba(255,60,60,0.95)',   label: 'Enemies' },
          { color: 'rgba(210,170,80,0.85)',  label: 'Buildings' },
          { color: 'rgba(245,215,120,0.95)', label: 'Objectives' },
          { color: 'rgba(80,200,220,0.9)',   label: 'Boats' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 7, color: 'hsl(42, 15%, 46%)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Minimap;
