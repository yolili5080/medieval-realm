// ──────────────────────────────────────────────
//  Seeded PRNG (Mulberry32) for deterministic
//  world generation
// ──────────────────────────────────────────────

export class PRNG {
  private s: number;

  constructor(seed: number) { this.s = seed >>> 0; }

  next(): number {
    this.s += 0x6D2B79F5;
    let z = this.s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  /** Random float in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Random integer in [min, max] */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Pick random element */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// ── Simplex-like noise (value noise, 2D) ──────────────────────────────────────

function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a: number, b: number, t: number): number { return a + t * (b - a); }

function hash(x: number, y: number, seed: number): number {
  let h = seed ^ (x * 374761393 + y * 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) / 4294967296;
}

export function valueNoise(x: number, y: number, seed = 42): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = x0 + 1, y1 = y0 + 1;
  const fx = fade(x - x0), fy = fade(y - y0);

  const v00 = hash(x0, y0, seed);
  const v10 = hash(x1, y0, seed);
  const v01 = hash(x0, y1, seed);
  const v11 = hash(x1, y1, seed);

  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
}

export function fbm(x: number, y: number, octaves = 6, seed = 42): number {
  let val = 0, amp = 0.5, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    val += valueNoise(x * freq, y * freq, seed + i * 137) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return val / max;
}

/** Get terrain height at world position — matches TERRAIN_SIZE=400 */
export function getTerrainHeight(worldX: number, worldZ: number): number {
  const nx = worldX / 80;
  const nz = worldZ / 80;
  const base = fbm(nx, nz, 6, 42);
  const dist = Math.sqrt(worldX * worldX + worldZ * worldZ) / 180;
  const hillShape = Math.max(0, dist - 0.18) * 2;
  let height = base * 8 + hillShape * 6;

  // South slope: terrain gradually descends toward ocean (Z > 100 → beach → water)
  if (worldZ > 100) {
    const slopeFactor = Math.min(1.0, (worldZ - 100) / 60); // 0 at Z=100, 1 at Z=160
    height = height * (1 - slopeFactor) + (-0.5) * slopeFactor;
  }

  return height;
}

export type TerrainGameplayClass = 'plain' | 'forest' | 'marsh' | 'slope' | 'highground' | 'shore';

export function getTerrainClass(worldX: number, worldZ: number): TerrainGameplayClass {
  const h = getTerrainHeight(worldX, worldZ);
  if (h < 0.35) return 'shore';

  const hDx = Math.abs(getTerrainHeight(worldX + 1.5, worldZ) - h);
  const hDz = Math.abs(getTerrainHeight(worldX, worldZ + 1.5) - h);
  const slope = hDx + hDz;

  const biomeNoise = valueNoise(worldX * 0.03, worldZ * 0.03, 1337);

  if (h > 7.8) return 'highground';
  if (slope > 0.42) return 'slope';
  if (biomeNoise < 0.2) return 'marsh';
  if (biomeNoise > 0.68) return 'forest';
  return 'plain';
}
