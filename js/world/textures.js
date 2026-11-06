// Procedurally painted 16x16 pixel-art textures packed into a single atlas.
// Everything is generated at load time, so the game ships no image files.

import * as THREE from 'three';

export const TILE = 16;
const COLS = 8;
const ROWS = 8;

/** Seeded PRNG so textures are identical on every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

class TilePainter {
  constructor(data, stride, ox, oy, seed) {
    this.data = data;
    this.stride = stride;
    this.ox = ox;
    this.oy = oy;
    this.rand = mulberry32(seed);
  }
  set(x, y, c) {
    x = ((x % TILE) + TILE) % TILE;
    y = ((y % TILE) + TILE) % TILE;
    const i = ((this.oy + y) * this.stride + this.ox + x) * 4;
    this.data[i] = clamp255(c[0]);
    this.data[i + 1] = clamp255(c[1]);
    this.data[i + 2] = clamp255(c[2]);
    this.data[i + 3] = 255;
  }
  get(x, y) {
    x = ((x % TILE) + TILE) % TILE;
    y = ((y % TILE) + TILE) % TILE;
    const i = ((this.oy + y) * this.stride + this.ox + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }
  /** Brightness jitter applied equally to all channels. */
  jit(c, n) {
    const d = (this.rand() * 2 - 1) * n;
    return [c[0] + d, c[1] + d, c[2] + d];
  }
  fill(c, n = 0) {
    this.rect(0, 0, TILE, TILE, c, n);
  }
  rect(x, y, w, h, c, n = 0) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, this.jit(c, n));
  }
  shade(x, y, f) {
    const c = this.get(x, y);
    this.set(x, y, [c[0] * f, c[1] * f, c[2] * f]);
  }
  hline(y, c, n = 0) {
    this.rect(0, y, TILE, 1, c, n);
  }
  vline(x, c, n = 0) {
    this.rect(x, 0, 1, TILE, c, n);
  }
  speckle(count, c, n = 0) {
    for (let k = 0; k < count; k++) {
      this.set((this.rand() * TILE) | 0, (this.rand() * TILE) | 0, this.jit(c, n));
    }
  }
  /** Soft darker blobs (stains, grime). */
  stain(count, strength) {
    for (let k = 0; k < count; k++) {
      const cx = this.rand() * TILE;
      const cy = this.rand() * TILE;
      const r = 1.5 + this.rand() * 3;
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d < r) this.shade(x, y, 1 - strength * (1 - d / r));
        }
      }
    }
  }
}

// --- Stripe helper: white upper wall, colored band, grey lower wall ------------
function stripe(color, upper = [202, 202, 196], lower = [150, 152, 156]) {
  return (p) => {
    p.rect(0, 0, TILE, 6, upper, 4);
    p.rect(0, 6, TILE, 1, [color[0] * 0.7, color[1] * 0.7, color[2] * 0.7], 2);
    p.rect(0, 7, TILE, 3, color, 5);
    p.rect(0, 10, TILE, 1, [color[0] * 0.6, color[1] * 0.6, color[2] * 0.6], 2);
    p.rect(0, 11, TILE, 5, lower, 4);
    p.vline(0, [lower[0] * 0.85, lower[1] * 0.85, lower[2] * 0.85]);
  };
}

function cinder(p, base = [160, 156, 146]) {
  p.fill(base, 7);
  const mortar = [118, 115, 108];
  p.hline(7, mortar, 3);
  p.hline(15, mortar, 3);
  for (let y = 0; y < 7; y++) p.set(0, y, p.jit(mortar, 3));
  for (let y = 8; y < 15; y++) p.set(8, y, p.jit(mortar, 3));
  // pitted block surface
  p.speckle(10, [base[0] * 0.8, base[1] * 0.8, base[2] * 0.8], 6);
}

/**
 * Tile definitions in atlas order. Index in this array == texture id.
 */
