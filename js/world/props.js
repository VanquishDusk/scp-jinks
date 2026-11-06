// Micro-voxel props built from colored boxes (units: 1/16 m, "pu").
//
// Each generator returns { boxes, colliders?, collide? }:
//   box      = [x0, y0, z0, x1, y1, z1, color, emissive?]
//   origin   = footprint center on the floor; a prop's "front" faces -Z
//   colliders defaults to the union of all boxes; collide:false disables it

import * as THREE from 'three';
import { VOXEL } from '../config.js';
import { mulberry32 } from './textures.js';

const PU = 1 / 16;

const C = {
  metal: 0x6c7078, metalLight: 0x9aa0a8, metalDark: 0x3e4248, steel: 0x9aa0a6,
  mattress: 0xb4ab92, pillow: 0xd6d0c0, blanket: 0x5a6070,
  wood: 0x8a6440, woodDark: 0x5e4228, laminate: 0xb8b0a0,
  white: 0xd8dcdc, plastic: 0x8c9096, black: 0x1e2024, dark: 0x2a2c30,
  beige: 0xc8c0a8, cardboard: 0xa07a4a, cardboard2: 0x8c6a40,
  green: 0x3c7a3a, green2: 0x4e8e46, terracotta: 0x7a5a40,
  fabric: 0x3a3c44, blueFabric: 0x4a5a6a, red: 0xa82820, yellow: 0xc8a030,
};

function legs4(x0, z0, x1, z1, h, c, t = 1) {
  return [
    [x0, 0, z0, x0 + t, h, z0 + t, c],
    [x1 - t, 0, z0, x1, h, z0 + t, c],
    [x0, 0, z1 - t, x0 + t, h, z1, c],
    [x1 - t, 0, z1 - t, x1, h, z1, c],
  ];
}

function crt(x, y, z, screen = 0x5fd39a) {
  // Boxy CRT monitor; its screen faces -Z. (x, z) is the screen's center front.
  return [
    [x - 4, y, z, x + 4, y + 7, z + 6, C.beige],
    [x - 2.5, y + 1, z + 6, x + 2.5, y + 6, z + 8.5, C.beige],
    [x - 3.2, y + 1, z - 0.15, x + 3.2, y + 6, z, screen, true],
  ];
}

