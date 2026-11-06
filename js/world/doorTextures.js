// Pixel-art textures for doors and keycard readers, painted at load time.

import { mulberry32, pixelTexture } from './textures.js';
import { drawPixelText } from './pixelFont.js';

class PixelCanvas {
  constructor(w, h, seed) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(w, h);
    this.rand = mulberry32(seed);
  }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.img.data[i] = Math.max(0, Math.min(255, c[0]));
    this.img.data[i + 1] = Math.max(0, Math.min(255, c[1]));
    this.img.data[i + 2] = Math.max(0, Math.min(255, c[2]));
    this.img.data[i + 3] = 255;
  }
  rect(x, y, w, h, c, n = 0) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        const d = (this.rand() * 2 - 1) * n;
        this.set(i, j, [c[0] + d, c[1] + d, c[2] + d]);
      }
    }
  }
  hazard(x, y, w, h, period = 4) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        const band = Math.floor((i + j) / period) % 2;
        const d = (this.rand() * 2 - 1) * 6;
        const c = band ? [28, 28, 30] : [216, 176, 38];
        this.set(i, j, [c[0] + d, c[1] + d, c[2] + d]);
      }
    }
  }
  flipX() {
    const out = new PixelCanvas(this.w, this.h, 1);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        const j = (y * this.w + (this.w - 1 - x)) * 4;
        for (let k = 0; k < 4; k++) out.img.data[j + k] = this.img.data[i + k];
      }
    }
    return out;
  }
  commit() {
    this.ctx.putImageData(this.img, 0, 0);
    return this;
  }
  texture() {
    this.commit();
    return pixelTexture(this.canvas);
  }
}

function standardHalf(seed) {
  // 1m x 2.5m half of a split door; the seam is on the right edge.
  const p = new PixelCanvas(16, 40, seed);
  p.rect(0, 0, 16, 40, [150, 154, 160], 4);
  p.rect(0, 0, 1, 40, [96, 98, 104]);
  p.rect(14, 0, 1, 40, [60, 62, 66]);
  p.rect(15, 0, 1, 40, [200, 168, 50]);
  p.rect(0, 0, 16, 2, [104, 106, 112]);
  for (const y of [11, 25]) {
    p.rect(1, y, 13, 1, [104, 108, 114]);
    p.rect(1, y + 1, 13, 1, [184, 188, 194]);
  }
  p.rect(3, 15, 8, 6, [118, 122, 128], 3);
  p.rect(4, 16, 6, 1, [70, 72, 76]);
  p.rect(4, 18, 4, 1, [70, 72, 76]);
  p.hazard(0, 36, 14, 4, 3);
  return p;
}

function cellDoor(seed) {
  const p = new PixelCanvas(24, 40, seed);
  p.rect(0, 0, 24, 40, [86, 94, 106], 5);
  p.rect(0, 0, 24, 1, [60, 66, 74]);
  p.rect(0, 0, 1, 40, [60, 66, 74]);
  p.rect(23, 0, 1, 40, [60, 66, 74]);
  p.rect(2, 2, 20, 1, [112, 120, 132]);
  p.rect(2, 2, 1, 36, [112, 120, 132]);
  // viewing slit
  p.rect(7, 9, 10, 3, [40, 44, 50]);
  p.rect(8, 10, 8, 1, [16, 18, 22]);
  // food hatch
  p.rect(6, 24, 12, 4, [70, 76, 86]);
  p.rect(6, 24, 12, 1, [40, 44, 50]);
  p.rect(6, 27, 12, 1, [110, 118, 128]);
  for (const [x, y] of [[3, 4], [20, 4], [3, 35], [20, 35]]) p.set(x, y, [140, 148, 160]);
  p.rect(0, 37, 24, 3, [64, 70, 80], 4);
  return p;
}

function officeDoor(seed) {
  const p = new PixelCanvas(24, 40, seed);
  p.rect(0, 0, 24, 40, [176, 178, 180], 4);
  p.rect(0, 0, 1, 40, [130, 132, 136]);
  p.rect(23, 0, 1, 40, [130, 132, 136]);
  p.rect(0, 0, 24, 1, [130, 132, 136]);
  // narrow window strip
  p.rect(5, 6, 4, 14, [60, 84, 100], 3);
  p.rect(5, 6, 4, 1, [40, 50, 60]);
  p.set(6, 8, [150, 190, 210]);
  p.set(7, 9, [150, 190, 210]);
  // handle bar
  p.rect(18, 16, 2, 8, [70, 72, 76]);
  p.rect(0, 36, 24, 4, [120, 122, 126], 3);
  return p;
}

