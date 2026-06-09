import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from '../core/GameState';

const WATER_VERT = `
  uniform float uTime;
  uniform float uWaveAmp;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vWaveY;

  vec3 gerstner(vec2 p, vec2 dir, float steep, float wavelength, float speed) {
    float k = 6.28318 / wavelength;
    float c = speed;
    float f = k * dot(dir, p) + c * uTime;
    float a = steep / k;
    return vec3(dir.x * (a * cos(f)), a * sin(f), dir.y * (a * cos(f)));
  }

  void main() {
    vUv = uv;
    vec2 p = position.xz;

    vec3 w1 = gerstner(p, normalize(vec2(1.0, 0.2)), 0.12 * uWaveAmp, 14.0, 1.6);
    vec3 w2 = gerstner(p, normalize(vec2(0.3, 1.0)), 0.08 * uWaveAmp, 8.0, 2.2);
    vec3 w3 = gerstner(p, normalize(vec2(-0.9, 0.4)), 0.04 * uWaveAmp, 4.0, 3.1);

    vec3 displaced = position + w1 + w2 + w3;
    vWaveY = displaced.y;
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const WATER_FRAG = `
  uniform float uTime;
  uniform float uFoamBoost;
  uniform float uShoreBlendDistance;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vWaveY;

  float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 74.3);
    return fract(p.x * p.y);
  }

  float n2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec3 deepColor = vec3(0.02, 0.09, 0.20);
    vec3 shallowColor = vec3(0.08, 0.28, 0.38);
    vec3 foamColor = vec3(0.82, 0.90, 0.95);

    float fresnel = pow(1.0 - clamp(dot(normalize(vec3(0.0, 1.0, 0.0)), normalize(vec3(0.2, 1.0, 0.1))), 0.0, 1.0), 3.0);
    float depthBlend = clamp(vWaveY * 2.2 + 0.46, 0.0, 1.0);

    vec3 col = mix(deepColor, shallowColor, depthBlend);
    col += fresnel * 0.14;

    float crest = smoothstep(0.08, 0.20, vWaveY);
    float foamN = n2(vWorldPos.xz * 0.35 + uTime * 0.25);
    float foam = crest * mix(0.4, 1.0, foamN) * uFoamBoost;
    col = mix(col, foamColor, foam * 0.6);

    float edge = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5));
    float shoreMask = smoothstep(0.42, 0.5, edge + (0.1 / max(1.0, uShoreBlendDistance)));
    col = mix(col, foamColor, shoreMask * 0.35);

    float caustics = n2(vWorldPos.xz * 0.55 + vec2(uTime * 0.45, -uTime * 0.33));
    col += caustics * 0.03;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const OceanSurface: React.FC = () => {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uWaveAmp: { value: 1 },
      uFoamBoost: { value: 1 },
      uShoreBlendDistance: { value: gameState.oceanRender.shoreBlendDistance },
    }),
    []
  );

  useFrame((_, dt) => {
    const g = gameState.oceanRender;
    if (!matRef.current) return;

    uniforms.uTime.value += dt;
    uniforms.uWaveAmp.value = g.wavePreset === 'storm' ? 1.5 : g.wavePreset === 'calm' ? 0.65 : 1.0;
    uniforms.uFoamBoost.value = g.foamQuality === 'high' ? 1.0 : g.foamQuality === 'medium' ? 0.75 : 0.55;
    uniforms.uShoreBlendDistance.value = g.shoreBlendDistance;
  });

  return (
    <group renderOrder={1}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 165]}>
        <planeGeometry args={[440, 185, 320, 180]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={WATER_VERT}
          fragmentShader={WATER_FRAG}
          uniforms={uniforms}
          transparent={false}
          depthWrite
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};

export default OceanSurface;
