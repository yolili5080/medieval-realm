// ──────────────────────────────────────────────
//  ResourceNodeLabels
//  Floating HTML badges for resource nodes:
//    - Level badge (1–5 based on distance from origin)
//    - Procedurally named "camp" label
//  Positioned via worldToScreen projection
// ──────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { gameState } from '../core/GameState';

// Name generation
const ADJECTIVES = [
  'Ancient', 'Dense', 'Hidden', 'Mossy', 'Shadowed', 'Twisted',
  'Forgotten', 'Silent', 'Gnarled', 'Sunken', 'Rugged', 'Windswept',
  'Overgrown', 'Crumbling', 'Towering', 'Jagged', 'Murky', 'Storied',
  'Weathered', 'Lonesome',
];

const WOOD_NOUNS = [
  'Lumber Camp', 'Forest Grove', 'Timber Stand', 'Woodlands',
  'Copse', 'Tree Line', 'Loggers\' Rest', 'Birch Run',
];

const STONE_NOUNS = [
  'Stone Quarry', 'Rock Formation', 'Outcrop', 'Boulder Field',
  'Quarry Site', 'Gravel Pit', 'Granite Ridge', 'Stoneworkers\' Haul',
];

// Seeded prng
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Compute node level from distance (farther = higher level, 1–5)
function computeNodeLevel(wx: number, wz: number): number {
  const dist = Math.sqrt(wx * wx + wz * wz);
  if (dist < 15) return 1;
  if (dist < 30) return 2;
  if (dist < 50) return 3;
  if (dist < 70) return 4;
  return 5;
}

// Generate camp name for a node position
function generateCampName(wx: number, wz: number, resourceType: 'wood' | 'stone'): string {
  const seed = Math.floor(wx * 17 + wz * 31 + 1000);
  const rng = seededRng(seed);
  const adj = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
  const nouns = resourceType === 'wood' ? WOOD_NOUNS : STONE_NOUNS;
  const noun = nouns[Math.floor(rng() * nouns.length)];
  return `${adj} ${noun}`;
}

// worldToScreen helper
function worldToScreen(
  wx: number, wy: number, wz: number,
  camera: THREE.Camera,
  canvasEl: HTMLCanvasElement
): { x: number; y: number; behind: boolean } {
  const vec = new THREE.Vector3(wx, wy, wz);
  vec.project(camera);
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: (vec.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-vec.y * 0.5 + 0.5) * rect.height + rect.top,
    behind: vec.z > 1,
  };
}

// ── Inner component that reads camera and renders HTML badges ──────────────

interface NodeBadgeData {
  id: number;
  wx: number; wy: number; wz: number;
  level: number;
  name: string;
  resourceType: 'wood' | 'stone';
  amount: number;
  depleted: boolean;
}

const NodeLabelsInner: React.FC<{ tick: number }> = ({ tick: _tick }) => {
  const { camera, gl } = useThree();
  const [badges, setBadges] = useState<NodeBadgeData[]>([]);
  const [positions, setPositions] = useState<Array<{ x: number; y: number; behind: boolean }>>([]);
  const frameCount = useRef(0);

  // Rebuild badge list from gameState (throttled)
  useEffect(() => {
    const result: NodeBadgeData[] = [];
    gameState.resourceNodes.forEach((node, id) => {
      if (node.resourceType !== 'wood' && node.resourceType !== 'stone') return;
      const t = gameState.transforms.get(id);
      if (!t) return;
      const level = computeNodeLevel(t.x, t.z);
      const name = generateCampName(t.x, t.z, node.resourceType);
      result.push({
        id, wx: t.x, wy: t.y + 2.2, wz: t.z,
        level, name,
        resourceType: node.resourceType,
        amount: node.amount,
        depleted: node.depleted,
      });
    });
    setBadges(result);
  }, []);

  // Update screen positions every 3 frames
  useFrame(() => {
    frameCount.current++;
    if (frameCount.current % 3 !== 0) return;
    const canvas = gl.domElement;
    const newPositions = badges.map(b =>
      worldToScreen(b.wx, b.wy, b.wz, camera, canvas)
    );
    setPositions(newPositions);
  });

  // Camera distance for LOD
  const [camDist, setCamDist] = useState(30);
  useFrame(() => {
    setCamDist(camera.position.length());
  });

  if (camDist > 60) return null; // hide when very far zoomed out

  return (
    <>
      {badges.map((badge, i) => {
        const pos = positions[i];
        if (!pos || pos.behind) return null;
        // Hide depleted nodes' names but still show level badge
        const iconColor = badge.resourceType === 'wood' ? 'hsl(30 55% 45%)' : 'hsl(210 20% 55%)';
        const bgColor = badge.resourceType === 'wood' ? 'hsla(28,30%,8%,0.92)' : 'hsla(210,20%,8%,0.92)';
        const borderColor = badge.resourceType === 'wood' ? 'hsl(30 40% 28%)' : 'hsl(210 20% 28%)';
        const levelGlow = badge.level >= 4 ? `0 0 6px ${iconColor}` : 'none';

        return (
          <div
            key={badge.id}
            style={{
              position: 'fixed',
              left: pos.x,
              top: pos.y,
              transform: 'translate(-50%, -100%)',
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              zIndex: 50,
              opacity: badge.depleted ? 0.4 : 1,
            }}
          >
            {/* Level badge */}
            <div style={{
              background: bgColor,
              border: `1px solid ${borderColor}`,
              borderRadius: 10,
              padding: '1px 5px',
              fontSize: 9,
              fontWeight: 700,
              color: iconColor,
              boxShadow: levelGlow,
              letterSpacing: '0.05em',
            }}>
              {badge.resourceType === 'wood' ? '🌲' : '⛰️'} Lv.{badge.level}
            </div>
            {/* Camp name — only show at mid zoom */}
            {camDist < 45 && !badge.depleted && (
              <div style={{
                fontSize: 8,
                color: 'hsl(42 15% 48%)',
                background: 'hsla(28,20%,6%,0.8)',
                padding: '1px 4px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
                border: '1px solid hsl(38 12% 16%)',
              }}>
                {badge.name}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};

// Wrapper that uses a portal to render HTML outside the canvas
const ResourceNodeLabels: React.FC<{ tick: number }> = ({ tick }) => {
  return <NodeLabelsInner tick={tick} />;
};

export default ResourceNodeLabels;
export { computeNodeLevel, generateCampName };
