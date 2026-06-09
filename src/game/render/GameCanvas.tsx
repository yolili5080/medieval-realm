// ──────────────────────────────────────────────
//  Main 3D Scene – all render layers assembled
//  PBR lighting, postprocessing, RTS camera
//  Day/night ambient changes, construction ghosts
// ──────────────────────────────────────────────

import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, useGLTF } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, SSAO, DepthOfField, Noise, BrightnessContrast } from '@react-three/postprocessing';
import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import TerrainMesh from './Terrain';
import { InstancedForest, StoneOutcrops } from './Foliage';
import { BuildingMesh } from './BuildingMeshes';
import CitizenMesh from './CitizenMesh';
import { SoldierMesh, EnemyMesh } from './SoldierMesh';
import { gameState } from '../core/GameState';
import { placeBuilding } from '../systems/BuildingPlacementSystem';
import { EventBus } from '../core/EventBus';
import { getTerrainHeight } from '../core/Noise';
import { commandState, cancelToSelection, exitCommandMode } from '../core/CommandState';
import { setPath } from '../systems/JobSystem';
import { getBuildingLevel, buildingUpgradeTimers } from '../systems/BuildingUpgradeSystem';
import { BUILDING_DEFS } from '../data/buildings';
import OceanSurface from './OceanSurface';
import { applyRendererConfig, createSceneFog, RENDER_BUDGETS } from './RendererConfig';
import PlayerCharacter from './PlayerCharacter';

interface CanvasErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class CanvasErrorBoundary extends React.Component<React.PropsWithChildren, CanvasErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): CanvasErrorBoundaryState {
    const message = error instanceof Error ? error.message : 'Unknown rendering error';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error('CanvasErrorBoundary caught render error:', message);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rts-render-fallback">
          <h3>Graphics Initialization Failed</h3>
          <p>WebGL could not be started in this environment.</p>
          <p className="detail">{this.state.message}</p>
          <p className="detail">Try enabling hardware acceleration or running outside a sandboxed browser profile.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function detectWebGLSupport(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    if (gl2) return true;
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}

// ── Spherical Orbit RTS Camera ────────────────────────────────────────────────

const WORLD_HALF = 185;
const DRAG_THRESHOLD = 6; // px — single source of truth

interface CamState {
  targetX: number;
  targetZ: number;
  azimuth: number;
  elevation: number;
  distance: number;
  velX: number;
  velZ: number;
}

const cam: CamState = {
  targetX: 0, targetZ: 0,
  azimuth: Math.PI * 0.25,
  elevation: 0.8, distance: 30,
  velX: 0, velZ: 0,
};

// Shared input state — read by ClickHandler to know if right-drag happened
export const inputState = {
  rightDragDistance: 0,
  rightDown: false,
};

const RTSCamera: React.FC = () => {
  const { camera, gl } = useThree();
  const keys = useRef<Set<string>>(new Set());
  const dragMode = useRef<'none' | 'pan' | 'rotate'>('none');
  const lastMouse = useRef({ x: 0, y: 0 });
  const rightDownPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== undefined) { pc.fov = 45; pc.updateProjectionMatrix(); }
  }, [camera]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.distance = THREE.MathUtils.clamp(cam.distance + e.deltaY * 0.05, 8, 120);
    };

    const onMouseDown = (e: MouseEvent) => {
      lastMouse.current = { x: e.clientX, y: e.clientY };
      if (e.button === 2) {
        dragMode.current = 'pan';
        rightDownPos.current = { x: e.clientX, y: e.clientY };
        inputState.rightDown = true;
        inputState.rightDragDistance = 0;
        e.preventDefault();
      } else if (e.button === 1) {
        dragMode.current = 'rotate';
        e.preventDefault();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        dragMode.current = 'none';
        inputState.rightDown = false;
      } else if (e.button === 1) {
        dragMode.current = 'none';
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };

      if (inputState.rightDown) {
        const totalDx = e.clientX - rightDownPos.current.x;
        const totalDy = e.clientY - rightDownPos.current.y;
        inputState.rightDragDistance = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
      }

      if (dragMode.current === 'pan' && inputState.rightDragDistance > DRAG_THRESHOLD) {
        const sensitivity = cam.distance * 0.003;
        const rightX = Math.cos(cam.azimuth);
        const rightZ = -Math.sin(cam.azimuth);
        const fwdX = -Math.sin(cam.azimuth);
        const fwdZ = -Math.cos(cam.azimuth);
        cam.targetX -= dx * sensitivity * rightX;
        cam.targetZ -= dx * sensitivity * rightZ;
        cam.targetX += dy * sensitivity * fwdX;
        cam.targetZ += dy * sensitivity * fwdZ;
        cam.targetX = THREE.MathUtils.clamp(cam.targetX, -WORLD_HALF, WORLD_HALF);
        cam.targetZ = THREE.MathUtils.clamp(cam.targetZ, -WORLD_HALF, WORLD_HALF);
        document.body.style.cursor = 'grabbing';
      } else if (dragMode.current === 'rotate') {
        cam.azimuth -= dx * 0.005;
        cam.elevation += dy * 0.005;
        cam.elevation = THREE.MathUtils.clamp(cam.elevation, 0.3, 1.2);
      }
    };

    const onMouseUpWindow = (e: MouseEvent) => {
      if (e.button === 2) {
        if (document.body.style.cursor === 'grabbing') document.body.style.cursor = '';
      }
    };

    const onKeyDown = (e: KeyboardEvent) => keys.current.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mouseup', onMouseUpWindow);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mouseup', onMouseUpWindow);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gl, camera]);

  useFrame((_, delta) => {
    const k = keys.current;
    const panSpeed = cam.distance * 0.8 * delta;

    // WASD/Arrow panning — moves target in camera-relative horizontal directions
    const fwdX = -Math.sin(cam.azimuth);
    const fwdZ = -Math.cos(cam.azimuth);
    const rightX = Math.cos(cam.azimuth);
    const rightZ = -Math.sin(cam.azimuth);

    let moveX = 0;
    let moveZ = 0;
    if (k.has('KeyW') || k.has('ArrowUp'))    { moveX += fwdX; moveZ += fwdZ; }
    if (k.has('KeyS') || k.has('ArrowDown'))  { moveX -= fwdX; moveZ -= fwdZ; }
    if (k.has('KeyA') || k.has('ArrowLeft'))  { moveX -= rightX; moveZ -= rightZ; }
    if (k.has('KeyD') || k.has('ArrowRight')) { moveX += rightX; moveZ += rightZ; }

    cam.velX += moveX * panSpeed;
    cam.velZ += moveZ * panSpeed;

    const damping = Math.exp(-8 * delta);
    cam.velX *= damping;
    cam.velZ *= damping;
    if (Math.abs(cam.velX) < 0.001) cam.velX = 0;
    if (Math.abs(cam.velZ) < 0.001) cam.velZ = 0;

    cam.targetX = THREE.MathUtils.clamp(cam.targetX + cam.velX, -WORLD_HALF, WORLD_HALF);
    cam.targetZ = THREE.MathUtils.clamp(cam.targetZ + cam.velZ, -WORLD_HALF, WORLD_HALF);

    // Ground clamp target Y
    const groundY = getTerrainHeight(cam.targetX, cam.targetZ);
    const targetY = Math.max(groundY, 0);

    // Spherical to Cartesian
    const sinEl = Math.sin(cam.elevation);
    const cosEl = Math.cos(cam.elevation);
    const sinAz = Math.sin(cam.azimuth);
    const cosAz = Math.cos(cam.azimuth);

    const camX = cam.targetX + cam.distance * sinEl * sinAz;
    const camY = targetY + cam.distance * cosEl;
    const camZ = cam.targetZ + cam.distance * sinEl * cosAz;

    // Enforce minimum camera height above terrain
    const terrainUnderCam = getTerrainHeight(camX, camZ) + 2.0;
    const finalCamY = Math.max(camY, terrainUnderCam);

    camera.position.set(camX, finalCamY, camZ);
    camera.lookAt(cam.targetX, targetY, cam.targetZ);
  });

  return null;
};

const CascadeShadows: React.FC = () => {
  const { scene, camera } = useThree();
  const csmRef = useRef<CSM | null>(null);

  useEffect(() => {
    const cascades = gameState.graphics.qualityTier === 'ultra' ? 4 : 3;
    csmRef.current = new CSM({
      camera: camera as THREE.PerspectiveCamera,
      parent: scene,
      cascades,
      mode: 'practical',
      maxFar: 420,
      shadowMapSize: 2048,
      lightDirection: new THREE.Vector3(-0.6, -1, -0.45).normalize(),
      lightIntensity: 1.25,
      shadowBias: -0.0005,
    });
    csmRef.current?.lights?.forEach((light) => light.color.set(0xfff8e7));
    return () => {
      csmRef.current?.remove();
      csmRef.current?.dispose();
      csmRef.current = null;
    };
  }, [camera, scene]);

  useFrame(() => {
    csmRef.current?.update();
  });

  return null;
};