const TILE_DEFS = [
  ['CONCRETE', (p) => {
    p.fill([118, 118, 116], 9);
    p.speckle(14, [92, 92, 90], 6);
    p.speckle(6, [140, 140, 138], 4);
  }],
  ['FLOOR_TILE', (p) => {
    p.fill([198, 198, 192], 5);
    p.hline(0, [148, 148, 144], 3);
    p.vline(0, [148, 148, 144], 3);
    p.stain(1, 0.08);
  }],
  ['FLOOR_DARK', (p) => {
    p.fill([62, 64, 68], 4);
    for (let y = 1; y < TILE; y += 4) for (let x = 1; x < TILE; x += 4) {
      p.set(x, y, [84, 86, 90]);
      p.set(x + 1, y + 1, [44, 45, 48]);
    }
  }],
  ['FLOOR_CHECKER', (p) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const w = ((x >> 3) + (y >> 3)) & 1;
      p.set(x, y, p.jit(w ? [212, 206, 194] : [52, 54, 60], 5));
    }
    p.stain(1, 0.1);
  }],
  ['FLOOR_CARPET', (p) => {
    p.fill([70, 78, 94], 9);
    p.speckle(30, [58, 64, 80], 5);
    p.speckle(12, [92, 100, 116], 5);
  }],
  ['FLOOR_METAL', (p) => {
    p.fill([108, 110, 114], 5);
    for (let y = 0; y < TILE; y += 4) for (let x = 0; x < TILE; x += 4) {
      const ox = (y / 4) % 2 ? 2 : 0;
      p.set(x + ox, y + 1, [148, 150, 154]);
      p.set(x + ox + 1, y + 2, [148, 150, 154]);
      p.set(x + ox + 1, y + 1, [80, 82, 86]);
    }
  }],
  ['FLOOR_LAB', (p) => {
    p.fill([222, 226, 228], 3);
    p.hline(0, [176, 182, 188], 2);
    p.hline(8, [176, 182, 188], 2);
    p.vline(0, [176, 182, 188], 2);
    p.vline(8, [176, 182, 188], 2);
  }],
  ['FLOOR_DIRTY', (p) => {
    p.fill([108, 104, 96], 8);
    p.stain(3, 0.18);
    p.speckle(10, [84, 80, 74], 5);
    p.hline(0, [90, 86, 80], 3);
  }],
  ['WALL_WHITE', (p) => {
    p.fill([202, 202, 196], 4);
    p.vline(0, [178, 178, 174], 2);
    p.speckle(4, [196, 196, 190], 2);
  }],
  ['WALL_GREY', (p) => {
    p.fill([150, 152, 156], 4);
    p.vline(0, [124, 126, 130], 2);
  }],
  ['WALL_BASE', (p) => {
    p.fill([58, 58, 62], 4);
    p.hline(0, [96, 96, 100], 2);
    p.hline(1, [76, 76, 80], 2);
    p.vline(0, [44, 44, 48], 2);
  }],
  ['WALL_CINDER', (p) => cinder(p)],
  ['WALL_TILE', (p) => {
    p.fill([206, 214, 216], 4);
    for (let i = 0; i < TILE; i += 4) {
      p.hline(i, [160, 170, 174], 2);
      p.vline(i, [160, 170, 174], 2);
    }
  }],
  ['STRIPE_DBLOCK', (p) => {
    cinder(p);
    p.rect(0, 5, TILE, 6, [196, 104, 36], 8);
    p.hline(5, [150, 74, 26], 3);
    p.hline(10, [150, 74, 26], 3);
  }],
  ['STRIPE_BLUE', stripe([52, 104, 168], [210, 213, 216], [210, 213, 216])],
  ['STRIPE_YELLOW', stripe([202, 168, 46])],
  ['STRIPE_RED', (p) => {
    p.fill([126, 126, 124], 8);
    p.rect(0, 4, TILE, 8, [150, 34, 30], 8);
    p.hline(4, [96, 22, 20], 3);
    p.hline(11, [96, 22, 20], 3);
  }],
  ['STRIPE_GREEN', stripe([64, 146, 98], [222, 226, 224], [222, 226, 224])],
  ['STRIPE_DARK', stripe([62, 66, 76])],
  ['CEIL_TILE', (p) => {
    p.fill([186, 186, 180], 4);
    p.speckle(16, [150, 150, 144], 3);
    p.hline(0, [132, 132, 128], 2);
    p.vline(0, [132, 132, 128], 2);
  }],
  ['CEIL_METAL', (p) => {
    p.fill([82, 84, 88], 5);
    p.hline(0, [56, 58, 62], 2);
    p.vline(0, [56, 58, 62], 2);
    p.hline(8, [96, 98, 102], 2);
    p.set(3, 3, [120, 122, 126]);
    p.set(12, 12, [120, 122, 126]);
  }],
  ['CEIL_CONCRETE', (p) => {
    p.fill([92, 92, 90], 8);
    p.stain(2, 0.2);
    p.speckle(10, [70, 70, 68], 4);
  }],
  ['LIGHT_PANEL', (p) => {
    p.fill([248, 248, 240], 2);
    p.rect(0, 0, TILE, 1, [176, 176, 170]);
    p.rect(0, 15, TILE, 1, [176, 176, 170]);
    p.rect(0, 0, 1, TILE, [176, 176, 170]);
    p.rect(15, 0, 1, TILE, [176, 176, 170]);
    p.hline(5, [226, 228, 222]);
    p.hline(10, [226, 228, 222]);
  }],
  ['LIGHT_RED', (p) => {
    p.fill([210, 40, 30], 10);
    p.rect(0, 0, TILE, 2, [90, 20, 18]);
    p.rect(0, 14, TILE, 2, [90, 20, 18]);
    for (let x = 0; x < TILE; x += 3) p.vline(x, [150, 30, 24]);
  }],
  ['HAZARD', (p) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const band = Math.floor((x + y) / 4) % 2;
      p.set(x, y, p.jit(band ? [30, 30, 32] : [214, 174, 36], 6));
    }
  }],
  ['VENT', (p) => {
    p.fill([70, 72, 76], 3);
    for (let y = 2; y < 14; y += 3) {
      p.rect(2, y, 12, 1, [24, 25, 28]);
      p.rect(2, y + 1, 12, 1, [104, 106, 110]);
    }
    p.rect(0, 0, TILE, 1, [110, 112, 116]);
    p.rect(0, 0, 1, TILE, [110, 112, 116]);
  }],
  ['METAL_DARK', (p) => {
    p.fill([72, 74, 80], 5);
    p.set(2, 2, [120, 122, 128]);
    p.set(13, 2, [120, 122, 128]);
    p.set(2, 13, [120, 122, 128]);
    p.set(13, 13, [120, 122, 128]);
    p.hline(15, [52, 54, 58], 2);
  }],
  ['GLASS', (p) => {
    p.fill([150, 196, 214], 3);
    for (let i = 0; i < 6; i++) p.set(3 + i, 11 - i, [220, 240, 248]);
    p.rect(0, 0, TILE, 1, [110, 140, 150]);
    p.rect(0, 0, 1, TILE, [110, 140, 150]);
  }],
  ['WALL_LAB', (p) => {
    p.fill([210, 213, 216], 3);
    p.vline(0, [190, 194, 200], 2);
    p.hline(15, [196, 200, 204], 2);
    p.set(2, 2, [170, 174, 180]);
    p.set(13, 13, [170, 174, 180]);
  }],
  ['WALL_WOOD', (p) => {
    p.fill([118, 80, 50], 6);
    for (let x = 0; x < TILE; x += 4) {
      for (let y = 0; y < TILE; y++) if (p.rand() < 0.5) p.shade(x + 1, y, 0.88);
      p.vline(x, [90, 60, 38], 3);
    }
  }],
  ['WALL_TEST', (p) => {
    p.fill([204, 204, 198], 4);
    p.hline(0, [120, 120, 118], 2);
    p.vline(0, [120, 120, 118], 2);
    p.hline(1, [228, 228, 222], 2);
    p.set(3, 3, [90, 90, 90]);
    p.set(12, 3, [90, 90, 90]);
    p.set(3, 12, [90, 90, 90]);
    p.set(12, 12, [90, 90, 90]);
  }],
  ['LIGHT_WARM', (p) => {
    p.fill([255, 236, 196], 3);
    p.rect(0, 0, TILE, 1, [180, 160, 130]);
    p.rect(0, 15, TILE, 1, [180, 160, 130]);
    p.rect(0, 0, 1, TILE, [180, 160, 130]);
    p.rect(15, 0, 1, TILE, [180, 160, 130]);
  }],
  ['FLOOR_GRATE', (p) => {
    p.fill([84, 86, 92], 4);
    for (let y = 1; y < TILE; y += 3) for (let x = 1; x < TILE; x += 3) p.set(x, y, [30, 32, 36]);
    p.hline(0, [60, 62, 66], 2);
    p.vline(0, [60, 62, 66], 2);
  }],
  ['FLOOR_CONCRETE', (p) => {
    p.fill([128, 128, 124], 7);
    p.speckle(12, [104, 104, 100], 4);
    p.hline(0, [100, 100, 96], 3);
  }],
  ['WALL_PAINTED', (p) => {
    p.fill([168, 176, 170], 5);
    p.speckle(8, [150, 158, 152], 3);
  }],
  ['LIGHT_BLUE', (p) => {
    p.fill([200, 226, 255], 3);
    p.rect(0, 0, TILE, 1, [120, 140, 170]);
    p.rect(0, 15, TILE, 1, [120, 140, 170]);
    p.rect(0, 0, 1, TILE, [120, 140, 170]);
    p.rect(15, 0, 1, TILE, [120, 140, 170]);
    p.hline(7, [170, 200, 240]);
  }],
  ['LIGHT_OFF', (p) => {
    p.fill([120, 122, 118], 3);
    p.rect(0, 0, TILE, 1, [80, 80, 78]);
    p.rect(0, 15, TILE, 1, [80, 80, 78]);
    p.rect(0, 0, 1, TILE, [80, 80, 78]);
    p.rect(15, 0, 1, TILE, [80, 80, 78]);
    p.hline(5, [100, 100, 98]);
    p.hline(10, [100, 100, 98]);
  }],
];

