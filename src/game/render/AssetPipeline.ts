import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

let cachedLoader: GLTFLoader | null = null;

export function createAssetLoader(renderer: THREE.WebGLRenderer): GLTFLoader {
  if (cachedLoader) return cachedLoader;

  const draco = new DRACOLoader();
  draco.setDecoderPath('/draco/');

  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath('/basis/');
  ktx2.detectSupport(renderer);

  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setKTX2Loader(ktx2);

  cachedLoader = loader;
  return loader;
}
