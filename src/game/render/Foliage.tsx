import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { gameState } from '../core/GameState';

type ScatterItem = {
  key: string;
  asset: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
};

const gltfUrl = (fileName: string) => new URL(`../../../glTF/${fileName}`, import.meta.url).href;

const TREE_ASSETS = [
  'Resource_Tree1.gltf',
  'Resource_Tree2.gltf',
  'Resource_PineTree.gltf',
  'Resource_Tree_Group.gltf',
  'Resource_PineTree_Group.gltf',
] as const;

const ROCK_ASSETS = [
  'Resource_Rock_1.gltf',
  'Resource_Rock_2.gltf',
  'Resource_Rock_3.gltf',
  'Rock.gltf',
  'Rock_Group.gltf',
] as const;

const ASSET_SCALE: Record<string, number> = {
  'Resource_Tree1.gltf': 3.4,
  'Resource_Tree2.gltf': 3.6,
  'Resource_PineTree.gltf': 5.6,
  'Resource_Tree_Group.gltf': 3.2,
  'Resource_PineTree_Group.gltf': 4.8,
  'Resource_Rock_1.gltf': 4.2,
  'Resource_Rock_2.gltf': 4.4,
  'Resource_Rock_3.gltf': 4.0,
  'Rock.gltf': 3.6,
  'Rock_Group.gltf': 3.5,
};

[...TREE_ASSETS, ...ROCK_ASSETS].forEach((f) => useGLTF.preload(gltfUrl(f)));

function hash01(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453123;
  return x - Math.floor(x);
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[Math.floor(hash01(seed) * arr.length) % arr.length];
}

const ScatterInstances: React.FC<{ items: ScatterItem[] }> = ({ items }) => {
  const tree1 = useGLTF(gltfUrl('Resource_Tree1.gltf'));
  const tree2 = useGLTF(gltfUrl('Resource_Tree2.gltf'));
  const pine = useGLTF(gltfUrl('Resource_PineTree.gltf'));
  const treeGroup = useGLTF(gltfUrl('Resource_Tree_Group.gltf'));
  const pineGroup = useGLTF(gltfUrl('Resource_PineTree_Group.gltf'));

  const rock1 = useGLTF(gltfUrl('Resource_Rock_1.gltf'));
  const rock2 = useGLTF(gltfUrl('Resource_Rock_2.gltf'));
  const rock3 = useGLTF(gltfUrl('Resource_Rock_3.gltf'));
  const rock = useGLTF(gltfUrl('Rock.gltf'));
  const rockGroup = useGLTF(gltfUrl('Rock_Group.gltf'));

  const sceneMap: Record<string, THREE.Object3D> = useMemo(
    () => ({
      'Resource_Tree1.gltf': tree1.scene,
      'Resource_Tree2.gltf': tree2.scene,
      'Resource_PineTree.gltf': pine.scene,
      'Resource_Tree_Group.gltf': treeGroup.scene,
      'Resource_PineTree_Group.gltf': pineGroup.scene,
      'Resource_Rock_1.gltf': rock1.scene,
      'Resource_Rock_2.gltf': rock2.scene,
      'Resource_Rock_3.gltf': rock3.scene,
      'Rock.gltf': rock.scene,
      'Rock_Group.gltf': rockGroup.scene,
    }),
    [tree1.scene, tree2.scene, pine.scene, treeGroup.scene, pineGroup.scene, rock1.scene, rock2.scene, rock3.scene, rock.scene, rockGroup.scene]
  );

  const prepared = useMemo(() => {
    return items
      .map((item) => {
        const base = sceneMap[item.asset];
        if (!base) return null;
        const obj = base.clone(true);
        obj.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = true;
        });

        return {
          ...item,
          object: obj,
          finalScale: item.scale * (ASSET_SCALE[item.asset] ?? 1),
        };
      })
      .filter((x): x is ScatterItem & { object: THREE.Object3D; finalScale: number } => x !== null);
  }, [items, sceneMap]);

  return (
    <group>
      {prepared.map((item) => (
        <primitive
          key={item.key}
          object={item.object}
          position={item.position}
          rotation={[0, item.rotationY, 0]}
          scale={item.finalScale}
        />
      ))}
    </group>
  );
};

export const InstancedForest: React.FC = () => {
  const items = useMemo(() => {
    const out: ScatterItem[] = [];

    gameState.resourceNodes.forEach((node, id) => {
      if (node.resourceType !== 'wood') return;
      const t = gameState.transforms.get(id);
      if (!t) return;

      const seed = id * 11.73 + 0.17;
      const cluster = 1; // Keep visual exactly aligned with gameplay resource node.

      for (let i = 0; i < cluster; i++) {
        const offsSeed = seed + i * 13.7;
        const x = t.x;
        const z = t.z;
        const y = t.y;
        const asset = pick(TREE_ASSETS, offsSeed + 4.2);

        out.push({
          key: `wood-${id}-${i}`,
          asset,
          position: [x, y, z],
          rotationY: hash01(offsSeed + 2.3) * Math.PI * 2,
          scale: 1.0 + hash01(offsSeed + 5.8) * 0.45,
        });
      }
    });

    return out;
  }, []);

  if (items.length === 0) return null;
  return <ScatterInstances items={items} />;
};

export const StoneOutcrops: React.FC = () => {
  const items = useMemo(() => {
    const out: ScatterItem[] = [];

    gameState.resourceNodes.forEach((node, id) => {
      if (node.resourceType !== 'stone') return;
      const t = gameState.transforms.get(id);
      if (!t) return;

      const seed = id * 17.43 + 0.44;
      const cluster = hash01(seed + 0.8) > 0.65 ? 2 : 1; // mostly 1 rock outcrop per node

      for (let i = 0; i < cluster; i++) {
        const offsSeed = seed + i * 7.1;
        const angle = hash01(offsSeed + 1.93) * Math.PI * 2;
        const radius = cluster === 1 ? 0 : 0.25 + hash01(offsSeed + 2.61) * 0.85;
        const x = t.x + Math.cos(angle) * radius;
        const z = t.z + Math.sin(angle) * radius;
        const y = t.y;
        const asset = pick(ROCK_ASSETS, offsSeed + 8.5);

        out.push({
          key: `stone-${id}-${i}`,
          asset,
          position: [x, y, z],
          rotationY: hash01(offsSeed + 3.2) * Math.PI * 2,
          scale: 0.95 + hash01(offsSeed + 4.2) * 0.55,
        });
      }
    });

    return out;
  }, []);

  if (items.length === 0) return null;
  return <ScatterInstances items={items} />;
};