export const PROPS = {
  bunk() {
    const b = [
      ...legs4(-7, -16, 7, 16, 30, C.metal),
      [-7, 5, -16, 7, 6, 16, C.metal],
      [-6, 6, -15, 6, 9, 15, C.mattress],
      [-5, 9, -14, 5, 10, -10, C.pillow],
      [-6, 9, -6, 6, 9.6, 15, C.blanket],
      [-7, 18, -16, 7, 19, 16, C.metal],
      [-6, 19, -15, 6, 22, 15, C.mattress],
      [-5, 22, -14, 5, 23, -10, C.pillow],
      [-6, 22, -6, 6, 22.6, 15, C.blanket],
    ];
    return { boxes: b };
  },

  toilet() {
    return {
      boxes: [
        [-3, 0, -1, 3, 6, 5, C.steel],
        [-4, 5, -4, 4, 8, 6, C.steel],
        [-2.5, 7.9, -2.5, 2.5, 8.1, 4, C.dark],
        [-4, 0, 5, 4, 12, 8, C.steel],
      ],
    };
  },

  sink() {
    return {
      boxes: [
        [-4, 12, -2, 4, 14, 6, C.steel],
        [-3, 13.9, -1, 3, 14.1, 5, C.dark],
        [-1, 0, 3, 1, 12, 6, C.steel],
        [-0.5, 14, 5, 0.5, 16.5, 6, C.metalLight],
        [-0.5, 16, 3.5, 0.5, 16.5, 6, C.metalLight],
      ],
    };
  },

  cafTable(o, rnd) {
    const b = [
      [-8, 11, -24, 8, 12, 24, 0xc8c2b0],
      [-7, 10, -23, 7, 11, 23, C.metalDark],
      ...legs4(-7, -23, 7, 23, 10, C.metalDark),
    ];
    // Scatter some trays and cups.
    for (let z = -20; z < 20; z += 8) {
      if (rnd() < 0.55) {
        const side = rnd() < 0.5 ? -1 : 1;
        const x = side * 4;
        b.push([x - 3, 12, z - 2, x + 3, 12.4, z + 2, rnd() < 0.5 ? 0xa06030 : 0x4a6a8a]);
        if (rnd() < 0.6) b.push([x - 1, 12.4, z - 1, x + 1, 14, z + 1, 0xe0ddd0]);
      }
    }
    return { boxes: b };
  },

  bench() {
    return {
      boxes: [
        [-3, 7, -22, 3, 8, 22, C.metal],
        [-2, 0, -20, -1, 7, -19, C.metalDark],
        [1, 0, -20, 2, 7, -19, C.metalDark],
        [-2, 0, 19, -1, 7, 20, C.metalDark],
        [1, 0, 19, 2, 7, 20, C.metalDark],
      ],
    };
  },

  desk(o) {
    const b = [
      [-12, 11, -6, 12, 12, 6, C.laminate],
      [-12, 0, -6, -11, 11, 6, 0x7a7e86],
      [11, 0, -6, 12, 11, 6, 0x7a7e86],
      [-11, 3, 5, 11, 11, 6, 0x7a7e86],
      [5, 0, -5, 11, 10, 5, 0x868a92],
      [6, 7, -5.2, 10, 7.4, -5, C.dark],
      [6, 3, -5.2, 10, 3.4, -5, C.dark],
    ];
    if (o.computer !== false) {
      b.push(...crt(-2, 12, -2, o.screen || 0x5fd39a));
      b.push([-5, 12, -5.5, 3, 12.5, -2.5, C.beige]);
    }
    if (o.papers !== false) {
      b.push([5, 12, -4, 9, 12.3, 1, 0xe8e4d8]);
      b.push([5.5, 12.3, -3.5, 9.5, 12.5, 0.5, 0xd8d4c8]);
    }
    return { boxes: b };
  },

  chair() {
    return {
      boxes: [
        [-4, 7, -4, 4, 8, 4, C.fabric],
        [-4, 8, 3, 4, 16, 4, C.fabric],
        [-0.5, 1, -0.5, 0.5, 7, 0.5, C.metalDark],
        [-4, 0, -0.5, 4, 1, 0.5, C.metalDark],
        [-0.5, 0, -4, 0.5, 1, 4, C.metalDark],
      ],
    };
  },

  locker(o) {
    const n = o.count || 1;
    const b = [];
    const total = n * 8;
    for (let i = 0; i < n; i++) {
      const x = -total / 2 + i * 8;
      b.push([x, 0, -4, x + 8, 30, 4, i % 2 ? 0x56606c : 0x5a6470]);
      for (const y of [24, 25.5, 27]) b.push([x + 2, y, -4.1, x + 6, y + 0.6, -4, C.dark]);
      b.push([x + 5.6, 13, -4.25, x + 6.4, 17, -4, C.metalLight]);
      b.push([x, 0, -4.05, x + 0.3, 30, -4, 0x3a4048]);
    }
    return { boxes: b };
  },

  crate(o, rnd) {
    const s = o.size || 10;
    const h = s / 2;
    const c = rnd() < 0.5 ? 0x8a6c42 : 0x7c6038;
    return {
      boxes: [
        [-h, 0, -h, h, s, h, c],
        [-h - 0.2, s - 1, -h - 0.2, h + 0.2, s, h + 0.2, 0x5e4a2c],
        [-h - 0.2, 0, -h - 0.2, h + 0.2, 1, h + 0.2, 0x5e4a2c],
        [-0.5, 1, -h - 0.2, 0.5, s - 1, -h, 0x5e4a2c],
      ],
    };
  },

  crates(o, rnd) {
    const b = [];
    const base = PROPS.crate({ size: 10 }, rnd).boxes;
    b.push(...base.map((q) => [q[0] - 6, q[1], q[2], q[3] - 6, q[4], q[5], q[6]]));
    b.push(...PROPS.crate({ size: 10 }, rnd).boxes.map((q) => [q[0] + 6, q[1], q[2], q[3] + 6, q[4], q[5], q[6]]));
    b.push(...PROPS.crate({ size: 8 }, rnd).boxes.map((q) => [q[0] - 2, q[1] + 10, q[2], q[3] - 2, q[4] + 10, q[5], q[6]]));
    return { boxes: b };
  },

  shelf(o, rnd) {
    const b = [...legs4(-12, -4, 12, 4, 32, C.metal)];
    for (const y of [1, 11, 21, 31]) {
      b.push([-12, y, -4, 12, y + 1, 4, C.metal]);
      if (y > 30) continue;
      let x = -11;
      while (x < 9) {
        const w = 3 + Math.floor(rnd() * 5);
        const h = 3 + Math.floor(rnd() * 5);
        if (rnd() < 0.8) {
          const c = [C.cardboard, C.cardboard2, 0x6a7a8a, 0xb09060][Math.floor(rnd() * 4)];
          b.push([x, y + 1, -3, Math.min(11, x + w), y + 1 + h, 3, c]);
        }
        x += w + 1;
      }
    }
    return { boxes: b };
  },

  serverRack(o, rnd) {
    const b = [[-6, 0, -8, 6, 34, 8, C.black]];
    for (let r = 0; r < 8; r++) {
      const y = 2 + r * 4;
      b.push([-5, y, -8.2, 5, y + 3, -8, 0x2c3036]);
      for (let k = 0; k < 4; k++) {
        if (rnd() < 0.7) {
          const x = -4 + k * 1.6;
          const col = [0x40ff70, 0x40ff70, 0xffb030, 0x50a0ff][Math.floor(rnd() * 4)];
          b.push([x, y + 1, -8.35, x + 0.7, y + 1.7, -8.2, col, true]);
        }
      }
    }
    return { boxes: b };
  },

  medBed() {
    return {
      boxes: [
        ...legs4(-7, -16, 7, 16, 6, C.metalLight),
        [-7, 6, -16, 7, 8, 16, C.metalLight],
        [-6, 8, -15, 6, 10, 15, 0xd8e0e4],
        [-5, 10, -14, 5, 11, -10, 0xf0f0f0],
        [-6, 10, -6, 6, 10.5, 15, 0x8ab0c0],
        [-7, 6, -16.6, 7, 15, -16, C.metalLight],
      ],
    };
  },

  ivStand() {
    return {
      boxes: [
        [-0.3, 0, -0.3, 0.3, 28, 0.3, C.metalLight],
        [-3, 0, -0.4, 3, 0.6, 0.4, C.metalLight],
        [-0.4, 0, -3, 0.4, 0.6, 3, C.metalLight],
        [-1.2, 21, -0.6, 1.2, 25, 0.6, 0xc8e0e8],
      ],
    };
  },

  plant() {
    return {
      boxes: [
        [-3, 0, -3, 3, 6, 3, C.terracotta],
        [-2.5, 6, -2.5, 2.5, 6.3, 2.5, 0x3a2a1a],
        [-4, 6, -1, 4, 9, 1, C.green],
        [-1, 6, -4, 1, 10, 4, C.green2],
        [-3, 9, -3, 3, 13, 3, C.green],
        [-1, 12, -1, 1, 16, 1, C.green2],
      ],
    };
  },

  counter(o) {
    const w = (o.width || 40) / 2;
    return {
      boxes: [
        [-w, 0, -5, w, 16, 5, 0x8a8f96],
        [-w - 1, 16, -6, w + 1, 17, 6, 0xd8d4c8],
        [-w, 6, -5.1, w, 8, -5, 0x2a4a7a],
        [-w + 1, 10, 5, w - 1, 11, 12, 0xb8b0a0],
        // Monitor faces the staff side (+Z).
        [-w / 3 - 4, 11, 4, -w / 3 + 4, 18, 10, C.beige],
        [-w / 3 - 3.2, 12, 10, -w / 3 + 3.2, 17, 10.15, 0x7aa8e8, true],
        [-w / 3 + 6, 11, 6, -w / 3 + 13, 11.5, 9, C.beige],
      ],
      colliders: [[-w - 1, 0, -6, w + 1, 17, 12]],
    };
  },

  vending() {
    return {
      boxes: [
        [-7, 0, -5, 7, 30, 5, 0x7a2228],
        [-6, 10, -5.1, 2, 27, -5, 0x9ab8c8, true],
        [-6, 14, -5.15, 2, 14.4, -5.1, 0x3a4048],
        [-6, 19, -5.15, 2, 19.4, -5.1, 0x3a4048],
        [-6, 23, -5.15, 2, 23.4, -5.1, 0x3a4048],
        [3, 12, -5.1, 6, 24, -5, C.dark],
        [-5, 3, -5.1, 1, 6, -5, 0x111214],
      ],
    };
  },

  bin() {
    return {
      boxes: [
        [-3, 0, -3, 3, 8, 3, 0x4a5a4a],
        [-3.3, 8, -3.3, 3.3, 8.6, 3.3, 0x3a4a3a],
      ],
    };
  },

  monitorWall(o) {
    // Wall-mounted CCTV monitor bank; back sits on local z = 0 (against wall).
    const b = [[-17, 0, -3, 17, 18, 0, C.dark]];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const x = -16 + c * 11;
        const y = 1 + r * 9;
        const tint = [0x7a9a8a, 0x8aa0b0, 0x6a8a9a][(r + c) % 3];
        b.push([x, y, -3.15, x + 10, y + 7, -3, tint, true]);
      }
    }
    return { boxes: b, collide: false };
  },

  consoleDesk() {
    return {
      boxes: [
        [-20, 0, -6, 20, 11, 6, 0x5a5e66],
        [-21, 11, -7, 21, 12, 7, 0x3a3e46],
        ...crt(-11, 12, -1, 0x7aa8e8),
        ...crt(0, 12, -1, 0x5fd39a),
        ...crt(11, 12, -1, 0x7aa8e8),
        [-6, 12, -6, 6, 12.5, -3, C.beige],
      ],
    };
  },

  labTable(o, rnd) {
    const b = [
      [-16, 0, -7, 16, 14, 7, 0xd0d4d8],
      [-16.5, 14, -7.5, 16.5, 15, 7.5, 0x2e3034],
      [-15, 1, -7.1, 15, 13, -7, 0xbcc0c4],
      [-10, 15, -2, -6, 21, 2, 0x3a3c40],
      [-9, 21, -3, -7, 22, 1, 0x3a3c40],
      [2, 15, -1, 4, 18, 1, 0x9ad8c8, true],
      [5, 15, 0, 6.5, 17, 1.5, 0xd8a8c8, true],
      [8, 15, -4, 14, 19, 3, 0xc8c4b8],
      [9, 16, -4.1, 12, 18, -4, 0x5fd39a, true],
    ];
    if (rnd() < 0.5) b.push([-3, 15, 2, 1, 15.4, 6, 0xe8e4d8]);
    return { boxes: b };
  },

  specimenCase() {
    return {
      boxes: [
        [-6, 0, -6, 6, 10, 6, C.metalLight],
        [-6.5, 10, -6.5, 6.5, 11, 6.5, C.metal],
        [-4, 11, -4, 4, 19, 4, 0x2a3a3a],
        [-4.1, 14, -4.1, 4.1, 15, 4.1, 0xc8a030],
        [-6.5, 11, -6.5, -5.5, 22, -5.5, C.metal],
        [5.5, 11, -6.5, 6.5, 22, -5.5, C.metal],
        [-6.5, 11, 5.5, -5.5, 22, 6.5, C.metal],
        [5.5, 11, 5.5, 6.5, 22, 6.5, C.metal],
        [-6.5, 22, -6.5, 6.5, 23, 6.5, C.metal],
      ],
    };
  },

  cabinet() {
    const b = [[-4, 0, -5, 4, 20, 5, 0x80868c]];
    for (const y of [5, 10, 15]) b.push([-3.5, y, -5.1, 3.5, y + 0.3, -5, C.dark]);
    for (const y of [3, 8, 13, 18]) b.push([-1, y, -5.3, 1, y + 0.6, -5, C.metalLight]);
    return { boxes: b };
  },

  couch(o) {
    const c = o.color || C.blueFabric;
    return {
      boxes: [
        [-16, 1, -7, 16, 7, 7, c],
        [-16, 7, 4, 16, 14, 7, c],
        [-16, 7, -7, -13, 10, 4, c],
        [13, 7, -7, 16, 10, 4, c],
        [-0.2, 7, -7, 0.2, 7.3, 4, 0x2a3440],
        ...legs4(-15, -6, 15, 6, 1, C.dark),
      ],
    };
  },

  roundTable() {
    return {
      boxes: [
        [-6, 11, -6, 6, 12, 6, 0xc8c0b0],
        [-0.6, 1, -0.6, 0.6, 11, 0.6, C.metalDark],
        [-4, 0, -4, 4, 1, 4, C.metalDark],
      ],
    };
  },

  stool() {
    return {
      boxes: [
        [-2.5, 7, -2.5, 2.5, 8, 2.5, C.fabric],
        [-0.5, 0, -0.5, 0.5, 7, 0.5, C.metalDark],
        [-2, 0, -2, 2, 0.5, 2, C.metalDark],
      ],
    };
  },

  whiteboard() {
    return {
      boxes: [
        [-16, 14, -1, 16, 30, 0, C.metalLight],
        [-15, 15, -1.1, 15, 29, -1, 0xeef0f0],
        [-12, 25, -1.15, -2, 25.4, -1.1, 0x2a4a8a],
        [-12, 22, -1.15, 4, 22.4, -1.1, 0x2a2c30],
        [-12, 19, -1.15, 0, 19.4, -1.1, 0xa83a30],
        [-15, 14, -3, 15, 14.6, -1, C.metalLight],
      ],
      collide: false,
    };
  },

  noticeBoard(o, rnd) {
    const b = [[-10, 16, -0.8, 10, 28, 0, 0x8a6a46]];
    for (let i = 0; i < 6; i++) {
      const x = -9 + rnd() * 14;
      const y = 17 + rnd() * 7;
      b.push([x, y, -0.95, x + 3 + rnd() * 2, y + 3 + rnd() * 2, -0.8, rnd() < 0.7 ? 0xe8e4d8 : 0xd8c860]);
    }
    return { boxes: b, collide: false };
  },

  waterCooler() {
    return {
      boxes: [
        [-3, 0, -3, 3, 14, 3, C.white],
        [-2.5, 14, -2.5, 2.5, 21, 2.5, 0x7ab0e0],
        [-1, 10, -3.2, 1, 11, -3, 0x3070c0],
      ],
    };
  },

  cctvCam() {
    return {
      boxes: [
        [-0.5, 0, -0.5, 0.5, 2, 1.5, C.metalDark],
        [-1.5, -2.5, -3, 1.5, 0, 1, C.white],
        [-1, -2, -3.2, 1, -0.5, -3, 0x111214],
        [0.6, -0.8, -3.3, 1.1, -0.4, -3.1, 0xff2020, true],
      ],
      collide: false,
    };
  },

  fireExt() {
    return {
      boxes: [
        [-1.5, 0, -1.5, 1.5, 8, 1.5, C.red],
        [-1, 8, -1, 1, 9.5, 1, 0x2a2a2a],
        [-2, 4, 1.5, 2, 9, 2, C.metalDark],
      ],
      collide: false,
    };
  },

  pipe(o) {
    // Runs along local +X for `len` pu.
    const len = o.len;
    const r = o.r || 1.5;
    const c = o.color || 0x6a6e76;
    const b = [[0, -r, -r, len, r, r, c]];
    for (let x = 4; x < len; x += 24) b.push([x, -r - 0.3, -r - 0.3, x + 1, r + 0.3, r + 0.3, C.metalDark]);
    return { boxes: b, collide: false };
  },

  barrier() {
    const b = [
      [-12, 0, -1, -11, 14, 1, C.metalDark],
      [11, 0, -1, 12, 14, 1, C.metalDark],
      [-13, 0, -3, -10, 1, 3, C.metalDark],
      [10, 0, -3, 13, 1, 3, C.metalDark],
    ];
    for (let i = 0; i < 6; i++) {
      const x = -11 + i * (22 / 6);
      b.push([x, 10, -0.8, x + 22 / 6, 13, 0.8, i % 2 ? 0x1e1e20 : 0xd8b030]);
    }
    return { boxes: b };
  },

  metalDetector() {
    return {
      boxes: [
        [-9, 0, -3, -6, 34, 3, 0x8a9098],
        [6, 0, -3, 9, 34, 3, 0x8a9098],
        [-9, 34, -3, 9, 37, 3, 0x8a9098],
        [-2, 35, -3.2, 2, 36, -3, 0x40ff60, true],
      ],
      colliders: [[-9, 0, -3, -6, 37, 3], [6, 0, -3, 9, 37, 3]],
    };
  },

  cart() {
    return {
      boxes: [
        ...legs4(-8, -5, 8, 5, 14, C.metalLight, 0.8),
        [-8, 3, -5, 8, 4, 5, C.metalLight],
        [-8, 13, -5, 8, 14, 5, C.metalLight],
        [-6, 14, -3, -1, 16, 3, 0xe0e4e8],
        [1, 14, -3, 5, 15, 1, 0x8ab0c0],
      ],
    };
  },

  pallet(o, rnd) {
    const b = [[-12, 0, -8, 12, 2, 8, 0x8a7048]];
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const x = -10 + i * 7;
      b.push([x, 2, -6, x + 6, 8 + Math.floor(rnd() * 6), 6, i % 2 ? C.cardboard : C.cardboard2]);
    }
    return { boxes: b };
  },

  drum() {
    return {
      boxes: [
        [-3.5, 0, -3.5, 3.5, 14, 3.5, 0x3a5a8a],
        [-3.7, 4, -3.7, 3.7, 4.6, 3.7, 0x2a4a7a],
        [-3.7, 10, -3.7, 3.7, 10.6, 3.7, 0x2a4a7a],
        [-2, 14, -2, -1, 14.4, -1, C.dark],
      ],
    };
  },

  stall() {
    // Washroom stall partition (front opening).
    return {
      boxes: [
        [-8, 1, 0, -7.5, 28, 16, 0x8a9aa0],
        [7.5, 1, 0, 8, 28, 16, 0x8a9aa0],
        [-7.5, 26, 0, 7.5, 28, 0.5, 0x8a9aa0],
      ],
      colliders: [[-8, 0, 0, -7.5, 28, 16], [7.5, 0, 0, 8, 28, 16]],
    };
  },

  ladder() {
    // Wall-mounted; back against local z = 0, climbs into a ceiling hatch.
    const b = [
      [-5, 0, -3, -4, 58, -2, C.metalLight],
      [4, 0, -3, 5, 58, -2, C.metalLight],
      [-6, 0, -1, -5, 58, 0, C.metalDark],
      [5, 0, -1, 6, 58, 0, C.metalDark],
    ];
    for (let y = 4; y < 58; y += 5) b.push([-4, y, -2.8, 4, y + 0.8, -2.2, C.metalLight]);
    return { boxes: b, collide: false };
  },

  showerHead() {
    return {
      boxes: [
        [-0.4, 28, -3, 0.4, 28.8, 0, C.metalLight],
        [-1.5, 26.5, -4, 1.5, 28.2, -2, C.metalLight],
        [-1, 12, -0.4, 1, 14, 0, C.metalLight],
      ],
      collide: false,
    };
  },
};