const RenderMetricsCollector: React.FC<{ setStatsVisible: React.Dispatch<React.SetStateAction<boolean>> }> = ({ setStatsVisible }) => {
  const { gl } = useThree();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F10') setStatsVisible((v) => !v);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setStatsVisible]);

  useFrame((_, delta) => {
    const frameMs = delta * 1000;
    const drawCalls = gl.info.render.calls;
    const triangles = gl.info.render.triangles;
    const postMs = gameState.graphics.ao || gameState.graphics.bloom || gameState.graphics.dof ? frameMs * 0.16 : 0;
    const cpuMs = frameMs * 0.32;
    const gpuMs = Math.max(0, frameMs - cpuMs);

    gameState.renderMetrics.frameMs = frameMs;
    gameState.renderMetrics.cpuMs = cpuMs;
    gameState.renderMetrics.gpuMs = gpuMs;
    gameState.renderMetrics.drawCalls = drawCalls;
    gameState.renderMetrics.triangles = triangles;
    gameState.renderMetrics.postMs = postMs;
  });

  return null;
};

// ── Day/Night Lighting ────────────────────────────────────────────────────────

const DayNightLighting: React.FC<{ tick: number }> = ({ tick }) => {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);

  useFrame(() => {
    const { hour, minute } = gameState.gameTime;
    const t = hour + minute / 60;

    let ambInt: number, sunInt: number;
    let ambCol: THREE.Color, sunCol: THREE.Color;

    if (t >= 6 && t < 18) {
      // Daytime
      const dayT = (t - 6) / 12;
      sunInt = 1.5 + Math.sin(dayT * Math.PI) * 0.8;
      ambInt = 0.4;
      sunCol = new THREE.Color(t < 9 || t > 16 ? 0xffd4a0 : 0xfff8e7);
      ambCol = new THREE.Color(0xd4e8ff);
    } else if (t >= 18 && t < 21) {
      // Dusk transition
      const duskT = (t - 18) / 3;
      sunInt = THREE.MathUtils.lerp(1.5, 0.15, duskT);
      ambInt = THREE.MathUtils.lerp(0.4, 0.25, duskT);
      sunCol = new THREE.Color().lerpColors(new THREE.Color(0xff8844), new THREE.Color(0x8899cc), duskT);
      ambCol = new THREE.Color().lerpColors(new THREE.Color(0xd4e8ff), new THREE.Color(0x334466), duskT);
    } else if (t >= 21 || t < 5) {
      // Night — NOT pitch black, use moonlight
      sunInt = 0.15;
      ambInt = 0.25;
      sunCol = new THREE.Color(0x8899cc);
      ambCol = new THREE.Color(0x334466);
    } else {
      // Dawn (5–6)
      const dawnT = (t - 5) / 1;
      sunInt = THREE.MathUtils.lerp(0.15, 1.5, dawnT);
      ambInt = THREE.MathUtils.lerp(0.25, 0.4, dawnT);
      sunCol = new THREE.Color().lerpColors(new THREE.Color(0x8899cc), new THREE.Color(0xffd4a0), dawnT);
      ambCol = new THREE.Color().lerpColors(new THREE.Color(0x334466), new THREE.Color(0xd4e8ff), dawnT);
    }

    if (ambientRef.current) {
      ambientRef.current.intensity = ambInt;
      ambientRef.current.color.copy(ambCol);
    }
    if (sunRef.current) {
      sunRef.current.intensity = sunInt;
      sunRef.current.color.copy(sunCol);
      const angle = ((t - 6) / 15) * Math.PI;
      sunRef.current.position.set(Math.cos(angle) * 80, Math.sin(angle) * 80 + 5, 40);
      sunRef.current.shadow.camera.updateProjectionMatrix();
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.4} color={0xd4e8ff} />
      {/* Main sun light - shadows handled by CSM, this is lighting only */}
      <directionalLight
        ref={sunRef}
        position={[60, 80, 40]}
        intensity={2.2}
        color={0xfff8e7}
        castShadow={false}
      />
      {/* Hemisphere for sky/ground bounce */}
      <hemisphereLight args={[0x87ceeb, 0x8b6914, 0.4]} />
      {/* Cool fill from opposite side */}
      <directionalLight ref={fillRef} position={[-40, 30, -40]} intensity={0.4} color={0xd0e8ff} />
    </>
  );
};

// ── Buildings Layer ───────────────────────────────────────────────────────────

