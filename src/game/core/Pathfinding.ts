import type { Vec2 } from '../core/Components';
import { getTerrainClass } from './Noise';

const GRID_CELL_SIZE = 2;
const GRID_W = 100;
const GRID_H = 100;
const GRID_OFFSET_X = -100;
const GRID_OFFSET_Z = -100;
const SECTOR_SIZE = 10; // in cells

export type SectorId = number;

export interface NavCostGrid {
  width: number;
  height: number;
  cellSize: number;
  costs: Float32Array;
}

export interface FlowField {
  goalCell: [number, number];
  sectorRoute: SectorId[];
  vectors: Int8Array;
}

interface FindPathOptions {
  unitRadius?: number;
  avoidDynamic?: boolean;
  groupId?: string;
}

interface Node {
  cx: number;
  cz: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

const obstacles = new Uint8Array(GRID_W * GRID_H);
const dynamicOccupancy = new Float32Array(GRID_W * GRID_H);
const flowCache = new Map<string, FlowField>();
let flowCacheTick = 0;

function idx(cx: number, cz: number): number {
  return cz * GRID_W + cx;
}

function inBounds(cx: number, cz: number): boolean {
  return cx >= 0 && cx < GRID_W && cz >= 0 && cz < GRID_H;
}

export function worldToCell(x: number, z: number): [number, number] {
  return [
    Math.floor((x - GRID_OFFSET_X) / GRID_CELL_SIZE),
    Math.floor((z - GRID_OFFSET_Z) / GRID_CELL_SIZE),
  ];
}

function cellToWorld(cx: number, cz: number): Vec2 {
  return {
    x: cx * GRID_CELL_SIZE + GRID_OFFSET_X + GRID_CELL_SIZE * 0.5,
    z: cz * GRID_CELL_SIZE + GRID_OFFSET_Z + GRID_CELL_SIZE * 0.5,
  };
}

function sectorOfCell(cx: number, cz: number): SectorId {
  const sx = Math.floor(cx / SECTOR_SIZE);
  const sz = Math.floor(cz / SECTOR_SIZE);
  const sw = Math.ceil(GRID_W / SECTOR_SIZE);
  return sz * sw + sx;
}

function heuristic(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

const DIRS: Array<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function terrainMoveCost(cx: number, cz: number): number {
  const w = cellToWorld(cx, cz);
  const t = getTerrainClass(w.x, w.z);
  switch (t) {
    case 'marsh': return 1.45;
    case 'forest': return 1.22;
    case 'slope': return 1.35;
    case 'shore': return 1.2;
    default: return 1.0;
  }
}

function dynamicMoveCost(cx: number, cz: number): number {
  return 1 + Math.min(2.5, dynamicOccupancy[idx(cx, cz)] * 0.2);
}

function isBlockedForRadius(cx: number, cz: number, radius: number): boolean {
  if (!inBounds(cx, cz)) return true;
  if (radius <= 0.6) return obstacles[idx(cx, cz)] === 1;

  const rCells = Math.max(1, Math.ceil(radius / GRID_CELL_SIZE));
  for (let dz = -rCells; dz <= rCells; dz++) {
    for (let dx = -rCells; dx <= rCells; dx++) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (!inBounds(nx, nz)) return true;
      if (obstacles[idx(nx, nz)] === 1) return true;
    }
  }
  return false;
}

function smoothPath(path: Vec2[]): Vec2[] {
  if (path.length <= 2) return path;
  const result = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = result[result.length - 1];
    const cur = path[i];
    const next = path[i + 1];
    const dx1 = cur.x - prev.x;
    const dz1 = cur.z - prev.z;
    const dx2 = next.x - cur.x;
    const dz2 = next.z - cur.z;
    if (Math.abs(dx1 - dx2) > 0.001 || Math.abs(dz1 - dz2) > 0.001) result.push(cur);
  }
  result.push(path[path.length - 1]);
  return result;
}

function makeFlowKey(sx: number, sz: number, ex: number, ez: number): string {
  return `${sectorOfCell(sx, sz)}:${sectorOfCell(ex, ez)}`;
}

function buildFlowField(goalCx: number, goalCz: number): Int8Array {
  const vectors = new Int8Array(GRID_W * GRID_H * 2);
  for (let cz = 0; cz < GRID_H; cz++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const i = idx(cx, cz) * 2;
      const dx = Math.sign(goalCx - cx);
      const dz = Math.sign(goalCz - cz);
      vectors[i] = dx;
      vectors[i + 1] = dz;
    }
  }
  return vectors;
}

export function beginNavFrame(): void {
  dynamicOccupancy.fill(0);
  flowCacheTick++;
  if (flowCacheTick % 45 === 0) flowCache.clear();
}

