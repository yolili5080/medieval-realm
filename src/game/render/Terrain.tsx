import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fbm, getTerrainHeight, valueNoise } from '../core/Noise';
import { gameState } from '../core/GameState';

export const TERRAIN_SIZE = 400;
const SEGMENTS = 200;

function slopeAt(normals: THREE.BufferAttribute, i: number): number {
  const ny = normals.getY(i);
  return 1.0 - Math.abs(ny);
}

function buildTerrainGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const positions = geo.attributes.position as THREE.BufferAttribute;
  const count = positions.count;

  for (let i = 0; i < count; i++) {
    const wx = positions.getX(i);
    const wz = positions.getZ(i);
    const nx = wx / 80;
    const nz = wz / 80;
    const base = fbm(nx, nz, 6, 42);
    const dist = Math.sqrt(wx * wx + wz * wz) / 180;
    const hillShape = Math.max(0, dist - 0.18) * 2;
    let height = base * 8 + hillShape * 6;

    if (wz > 100) {
      const slopeFactor = Math.min(1.0, (wz - 100) / 60);
      height = height * (1 - slopeFactor) + (-0.5) * slopeFactor;
    }

    positions.setY(i, height);
  }

  geo.computeVertexNormals();

  const normals = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const height = positions.getY(i);
    const wx = positions.getX(i);
    const wz = positions.getZ(i);

    const macro = valueNoise(wx * 0.012, wz * 0.012, 77);
    const micro = valueNoise(wx * 0.22, wz * 0.22, 33) * 0.55
      + valueNoise(wx * 0.55, wz * 0.55, 55) * 0.25;
    const n = micro;
    const slope = slopeAt(normals, i);

    const gR = 0.18 + n * 0.09, gG = 0.35 + n * 0.12, gB = 0.10 + n * 0.04;
    const dR = 0.36 + n * 0.08, dG = 0.25 + n * 0.05, dB = 0.13 + n * 0.03;
    const rR = 0.40 + n * 0.06, rG = 0.38 + n * 0.05, rB = 0.36 + n * 0.05;
    const sR = 0.55 + n * 0.05, sG = 0.46 + n * 0.04, sB = 0.28 + n * 0.03;

    const sandW = Math.max(0, 1.0 - (height - 0.2 + macro * 1.5) / 1.0);
    const grassW = Math.max(0, Math.min(1.0, (height + 0.5) / 1.5))
      * Math.max(0, 1.0 - slope / 0.45);
    const dirtW = Math.max(0, Math.min(1.0, (height - 0.8) / 2.0))
      * Math.max(0, 1.0 - slope / 0.6)
      * (0.4 + macro * 0.6);
    const rockW = Math.min(1.0, slope / 0.35 + Math.max(0, (height - 5.0) / 3.0) * 0.7);

    const total = sandW + grassW + dirtW + rockW + 0.001;
    const sw = sandW / total;
    const gw = grassW / total;
    const dw = dirtW / total;
    const rw = rockW / total;

    let r = sR * sw + gR * gw + dR * dw + rR * rw;
    let g = sG * sw + gG * gw + dG * dw + rG * rw;
    let b = sB * sw + gB * gw + dB * dw + rB * rw;

    if (height < 0) {
      const ao = 1.0 - Math.min(0.3, -height * 0.06);
      r *= ao; g *= ao; b *= ao;
    }

    colors[i * 3] = Math.min(1, Math.max(0, r));
    colors[i * 3 + 1] = Math.min(1, Math.max(0, g));
    colors[i * 3 + 2] = Math.min(1, Math.max(0, b));
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function createTerrainDetailTextures(): {
  albedo: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  normal: THREE.DataTexture;
} {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  if (!colorCtx) {
    throw new Error('Failed to create terrain detail canvas context.');
  }

  const roughnessCanvas = document.createElement('canvas');
  roughnessCanvas.width = size;
  roughnessCanvas.height = size;
  const roughCtx = roughnessCanvas.getContext('2d');
  if (!roughCtx) {
    throw new Error('Failed to create roughness canvas context.');
  }

  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const h = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n1 = valueNoise(x * 0.08, y * 0.08, 71);
      const n2 = valueNoise(x * 0.24, y * 0.24, 87);
      const n3 = valueNoise(x * 0.5, y * 0.5, 113);
      const m = n1 * 0.6 + n2 * 0.3 + n3 * 0.1;
      h[y * size + x] = m;

      const r = 78 + m * 30 + n3 * 12;
      const g = 103 + m * 40 + n2 * 14;
      const b = 55 + m * 22;
      const i = (y * size + x) * 4;
      colorImg.data[i] = Math.min(255, Math.max(0, Math.round(r)));
      colorImg.data[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
      colorImg.data[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
      colorImg.data[i + 3] = 255;

      const rough = 170 + (1 - m) * 52;
      roughImg.data[i] = rough;
      roughImg.data[i + 1] = rough;
      roughImg.data[i + 2] = rough;
      roughImg.data[i + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const normalData = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const dx = h[y * size + xp] - h[y * size + xm];
      const dy = h[yp * size + x] - h[ym * size + x];
      const nx = -dx * 2.2;
      const ny = 1.0;
      const nz = -dy * 2.2;
      const inv = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      const nxx = nx * inv;
      const nyy = ny * inv;
      const nzz = nz * inv;
      const i = (y * size + x) * 4;
      normalData[i] = Math.round((nxx * 0.5 + 0.5) * 255);
      normalData[i + 1] = Math.round((nyy * 0.5 + 0.5) * 255);
      normalData[i + 2] = Math.round((nzz * 0.5 + 0.5) * 255);
      normalData[i + 3] = 255;
    }
  }

  const albedo = new THREE.CanvasTexture(colorCanvas);
  const roughness = new THREE.CanvasTexture(roughnessCanvas);
  const normal = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);

  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.repeat.set(60, 60);
  albedo.colorSpace = THREE.SRGBColorSpace;

  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.repeat.set(60, 60);
  roughness.colorSpace = THREE.NoColorSpace;

  normal.wrapS = THREE.RepeatWrapping;
  normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(60, 60);
  normal.colorSpace = THREE.NoColorSpace;
  normal.needsUpdate = true;

  albedo.needsUpdate = true;
  roughness.needsUpdate = true;

  return { albedo, roughness, normal };
}