const BuildingsLayer: React.FC<{ tick: number }> = ({ tick }) => {
  const buildings = gameState.buildings.toArray();
  const { hour } = gameState.gameTime;
  const isNight = hour >= 21 || hour < 6;
  const isDusk = hour >= 18 && hour < 21;
  const windowIntensity = isNight ? 0.9 : isDusk ? 0.45 : 0.08;
  const WINDOW_BUILDINGS = new Set(['house', 'town_center', 'barracks', 'market', 'smithy']);

  return (
    <group>
      {buildings.map(([id, b]) => {
        const t = gameState.transforms.get(id);
        if (!t) return null;
        const sel = gameState.selectables.get(id);
        const opacity = b.state === 'under_construction' ? 0.4 + (b.constructionProgress / 100) * 0.6 : 1.0;

        const maxHp = 200;
        const currentHp = gameState.military.buildingHp.get(id);
        const hpRatio = currentHp !== undefined ? currentHp / maxHp : 1.0;

        // Footprint size estimate for AO disc
        const footprintR = b.type === 'town_center' ? 4 : b.type === 'barracks' ? 3.5 : b.type === 'stronghold' ? 5 : 2.5;

        // Level-based scale
        const level = getBuildingLevel(id);
        const levelScale = b.state === 'active' ? (0.92 + level * 0.08) : 1.0;
        const upgrading = buildingUpgradeTimers.has(id);

        return (
          <group key={id} position={[t.x, t.y, t.z]} rotation={[0, t.rotation, 0]} scale={levelScale}>
            {/* AO / contact shadow disc under building */}
            {b.state === 'active' && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015 / levelScale, 0]}>
                <circleGeometry args={[footprintR * 1.2, 20]} />
                <meshBasicMaterial color={0x000000} transparent opacity={0.22} depthWrite={false} />
              </mesh>
            )}

            {/* Construction scaffolding */}
            {b.state === 'under_construction' && (
              <>
                {[[-1.2,-1.2],[1.2,-1.2],[-1.2,1.2],[1.2,1.2]].map(([px,pz],i) => (
                  <mesh key={i} position={[px, (b.constructionProgress / 100) * 2, pz]}>
                    <cylinderGeometry args={[0.06, 0.06, (b.constructionProgress / 100) * 4, 5]} />
                    <meshStandardMaterial color={0x8b6914} roughness={0.9} />
                  </mesh>
                ))}
                {/* Crossbeam */}
                <mesh position={[0, (b.constructionProgress / 100) * 3.5, 0]}>
                  <boxGeometry args={[2.6, 0.06, 0.06]} />
                  <meshStandardMaterial color={0x7a5c10} roughness={0.9} />
                </mesh>
                <mesh position={[0, (b.constructionProgress / 100) * 3.5, 0]} rotation={[0, Math.PI / 2, 0]}>
                  <boxGeometry args={[2.6, 0.06, 0.06]} />
                  <meshStandardMaterial color={0x7a5c10} roughness={0.9} />
                </mesh>
              </>
            )}

            <BuildingMesh
              type={b.type}
              state={b.state}
              selected={sel?.isSelected}
              opacity={opacity}
            />

            {/* Window lights — glow at dusk/night */}
            {b.state === 'active' && WINDOW_BUILDINGS.has(b.type) && windowIntensity > 0.1 && (
              <>
                <pointLight
                  position={[0, 1.5, 0.8]}
                  color={0xffb060}
                  intensity={windowIntensity * 1.8}
                  distance={5}
                  decay={2}
                />
                {b.type === 'town_center' && (
                  <pointLight
                    position={[1.5, 2, 0]}
                    color={0xffaa40}
                    intensity={windowIntensity * 1.4}
                    distance={6}
                    decay={2}
                  />
                )}
                {/* Emissive window quad */}
                <mesh position={[0, 1.4, footprintR * 0.82]}>
                  <planeGeometry args={[0.3, 0.25]} />
                  <meshStandardMaterial
                    color={0xffcc70}
                    emissive={new THREE.Color(0xffcc70)}
                    emissiveIntensity={windowIntensity}
                    transparent
                    opacity={0.85}
                    depthWrite={false}
                  />
                </mesh>
              </>
            )}

            {/* Upgrade glow ring */}
            {upgrading && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
                <torusGeometry args={[footprintR * 1.1, 0.12, 6, 24]} />
                <meshBasicMaterial color={0xffd060} transparent opacity={0.6} depthWrite={false} />
              </mesh>
            )}

            {/* Construction progress bar */}
            {b.state === 'under_construction' && (
              <group position={[0, 4.5, 0]}>
                <mesh>
                  <boxGeometry args={[2.0, 0.12, 0.08]} />
                  <meshBasicMaterial color={0x1a1008} />
                </mesh>
                <mesh position={[(b.constructionProgress / 100 - 1) * 1.0, 0, 0.01]}>
                  <boxGeometry args={[2.0 * (b.constructionProgress / 100), 0.1, 0.09]} />
                  <meshBasicMaterial color={0xf4a020} />
                </mesh>
              </group>
            )}
            {/* Damage smoke indicator */}
            {hpRatio < 0.5 && currentHp !== undefined && (
              <group position={[0, 3.5, 0]}>
                {[0, 1, 2].map(i => (
                  <mesh key={i} position={[(i - 1) * 0.4, 0, 0]}>
                    <sphereGeometry args={[0.18, 5, 4]} />
                    <meshStandardMaterial color={hpRatio < 0.25 ? 0xff4400 : 0x555555} transparent opacity={0.55} />
                  </mesh>
                ))}
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
};


// ── Citizens Layer ────────────────────────────────────────────────────────────

// Job ring materials — created once
const JOB_RING_COLORS: Record<string, number> = {
  woodcutter: 0x4f86d9,
  quarryman:  0x5b92e5,
  farmer:     0x4a9ad1,
  builder:    0x61a3ea,
  hauler:     0x5c8fcb,
  idle:       0x4a7fd3,
};

const CitizensLayer: React.FC<{ tick: number }> = ({ tick }) => {
  const citizens = gameState.citizens.toArray();
  return (
    <group>
      {citizens.map(([id, cit], idx) => {
        const t = gameState.transforms.get(id);
        if (!t) return null;
        const sel = gameState.selectables.get(id);
        const inv = gameState.inventories.get(id);
        const job = gameState.jobs.get(id);
        const isSelected = sel?.isSelected ?? false;
        const jobColor = isSelected ? 0xffd060 : (JOB_RING_COLORS[job?.jobType ?? 'idle'] ?? 0x4466aa);

        return (
          <group key={id} position={[t.x, t.y, t.z]} rotation={[0, t.rotation, 0]}>
            {/* Job indicator ring on ground */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <torusGeometry args={[0.45, isSelected ? 0.07 : 0.04, 6, 16]} />
              <meshBasicMaterial color={jobColor} transparent opacity={isSelected ? 0.95 : 0.7} depthWrite={false} />
            </mesh>
            <CitizenMesh
              citizen={cit}
              selected={isSelected}
              animOffset={idx * 0.4}
              carryType={inv?.carryType ?? null}
            />
          </group>
        );
      })}
    </group>
  );
};

const EnemyWorkersLayer: React.FC<{ tick: number }> = ({ tick: _tick }) => {
  const workers = Array.from(gameState.enemyFaction.workerEntities.values());
  return (
    <group>
      {workers.map((w, idx) => {
        const fakeCitizen = {
          name: 'Enemy Worker',
          age: 25,
          happiness: 50,
          homeId: null,
          workplaceId: null,
          animState: (w.state === 'gathering' || w.state === 'building') ? 'work' : (w.state === 'returning' || w.state === 'moving_to_resource' || w.state === 'moving_to_build') ? 'walk' : 'idle',
          wanderSeed: 0.4 + ((w.id % 5) * 0.1),
          baseSpeed: w.speed,
        } as const;

        return (
          <group key={w.id} position={[w.x, w.y, w.z]} rotation={[0, w.rotation, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <torusGeometry args={[0.42, 0.04, 6, 16]} />
              <meshBasicMaterial color={0xff7045} transparent opacity={0.72} depthWrite={false} />
            </mesh>
            <CitizenMesh
              citizen={fakeCitizen as any}
              selected={false}
              animOffset={idx * 0.25}
              carryType={w.carryType}
            />
          </group>
        );
      })}
    </group>
  );
};

// ── Soldiers Layer ────────────────────────────────────────────────────────────

const SoldiersLayer: React.FC<{ tick: number }> = ({ tick }) => {
  const { military } = gameState;
  const soldiers = Array.from(military.soldiers.entries());
  return (
    <group>
      {soldiers.map(([id, s], idx) => {
        const t = military.soldierTransforms.get(id);
        if (!t || s.state === 'dead') return null;
        const isSelected = military.selectedSoldierId === id || !!s.selected;
        return (
          <group key={id} position={[t.x, t.y, t.z]} rotation={[0, t.rotation, 0]}>
            <SoldierMesh soldier={s} selected={isSelected} animOffset={idx * 0.3} />
          </group>
        );
      })}
    </group>
  );
};

// ── Enemies Layer ─────────────────────────────────────────────────────────────

const EnemiesLayer: React.FC<{ tick: number }> = ({ tick }) => {
  const { military } = gameState;
  const enemies = Array.from(military.enemies.entries());
  return (
    <group>
      {enemies.map(([id, e]) => {
        const t = military.enemyTransforms.get(id);
        if (!t || e.state === 'dead') return null;
        return (
          <group key={id} position={[t.x, t.y, t.z]} rotation={[0, t.rotation, 0]}>
            <EnemyMesh enemy={e} />
          </group>
        );
      })}
    </group>
  );
};


// ── Build Ghost ────────────────────────────────────────────────────────────────

const BuildGhost: React.FC<{ buildMode: string | null }> = ({ buildMode }) => {
  const { camera, gl } = useThree();
  const [pos, setPos] = useState<[number, number, number]>([0, 0, 0]);
  const [valid, setValid] = useState(true);
  const timeRef = useRef(0);
  const footprintRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (footprintRef.current) {
      const mat = footprintRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.3 + Math.sin(timeRef.current * 3) * 0.1;
    }
  });

  useEffect(() => {
    if (!buildMode) return;
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const mouseVec = new THREE.Vector2();
    const worldPos = new THREE.Vector3();

    const onMove = (e: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      mouseVec.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouseVec, camera);
      raycaster.ray.intersectPlane(plane, worldPos);
      setPos([worldPos.x, worldPos.y, worldPos.z]);

      // Check validity: not too close to other buildings
      let tooClose = false;
      gameState.buildings.forEach((b, id) => {
        const t = gameState.transforms.get(id);
        if (!t) return;
        const d = Math.sqrt((t.x - worldPos.x) ** 2 + (t.z - worldPos.z) ** 2);
        if (d < 4) tooClose = true;
      });
      setValid(!tooClose);
    };

    gl.domElement.addEventListener('mousemove', onMove);
    return () => gl.domElement.removeEventListener('mousemove', onMove);
  }, [buildMode, camera, gl]);

  if (!buildMode) return null;

  const def = BUILDING_DEFS[buildMode as keyof typeof BUILDING_DEFS];
  const footprintR = def ? Math.max(def.footprintX, def.footprintZ) / 2 + 0.5 : 2.5;
  const ghostColor = valid ? 0x44aaff : 0xff3322;
  const footprintColor = valid ? 0x00ff44 : 0xff2200;

  return (
    <group position={pos}>
      {/* Footprint disc */}
      <mesh ref={footprintRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[footprintR, 32]} />
        <meshBasicMaterial color={footprintColor} transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Ghost ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <torusGeometry args={[footprintR, 0.08, 6, 32]} />
        <meshBasicMaterial color={ghostColor} transparent opacity={0.7} depthWrite={false} />
      </mesh>
      {/* Ghost building box — semi-transparent with color tint */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[footprintR * 1.4, 3, footprintR * 1.4]} />
        <meshStandardMaterial
          color={ghostColor}
          transparent
          opacity={0.28}
          depthWrite={false}
          wireframe={false}
        />
      </mesh>
      {/* Wireframe outline */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[footprintR * 1.4, 3, footprintR * 1.4]} />
        <meshBasicMaterial color={ghostColor} transparent opacity={0.55} wireframe depthWrite={false} />
      </mesh>
    </group>
  );
};

// ── Waypoint Marker ───────────────────────────────────────────────────────────

interface MoveMarker {
  id: number;
  x: number;
  y: number;
  z: number;
  normal: THREE.Vector3;
  bornAt: number;
  lifeMs: number;
}

function sampleGroundNormal(x: number, z: number): THREE.Vector3 {
  const eps = 0.55;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  const n = new THREE.Vector3(hL - hR, 2 * eps, hD - hU);
  return n.normalize();
}

const MoveCommandMarkers: React.FC = () => {
  const [markers, setMarkers] = useState<MoveMarker[]>([]);
  const idRef = useRef(1);

  useEffect(() => {
    const unsub = EventBus.on('MoveCommandIssued', ({ x, z }) => {
      const y = getTerrainHeight(x, z) + 0.09;
      const normal = sampleGroundNormal(x, z);
      setMarkers((prev) => [
        ...prev,
        {
          id: idRef.current++,
          x, y, z, normal,
          bornAt: performance.now(),
          lifeMs: 950 + Math.random() * 220,
        },
      ]);
    });
    return unsub;
  }, []);

  useFrame(() => {
    if (markers.length === 0) return;
    const now = performance.now();
    setMarkers((prev) => prev.filter((m) => now - m.bornAt <= m.lifeMs));
  });

  if (markers.length === 0) return null;
  return (
    <group>
      {markers.map((m) => (
        <MoveCommandMarker key={m.id} marker={m} />
      ))}
    </group>
  );
};

const MoveCommandMarker: React.FC<{ marker: MoveMarker }> = ({ marker }) => {
  const g = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const tickRefs = useRef<THREE.Mesh[]>([]);
  const quat = React.useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), marker.normal),
    [marker.normal]
  );

  useFrame(() => {
    if (!g.current) return;
    const age = performance.now() - marker.bornAt;
    const t = THREE.MathUtils.clamp(age / marker.lifeMs, 0, 1);
    const pulse = 0.78 + Math.sin(t * Math.PI) * 0.28;
    const fade = 1 - t;
    g.current.scale.setScalar(pulse);
    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.78 * fade;
    }
    tickRefs.current.forEach((mesh) => {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.92 * fade;
    });
  });

  const assignTickRef = (mesh: THREE.Mesh | null) => {
    if (!mesh) return;
    if (!tickRefs.current.includes(mesh)) tickRefs.current.push(mesh);
  };

  return (
    <group ref={g} position={[marker.x, marker.y, marker.z]} quaternion={quat} renderOrder={60}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.78, 1.02, 42]} />
        <meshBasicMaterial color={0xc9a34a} transparent opacity={0.8} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((a, i) => (
        <group key={i} rotation={[0, a, 0]} position={[0, 0.01, 0]}>
          <mesh ref={assignTickRef} position={[0, 0, -1.08]}>
            <boxGeometry args={[0.06, 0.01, 0.32]} />
            <meshBasicMaterial color={0xf2d07b} transparent opacity={0.95} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
          <mesh ref={assignTickRef} position={[0.16, 0, -0.92]}>
            <boxGeometry args={[0.06, 0.01, 0.2]} />
            <meshBasicMaterial color={0xf2d07b} transparent opacity={0.95} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
          <mesh ref={assignTickRef} position={[-0.16, 0, -0.92]}>
            <boxGeometry args={[0.06, 0.01, 0.2]} />
            <meshBasicMaterial color={0xf2d07b} transparent opacity={0.95} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// ── Box Select Overlay ────────────────────────────────────────────────────────

// Create a persistent box-select div in the DOM (outside React)
let boxSelectEl: HTMLDivElement | null = null;
function getBoxSelectEl(): HTMLDivElement {
  if (!boxSelectEl) {
    boxSelectEl = document.createElement('div');
    boxSelectEl.style.cssText = `
      position:fixed;border:1px solid hsl(120 80% 60%);
      background:hsla(120,60%,40%,0.12);pointer-events:none;
      display:none;z-index:800;
      box-shadow:inset 0 0 0 1px hsla(120,80%,60%,0.3);
    `;
    document.body.appendChild(boxSelectEl);
  }
  return boxSelectEl;
}

function showBoxSelect(sx: number, sy: number, ex: number, ey: number) {
  const el = getBoxSelectEl();
  const left   = Math.min(sx, ex);
  const top    = Math.min(sy, ey);
  const width  = Math.abs(ex - sx);
  const height = Math.abs(ey - sy);
  el.style.display = 'block';
  el.style.left    = left   + 'px';
  el.style.top     = top    + 'px';
  el.style.width   = width  + 'px';
  el.style.height  = height + 'px';
}

function hideBoxSelect() {
  getBoxSelectEl().style.display = 'none';
}

function worldToScreen(
  worldPos: THREE.Vector3,
  camera: THREE.Camera,
  canvasEl: HTMLCanvasElement
): { x: number; y: number } {
  const projected = worldPos.clone().project(camera);
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: (projected.x *  0.5 + 0.5) * rect.width  + rect.left,
    y: (projected.y * -0.5 + 0.5) * rect.height + rect.top,
  };
}

// ── Click Handler ─────────────────────────────────────────────────────────────

interface ClickHandlerProps {
  buildMode: string | null;
  onBuildPlaced: () => void;
  onRightClick: (e: MouseEvent, worldX: number, worldZ: number) => void;
  onMultiSelect: (ids: number[]) => void;
}

const ClickHandler: React.FC<ClickHandlerProps> = ({ buildMode, onBuildPlaced, onRightClick, onMultiSelect }) => {
  const { camera, gl } = useThree();
  const leftDownPos = useRef({ x: 0, y: 0 });
  const leftDragDist = useRef(0);
  const isBoxSelecting = useRef(false);

  // Escape cancels command mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (commandState.mode !== 'none' &&
            commandState.mode !== 'selected_citizen' &&
            commandState.mode !== 'selected_soldier') {
          cancelToSelection();
        } else {
          exitCommandMode();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const mouseVec = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const worldPos = new THREE.Vector3();

    const getWorldPos = (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      mouseVec.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouseVec, camera);
      raycaster.ray.intersectPlane(plane, worldPos);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      leftDownPos.current = { x: e.clientX, y: e.clientY };
      leftDragDist.current = 0;
      isBoxSelecting.current = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!(e.buttons & 1)) return; // left button not held
      const dx = e.clientX - leftDownPos.current.x;
      const dy = e.clientY - leftDownPos.current.y;
      leftDragDist.current = Math.sqrt(dx * dx + dy * dy);

      if (leftDragDist.current > DRAG_THRESHOLD) {
        isBoxSelecting.current = true;
        showBoxSelect(leftDownPos.current.x, leftDownPos.current.y, e.clientX, e.clientY);
      }
    };

    const finalizeBoxSelection = (endX: number, endY: number) => {
      const sx = leftDownPos.current.x, sy = leftDownPos.current.y;
      const left   = Math.min(sx, endX), right  = Math.max(sx, endX);
      const top    = Math.min(sy, endY), bottom = Math.max(sy, endY);
      if ((right - left) < 10 || (bottom - top) < 10) return;

      const selectedIds: number[] = [];

      gameState.citizens.forEach((_, citizenId) => {
        const t = gameState.transforms.get(citizenId);
        if (!t) return;
        const screen = worldToScreen(new THREE.Vector3(t.x, t.y + 0.8, t.z), camera, gl.domElement);
        if (screen.x >= left && screen.x <= right && screen.y >= top && screen.y <= bottom) {
          selectedIds.push(citizenId);
        }
      });

      gameState.military.soldiers.forEach((s, soldierId) => {
        if (s.state === 'dead') return;
        const t = gameState.military.soldierTransforms.get(soldierId);
        if (!t) return;
        const screen = worldToScreen(new THREE.Vector3(t.x, t.y + 0.8, t.z), camera, gl.domElement);
        if (screen.x >= left && screen.x <= right && screen.y >= top && screen.y <= bottom) {
          selectedIds.push(soldierId);
        }
      });

      if (selectedIds.length > 0) {
        onMultiSelect(selectedIds);
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;

      if (isBoxSelecting.current) {
        finalizeBoxSelection(e.clientX, e.clientY);
        hideBoxSelect();
        isBoxSelecting.current = false;
        leftDragDist.current = 0;
        return;
      }

      // Was a drag but below threshold — treat as click
      if (buildMode) {
        getWorldPos(e.clientX, e.clientY);
        placeBuilding(buildMode as any, worldPos.x, worldPos.z);
        onBuildPlaced();
        return;
      }

      getWorldPos(e.clientX, e.clientY);

      // ── Command mode handling ─────────────────────────────────────────
      const mode = commandState.mode;

      if (mode === 'awaiting_move_target') {
        const entityId = commandState.selectedEntityId!;
        EventBus.emit('MoveCommandIssued', { x: worldPos.x, z: worldPos.z });
        if (commandState.selectedEntityType === 'citizen') {
          setPath(entityId, worldPos.x, worldPos.z);
          const lj = gameState.jobs.get(entityId);
          if (lj) lj.actionState = 'moving_to_resource';
          const cit = gameState.citizens.get(entityId);
          if (cit) cit.animState = 'walk';
        } else if (commandState.selectedEntityType === 'soldier') {
          const soldier = gameState.military.soldiers.get(entityId);
          const st = gameState.military.soldierTransforms.get(entityId);
          if (soldier && st) {
            soldier.patrolWaypoints = [{ x: st.x, z: st.z }, { x: worldPos.x, z: worldPos.z }];
            soldier.patrolIndex = 0;
            soldier.state = 'patrolling';
          }
        }
        cancelToSelection();
        return;
      }

      if (mode === 'awaiting_attack_target') {
        const soldierId = commandState.selectedEntityId!;
        let nearestEnemyId: number | null = null;
        let nearestDist = 6;
        gameState.military.enemies.forEach((enemy, enemyId) => {
          if (enemy.state === 'dead') return;
          const et = gameState.military.enemyTransforms.get(enemyId);
          if (!et) return;
          const d = Math.sqrt((et.x - worldPos.x) ** 2 + (et.z - worldPos.z) ** 2);
          if (d < nearestDist) { nearestDist = d; nearestEnemyId = enemyId; }
        });
        if (nearestEnemyId !== null) {
          const soldier = gameState.military.soldiers.get(soldierId);
          if (soldier) { soldier.targetEnemyId = nearestEnemyId; soldier.state = 'engaging'; }
        }
        cancelToSelection();
        return;
      }

      if (mode === 'awaiting_work_target') {
        const citizenId = commandState.selectedEntityId!;
        let nearestNodeId: number | null = null;
        let nearestDist = 6;
        gameState.resourceNodes.forEach((node, nodeId) => {
          if (node.depleted || node.amount <= 0) return;
          const nt = gameState.transforms.get(nodeId);
          if (!nt) return;
          const d = Math.sqrt((nt.x - worldPos.x) ** 2 + (nt.z - worldPos.z) ** 2);
          if (d < nearestDist) { nearestDist = d; nearestNodeId = nodeId; }
        });
        if (nearestNodeId !== null) {
          const node = gameState.resourceNodes.get(nearestNodeId)!;
          const nt = gameState.transforms.get(nearestNodeId)!;
          const lj = gameState.jobs.get(citizenId);
          if (lj) {
            const jobForResource = node.resourceType === 'wood' ? 'woodcutter' :
              node.resourceType === 'stone' ? 'quarryman' : 'farmer';
            lj.jobType = jobForResource as any;
            lj.actionState = 'moving_to_resource';
            lj.targetEntityId = nearestNodeId;
            lj.assignedBuildingId = null;
            setPath(citizenId, nt.x, nt.z);
            const cit = gameState.citizens.get(citizenId);
            if (cit) cit.animState = 'walk';
          }
        }
        cancelToSelection();
        return;
      }

      // ── Normal selection ──────────────────────────────────────────────
      const hits: Array<{ id: number; dist: number; isSoldier?: boolean }> = [];

      gameState.selectables.forEach((_, id) => {
        const t = gameState.transforms.get(id);
        if (!t) return;
        const d = Math.sqrt((t.x - worldPos.x) ** 2 + (t.z - worldPos.z) ** 2);
        if (d < 3.5) hits.push({ id, dist: d });
      });

      gameState.military.soldiers.forEach((s, sid) => {
        if (s.state === 'dead') return;
        const st = gameState.military.soldierTransforms.get(sid);
        if (!st) return;
        const d = Math.sqrt((st.x - worldPos.x) ** 2 + (st.z - worldPos.z) ** 2);
        if (d < 2.5) hits.push({ id: sid, dist: d, isSoldier: true });
      });

      gameState.selectables.forEach((sel) => { sel.isSelected = false; });

      if (hits.length > 0) {
        hits.sort((a, b) => a.dist - b.dist);
        const best = hits[0];
        if (best.isSoldier) {
          gameState.military.selectedSoldierId = best.id;
          EventBus.emit('SoldierSelected', { soldierId: best.id });
        } else {
          const sel = gameState.selectables.get(best.id);
          if (sel) sel.isSelected = true;
          gameState.selectedEntity = best.id;
          EventBus.emit('EntitySelected', { entityId: best.id });
        }
      } else {
        gameState.selectedEntity = null;
        gameState.military.selectedSoldierId = null;
        EventBus.emit('EntitySelected', { entityId: null });
        EventBus.emit('SoldierSelected', { soldierId: null });
      }
    };

    const onRightMouseUp = (e: MouseEvent) => {
      if (e.button !== 2) return;
      // Only fire context menu on clean right-click tap, not after a pan drag
      if (inputState.rightDragDistance > DRAG_THRESHOLD) return;
      getWorldPos(e.clientX, e.clientY);
      onRightClick(e, worldPos.x, worldPos.z);
    };

    const canvas = gl.domElement;
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mouseup', onRightMouseUp);
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mouseup', onRightMouseUp);
    };
  }, [camera, gl, buildMode, onBuildPlaced, onRightClick, onMultiSelect]);

  return <MoveCommandMarkers />;
};