/** Texture name → atlas index. */
export const T = Object.fromEntries(TILE_DEFS.map(([name], i) => [name, i]));

if (TILE_DEFS.length > COLS * ROWS) throw new Error('Texture atlas overflow');

export function createAtlas() {
  const w = TILE * COLS;
  const h = TILE * ROWS;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  TILE_DEFS.forEach(([, paint], i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    paint(new TilePainter(img.data, w, col * TILE, row * TILE, 1337 + i * 7919));
  });
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return { canvas, texture };
}

const UV_EPS = 0.002;
/** UV rectangle [u0, v0, u1, v1] of a tile (canvas row 0 is at v = 1). */
export function tileUV(index) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const u0 = col / COLS + UV_EPS / COLS;
  const u1 = (col + 1) / COLS - UV_EPS / COLS;
  const v1 = 1 - row / ROWS - UV_EPS / ROWS;
  const v0 = 1 - (row + 1) / ROWS + UV_EPS / ROWS;
  return [u0, v0, u1, v1];
}

/** Small grayscale grain texture used on props (gives a voxel-model feel). */
export function createGrainTexture() {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const r = mulberry32(42);
  for (let i = 0; i < size * size; i++) {
    const v = 214 + Math.floor(r() * 41);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Utility: create a nearest-filtered texture from a canvas. */
export function pixelTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