export function addDynamicOccupancy(worldX: number, worldZ: number, radius = 0.8, weight = 1): void {
  const [cx, cz] = worldToCell(worldX, worldZ);
  const rCells = Math.max(1, Math.ceil(radius / GRID_CELL_SIZE));
  for (let dz = -rCells; dz <= rCells; dz++) {
    for (let dx = -rCells; dx <= rCells; dx++) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (!inBounds(nx, nz)) continue;
      dynamicOccupancy[idx(nx, nz)] += weight;
    }
  }
}

export function getNavCostGridSnapshot(): NavCostGrid {
  const costs = new Float32Array(GRID_W * GRID_H);
  for (let cz = 0; cz < GRID_H; cz++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      costs[idx(cx, cz)] = obstacles[idx(cx, cz)] ? 9999 : terrainMoveCost(cx, cz) * dynamicMoveCost(cx, cz);
    }
  }
  return { width: GRID_W, height: GRID_H, cellSize: GRID_CELL_SIZE, costs };
}

export function markObstacle(worldX: number, worldZ: number, w: number, d: number): void {
  const [cx0, cz0] = worldToCell(worldX - w / 2, worldZ - d / 2);
  const [cx1, cz1] = worldToCell(worldX + w / 2, worldZ + d / 2);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (inBounds(cx, cz)) obstacles[idx(cx, cz)] = 1;
    }
  }
}

export function findPath(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  maxIterations = 2200,
  options: FindPathOptions = {}
): Vec2[] {
  const [sx, sz] = worldToCell(fromX, fromZ);
  let [ex, ez] = worldToCell(toX, toZ);
  const radius = options.unitRadius ?? 0.45;

  if (!inBounds(sx, sz) || !inBounds(ex, ez)) return [{ x: toX, z: toZ }];

  if (isBlockedForRadius(ex, ez, radius)) {
    let found = false;
    outer:
    for (let r = 1; r <= 6; r++) {
      for (const [dx, dz] of DIRS) {
        const nx = ex + dx * r;
        const nz = ez + dz * r;
        if (!inBounds(nx, nz)) continue;
        if (!isBlockedForRadius(nx, nz, radius)) {
          ex = nx; ez = nz; found = true; break outer;
        }
      }
    }
    if (!found) return [{ x: toX, z: toZ }];
  }

  const key = makeFlowKey(sx, sz, ex, ez);
  if (options.groupId && !flowCache.has(key)) {
    flowCache.set(key, {
      goalCell: [ex, ez],
      sectorRoute: [sectorOfCell(sx, sz), sectorOfCell(ex, ez)],
      vectors: buildFlowField(ex, ez),
    });
  }

  const open = new Map<number, Node>();
  const closed = new Set<number>();
  const start: Node = { cx: sx, cz: sz, g: 0, h: heuristic(sx, sz, ex, ez), f: 0, parent: null };
  start.f = start.g + start.h;
  open.set(idx(sx, sz), start);

  let iter = 0;
  while (open.size > 0 && iter < maxIterations) {
    iter++;
    let current: Node | null = null;
    let lowestF = Infinity;
    for (const node of open.values()) {
      if (node.f < lowestF) { lowestF = node.f; current = node; }
    }
    if (!current) break;

    const cId = idx(current.cx, current.cz);
    open.delete(cId);
    closed.add(cId);

    if (current.cx === ex && current.cz === ez) {
      const path: Vec2[] = [];
      let n: Node | null = current;
      while (n) { path.unshift(cellToWorld(n.cx, n.cz)); n = n.parent; }
      return smoothPath(path);
    }

    for (const [dx, dz] of DIRS) {
      const nx = current.cx + dx;
      const nz = current.cz + dz;
      if (!inBounds(nx, nz)) continue;
      const nId = idx(nx, nz);
      if (closed.has(nId)) continue;
      if (isBlockedForRadius(nx, nz, radius)) continue;

      const diagonal = dx !== 0 && dz !== 0;
      if (diagonal) {
        if (isBlockedForRadius(current.cx + dx, current.cz, radius) || isBlockedForRadius(current.cx, current.cz + dz, radius)) continue;
      }

      const base = diagonal ? 1.414 : 1.0;
      const terrainCost = terrainMoveCost(nx, nz);
      const dynCost = options.avoidDynamic === false ? 1 : dynamicMoveCost(nx, nz);
      const g = current.g + base * terrainCost * dynCost;

      const existing = open.get(nId);
      if (existing && existing.g <= g) continue;

      const node: Node = {
        cx: nx,
        cz: nz,
        g,
        h: heuristic(nx, nz, ex, ez),
        f: 0,
        parent: current,
      };
      node.f = node.g + node.h;
      open.set(nId, node);
    }
  }

  return [{ x: toX, z: toZ }];
}