// ── Sky that responds to time of day ─────────────────────────────────────────

const DynamicSky: React.FC<{ tick: number }> = ({ tick }) => {
  const { hour, minute } = gameState.gameTime;
  const timeOfDay = hour + minute / 60;
  const isNight = timeOfDay < 5 || timeOfDay >= 21;
  const isDusk = timeOfDay >= 17 && timeOfDay < 21;
  const isDawn = timeOfDay >= 5 && timeOfDay < 8;

  const inclination = isDusk || isDawn ? 0.51 : isNight ? 0.52 : 0.49;
  const turbidity = isDusk || isDawn ? 8 : isNight ? 12 : 4;
  const rayleigh = isNight ? 0.2 : isDusk || isDawn ? 2.5 : 0.8;

  const sunAngle = ((timeOfDay - 6) / 15) * Math.PI;
  const sunX = Math.cos(sunAngle) * 100;
  const sunY = isNight ? -20 : Math.sin(sunAngle) * 100;

  return (
    <Sky
      sunPosition={[sunX, sunY, 60]}
      inclination={inclination}
      azimuth={0.25}
      turbidity={turbidity}
      rayleigh={rayleigh}
      mieCoefficient={0.003}
      mieDirectionalG={0.8}
    />
  );
};

// ── Distant Mountains (visual depth only) ────────────────────────────────────

