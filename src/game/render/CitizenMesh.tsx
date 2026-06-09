// ──────────────────────────────────────────────
//  Citizen render component
//  Human-proportioned procedural character
//  with carry visual and walk bob
// ──────────────────────────────────────────────

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CitizenComponent } from '../core/Components';

const SKIN = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.8, metalness: 0.0 });
const CLOTH = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.95, metalness: 0.0 });
const CLOTH2 = new THREE.MeshStandardMaterial({ color: 0x7a5a2a, roughness: 0.92, metalness: 0.0 });
const HAIR = new THREE.MeshStandardMaterial({ color: 0x3a2810, roughness: 1.0, metalness: 0.0 });
const WOOD_MAT = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.88, metalness: 0.0 });
const SELECTED_MAT = new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 0.5, transparent: true, opacity: 0.6 });

interface CitizenMeshProps {
  citizen: CitizenComponent;
  selected?: boolean;
  animOffset?: number;
  carryType?: 'wood' | 'stone' | 'food' | null;
}

const STONE_CARRY_MAT = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.95, metalness: 0.05 });
const FOOD_CARRY_MAT = new THREE.MeshStandardMaterial({ color: 0xf0c040, roughness: 0.7, metalness: 0.0 });

const CitizenMesh: React.FC<CitizenMeshProps> = ({ citizen, selected, animOffset = 0, carryType }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime + animOffset;

    if (citizen.animState === 'walk' || citizen.animState === 'carry') {
      groupRef.current.position.y = Math.abs(Math.sin(t * 4)) * 0.06;
    } else if (citizen.animState === 'work') {
      groupRef.current.rotation.x = Math.sin(t * 4) * 0.15;
    } else if (citizen.animState === 'sleep') {
      groupRef.current.rotation.x = Math.PI / 3;
      groupRef.current.position.y = -0.4;
    } else {
      groupRef.current.position.y = 0;
      groupRef.current.rotation.x = 0;
    }
  });

  const isCarrying = citizen.animState === 'carry' || (carryType != null);

  return (
    <group ref={groupRef}>
      {/* Legs */}
      <mesh position={[-0.1, 0.35, 0]} castShadow material={CLOTH}>
        <boxGeometry args={[0.16, 0.7, 0.18]} />
      </mesh>
      <mesh position={[0.1, 0.35, 0]} castShadow material={CLOTH}>
        <boxGeometry args={[0.16, 0.7, 0.18]} />
      </mesh>
      {/* Torso */}
      <mesh position={[0, 0.9, 0]} castShadow material={CLOTH2}>
        <boxGeometry args={[0.38, 0.5, 0.26]} />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.27, 0.84, 0]} castShadow material={CLOTH}>
        <boxGeometry args={[0.12, 0.44, 0.14]} />
      </mesh>
      <mesh position={[0.27, 0.84, 0]} castShadow material={CLOTH}>
        <boxGeometry args={[0.12, 0.44, 0.14]} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.3, 0]} castShadow material={SKIN}>
        <boxGeometry args={[0.26, 0.26, 0.26]} />
      </mesh>
      {/* Hair */}
      <mesh position={[0, 1.45, 0]} castShadow material={HAIR}>
        <boxGeometry args={[0.28, 0.12, 0.28]} />
      </mesh>

      {/* Carry visual based on resource type */}
      {isCarrying && carryType === 'wood' && (
        <mesh position={[0.3, 1.0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={WOOD_MAT}>
          <cylinderGeometry args={[0.07, 0.07, 0.8, 6]} />
        </mesh>
      )}
      {isCarrying && carryType === 'stone' && (
        <mesh position={[0.3, 1.05, 0]} castShadow material={STONE_CARRY_MAT}>
          <dodecahedronGeometry args={[0.15, 0]} />
        </mesh>
      )}
      {isCarrying && carryType === 'food' && (
        <mesh position={[0.3, 1.05, 0]} castShadow material={FOOD_CARRY_MAT}>
          <boxGeometry args={[0.18, 0.12, 0.18]} />
        </mesh>
      )}

      {/* Selection ring */}
      {selected && (
        <mesh position={[0, 0.01, 0]} material={SELECTED_MAT}>
          <cylinderGeometry args={[0.5, 0.5, 0.04, 16]} />
        </mesh>
      )}
    </group>
  );
};

export default CitizenMesh;