const TerrainGrass: React.FC = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);

  const bladeGeometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.16, 1.05, 1, 4);
    g.translate(0, 0.52, 0);
    return g;
  }, []);

  const { matrices, count } = useMemo(() => {
    const tier = gameState.graphics.qualityTier;
    const target = tier === 'ultra' ? 5500 : tier === 'high' ? 3200 : tier === 'medium' ? 1800 : 0;
    const out: THREE.Matrix4[] = [];
    if (target === 0) return { matrices: out, count: 0 };

    const d = new THREE.Object3D();
    let i = 0;
    let attempts = 0;
    while (i < target && attempts < target * 4) {
      attempts++;
      const x = -135 + Math.random() * 270;
      const z = -120 + Math.random() * 240;
      const y = getTerrainHeight(x, z);
      if (y < 0.25 || z > 118) continue;

      const hX = getTerrainHeight(x + 1.1, z);
      const hZ = getTerrainHeight(x, z + 1.1);
      const slope = Math.abs(hX - y) + Math.abs(hZ - y);
      if (slope > 0.95) continue;

      d.position.set(x, y + 0.02, z);
      d.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.08);
      const s = 0.85 + Math.random() * 0.7;
      d.scale.set(s, s * (0.9 + Math.random() * 0.4), s);
      d.updateMatrix();
      out.push(d.matrix.clone());
      i++;
    }

    return { matrices: out, count: out.length };
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#6e9e46'),
      roughness: 0.98,
      metalness: 0.0,
      side: THREE.DoubleSide,
      dithering: true,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      materialRef.current = mat;
      (mat.userData as { shader?: { uniforms: Record<string, { value: number }> } }).shader = shader as { uniforms: Record<string, { value: number }> };

      shader.vertexShader = `
uniform float uTime;
varying float vBladeY;
${shader.vertexShader}
`;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
#include <begin_vertex>
vBladeY = uv.y;
#ifdef USE_INSTANCING
  vec3 ipos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 ipos = vec3(0.0);
#endif
float bend = vBladeY * vBladeY;
float gust = sin(uTime * 1.45 + ipos.x * 0.21 + ipos.z * 0.17);
transformed.x += sin(uTime * 1.9 + ipos.x * 0.26 + ipos.z * 0.22) * 0.16 * bend;
transformed.z += cos(uTime * 1.55 + ipos.x * 0.17 - ipos.z * 0.28 + gust * 0.5) * 0.11 * bend;
`
      );

      shader.fragmentShader = `
varying float vBladeY;
${shader.fragmentShader}
`;
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `
vec3 baseTint = vec3(0.34, 0.50, 0.20);
vec3 tipTint = vec3(0.57, 0.73, 0.33);
vec3 grad = mix(baseTint, tipTint, clamp(vBladeY, 0.0, 1.0));
vec4 diffuseColor = vec4(diffuse * grad, opacity);
`
      );
    };

    return mat;
  }, []);

  useEffect(() => {
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      meshRef.current.setMatrixAt(i, matrices[i]);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.frustumCulled = false;
  }, [count, matrices]);

  useFrame((state) => {
    const shader = (material.userData as { shader?: { uniforms: Record<string, { value: number }> } }).shader;
    if (!shader) return;
    shader.uniforms.uTime.value = state.clock.elapsedTime;
  });

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[bladeGeometry, material, count]}
      castShadow={false}
      receiveShadow={false}
      renderOrder={1}
    />
  );
};

const TerrainMesh: React.FC = () => {
  const geo = useMemo(() => buildTerrainGeometry(), []);
  const textures = useMemo(() => createTerrainDetailTextures(), []);

  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: textures.albedo,
    roughnessMap: textures.roughness,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.18,
  }), [textures]);

  useEffect(() => {
    const aniso = Math.max(1, gameState.graphics.anisotropy);
    textures.albedo.anisotropy = aniso;
    textures.roughness.anisotropy = aniso;
    textures.normal.anisotropy = aniso;
  }, [textures]);

  return (
    <group>
      <mesh geometry={geo} material={mat} receiveShadow castShadow />
      <TerrainGrass />
    </group>
  );
};

export const DirtPaths: React.FC = () => null;
export default TerrainMesh;