const DistantMountains: React.FC = () => {
  const mSingle = useGLTF(new URL('../../../glTF/Mountain_Single.gltf', import.meta.url).href);
  const mLarge = useGLTF(new URL('../../../glTF/MountainLarge_Single.gltf', import.meta.url).href);
  const mGroup1 = useGLTF(new URL('../../../glTF/Mountain_Group_1.gltf', import.meta.url).href);
  const mGroup2 = useGLTF(new URL('../../../glTF/Mountain_Group_2.gltf', import.meta.url).href);

  const mountains = React.useMemo(() => {
    const assets = [mSingle.scene, mLarge.scene, mGroup1.scene, mGroup2.scene];
    const group: Array<{ x: number; z: number; s: number; ry: number; obj: THREE.Object3D }> = [];
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.sin(i * 1.91) * 0.14);
      const r = 165 + (Math.sin(i * 3.7 + 1.2) * 0.5 + 0.5) * 35;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const s = 11 + (Math.sin(i * 2.3 + 0.5) * 0.5 + 0.5) * 5.5;
      const ry = (Math.sin(i * 5.1 + 0.8) * 0.5 + 0.5) * Math.PI * 2;
      const obj = assets[i % assets.length];
      group.push({ x, z, s, ry, obj });
    }
    return group;
  }, [mSingle.scene, mLarge.scene, mGroup1.scene, mGroup2.scene]);

  const mountainObjects = React.useMemo(() => {
    return mountains.map((m) => {
      const obj = m.obj.clone(true);
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;
      });
      return obj;
    });
  }, [mountains]);

  // Atmospheric haze band (flat ring low at horizon)
  const haze = React.useMemo(() => new THREE.RingGeometry(185, 280, 64), []);
  const hazeMat = React.useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xc4b8a0,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  return (
    <group>
      {/* Haze disc at horizon */}
      <mesh geometry={haze} material={hazeMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.5, 0]} renderOrder={-2} />
      {/* Scattered mountain glTF ring */}
      {mountains.map((m, i) => (
        <primitive
          key={i}
          object={mountainObjects[i]}
          position={[m.x, -12, m.z]}
          rotation={[0, m.ry, 0]}
          scale={m.s}
        />
      ))}
    </group>
  );
};

// ── Wall Layer ────────────────────────────────────────────────────────────────

// ── Wall Draw Handler ─────────────────────────────────────────────────────────

interface WallDrawHandlerProps {
  wallDrawMode: boolean;
  onWallDrawModeChange: (active: boolean) => void;
  onWallPlaced: (sx: number, sz: number, ex: number, ez: number) => void;
}

const WallDrawHandler: React.FC<WallDrawHandlerProps> = ({ wallDrawMode, onWallDrawModeChange, onWallPlaced }) => {
  const { camera, gl } = useThree();
  const firstPoint = useRef<{ x: number; z: number } | null>(null);
  const [previewLine, setPreviewLine] = useState<[number, number, number, number] | null>(null);

  useEffect(() => {
    if (!wallDrawMode) {
      firstPoint.current = null;
      setPreviewLine(null);
      return;
    }

    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const mouseVec = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const worldPos = new THREE.Vector3();

    const getTerrainPoint = (clientX: number, clientY: number): { x: number; z: number } | null => {
      const rect = canvas.getBoundingClientRect();
      mouseVec.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouseVec, camera);
      if (raycaster.ray.intersectPlane(plane, worldPos)) {
        return { x: worldPos.x, z: worldPos.z };
      }
      return null;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!firstPoint.current) return;
      const pt = getTerrainPoint(e.clientX, e.clientY);
      if (pt) setPreviewLine([firstPoint.current.x, firstPoint.current.z, pt.x, pt.z]);
    };

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const pt = getTerrainPoint(e.clientX, e.clientY);
      if (!pt) return;

      if (!firstPoint.current) {
        firstPoint.current = pt;
      } else {
        onWallPlaced(firstPoint.current.x, firstPoint.current.z, pt.x, pt.z);
        // Continue chaining — new first point = this end point
        firstPoint.current = pt;
        setPreviewLine(null);
      }
    };

    const onRightClick = (e: MouseEvent) => {
      e.preventDefault();
      firstPoint.current = null;
      setPreviewLine(null);
      onWallDrawModeChange(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        firstPoint.current = null;
        setPreviewLine(null);
        onWallDrawModeChange(false);
      }
    };

    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('contextmenu', onRightClick);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('contextmenu', onRightClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [wallDrawMode, camera, gl, onWallPlaced, onWallDrawModeChange]);

  if (!previewLine) return null;
  const [sx, sz, ex, ez] = previewLine;
  const midX = (sx + ex) / 2;
  const midZ = (sz + ez) / 2;
  const dx = ex - sx;
  const dz = ez - sz;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);

  return (
    <group position={[midX, 1.5, midZ]} rotation={[0, angle, 0]}>
      <mesh>
        <boxGeometry args={[0.6, 2.0, length]} />
        <meshStandardMaterial color={0xc8a020} transparent opacity={0.45} />
      </mesh>
    </group>
  );
};

