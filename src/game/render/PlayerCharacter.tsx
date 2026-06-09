import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { gameState } from '../core/GameState';
import { getTerrainHeight } from '../core/Noise';

const MODEL_URL = 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb';
useGLTF.preload(MODEL_URL);

type AnimMap = {
  idle: string | null;
  walk: string | null;
  run: string | null;
  jump: string | null;
  other: string | null;
};

function pickAnimationName(names: string[], token: string): string | null {
  return names.find((n) => n.toLowerCase().includes(token.toLowerCase())) ?? null;
}

function buildAnimMap(names: string[]): AnimMap {
  const idle = pickAnimationName(names, 'idle') ?? names[0] ?? null;
  const walk = pickAnimationName(names, 'walk') ?? idle;
  const run = pickAnimationName(names, 'run') ?? walk ?? idle;
  const jump = pickAnimationName(names, 'jump');
  const other = pickAnimationName(names, 'dance') ?? pickAnimationName(names, 'attack') ?? names[1] ?? idle;
  return { idle, walk, run, jump, other };
}

const PlayerCharacter: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const aiTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(8, 0, 8));
  const currentAnimRef = useRef<string | null>(null);
  const mouseDraggingRef = useRef(false);
  const yawRef = useRef(0);
  const pitchRef = useRef(0.35);
  const distRef = useRef(7.8);
  const jumpQueuedRef = useRef(false);
  const justLandedRef = useRef(false);
  const lookAtRef = useRef(new THREE.Vector3());
  const smoothedCamPosRef = useRef(new THREE.Vector3());
  const activeCamLookRef = useRef(new THREE.Vector3());
  const wasControlRef = useRef(gameState.playerCharacter.controlActive);
  const pointerLockedRef = useRef(false);

  const gltf = useGLTF(MODEL_URL);
  const clonedScene = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  const { actions, names } = useAnimations(gltf.animations, groupRef);
  const animMap = useMemo(() => buildAnimMap(names), [names]);
  const { camera, gl } = useThree();

  useEffect(() => {
    clonedScene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
    });
  }, [clonedScene]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (e.code === 'Space') jumpQueuedRef.current = true;
      if (!gameState.playerCharacter.controlActive) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'Digit1') {
        const candidate = animMap.idle;
        if (candidate) currentAnimRef.current = candidate;
      }
      if (e.code === 'Digit2') {
        const candidate = animMap.other;
        if (candidate) currentAnimRef.current = candidate;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [animMap.idle, animMap.other]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onMouseDown = (e: MouseEvent) => {
      if (!gameState.playerCharacter.controlActive) return;
      if (e.button === 0 || e.button === 2) {
        mouseDraggingRef.current = true;
      }
      if (e.button === 2) e.preventDefault();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0 || e.button === 2) mouseDraggingRef.current = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!gameState.playerCharacter.controlActive) return;
      if (!pointerLockedRef.current) {
        const target = e.target as Node | null;
        if (!target || !canvas.contains(target)) return;
      }
      yawRef.current -= e.movementX * 0.0055;
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current + e.movementY * 0.0035, -0.35, 1.0);
    };
    const onWheel = (e: WheelEvent) => {
      if (!gameState.playerCharacter.controlActive) return;
      distRef.current = THREE.MathUtils.clamp(distRef.current + e.deltaY * 0.01, 4.2, 11.5);
      e.preventDefault();
    };
    const onContext = (e: Event) => {
      if (gameState.playerCharacter.controlActive) e.preventDefault();
    };

    const onPointerLockChange = () => {
      pointerLockedRef.current = document.pointerLockElement === canvas;
      if (!pointerLockedRef.current && gameState.playerCharacter.controlActive) {
        gameState.playerCharacter.controlActive = false;
        gameState.playerCharacter.aiMode = true;
        document.body.style.cursor = '';
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  }, [gl]);

  const playAnim = (name: string | null, fade = 0.18) => {
    if (!name || currentAnimRef.current === name) return;
    const next = actions[name];
    if (!next) return;
    Object.values(actions).forEach((a) => {
      if (!a || a === next) return;
      a.fadeOut(fade);
    });
    next.reset().fadeIn(fade).play();
    currentAnimRef.current = name;
  };

  useFrame((_, dt) => {
    if (!groupRef.current) return;

    const st = gameState.playerCharacter;
    const control = st.controlActive;
    const switchedControl = control !== wasControlRef.current;
    wasControlRef.current = control;

    let x = st.x;
    let y = st.y;
    let z = st.z;
    let vy = st.vy;
    let rotY = st.rotationY;

    const terrainY = getTerrainHeight(x, z);
    let grounded = y <= terrainY + 0.02;
    if (grounded) {
      y = terrainY;
      vy = 0;
    }

    if (control) {
      st.aiMode = false;
      if (switchedControl) {
        mouseDraggingRef.current = false;
        pointerLockedRef.current = document.pointerLockElement === gl.domElement;
        if (!pointerLockedRef.current) {
          gl.domElement.requestPointerLock?.();
          pointerLockedRef.current = document.pointerLockElement === gl.domElement;
        }
        document.body.style.cursor = 'none';
        playAnim(animMap.idle, 0.12);
      }

      const keys = keysRef.current;
      const inX = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const inZ = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const wantsRun = keys.has('ShiftLeft') || keys.has('ShiftRight');

      const forward = new THREE.Vector3(-Math.sin(yawRef.current), 0, -Math.cos(yawRef.current));
      const right = new THREE.Vector3(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current));
      const move = forward.multiplyScalar(inZ).add(right.multiplyScalar(inX));
      const moving = move.lengthSq() > 0.0001;
      if (moving) move.normalize();

      const speed = wantsRun ? 8.1 : 4.9;
      if (moving) {
        x += move.x * speed * dt;
        z += move.z * speed * dt;
        rotY = THREE.MathUtils.lerp(rotY, Math.atan2(move.x, move.z), 1 - Math.exp(-15 * dt));
      }

      x = THREE.MathUtils.clamp(x, -180, 180);
      z = THREE.MathUtils.clamp(z, -180, 180);

      if (jumpQueuedRef.current && grounded) {
        vy = 6.8;
        grounded = false;
      }
      jumpQueuedRef.current = false;

      vy -= 16.0 * dt;
      y += vy * dt;
      const newTerrainY = getTerrainHeight(x, z);
      if (y <= newTerrainY) {
        y = newTerrainY;
        if (!grounded && vy < -0.5) justLandedRef.current = true;
        vy = 0;
        grounded = true;
      }

      if (!grounded) {
        playAnim(animMap.jump ?? animMap.run);
      } else if (moving) {
        playAnim(wantsRun ? animMap.run : animMap.walk);
      } else if (justLandedRef.current) {
        playAnim(animMap.idle, 0.08);
        justLandedRef.current = false;
      } else {
        playAnim(animMap.idle);
      }

      const camTarget = new THREE.Vector3(x, y + 1.5, z);
      const cosPitch = Math.cos(pitchRef.current);
      const camOffset = new THREE.Vector3(
        Math.sin(yawRef.current) * distRef.current * cosPitch,
        Math.sin(pitchRef.current) * distRef.current + 2.0,
        Math.cos(yawRef.current) * distRef.current * cosPitch
      );
      const desiredCamPos = camTarget.clone().add(camOffset);
      const minCamY = getTerrainHeight(desiredCamPos.x, desiredCamPos.z) + 1.2;
      desiredCamPos.y = Math.max(desiredCamPos.y, minCamY);

      if (smoothedCamPosRef.current.lengthSq() === 0) {
        smoothedCamPosRef.current.copy(desiredCamPos);
        activeCamLookRef.current.copy(camTarget);
      } else {
        const alpha = 1 - Math.exp(-10 * dt);
        smoothedCamPosRef.current.lerp(desiredCamPos, alpha);
        activeCamLookRef.current.lerp(camTarget, alpha);
      }
      camera.position.copy(smoothedCamPosRef.current);
      lookAtRef.current.copy(activeCamLookRef.current);
      camera.lookAt(lookAtRef.current);
    } else {
      st.aiMode = true;
      if (switchedControl) {
        if (document.pointerLockElement) document.exitPointerLock?.();
        pointerLockedRef.current = false;
        document.body.style.cursor = '';
        playAnim(animMap.idle, 0.12);
      }

      const target = aiTargetRef.current;
      const to = new THREE.Vector3(target.x - x, 0, target.z - z);
      const dist = to.length();
      if (dist < 0.9) {
        target.set(
          THREE.MathUtils.clamp(x + (Math.random() - 0.5) * 26, -170, 170),
          0,
          THREE.MathUtils.clamp(z + (Math.random() - 0.5) * 26, -170, 170)
        );
      } else {
        to.normalize();
        const aiSpeed = 2.0;
        x += to.x * aiSpeed * dt;
        z += to.z * aiSpeed * dt;
        rotY = THREE.MathUtils.lerp(rotY, Math.atan2(to.x, to.z), 1 - Math.exp(-8 * dt));
        playAnim(animMap.walk);
      }

      const aiTerrain = getTerrainHeight(x, z);
      y = aiTerrain;
      vy = 0;
      if (dist < 0.9) playAnim(animMap.idle);
    }

    st.x = x;
    st.y = y;
    st.z = z;
    st.vy = vy;
    st.rotationY = rotY;

    groupRef.current.position.set(x, y, z);
    groupRef.current.rotation.set(0, rotY, 0);
  });

  return (
    <group ref={groupRef} scale={0.42}>
      <primitive object={clonedScene} />
    </group>
  );
};

export default PlayerCharacter;
