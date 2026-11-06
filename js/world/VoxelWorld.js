// Voxel grid storage, baked lighting, chunk meshing and spatial queries.
//
// Coordinates: voxel (x, y, z) occupies world space [x, x+1) * VOXEL meters.
// The grid is stored y-major: index = (y * depth + z) * width + x.

import * as THREE from 'three';
import { VOXEL } from '../config.js';
import { BLOCKS, B, FACE_DIRS, STYLES, wallTexture } from './blocks.js';
import { tileUV } from './textures.js';

const OPAQUE = Uint8Array.from(BLOCKS, (b) => (b.opaque ? 1 : 0));
const SOLID = Uint8Array.from(BLOCKS, (b) => (b.solid ? 1 : 0));
const UNSET = 255;

// Corner positions for each face (CCW when viewed from outside) and the two
// in-plane axes used for ambient occlusion / smooth lighting samples.
const FACE_CORNERS = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], // +x
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], // -x
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], // +y
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], // -y
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], // +z
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], // -z
];
const FACE_AXES = [
  [1, 2], [1, 2], // x faces: in-plane axes y, z
  [0, 2], [0, 2], // y faces: x, z
  [0, 1], [0, 1], // z faces: x, y
];
const CORNER_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
// Directional shading so geometry reads well even under flat light.
const FACE_SHADE = [0.84, 0.84, 1.0, 0.62, 0.92, 0.92];
const AO_CURVE = [0.48, 0.66, 0.84, 1.0];

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class VoxelWorld {
  constructor(width, height, depth) {
    this.w = width;
    this.h = height;
    this.d = depth;
    this.size = width * height * depth;
    this.blocks = new Uint8Array(this.size).fill(B.CONCRETE);
    this.room = new Uint8Array(this.size);
    this.faceTex = new Uint8Array(this.size * 6).fill(UNSET);
    this.light = new Float32Array(this.size * 3);
    this.ambient = [0.05, 0.055, 0.065];
  }

  index(x, y, z) {
    return (y * this.d + z) * this.w + x;
  }

  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d;
  }

  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return B.CONCRETE;
    return this.blocks[this.index(x, y, z)];
  }

  set(x, y, z, block) {
    if (this.inBounds(x, y, z)) this.blocks[this.index(x, y, z)] = block;
  }

  isSolid(x, y, z) {
    return SOLID[this.get(x, y, z)] === 1;
  }

  isOpaque(x, y, z) {
    return OPAQUE[this.get(x, y, z)] === 1;
  }

  setFaceTex(x, y, z, face, tex) {
    if (this.inBounds(x, y, z)) this.faceTex[this.index(x, y, z) * 6 + face] = tex;
  }

  roomAtWorld(wx, wy, wz) {
    const x = Math.floor(wx / VOXEL);
    const y = Math.floor(wy / VOXEL);
    const z = Math.floor(wz / VOXEL);
    if (!this.inBounds(x, y, z)) return 0;
    return this.room[this.index(x, y, z)];
  }

  // ---------------------------------------------------------------------------
  // Painting: texture every exposed face of paintable blocks by room style.
  // ---------------------------------------------------------------------------
  paintRooms(roomStyles) {
    const { w, h, d, blocks, room, faceTex } = this;
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          const i = this.index(x, y, z);
          if (blocks[i] !== B.AIR) continue;
          const style = roomStyles[room[i]] || STYLES.corridor;
          for (let f = 0; f < 6; f++) {
            const [dx, dy, dz] = FACE_DIRS[f];
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            if (!this.inBounds(nx, ny, nz)) continue;
            const ni = this.index(nx, ny, nz);
            if (!BLOCKS[blocks[ni]].paintable) continue;
            let tex;
            if (dy === -1) tex = style.floor;
            else if (dy === 1) tex = style.ceiling;
            else tex = wallTexture(style, y);
            faceTex[ni * 6 + (f ^ 1)] = tex;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Lighting: direct light with voxel shadows + diffusion "bounce" + ambient.
  // Light positions/radii are in voxel units.
  // ---------------------------------------------------------------------------
  computeLighting(lights) {
    const { w, h, d, blocks } = this;
    const L = this.light;
    L.fill(0);

    for (const lt of lights) {
      const { x, y, z, radius: r, intensity } = lt;
      const [cr, cg, cb] = lt.color;
      const r2 = r * r;
      const x0 = Math.max(0, Math.floor(x - r));
      const x1 = Math.min(w - 1, Math.floor(x + r));
      const y0 = Math.max(0, Math.floor(y - r));
      const y1 = Math.min(h - 1, Math.floor(y + r));
      const z0 = Math.max(0, Math.floor(z - r));
      const z1 = Math.min(d - 1, Math.floor(z + r));
      const k = lt.falloff ?? 0.03;
      for (let vy = y0; vy <= y1; vy++) {
        const dy = vy + 0.5 - y;
        for (let vz = z0; vz <= z1; vz++) {
          const dz = vz + 0.5 - z;
          for (let vx = x0; vx <= x1; vx++) {
            const i = (vy * d + vz) * w + vx;
            if (OPAQUE[blocks[i]]) continue;
            const dx = vx + 0.5 - x;
            const dist2 = dx * dx + dy * dy + dz * dz;
            if (dist2 > r2) continue;
            if (!this.visible(x, y, z, vx + 0.5, vy + 0.5, vz + 0.5)) continue;
            const q = dist2 / r2;
            const win = (1 - q * q) * (1 - q * q);
            const att = (intensity * win) / (1 + k * dist2);
            L[i * 3] += cr * att;
            L[i * 3 + 1] += cg * att;
            L[i * 3 + 2] += cb * att;
          }
        }
      }
    }

    // Cheap indirect light: diffuse the direct light through open space.
    const bounce = new Float32Array(L);
    const tmp = new Float32Array(L.length);
    const strideZ = w;
    const strideY = w * d;
    for (let iter = 0; iter < 4; iter++) {
      for (let y = 0; y < h; y++) {
        for (let z = 0; z < d; z++) {
          for (let x = 0; x < w; x++) {
            const i = (y * d + z) * w + x;
            if (OPAQUE[blocks[i]]) continue;
            let sr = bounce[i * 3];
            let sg = bounce[i * 3 + 1];
            let sb = bounce[i * 3 + 2];
            let n = 1;
            const neigh = [
              x > 0 ? i - 1 : -1,
              x < w - 1 ? i + 1 : -1,
              z > 0 ? i - strideZ : -1,
              z < d - 1 ? i + strideZ : -1,
              y > 0 ? i - strideY : -1,
              y < h - 1 ? i + strideY : -1,
            ];
            for (let k = 0; k < 6; k++) {
              const j = neigh[k];
              if (j < 0 || OPAQUE[blocks[j]]) continue;
              sr += bounce[j * 3];
              sg += bounce[j * 3 + 1];
              sb += bounce[j * 3 + 2];
              n++;
            }
            tmp[i * 3] = sr / n;
            tmp[i * 3 + 1] = sg / n;
            tmp[i * 3 + 2] = sb / n;
          }
        }
      }
      bounce.set(tmp);
    }

    // Combine, then apply a soft shoulder so bright areas roll off instead of
    // clipping to flat white.
    const [ar, ag, ab] = this.ambient;
    const tone = (v) => (1.3 * v) / (1 + 0.55 * v);
    for (let i = 0; i < this.size; i++) {
      if (OPAQUE[blocks[i]]) continue;
      L[i * 3] = tone(L[i * 3] * 0.8 + bounce[i * 3] * 0.5 + ar);
      L[i * 3 + 1] = tone(L[i * 3 + 1] * 0.8 + bounce[i * 3 + 1] * 0.5 + ag);
      L[i * 3 + 2] = tone(L[i * 3 + 2] * 0.8 + bounce[i * 3 + 2] * 0.5 + ab);
    }
  }

  /** Voxel line-of-sight test (voxel units) between two points. */
  visible(ox, oy, oz, tx, ty, tz) {
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);
    const ex = Math.floor(tx);
    const ey = Math.floor(ty);
    const ez = Math.floor(tz);
    const dx = tx - ox;
    const dy = ty - oy;
    const dz = tz - oz;
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const adz = Math.abs(dz);
    const tdx = adx > 1e-9 ? 1 / adx : Infinity;
    const tdy = ady > 1e-9 ? 1 / ady : Infinity;
    const tdz = adz > 1e-9 ? 1 / adz : Infinity;
    let tmx = adx > 1e-9 ? (sx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
    let tmy = ady > 1e-9 ? (sy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
    let tmz = adz > 1e-9 ? (sz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
    const { w, d, blocks } = this;
    for (let steps = 0; steps < 256; steps++) {
      if (x === ex && y === ey && z === ez) return true;
      if (tmx < tmy && tmx < tmz) {
        x += sx;
        tmx += tdx;
      } else if (tmy < tmz) {
        y += sy;
        tmy += tdy;
      } else {
        z += sz;
        tmz += tdz;
      }
      if (x === ex && y === ey && z === ez) return true;
      if (!this.inBounds(x, y, z)) return false;
      if (OPAQUE[blocks[(y * d + z) * w + x]]) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Meshing
  // ---------------------------------------------------------------------------
  buildMeshes(material, glassMaterial, chunk = 16) {
    const group = new THREE.Group();
    group.name = 'voxel-world';
    for (let cz = 0; cz < this.d; cz += chunk) {
      for (let cx = 0; cx < this.w; cx += chunk) {
        const opaque = this._meshChunk(cx, cz, chunk, false);
        const glass = this._meshChunk(cx, cz, chunk, true);
        if (opaque) group.add(new THREE.Mesh(opaque, material));
        if (glass) {
          const m = new THREE.Mesh(glass, glassMaterial);
          m.renderOrder = 2;
          group.add(m);
        }
      }
    }
    return group;
  }

  _meshChunk(cx, cz, chunk, transparentPass) {
    const { w, h, d, blocks, faceTex, light } = this;
    const pos = [];
    const uv = [];
    const col = [];
    const idx = [];
    const xEnd = Math.min(w, cx + chunk);
    const zEnd = Math.min(d, cz + chunk);
    const s = [0, 0, 0];
    const lightAt = (x, y, z, out) => {
      const i = this.index(x, y, z) * 3;
      out[0] += light[i];
      out[1] += light[i + 1];
      out[2] += light[i + 2];
    };

    for (let y = 0; y < h; y++) {
      for (let z = cz; z < zEnd; z++) {
        for (let x = cx; x < xEnd; x++) {
          const i = this.index(x, y, z);
          const b = blocks[i];
          if (b === B.AIR) continue;
          const def = BLOCKS[b];
          if (!!def.transparent !== transparentPass) continue;
          const tint = 0.93 + hash3(x, y, z) * 0.1;

          for (let f = 0; f < 6; f++) {
            const [dx, dy, dz] = FACE_DIRS[f];
            const ax = x + dx;
            const ay = y + dy;
            const az = z + dz;
            const nb = this.get(ax, ay, az);
            if (transparentPass) {
              if (nb !== B.AIR) continue;
            } else if (OPAQUE[nb]) {
              continue;
            }

            let tex = faceTex[i * 6 + f];
            if (tex === UNSET) tex = def.tex;
            const [u0, v0, u1, v1] = tileUV(tex);
            const corners = FACE_CORNERS[f];
            const [ua, va] = FACE_AXES[f];
            const base = pos.length / 3;
            const bright = [0, 0, 0, 0];

            for (let c = 0; c < 4; c++) {
              const cc = corners[c];
              pos.push((x + cc[0]) * VOXEL, (y + cc[1]) * VOXEL, (z + cc[2]) * VOXEL);
              const cuv = CORNER_UV[c];
              uv.push(cuv[0] ? u1 : u0, cuv[1] ? v1 : v0);

              if (def.emissive) {
                col.push(def.emissive[0], def.emissive[1], def.emissive[2]);
                bright[c] = 1;
                continue;
              }

              // Smooth lighting + AO from the 4 voxels around this vertex.
              const A = [ax, ay, az];
              const su = cc[ua] ? 1 : -1;
              const sv = cc[va] ? 1 : -1;
              const p1 = A.slice();
              p1[ua] += su;
              const p2 = A.slice();
              p2[va] += sv;
              const pc = A.slice();
              pc[ua] += su;
              pc[va] += sv;
              const o1 = this.isOpaque(p1[0], p1[1], p1[2]) ? 1 : 0;
              const o2 = this.isOpaque(p2[0], p2[1], p2[2]) ? 1 : 0;
              const oc = this.isOpaque(pc[0], pc[1], pc[2]) ? 1 : 0;
              const ao = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);

              s[0] = s[1] = s[2] = 0;
              let n = 0;
              if (this.inBounds(ax, ay, az)) {
                lightAt(ax, ay, az, s);
                n++;
              }
              if (!o1) {
                lightAt(p1[0], p1[1], p1[2], s);
                n++;
              }
              if (!o2) {
                lightAt(p2[0], p2[1], p2[2], s);
                n++;
              }
              if (!oc && !(o1 && o2)) {
                lightAt(pc[0], pc[1], pc[2], s);
                n++;
              }
              const k = (AO_CURVE[transparentPass ? 3 : ao] * FACE_SHADE[f] * tint) / Math.max(1, n);
              const r = Math.min(1.6, s[0] * k);
              const g = Math.min(1.6, s[1] * k);
              const bl = Math.min(1.6, s[2] * k);
              col.push(r, g, bl);
              bright[c] = r + g + bl;
            }

            // Flip the quad diagonal to avoid AO interpolation artifacts.
            if (bright[0] + bright[2] < bright[1] + bright[3]) {
              idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
            } else {
              idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
          }
        }
      }
    }

    if (pos.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  // ---------------------------------------------------------------------------
  // Queries (world space, meters)
  // ---------------------------------------------------------------------------

  /** Trilinear light sample at a world position, ignoring opaque voxels. */
  sampleLight(wx, wy, wz, out = [0, 0, 0]) {
    const fx = wx / VOXEL - 0.5;
    const fy = wy / VOXEL - 0.5;
    const fz = wz / VOXEL - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const ty = fy - y0;
    const tz = fz - z0;
    let r = 0;
    let g = 0;
    let b = 0;
    let wsum = 0;
    for (let k = 0; k < 8; k++) {
      const ix = x0 + (k & 1);
      const iy = y0 + ((k >> 1) & 1);
      const iz = z0 + ((k >> 2) & 1);
      if (!this.inBounds(ix, iy, iz)) continue;
      const i = this.index(ix, iy, iz);
      if (OPAQUE[this.blocks[i]]) continue;
      const wgt = (k & 1 ? tx : 1 - tx) * ((k >> 1) & 1 ? ty : 1 - ty) * ((k >> 2) & 1 ? tz : 1 - tz);
      r += this.light[i * 3] * wgt;
      g += this.light[i * 3 + 1] * wgt;
      b += this.light[i * 3 + 2] * wgt;
      wsum += wgt;
    }
    if (wsum < 1e-4) {
      // Fully embedded: search the immediate neighbourhood.
      const cx = Math.floor(wx / VOXEL);
      const cy = Math.floor(wy / VOXEL);
      const cz = Math.floor(wz / VOXEL);
      for (let k = 0; k < 6; k++) {
        const [dx, dy, dz] = FACE_DIRS[k];
        const nx = cx + dx;
        const ny = cy + dy;
        const nz = cz + dz;
        if (this.inBounds(nx, ny, nz) && !this.isOpaque(nx, ny, nz)) {
          const i = this.index(nx, ny, nz);
          r += this.light[i * 3];
          g += this.light[i * 3 + 1];
          b += this.light[i * 3 + 2];
          wsum += 1;
        }
      }
      if (wsum < 1e-4) {
        out[0] = this.ambient[0];
        out[1] = this.ambient[1];
        out[2] = this.ambient[2];
        return out;
      }
    }
    out[0] = r / wsum;
    out[1] = g / wsum;
    out[2] = b / wsum;
    return out;
  }

  /** Append [minX,minY,minZ,maxX,maxY,maxZ] boxes of solid voxels in a region. */
  collectSolidBoxes(minX, minY, minZ, maxX, maxY, maxZ, out) {
    const x0 = Math.floor(minX / VOXEL);
    const y0 = Math.floor(minY / VOXEL);
    const z0 = Math.floor(minZ / VOXEL);
    const x1 = Math.floor(maxX / VOXEL);
    const y1 = Math.floor(maxY / VOXEL);
    const z1 = Math.floor(maxZ / VOXEL);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (this.isSolid(x, y, z)) {
            out.push([x * VOXEL, y * VOXEL, z * VOXEL, (x + 1) * VOXEL, (y + 1) * VOXEL, (z + 1) * VOXEL]);
          }
        }
      }
    }
    return out;
  }

  /** Distance (meters) along a ray to the first solid voxel, or Infinity. */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const px = ox / VOXEL;
    const py = oy / VOXEL;
    const pz = oz / VOXEL;
    let x = Math.floor(px);
    let y = Math.floor(py);
    let z = Math.floor(pz);
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? 1 / Math.abs(dx) : Infinity;
    const tdy = Math.abs(dy) > 1e-9 ? 1 / Math.abs(dy) : Infinity;
    const tdz = Math.abs(dz) > 1e-9 ? 1 / Math.abs(dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-9 ? (sx > 0 ? x + 1 - px : px - x) * tdx : Infinity;
    let tmy = Math.abs(dy) > 1e-9 ? (sy > 0 ? y + 1 - py : py - y) * tdy : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? (sz > 0 ? z + 1 - pz : pz - z) * tdz : Infinity;
    const maxT = maxDist / VOXEL;
    let t = 0;
    while (t <= maxT) {
      if (this.isSolid(x, y, z)) return t * VOXEL;
      if (tmx < tmy && tmx < tmz) {
        x += sx;
        t = tmx;
        tmx += tdx;
      } else if (tmy < tmz) {
        y += sy;
        t = tmy;
        tmy += tdy;
      } else {
        z += sz;
        t = tmz;
        tmz += tdz;
      }
    }
    return Infinity;
  }
}
