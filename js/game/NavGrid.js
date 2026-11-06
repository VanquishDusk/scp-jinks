// Walkability grid (one cell per voxel column) with A* pathfinding and path
// smoothing, used by NPCs and anomalies to move through the facility.

import { VOXEL } from '../config.js';

const SQRT2 = Math.SQRT2;
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

class MinHeap {
  constructor() {
    this.items = [];
    this.keys = [];
  }
  get size() {
    return this.items.length;
  }
  clear() {
    this.items.length = 0;
    this.keys.length = 0;
  }
  push(item, key) {
    const a = this.items;
    const k = this.keys;
    let i = a.length;
    a.push(item);
    k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      a[i] = a[p];
      k[i] = k[p];
      i = p;
    }
    a[i] = item;
    k[i] = key;
  }
  pop() {
    const a = this.items;
    const k = this.keys;
    const top = a[0];
    const lastItem = a.pop();
    const lastKey = k.pop();
    if (a.length > 0) {
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        let mk = lastKey;
        if (l < n && k[l] < mk) {
          m = l;
          mk = k[l];
        }
        if (r < n && k[r] < mk) m = r;
        if (m === i) break;
        a[i] = a[m];
        k[i] = k[m];
        i = m;
      }
      a[i] = lastItem;
      k[i] = lastKey;
    }
    return top;
  }
}

export class NavGrid {
  /**
   * @param world      VoxelWorld
   * @param colliders  static prop AABBs (meters) that block walking
   */
  constructor(world, colliders) {
    const w = world.w;
    const d = world.d;
    this.w = w;
    this.d = d;
    this.walk = new Uint8Array(w * d);
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        if (!world.isSolid(x, 0, z)) continue;
        let ok = true;
        for (let y = 1; y <= 4; y++) {
          if (world.isSolid(x, y, z)) {
            ok = false;
            break;
          }
        }
        if (ok) this.walk[z * w + x] = 1;
      }
    }
    // Walls only (before furniture): used for "clear straight line" checks.
    this.base = this.walk.slice();
    const pad = 0.12;
    for (const c of colliders) {
      if (c[1] > 1.9 || c[4] < 0.6) continue;
      const x0 = Math.ceil((c[0] - pad) / VOXEL - 0.5);
      const x1 = Math.floor((c[3] + pad) / VOXEL - 0.5);
      const z0 = Math.ceil((c[2] - pad) / VOXEL - 0.5);
      const z1 = Math.floor((c[5] + pad) / VOXEL - 0.5);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (this.inside(x, z)) this.walk[z * w + x] = 0;
    }
    // Prefer the middle of corridors: cells next to walls cost more.
    this.cost = new Float32Array(w * d).fill(1);
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        if (!this.walk[z * w + x]) continue;
        let near = 0;
        for (const [dx, dz] of DIRS) if (!this.isWalkable(x + dx, z + dz)) near++;
        if (near) this.cost[z * w + x] = 1.8 + near * 0.15;
      }
    }
    this.g = new Float32Array(w * d);
    this.came = new Int32Array(w * d);
    this.stamp = new Uint32Array(w * d);
    this.closed = new Uint32Array(w * d);
    this.gen = 1;
    this.heap = new MinHeap();
  }

  inside(x, z) {
    return x >= 0 && z >= 0 && x < this.w && z < this.d;
  }

  isWalkable(x, z) {
    return this.inside(x, z) && this.walk[z * this.w + x] === 1;
  }

  walkableAtWorld(wx, wz) {
    return this.isWalkable(Math.floor(wx / VOXEL), Math.floor(wz / VOXEL));
  }

  /** Nearest walkable cell (index) to a cell, searching outward. */
  nearest(cx, cz, maxR = 8) {
    if (this.isWalkable(cx, cz)) return cz * this.w + cx;
    for (let r = 1; r <= maxR; r++) {
      let best = -1;
      let bd = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (!this.isWalkable(cx + dx, cz + dz)) continue;
          const dd = dx * dx + dz * dz;
          if (dd < bd) {
            bd = dd;
            best = (cz + dz) * this.w + cx + dx;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Straight walkable line between two world points (cell sampling). */
  lineWalkable(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (VOXEL * 0.25)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.walkableAtWorld(ax + dx * t, az + dz * t)) return false;
    }
    return true;
  }

  /** Straight line that crosses no wall or glass (furniture ignored). */
  lineClear(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (VOXEL * 0.25)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.floor((ax + dx * t) / VOXEL);
      const z = Math.floor((az + dz * t) / VOXEL);
      if (!this.inside(x, z) || !this.base[z * this.w + x]) return false;
    }
    return true;
  }

  /** Path between world points → array of [x, z] (meters) or null. */
  findPath(sx, sz, tx, tz, maxNodes = 60000) {
    const w = this.w;
    const s = this.nearest(Math.floor(sx / VOXEL), Math.floor(sz / VOXEL));
    const t = this.nearest(Math.floor(tx / VOXEL), Math.floor(tz / VOXEL));
    if (s < 0 || t < 0) return null;
    const gen = ++this.gen;
    const { g, came, stamp, closed, heap, walk, cost } = this;
    const txc = t % w;
    const tzc = (t / w) | 0;
    const h = (i) => {
      const dx = Math.abs((i % w) - txc);
      const dz = Math.abs(((i / w) | 0) - tzc);
      return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
    };
    heap.clear();
    stamp[s] = gen;
    g[s] = 0;
    came[s] = -1;
    heap.push(s, h(s));
    let found = false;
    let expanded = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === t) {
        found = true;
        break;
      }
      if (++expanded > maxNodes) break;
      const cx = cur % w;
      const cz = (cur / w) | 0;
      for (const [dx, dz, dc] of DIRS) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!this.inside(nx, nz)) continue;
        const ni = nz * w + nx;
        if (!walk[ni] || closed[ni] === gen) continue;
        // No cutting corners around walls.
        if (dx && dz && (!walk[cz * w + nx] || !walk[nz * w + cx])) continue;
        const ng = g[cur] + dc * cost[ni];
        if (stamp[ni] !== gen || ng < g[ni]) {
          stamp[ni] = gen;
          g[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + h(ni));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = t; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => [((i % w) + 0.5) * VOXEL, (((i / w) | 0) + 0.5) * VOXEL]);
    if (this.walkableAtWorld(tx, tz)) pts[pts.length - 1] = [tx, tz];
    return this.smooth(sx, sz, pts);
  }

  /** Greedy string-pulling: skip waypoints that are in direct line of sight. */
  smooth(sx, sz, pts) {
    const out = [];
    let ax = sx;
    let az = sz;
    let i = 0;
    while (i < pts.length) {
      let j = Math.min(pts.length - 1, i + 24);
      while (j > i && !this.lineWalkable(ax, az, pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      ax = pts[j][0];
      az = pts[j][1];
      i = j + 1;
    }
    return out;
  }

  /** A random walkable world point within `radius` meters of (x, z). */
  randomPointNear(x, z, radius, rnd = Math.random) {
    for (let k = 0; k < 30; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * radius;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (this.walkableAtWorld(px, pz)) return [px, pz];
    }
    return null;
  }
}