// ── Walls Layer ────────────────────────────────────────────────────────────────
const WallsLayer: React.FC<{ tick: number }> = ({ tick }) => {

  const walls = gameState.walls;
  return (
    <group>
      {walls.map((seg) => {
        const dx = seg.endX - seg.startX;
        const dz = seg.endZ - seg.startZ;
        const length = Math.sqrt(dx * dx + dz * dz);
        if (length < 0.1) return null;
        const angle = Math.atan2(dx, dz);
        const midX = (seg.startX + seg.endX) / 2;
        const midZ = (seg.startZ + seg.endZ) / 2;
        const midY = getTerrainHeight(midX, midZ) + 1.25;
        const hpRatio = seg.hp / seg.maxHp;
        const wallColor = hpRatio > 0.6 ? 0x8a7a6a : hpRatio > 0.3 ? 0x6a5a4a : 0x4a3a2a;
        const meralonCount = Math.max(2, Math.floor(length / 1.5));

        return (
          <group key={seg.id} position={[midX, midY, midZ]} rotation={[0, angle, 0]}>
            {/* Main wall body */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.8, 2.5, length]} />
              <meshStandardMaterial color={wallColor} roughness={0.95} metalness={0} />
            </mesh>
            {/* Battlements */}
            {Array.from({ length: meralonCount }).map((_, i) => {
              const t = meralonCount > 1 ? (i / (meralonCount - 1) - 0.5) * length : 0;
              return (
                <mesh key={i} position={[0, 1.5, t]} castShadow>
                  <boxGeometry args={[0.4, 0.5, 0.4]} />
                  <meshStandardMaterial color={wallColor} roughness={0.95} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
};

// ── Main Scene ────────────────────────────────────────────────────────────────

interface SceneProps {
  tick: number;
  buildMode: string | null;
  onBuildPlaced: () => void;
  wallDrawMode: boolean;
  onWallDrawModeChange: (active: boolean) => void;
  onWallPlaced: (sx: number, sz: number, ex: number, ez: number) => void;
  onRightClick: (e: MouseEvent, worldX: number, worldZ: number) => void;
  onMultiSelect: (ids: number[]) => void;
  setStatsVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

// ── Premium Ocean Water ───────────────────────────────────────────────────────
// The plane is rotated -PI/2 on X. In local space:
//   local.x = world.x,  local.y = world.-z,  local.z = world.y (UP)
// So to displace vertices upward we must add to pos.z (local Z = world Y).
const WATER_VERT = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWaveY;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec3 pos = position;
    // pos.x = world X, pos.y = world -Z, pos.z = 0 (before displacement)
    float wx = pos.x;
    float wz = pos.y; // local Y = world -Z on rotated plane
    // Multi-octave wave — displace in local Z which = world Y (up)
    // abs() ensures wave never goes below base Y (prevents terrain clip-through)
    float wave =  abs(sin(wx * 0.14 + uTime * 1.2)) * 0.22
               +  abs(cos(wz * 0.12 + uTime * 0.95)) * 0.18
               +  abs(sin((wx - wz) * 0.09 + uTime * 0.65)) * 0.14
               +  abs(cos(wx * 0.22 - uTime * 1.5)) * 0.08
               +  abs(sin(wz * 0.18 + uTime * 0.8)) * 0.06;
    pos.z += wave; // always upward, never below base Y
    vWaveY = wave;
    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const WATER_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWaveY;
  varying vec3 vWorldPos;

  float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 74.3);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }

  void main() {
    // Depth-based color
    vec3 deepColor    = vec3(0.04, 0.11, 0.28);
    vec3 shallowColor = vec3(0.08, 0.35, 0.48);
    vec3 crestColor   = vec3(0.55, 0.80, 0.92);

    float depthBlend = clamp(vWaveY * 2.5 + 0.45, 0.0, 1.0);
    vec3 col = mix(deepColor, shallowColor, depthBlend);

    // Foam on crests
    float foam = smoothstep(0.10, 0.26, vWaveY);
    col = mix(col, crestColor, foam * 0.55);

    // Shoreline foam ring
    float edge = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0;
    float shore = smoothstep(0.36, 0.46, edge);
    float shoreFoam = shore * (0.35 + vnoise(vWorldPos.xz * 0.4 + uTime * 0.3) * 0.65);
    col = mix(col, vec3(0.85, 0.93, 0.97), shoreFoam * 0.65);

    // Caustic shimmer
    float n1 = vnoise(vWorldPos.xz * 0.32 + uTime * 0.55);
    float n2 = vnoise(vWorldPos.xz * 0.51 - uTime * 0.42);
    col += n1 * n2 * 0.055;

    // Sparkle on crests
    float sparkle = max(0.0, sin(vUv.x * 90.0 + uTime * 3.5) * sin(vUv.y * 90.0 + uTime * 2.8));
    col += sparkle * 0.04 * depthBlend;

    // Alpha: opaque in deep, fade at edges
    float edgeFade = 1.0 - smoothstep(0.40, 0.50, edge);
    float alpha = mix(0.78, 0.96, depthBlend) * edgeFade;

    col = clamp(col, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

const OceanWater: React.FC = () => {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useRef({ uTime: { value: 0 } });

  useFrame((_, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += delta;
  });

  return (
    // Position: centered at X=0, Z=165 (south edge), Y=0.12 above terrain
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 165]} renderOrder={1}>
      <planeGeometry args={[420, 160, 120, 80]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={WATER_VERT}
        fragmentShader={WATER_FRAG}
        uniforms={uniforms.current}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        side={THREE.FrontSide}
      />
    </mesh>
  );
};

// ── Settlement Dressing – props around buildings ──────────────────────────────
const SettlementDressing: React.FC<{ tick: number }> = ({ tick }) => {
  const props = React.useMemo(() => {
    const result: Array<{
      type: 'barrel' | 'crate' | 'torch' | 'hay' | 'woodstack' | 'stone_pile';
      x: number; y: number; z: number;
      rot: number; scale: number;
    }> = [];

    // Seed based on building positions (stable)
    let seed = 0;
    const rng = (s: number) => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };

    gameState.buildings.forEach((b, id) => {
      if (b.state !== 'active') return;
      const t = gameState.transforms.get(id);
      if (!t) return;
      seed++;

      const btype = b.type as string;
      const count = btype === 'town_center' ? 6 : btype === 'farm_field' ? 3 : 4;
      for (let i = 0; i < count; i++) {
        seed++;
        const angle = rng(seed * 31 + i * 7) * Math.PI * 2;
        const radius = 2.5 + rng(seed * 17 + i * 13) * 2.5;
        const px = t.x + Math.cos(angle) * radius;
        const pz = t.z + Math.sin(angle) * radius;

        let type: typeof result[0]['type'] = 'barrel';
        if (btype === 'farm_field' || btype === 'woodcutter_hut') type = 'hay';
        else if (btype === 'quarry') type = 'stone_pile';
        else if (btype === 'storage_barn') type = 'crate';
        else if (btype === 'woodcutter_hut' && i % 2 === 0) type = 'woodstack';
        else if (i % 3 === 0) type = 'torch';
        else type = rng(seed) > 0.5 ? 'barrel' : 'crate';

        result.push({
          type, x: px, y: t.y, z: pz,
          rot: rng(seed * 23 + i) * Math.PI * 2,
          scale: 0.8 + rng(seed * 11 + i) * 0.4,
        });
      }
    });

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <group>
      {props.map((p, i) => {
        const baseY = p.y + 0.15;
        if (p.type === 'barrel') {
          return (
            <group key={i} position={[p.x, baseY, p.z]} rotation={[0, p.rot, 0]} scale={p.scale}>
              <mesh castShadow>
                <cylinderGeometry args={[0.18, 0.16, 0.38, 8]} />
                <meshStandardMaterial color={0x5a3a1a} roughness={0.85} />
              </mesh>
              {[0.08, -0.06].map((y, ri) => (
                <mesh key={ri} position={[0, y, 0]}>
                  <torusGeometry args={[0.185, 0.018, 4, 10]} />
                  <meshStandardMaterial color={0x2a2a2a} roughness={0.7} metalness={0.4} />
                </mesh>
              ))}
            </group>
          );
        }
        if (p.type === 'crate') {
          return (
            <group key={i} position={[p.x, baseY, p.z]} rotation={[0, p.rot, 0]} scale={p.scale}>
              <mesh castShadow>
                <boxGeometry args={[0.35, 0.30, 0.35]} />
                <meshStandardMaterial color={0x6a4a22} roughness={0.88} />
              </mesh>
            </group>
          );
        }
        if (p.type === 'torch') {
          return (
            <group key={i} position={[p.x, baseY, p.z]} scale={p.scale}>
              <mesh castShadow>
                <cylinderGeometry args={[0.04, 0.04, 0.7, 5]} />
                <meshStandardMaterial color={0x5a3a10} roughness={0.9} />
              </mesh>
              <pointLight position={[0, 0.55, 0]} color={0xff9030} intensity={1.2} distance={4} decay={2} />
              <mesh position={[0, 0.45, 0]}>
                <sphereGeometry args={[0.08, 5, 4]} />
                <meshStandardMaterial color={0xff6010} emissive={0xff4000} emissiveIntensity={1.5} />
              </mesh>
            </group>
          );
        }
        if (p.type === 'hay') {
          return (
            <group key={i} position={[p.x, baseY, p.z]} rotation={[0, p.rot, 0]} scale={p.scale}>
              <mesh castShadow>
                <cylinderGeometry args={[0.22, 0.22, 0.30, 6]} />
                <meshStandardMaterial color={0xc8a030} roughness={0.95} />
              </mesh>
            </group>
          );
        }
        if (p.type === 'woodstack') {
          return (
            <group key={i} position={[p.x, baseY, p.z]} rotation={[0, p.rot, 0]} scale={p.scale}>
              {[0, 1, 2].map(row => (
                <group key={row} position={[0, row * 0.12, 0]}>
                  {[0, 1, 2].map(col => (
                    <group key={col} position={[(col - 1) * 0.15, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                      <mesh castShadow>
                        <cylinderGeometry args={[0.065, 0.065, 0.38, 5]} />
                        <meshStandardMaterial color={0x6a4a22} roughness={0.9} />
                      </mesh>
                    </group>
                  ))}
                </group>
              ))}
            </group>
          );
        }
        if (p.type === 'stone_pile') {
          return (
            <group key={i} position={[p.x, baseY, p.z]} rotation={[0, p.rot, 0]} scale={p.scale}>
              {[0, 1, 2].map(j => (
                <mesh key={j} position={[(j - 1) * 0.14, j * 0.06, 0]} castShadow>
                  <dodecahedronGeometry args={[0.12]} />
                  <meshStandardMaterial color={0x7a7870} roughness={0.92} />
                </mesh>
              ))}
            </group>
          );
        }
        return null;
      })}
    </group>
  );
};

// ── Blob shadow under units ────────────────────────────────────────────────────
const BlobShadows: React.FC<{ tick: number }> = ({ tick }) => {
  const shadowMat = React.useMemo(() => new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false,
  }), []);
  const shadowGeo = React.useMemo(() => new THREE.CircleGeometry(0.35, 10), []);

  const citizenPositions: [number, number, number][] = [];
  gameState.transforms.forEach((t, id) => {
    if (gameState.isCitizen.has(id)) citizenPositions.push([t.x, t.y + 0.02, t.z]);
  });
  const soldierPositions: [number, number, number][] = [];
  gameState.military.soldierTransforms.forEach((t) => {
    soldierPositions.push([t.x, t.y + 0.02, t.z]);
  });
  const enemyWorkerPositions: [number, number, number][] = [];
  gameState.enemyFaction.workerEntities.forEach((w) => {
    enemyWorkerPositions.push([w.x, w.y + 0.02, w.z]);
  });

  // Each circle is a flat disc lying on the ground — rotate each individually
  const SHADOW_ROT: [number, number, number] = [-Math.PI / 2, 0, 0];

  return (
    <group>
      {citizenPositions.map((pos, i) => (
        <mesh
          key={`c${i}`}
          position={[pos[0], pos[1] + 0.02, pos[2]]}
          rotation={SHADOW_ROT}
          geometry={shadowGeo}
          material={shadowMat}
        />
      ))}
      {soldierPositions.map((pos, i) => (
        <mesh
          key={`s${i}`}
          position={[pos[0], pos[1] + 0.02, pos[2]]}
          rotation={SHADOW_ROT}
          geometry={shadowGeo}
          material={shadowMat}
        />
      ))}
      {enemyWorkerPositions.map((pos, i) => (
        <mesh
          key={`ew${i}`}
          position={[pos[0], pos[1] + 0.02, pos[2]]}
          rotation={SHADOW_ROT}
          geometry={shadowGeo}
          material={shadowMat}
        />
      ))}
    </group>
  );
};

// ── Territory Grid ────────────────────────────────────────────────────────────
const TerritoryGrid: React.FC<{ tick: number }> = ({ tick: _tick }) => {
  const geo = React.useMemo(() => {
    const ZONE = 20;
    const HALF = 100;
    const points: number[] = [];
    for (let x = -HALF; x <= HALF; x += ZONE) {
      points.push(x, 0.06, -HALF, x, 0.06, HALF);
    }
    for (let z = -HALF; z <= HALF; z += ZONE) {
      points.push(-HALF, 0.06, z, HALF, 0.06, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return g;
  }, []);

  const mat = React.useMemo(() => new THREE.LineBasicMaterial({
    color: 0x886644,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  }), []);

  return <lineSegments geometry={geo} material={mat} />;
};

// ── Seagulls over ocean ───────────────────────────────────────────────────────
const Seagulls: React.FC = () => {
  const ref = useRef<THREE.Group>(null);
  const seagulls = React.useMemo(() => Array.from({ length: 6 }, (_, i) => ({
    baseX: (Math.sin(i * 1.3) * 60),
    baseZ: 90 + (i % 3) * 15,
    phase: i * 1.1,
    speed: 0.4 + (i % 3) * 0.15,
  })), []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.children.forEach((child, i) => {
      const s = seagulls[i];
      child.position.x = s.baseX + Math.sin(t * s.speed + s.phase) * 18;
      child.position.y = 8 + Math.sin(t * 0.8 + s.phase) * 1.2;
      child.position.z = s.baseZ + Math.cos(t * s.speed * 0.6 + s.phase) * 8;
      child.rotation.y = Math.atan2(
        Math.cos(t * s.speed + s.phase) * 18 * s.speed,
        Math.cos(t * s.speed * 0.6 + s.phase) * 8 * s.speed * 0.6
      );
    });
  });

  return (
    <group ref={ref}>
      {seagulls.map((_, i) => (
        <mesh key={i} rotation={[0.15, 0, 0]}>
          <planeGeometry args={[0.7, 0.2]} />
          <meshStandardMaterial color={0xfafafa} side={THREE.DoubleSide} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
};

// ── Building Level HTML Badges — rendered OUTSIDE Canvas as a DOM overlay ─────
// Uses a shared camera ref updated by a small R3F helper inside the Canvas.
const buildingBadgeCameraRef = { current: null as THREE.Camera | null };
const buildingBadgeCanvasRef = { current: null as HTMLCanvasElement | null };

// Small R3F helper that just updates the shared refs (no HTML rendering)
const BuildingBadgeCameraSync: React.FC = () => {
  const { camera, gl } = useThree();
  useFrame(() => {
    buildingBadgeCameraRef.current = camera;
    buildingBadgeCanvasRef.current = gl.domElement;
  });
  return null;
};

// Pure HTML overlay — lives OUTSIDE the Canvas
const BuildingLevelBadgesOverlay: React.FC<{ tick: number }> = ({ tick: _tick }) => {
  const [badges, setBadges] = useState<Array<{ id: number; x: number; y: number; behind: boolean; level: number; upgrading: boolean }>>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const update = () => {
      const camera = buildingBadgeCameraRef.current;
      const canvas = buildingBadgeCanvasRef.current;
      if (!camera || !canvas) { rafRef.current = requestAnimationFrame(update); return; }
      const rect = canvas.getBoundingClientRect();
      const result: typeof badges = [];
      gameState.buildings.forEach((b, id) => {
        if (b.state !== 'active') return;
        const t = gameState.transforms.get(id);
        if (!t) return;
        const level = getBuildingLevel(id);
        const upgrading = buildingUpgradeTimers.has(id);
        const vec = new THREE.Vector3(t.x, t.y + 4.2, t.z).project(camera);
        const x = (vec.x * 0.5 + 0.5) * rect.width + rect.left;
        const y = (-vec.y * 0.5 + 0.5) * rect.height + rect.top;
        result.push({ id, x, y, behind: vec.z > 1, level, upgrading });
      });
      setBadges(result);
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <>
      {badges.map(b => {
        if (b.behind) return null;
        const glowColor = b.level >= 5 ? 'hsl(38 90% 60%)' : b.level >= 4 ? 'hsl(38 70% 52%)' : 'hsl(42 30% 55%)';
        return (
          <div
            key={b.id}
            style={{
              position: 'fixed',
              left: b.x,
              top: b.y,
              transform: 'translate(-50%, -100%)',
              pointerEvents: 'none',
              zIndex: 60,
              background: 'hsla(28,25%,7%,0.92)',
              border: `1px solid ${b.upgrading ? 'hsl(38 70% 50%)' : 'hsl(38 20% 22%)'}`,
              borderRadius: 8,
              padding: '1px 6px',
              fontSize: 9,
              fontWeight: 700,
              color: glowColor,
              boxShadow: b.level >= 5 ? `0 0 6px hsla(38,80%,55%,0.5)` : 'none',
              letterSpacing: '0.04em',
            }}
          >
            {b.upgrading ? '⬆️' : `Lv.${b.level}`}
          </div>
        );
      })}
    </>
  );
};

const StrategicMarkers: React.FC = () => {
  const base = gameState.enemyFaction.basePosition;
  const structures = gameState.enemyFaction.visualStructures;
  return (
    <group>
      {!gameState.enemyFaction.destroyed && (
        <>
          {structures.filter((s) => s.state === 'active' && (s.hp ?? s.maxHp ?? 1) > 0).map((s) => (
            <group key={s.id} position={[s.x, getTerrainHeight(s.x, s.z), s.z]}>
              <BuildingMesh type={s.type} state="active" selected={false} opacity={0.98} />
            </group>
          ))}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[base.x, getTerrainHeight(base.x, base.z) + 0.03, base.z]}>
            <ringGeometry args={[7.2, 8.0, 28]} />
            <meshBasicMaterial color={0xff6666} transparent opacity={0.72} />
          </mesh>
        </>
      )}
      {Array.from(gameState.mapObjectives.values()).map((o) => (
        <group key={o.id} position={[o.position.x, getTerrainHeight(o.position.x, o.position.z), o.position.z]}>
          <mesh position={[0, 1.1, 0]}>
            <octahedronGeometry args={[0.9, 0]} />
            <meshStandardMaterial
              color={o.owner === 'player' ? 0x68d4ff : o.owner === 'enemy' ? 0xff7b64 : 0xf4d98b}
              emissive={o.owner === 'neutral' ? 0x221b0a : 0x0d1a24}
              roughness={0.35}
              metalness={0.15}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <ringGeometry args={[1.3, 1.6, 20]} />
            <meshBasicMaterial color={o.owner === 'player' ? 0x58c8ff : o.owner === 'enemy' ? 0xff6b59 : 0xe2c470} transparent opacity={0.78} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

const Scene: React.FC<SceneProps> = ({ tick, buildMode, onBuildPlaced, wallDrawMode, onWallDrawModeChange, onWallPlaced, onRightClick, onMultiSelect, setStatsVisible }) => {
  const characterControlActive = gameState.playerCharacter.controlActive;
  return (
    <>
      <DayNightLighting tick={tick} />
      {gameState.graphics.shadows && <CascadeShadows />}
      <DynamicSky tick={tick} />
      <OceanSurface />
      <TerrainMesh />
      <InstancedForest />
      <StoneOutcrops />
      <DistantMountains />
      <Seagulls />
      <TerritoryGrid tick={tick} />
      <BlobShadows tick={tick} />
      <BuildingsLayer tick={tick} />
      <BuildingBadgeCameraSync />
      <SettlementDressing tick={tick} />
      <WallsLayer tick={tick} />
      <CitizensLayer tick={tick} />
      <EnemyWorkersLayer tick={tick} />
      <SoldiersLayer tick={tick} />
      <EnemiesLayer tick={tick} />
      <StrategicMarkers />
      <PlayerCharacter />
      <BuildGhost buildMode={buildMode} />
      {!characterControlActive && (
        <WallDrawHandler wallDrawMode={wallDrawMode} onWallDrawModeChange={onWallDrawModeChange} onWallPlaced={onWallPlaced} />
      )}
      {!characterControlActive && (
        <ClickHandler buildMode={buildMode} onBuildPlaced={onBuildPlaced} onRightClick={onRightClick} onMultiSelect={onMultiSelect} />
      )}
      {!characterControlActive && <RTSCamera />}
      <RenderMetricsCollector setStatsVisible={setStatsVisible} />
      <EffectComposer multisampling={4} enableNormalPass>
        {gameState.graphics.ao && (
          <SSAO
            samples={gameState.graphics.qualityTier === 'ultra' ? 24 : 16}
            radius={0.16}
            intensity={18}
            luminanceInfluence={0.45}
            worldDistanceThreshold={0.6}
            worldDistanceFalloff={0.25}
            worldProximityThreshold={0.62}
            worldProximityFalloff={0.24}
            color={new THREE.Color(0x000000)}
          />
        )}
        {gameState.graphics.bloom && <Bloom intensity={0.36} luminanceThreshold={0.7} luminanceSmoothing={0.8} />}
        {gameState.graphics.dof && (
          <DepthOfField
            focusDistance={0.018}
            focalLength={0.012}
            bokehScale={2.1}
            height={gameState.graphics.qualityTier === 'ultra' ? 720 : 512}
          />
        )}
        <BrightnessContrast brightness={0.015} contrast={0.08} />
        <Noise opacity={0.014} />
        <Vignette eskil={false} offset={0.33} darkness={0.46} />
      </EffectComposer>
    </>
  );
};

// ── Canvas wrapper ────────────────────────────────────────────────────────────

interface GameCanvasProps {
  tick: number;
  buildMode: string | null;
  onBuildPlaced: () => void;
  wallDrawMode?: boolean;
  onWallDrawModeChange?: (active: boolean) => void;
  onWallPlaced?: (sx: number, sz: number, ex: number, ez: number) => void;
  onRightClick?: (e: MouseEvent, worldX: number, worldZ: number) => void;
  onMultiSelect?: (ids: number[]) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  tick, buildMode, onBuildPlaced,
  wallDrawMode = false, onWallDrawModeChange, onWallPlaced,
  onRightClick, onMultiSelect,
}) => {
  const [statsVisible, setStatsVisible] = useState(false);
  const [webglSupported] = useState<boolean>(() => detectWebGLSupport());
  const dprScale = Math.max(0.75, Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) * gameState.graphics.renderScale));
  const fps = gameState.renderMetrics.frameMs > 0 ? Math.round(1000 / gameState.renderMetrics.frameMs) : 0;
  const fpsColor = fps >= 60 ? '#8ee59d' : fps >= 45 ? '#f2c46f' : '#ef7b7b';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {webglSupported ? (
        <CanvasErrorBoundary>
          <Canvas
            className="w-full h-full"
            shadows={gameState.graphics.shadows ? 'soft' : false}
            dpr={dprScale}
            camera={{ fov: 45, near: 0.5, far: 2000 }}
            gl={{
              antialias: true,
              powerPreference: 'high-performance',
            }}
            onCreated={({ gl }) => applyRendererConfig(gl)}
            scene={{ fog: createSceneFog() }}
          >
            <Scene
              tick={tick}
              buildMode={buildMode}
              onBuildPlaced={onBuildPlaced}
              wallDrawMode={wallDrawMode}
              onWallDrawModeChange={onWallDrawModeChange ?? (() => {})}
              onWallPlaced={onWallPlaced ?? (() => {})}
              onRightClick={onRightClick ?? (() => {})}
              onMultiSelect={onMultiSelect ?? (() => {})}
              setStatsVisible={setStatsVisible}
            />
          </Canvas>
        </CanvasErrorBoundary>
      ) : (
        <div className="rts-render-fallback">
          <h3>WebGL Unavailable</h3>
          <p>This browser profile cannot create a WebGL context.</p>
          <p className="detail">GPU acceleration appears disabled or blocked by sandbox settings.</p>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 110,
          background: 'rgba(8,10,14,0.7)',
          border: '1px solid rgba(126,154,199,0.35)',
          borderRadius: 8,
          padding: '5px 8px',
          fontSize: 12,
          color: fpsColor,
          fontWeight: 700,
          pointerEvents: 'none',
        }}
      >
        FPS {fps}
      </div>
      {statsVisible && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 100,
            background: 'rgba(6,8,12,0.78)',
            color: '#d7dfef',
            border: '1px solid rgba(126,154,199,0.35)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 11,
            lineHeight: 1.35,
            minWidth: 190,
          }}
        >
          <div style={{ color: '#f0c87d', fontWeight: 700, marginBottom: 4 }}>Render Metrics (F10)</div>
          <div>frame: {gameState.renderMetrics.frameMs.toFixed(2)}ms / {RENDER_BUDGETS.frameMs}ms</div>
          <div>cpu: {gameState.renderMetrics.cpuMs.toFixed(2)}ms / {RENDER_BUDGETS.cpuMs}ms</div>
          <div>gpu: {gameState.renderMetrics.gpuMs.toFixed(2)}ms / {RENDER_BUDGETS.gpuMs}ms</div>
          <div>post: {gameState.renderMetrics.postMs.toFixed(2)}ms / {RENDER_BUDGETS.postMs}ms</div>
          <div>draw calls: {gameState.renderMetrics.drawCalls} / {RENDER_BUDGETS.drawCalls}</div>
          <div>triangles: {gameState.renderMetrics.triangles.toLocaleString()} / {RENDER_BUDGETS.triangles.toLocaleString()}</div>
          <div style={{ marginTop: 4, opacity: 0.8 }}>quality: {gameState.graphics.qualityTier}</div>
        </div>
      )}
      {/* HTML overlays that cannot live inside Canvas */}
      <BuildingLevelBadgesOverlay tick={tick} />
    </div>
  );
};

export default GameCanvas;
