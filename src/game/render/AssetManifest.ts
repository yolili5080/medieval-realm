export interface AssetManifestEntry {
  id: string;
  meshLods: string[];
  textureSets: {
    baseColor: string;
    normal: string;
    orm: string;
    emissive?: string;
    height?: string;
  };
  collisionProxy: string;
  instancingGroup: string;
}

export interface AssetManifest {
  assets: AssetManifestEntry[];
}
