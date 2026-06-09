// ──────────────────────────────────────────────
//  SoldierMesh & EnemyMesh – military unit renders
// ──────────────────────────────────────────────

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SoldierComponent, EnemyComponent } from '../core/MilitaryTypes';

// ── Shared materials ────────────────────────────────────────────────────────

const SKIN      = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.8 });
const SKIN_DARK = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });
const ENEMY_TOR = new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.9 });
const ENEMY_LEG = new THREE.MeshStandardMaterial({ color: 0x4a1a1a, roughness: 0.9 });
const SPEAR_MAT = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8 });
const SWORD_MAT = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.4, metalness: 0.8 });
const KNIGHT_TOR= new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: 0.5, metalness: 0.4 });
const HELM_MAT  = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, roughness: 0.4, metalness: 0.8 });
const ARCHER_TOR= new THREE.MeshStandardMaterial({ color: 0x2d4a2d, roughness: 0.9 });
const SWORD_TOR = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.9 });
const SPEAR_TOR = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.9 });
const SELECTION = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00aa44, emissiveIntensity: 0.6, transparent: true, opacity: 0.55 });
const ENEMY_SEL = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xaa0000, emissiveIntensity: 0.5, transparent: true, opacity: 0.45 });

// ── HP bar helper ────────────────────────────────────────────────────────────

const HpBar: React.FC<{ hp: number; maxHp: number; yOffset?: number }> = ({ hp, maxHp, yOffset = 2.2 }) => {
  const ratio = Math.max(0, hp / maxHp);
  const col = ratio > 0.6 ? 0x44cc44 : ratio > 0.3 ? 0xffaa00 : 0xff3333;
  return (
    <group position={[0, yOffset, 0]}>
      {/* Background track */}
      <mesh>
        <boxGeometry args={[0.7, 0.08, 0.04]} />
        <meshBasicMaterial color={0x111111} />
      </mesh>
      {/* Fill — shift left so fill grows from left */}
      <mesh position={[(ratio - 1) * 0.35, 0, 0.01]}>
        <boxGeometry args={[0.7 * ratio, 0.07, 0.05]} />
        <meshBasicMaterial color={col} />
      </mesh>
    </group>
  );
};

// ── Soldier Mesh ─────────────────────────────────────────────────────────────

interface SoldierMeshProps {
  soldier: SoldierComponent;
  selected?: boolean;
  animOffset?: number;
}

export const SoldierMesh: React.FC<SoldierMeshProps> = ({ soldier, selected, animOffset = 0 }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime + animOffset;
    if (soldier.state === 'engaging' || soldier.state === 'patrolling') {
      groupRef.current.position.y = Math.abs(Math.sin(t * 5)) * 0.07;
    } else if (soldier.state === 'attacking') {
      groupRef.current.rotation.z = Math.sin(t * 10) * 0.18;
    } else {
      groupRef.current.position.y = 0;
      groupRef.current.rotation.z = 0;
    }
  });

  const { soldierType, hp, maxHp } = soldier;

  // Pick torso material by unit type
  const torsoMat =
    soldierType === 'knight'   ? KNIGHT_TOR :
    soldierType === 'archer'   ? ARCHER_TOR :
    soldierType === 'swordsman'? SWORD_TOR  : SPEAR_TOR;

  return (
    <group ref={groupRef} scale={[1, 1.15, 1]}>
      {/* HP bar */}
      <HpBar hp={hp} maxHp={maxHp} yOffset={2.0} />

      {/* Legs */}
      <mesh position={[-0.09, 0.33, 0]} castShadow material={SPEAR_TOR}>
        <boxGeometry args={[0.14, 0.65, 0.16]} />
      </mesh>
      <mesh position={[0.09, 0.33, 0]} castShadow material={SPEAR_TOR}>
        <boxGeometry args={[0.14, 0.65, 0.16]} />
      </mesh>

      {/* Torso */}
      <mesh position={[0, 0.85, 0]} castShadow material={torsoMat}>
        <boxGeometry args={[0.36, 0.48, 0.24]} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.25, 0]} castShadow material={SKIN}>
        <boxGeometry args={[0.24, 0.24, 0.24]} />
      </mesh>

      {/* Knight helmet */}
      {soldierType === 'knight' && (
        <mesh position={[0, 1.35, 0]} castShadow material={HELM_MAT}>
          <sphereGeometry args={[0.16, 8, 6]} />
        </mesh>
      )}

      {/* Spearman: spear held vertically at right side */}
      {soldierType === 'spearman' && (
        <mesh position={[0.3, 0.9, 0]} castShadow material={SPEAR_MAT}>
          <cylinderGeometry args={[0.025, 0.025, 1.6, 6]} />
        </mesh>
      )}

      {/* Swordsman / Knight: sword at hip */}
      {(soldierType === 'swordsman' || soldierType === 'knight') && (
        <mesh position={[0.28, 0.7, 0.04]} rotation={[0, 0, Math.PI / 2.5]} castShadow material={SWORD_MAT}>
          <boxGeometry args={[0.06, 0.45, 0.015]} />
        </mesh>
      )}

      {/* Archer: bow arc on back */}
      {soldierType === 'archer' && (
        <mesh position={[-0.22, 0.9, 0]} rotation={[Math.PI / 2, 0, 0.4]} castShadow material={SPEAR_MAT}>
          <torusGeometry args={[0.22, 0.025, 6, 12, Math.PI]} />
        </mesh>
      )}

      {/* Selection indicator */}
      {selected && (
        <mesh position={[0, 0.02, 0]} material={SELECTION}>
          <cylinderGeometry args={[0.5, 0.5, 0.04, 16]} />
        </mesh>
      )}
    </group>
  );
};

// ── Enemy Mesh ───────────────────────────────────────────────────────────────

interface EnemyMeshProps {
  enemy: EnemyComponent;
}

export const EnemyMesh: React.FC<EnemyMeshProps> = ({ enemy }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    if (enemy.state === 'marching' || enemy.state === 'attacking_building' || enemy.state === 'attacking_soldier') {
      groupRef.current.position.y = Math.abs(Math.sin(t * 5.5)) * 0.07;
    } else {
      groupRef.current.position.y = 0;
    }
  });

  const { hp, maxHp } = enemy;

  return (
    <group ref={groupRef}>
      <HpBar hp={hp} maxHp={maxHp} yOffset={2.0} />

      {/* Legs */}
      <mesh position={[-0.09, 0.33, 0]} castShadow material={ENEMY_LEG}>
        <boxGeometry args={[0.14, 0.65, 0.16]} />
      </mesh>
      <mesh position={[0.09, 0.33, 0]} castShadow material={ENEMY_LEG}>
        <boxGeometry args={[0.14, 0.65, 0.16]} />
      </mesh>

      {/* Torso */}
      <mesh position={[0, 0.85, 0]} castShadow material={ENEMY_TOR}>
        <boxGeometry args={[0.36, 0.48, 0.24]} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.25, 0]} castShadow material={SKIN_DARK}>
        <boxGeometry args={[0.24, 0.24, 0.24]} />
      </mesh>

      {/* Weapon: club / jagged axe */}
      <mesh position={[0.28, 0.85, 0.05]} rotation={[0, 0, -0.4]} castShadow material={SPEAR_MAT}>
        <boxGeometry args={[0.07, 0.45, 0.07]} />
      </mesh>

      {/* Enemy indicator ring — always red */}
      <mesh position={[0, 0.02, 0]} material={ENEMY_SEL}>
        <cylinderGeometry args={[0.5, 0.5, 0.04, 16]} />
      </mesh>
    </group>
  );
};
