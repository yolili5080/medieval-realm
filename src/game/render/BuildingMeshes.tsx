import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { BuildingType } from '../core/EventBus';
import { BUILDING_DEFS } from '../data/buildings';

interface BuildingMeshProps {
  type: BuildingType;
  state?: string;
  selected?: boolean;
  opacity?: number;
}

const gltfUrl = (fileName: string) => new URL(`../../../glTF/${fileName}`, import.meta.url).href;

const BUILDING_MODEL_MAP: Partial<Record<BuildingType, string>> = {
  town_center: 'TownCenter_FirstAge_Level1.gltf',
  house: 'Houses_FirstAge_1_Level1.gltf',
  storage_barn: 'Storage_FirstAge_Level1.gltf',
  woodcutter_hut: 'Houses_FirstAge_2_Level1.gltf',
  farm_field: 'Farm_FirstAge_Level1_Wheat.gltf',
  quarry: 'Mine.gltf',
  barracks: 'Barracks_FirstAge_Level1.gltf',
  tower: 'WatchTower_FirstAge_Level1.gltf',
  smithy: 'Market_FirstAge_Level1.gltf',
  guard_post: 'WatchTower_FirstAge_Level1.gltf',
  market: 'Market_FirstAge_Level1.gltf',
  stronghold: 'Wonder_FirstAge_Level1.gltf',
  dock: 'Dock_FirstAge.gltf',
};

Object.values(BUILDING_MODEL_MAP).forEach((file) => {
  if (file) useGLTF.preload(gltfUrl(file));
});

const selectionMat = new THREE.MeshStandardMaterial({
  color: 0xffcc44,
  emissive: 0xffaa00,
  emissiveIntensity: 0.5,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});

const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x7f6c58, roughness: 0.9, metalness: 0.05 });

const GltfBuildingModel: React.FC<{ type: BuildingType; opacity: number }> = ({ type, opacity }) => {
  const file = BUILDING_MODEL_MAP[type];
  if (!file) {
    const def = BUILDING_DEFS[type];
    return (
      <mesh castShadow receiveShadow>
        <boxGeometry args={[def.footprintX, 2.2, def.footprintZ]} />
        <primitive object={fallbackMat} attach="material" />
      </mesh>
    );
  }

  const def = BUILDING_DEFS[type];
  const gltf = useGLTF(gltfUrl(file));

  const model = useMemo(() => {
    const root = (gltf.scene as THREE.Object3D).clone(true);

    // Normalize origin to center-on-ground and fit footprint scale.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    root.position.set(-center.x, -box.min.y, -center.z);

    const sx = def.footprintX / Math.max(0.01, size.x);
    const sz = def.footprintZ / Math.max(0.01, size.z);
    const uniformScale = Math.min(sx, sz) * (type === 'guard_post' ? 0.55 : 0.95);
    root.scale.setScalar(Number.isFinite(uniformScale) ? uniformScale : 1);

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => {
          const cloned = m.clone();
          cloned.depthWrite = true;
          return cloned;
        });
      } else if (mesh.material) {
        mesh.material = mesh.material.clone();
        mesh.material.depthWrite = true;
      }
    });

    return root;
  }, [def.footprintX, def.footprintZ, gltf.scene, type]);

  useEffect(() => {
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      const applyOpacity = (mat: THREE.Material) => {
        const m = mat as THREE.Material & { transparent?: boolean; opacity?: number };
        m.transparent = opacity < 0.999;
        m.opacity = opacity;
      };

      if (Array.isArray(mesh.material)) mesh.material.forEach(applyOpacity);
      else if (mesh.material) applyOpacity(mesh.material);
    });
  }, [model, opacity]);

  return <primitive object={model} />;
};

export const BuildingMesh: React.FC<BuildingMeshProps> = ({ type, selected, opacity = 1.0 }) => {
  const def = BUILDING_DEFS[type];
  const radius = Math.max(def.footprintX, def.footprintZ) * 0.58;

  return (
    <group>
      <GltfBuildingModel type={type} opacity={opacity} />
      {selected && (
        <mesh position={[0, 0.05, 0]} material={selectionMat}>
          <cylinderGeometry args={[radius, radius, 0.05, 32]} />
        </mesh>
      )}
    </group>
  );
};