function heavyDoor(seed) {
  const p = new PixelCanvas(32, 40, seed);
  p.rect(0, 0, 32, 40, [98, 102, 108], 5);
  for (let y = 4; y < 32; y += 7) {
    p.rect(0, y, 32, 1, [64, 66, 72]);
    p.rect(0, y + 1, 32, 1, [130, 134, 140]);
  }
  p.rect(0, 0, 32, 2, [64, 66, 72]);
  p.rect(0, 0, 1, 40, [64, 66, 72]);
  p.rect(31, 0, 1, 40, [64, 66, 72]);
  p.hazard(0, 33, 32, 7, 4);
  for (let x = 3; x < 32; x += 6) {
    p.set(x, 2, [150, 154, 160]);
    p.set(x, 31, [150, 154, 160]);
  }
  p.commit();
  drawPixelText(p.ctx, '!', 16, 14, 1, 'rgb(200,168,50)', 'center');
  return p;
}

function gateDoor(seed) {
  const p = new PixelCanvas(64, 56, seed);
  p.rect(0, 0, 64, 56, [84, 88, 96], 5);
  for (let x = 0; x < 64; x += 8) {
    p.rect(x, 0, 1, 56, [58, 60, 66]);
    p.rect(x + 1, 0, 1, 56, [108, 112, 120]);
  }
  p.hazard(0, 46, 64, 10, 5);
  p.hazard(0, 0, 64, 4, 5);
  for (let y = 8; y < 44; y += 8) for (let x = 4; x < 64; x += 8) p.set(x, y, [140, 144, 150]);
  p.rect(16, 18, 32, 14, [60, 62, 68], 3);
  p.commit();
  drawPixelText(p.ctx, 'HCZ', 32, 22, 1, 'rgb(214,176,40)', 'center');
  return p;
}

function elevatorHalf(seed) {
  const p = new PixelCanvas(16, 40, seed);
  for (let x = 0; x < 16; x++) {
    const streak = (p.rand() * 2 - 1) * 10;
    for (let y = 0; y < 40; y++) {
      const d = (p.rand() * 2 - 1) * 3 + streak;
      p.set(x, y, [178 + d, 182 + d, 188 + d]);
    }
  }
  p.rect(15, 0, 1, 40, [90, 92, 96]);
  p.rect(0, 0, 16, 1, [120, 124, 128]);
  return p;
}

const BUILDERS = {
  standard: (s) => standardHalf(s),
  elevator: (s) => elevatorHalf(s),
  cell: (s) => cellDoor(s),
  office: (s) => officeDoor(s),
  heavy: (s) => heavyDoor(s),
  gate: (s) => gateDoor(s),
};

const cache = new Map();

/**
 * Returns { a, b } textures: `a` is the panel as painted, `b` mirrored.
 * Split doors use a/b for the two halves; every panel uses the mirrored
 * version on its back face so seams line up from both sides.
 */
export function getDoorTextures(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const painted = BUILDERS[kind](kind.length * 131 + 7);
  painted.commit();
  const mirrored = painted.flipX().commit();
  const res = { a: pixelTexture(painted.canvas), b: pixelTexture(mirrored.canvas) };
  cache.set(kind, res);
  return res;
}

let readerTex = null;
let buttonTex = null;

/** Keycard reader face (LED is a separate mesh so it can flash). */
export function getReaderTexture() {
  if (readerTex) return readerTex;
  const p = new PixelCanvas(10, 16, 99);
  p.rect(0, 0, 10, 16, [62, 64, 70], 3);
  p.rect(0, 0, 10, 1, [96, 98, 104]);
  p.rect(0, 0, 1, 16, [96, 98, 104]);
  p.rect(2, 4, 6, 3, [40, 70, 56]);
  p.rect(3, 5, 3, 1, [90, 160, 120]);
  p.rect(2, 10, 6, 1, [16, 16, 18]);
  p.rect(2, 11, 6, 1, [100, 102, 108]);
  p.rect(3, 13, 4, 1, [84, 86, 92]);
  readerTex = p.texture();
  return readerTex;
}

/** Simple push-button panel for unrestricted doors. */
export function getButtonTexture() {
  if (buttonTex) return buttonTex;
  const p = new PixelCanvas(10, 16, 77);
  p.rect(0, 0, 10, 16, [150, 152, 156], 3);
  p.rect(0, 0, 10, 1, [190, 192, 196]);
  p.rect(0, 15, 10, 1, [100, 102, 106]);
  p.rect(3, 6, 4, 4, [60, 62, 66]);
  p.rect(4, 7, 2, 2, [110, 112, 116]);
  buttonTex = p.texture();
  return buttonTex;
}