const SHADE = [0.82, 0.82, 1.0, 0.6, 0.92, 0.92];

/** Rotate a pu-space footprint k quarter turns: (x, z) → (z, -x). */
function rotXZ(x, z, k) {
  for (let i = 0; i < k; i++) {
    const t = x;
    x = z;
    z = -t;
  }
  return [x, z];
}

function transformBox(box, ox, oy, oz, rot) {
  const [ax, az] = rotXZ(box[0], box[2], rot);
  const [bx, bz] = rotXZ(box[3], box[5], rot);
  return [
    ox + Math.min(ax, bx) * PU,
    oy + box[1] * PU,
    oz + Math.min(az, bz) * PU,
    ox + Math.max(ax, bx) * PU,
    oy + box[4] * PU,
    oz + Math.max(az, bz) * PU,
  ];
}

/**
 * Bake every placed prop into one merged, pre-lit mesh.
 * placement = { type, x, z, y?, rot?, opts? } (voxel coordinates)
 */
export function buildProps(world, placements, grainTexture) {
  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];
  const colliders = [];
  const light = [0, 0, 0];
  const tmp = new THREE.Color();

  const emitBox = (b, colorHex, emissive, floorY) => {
    tmp.setHex(colorHex);
    const [x0, y0, z0, x1, y1, z1] = b;
    const faces = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
    ];
    for (let f = 0; f < 6; f++) {
      if (f === 3 && Math.abs(y0 - floorY) < 0.001) continue; // bottom resting on the floor
      const face = faces[f];
      const n = face[4];
      const base = pos.length / 3;
      for (let c = 0; c < 4; c++) {
        const v = face[c];
        pos.push(v[0], v[1], v[2]);
        // World-space UVs: the 16px grain repeats once per meter (1 texel per pu).
        if (n[0] !== 0) uv.push(v[2], v[1]);
        else if (n[1] !== 0) uv.push(v[0], v[2]);
        else uv.push(v[0], v[1]);
        if (emissive) {
          const k = f === 2 || n[2] !== 0 || n[0] !== 0 ? 1.0 : 0.8;
          col.push(tmp.r * k * 1.1, tmp.g * k * 1.1, tmp.b * k * 1.1);
        } else {
          world.sampleLight(v[0] + n[0] * 0.06, v[1] + n[1] * 0.06, v[2] + n[2] * 0.06, light);
          const s = SHADE[f] * 1.08;
          col.push(
            Math.min(1.5, tmp.r * light[0] * s),
            Math.min(1.5, tmp.g * light[1] * s),
            Math.min(1.5, tmp.b * light[2] * s),
          );
        }
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  };

  for (const pl of placements) {
    const gen = PROPS[pl.type];
    if (!gen) {
      console.warn('Unknown prop', pl.type);
      continue;
    }
    const seed = Math.floor(pl.x * 73856093) ^ Math.floor(pl.z * 19349663) ^ (pl.type.length * 83492791);
    const def = gen(pl.opts || {}, mulberry32(seed));
    const ox = pl.x * VOXEL;
    const oy = (pl.y ?? 1) * VOXEL;
    const oz = pl.z * VOXEL;
    const rot = pl.rot || 0;
    let union = null;
    for (const box of def.boxes) {
      const wb = transformBox(box, ox, oy, oz, rot);
      emitBox(wb, box[6], box[7] === true, oy);
      if (!union) union = wb.slice();
      else {
        for (let k = 0; k < 3; k++) union[k] = Math.min(union[k], wb[k]);
        for (let k = 3; k < 6; k++) union[k] = Math.max(union[k], wb[k]);
      }
    }
    if (def.collide === false || pl.collide === false) continue;
    if (def.colliders) {
      for (const c of def.colliders) colliders.push(transformBox(c, ox, oy, oz, rot));
    } else if (union) {
      colliders.push(union);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, map: grainTexture });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'props';
  return { mesh, colliders };
}
