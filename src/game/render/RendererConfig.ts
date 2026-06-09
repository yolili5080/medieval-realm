import * as THREE from 'three';

export const RENDER_BUDGETS = {
  frameMs: 16.6,
  cpuMs: 5,
  gpuMs: 8.5,
  postMs: 3,
  drawCalls: 1500,
  triangles: 3_500_000,
  shadowMs: 2.5,
  waterMs: 3.5,
} as const;

export const RENDERER_CONFIG = {
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.06,
  outputColorSpace: THREE.SRGBColorSpace,
  shadowMapType: THREE.PCFSoftShadowMap,
  physicallyCorrectLights: true,
  fogColor: 0x9ab8d0,
  fogDensity: 0.0018,
} as const;

export function applyRendererConfig(gl: THREE.WebGLRenderer): void {
  gl.toneMapping = RENDERER_CONFIG.toneMapping;
  gl.toneMappingExposure = RENDERER_CONFIG.toneMappingExposure;
  gl.outputColorSpace = RENDERER_CONFIG.outputColorSpace;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = RENDERER_CONFIG.shadowMapType;
  // three r169+ is physically correct by default; this keeps older typings safe.
  (gl as THREE.WebGLRenderer & { useLegacyLights?: boolean }).useLegacyLights = !RENDERER_CONFIG.physicallyCorrectLights;
}

export function createSceneFog(): THREE.FogExp2 {
  return new THREE.FogExp2(RENDERER_CONFIG.fogColor, RENDERER_CONFIG.fogDensity);
}
