// Voxel block types and the room "paint styles" that decide which texture each
// exposed face of a room gets.

import { T } from './textures.js';

/**
 * solid:     blocks movement
 * opaque:    blocks light and hides neighbouring faces
 * paintable: faces are textured by the surrounding room's style
 * emissive:  faces ignore lighting and use this RGB multiplier instead
 */
export const BLOCKS = [
  { name: 'air', solid: false, opaque: false },
  { name: 'concrete', solid: true, opaque: true, paintable: true, tex: T.CONCRETE },
  { name: 'light', solid: true, opaque: true, tex: T.LIGHT_PANEL, emissive: [1.25, 1.25, 1.2] },
  { name: 'glass', solid: true, opaque: false, transparent: true, tex: T.GLASS },
  { name: 'hazard', solid: true, opaque: true, tex: T.HAZARD },
  { name: 'vent', solid: true, opaque: true, tex: T.VENT },
  { name: 'metal', solid: true, opaque: true, tex: T.METAL_DARK },
  { name: 'light_red', solid: true, opaque: true, tex: T.LIGHT_RED, emissive: [1.3, 0.45, 0.4] },
  { name: 'light_warm', solid: true, opaque: true, tex: T.LIGHT_WARM, emissive: [1.2, 1.12, 0.98] },
  { name: 'light_blue', solid: true, opaque: true, tex: T.LIGHT_BLUE, emissive: [1.1, 1.18, 1.3] },
  { name: 'light_off', solid: true, opaque: true, tex: T.LIGHT_OFF },
];

export const B = Object.fromEntries(BLOCKS.map((b, i) => [b.name.toUpperCase(), i]));

/** Face directions: index → [dx, dy, dz]. Opposite face = index ^ 1. */
export const FACE_DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Room paint styles. Wall rows are chosen by voxel height above the floor:
 *   y == 1 → base, y <= lowerTop → lower, y == stripeY → stripe, else upper.
 */
export const STYLES = {
  doorway: {
    floor: T.FLOOR_METAL, ceiling: T.METAL_DARK,
    base: T.METAL_DARK, lower: T.METAL_DARK, stripe: T.METAL_DARK, upper: T.METAL_DARK,
    lowerTop: 99, stripeY: 0,
  },
  corridor: {
    floor: T.FLOOR_TILE, ceiling: T.CEIL_TILE,
    base: T.WALL_BASE, lower: T.WALL_GREY, stripe: T.STRIPE_DARK, upper: T.WALL_WHITE,
    lowerTop: 2, stripeY: 3,
  },
  hub: {
    floor: T.FLOOR_TILE, ceiling: T.CEIL_METAL,
    base: T.WALL_BASE, lower: T.WALL_GREY, stripe: T.STRIPE_DARK, upper: T.WALL_WHITE,
    lowerTop: 2, stripeY: 3,
  },
  dblock: {
    floor: T.FLOOR_DIRTY, ceiling: T.CEIL_CONCRETE,
    base: T.WALL_BASE, lower: T.WALL_CINDER, stripe: T.STRIPE_DBLOCK, upper: T.WALL_CINDER,
    lowerTop: 2, stripeY: 3,
  },
  cell: {
    floor: T.FLOOR_DIRTY, ceiling: T.CEIL_CONCRETE,
    base: T.WALL_BASE, lower: T.WALL_CINDER, stripe: T.WALL_CINDER, upper: T.WALL_CINDER,
    lowerTop: 2, stripeY: 0,
  },
  washroom: {
    floor: T.FLOOR_LAB, ceiling: T.CEIL_CONCRETE,
    base: T.WALL_BASE, lower: T.WALL_TILE, stripe: T.WALL_TILE, upper: T.WALL_CINDER,
    lowerTop: 4, stripeY: 0,
  },
  security: {
    floor: T.FLOOR_DARK, ceiling: T.CEIL_METAL,
    base: T.WALL_BASE, lower: T.WALL_GREY, stripe: T.STRIPE_YELLOW, upper: T.WALL_WHITE,
    lowerTop: 2, stripeY: 3,
  },
  cafeteria: {
    floor: T.FLOOR_CHECKER, ceiling: T.CEIL_TILE,
    base: T.WALL_BASE, lower: T.WALL_TILE, stripe: T.STRIPE_GREEN, upper: T.WALL_WHITE,
    lowerTop: 2, stripeY: 3,
  },
  kitchen: {
    floor: T.FLOOR_LAB, ceiling: T.CEIL_METAL,
    base: T.WALL_BASE, lower: T.WALL_TILE, stripe: T.WALL_TILE, upper: T.WALL_TILE,
    lowerTop: 99, stripeY: 0,
  },
  hcz: {
    floor: T.FLOOR_METAL, ceiling: T.CEIL_METAL,
    base: T.HAZARD, lower: T.WALL_GREY, stripe: T.STRIPE_RED, upper: T.CONCRETE,
    lowerTop: 2, stripeY: 3,
  },
  research: {
    floor: T.FLOOR_LAB, ceiling: T.CEIL_TILE,
    base: T.WALL_BASE, lower: T.WALL_LAB, stripe: T.STRIPE_BLUE, upper: T.WALL_LAB,
    lowerTop: 2, stripeY: 3,
  },
  lab: {
    floor: T.FLOOR_LAB, ceiling: T.CEIL_TILE,
    base: T.WALL_BASE, lower: T.WALL_LAB, stripe: T.WALL_LAB, upper: T.WALL_LAB,
    lowerTop: 2, stripeY: 0,
  },
  test: {
    floor: T.FLOOR_LAB, ceiling: T.CEIL_METAL,
    base: T.WALL_BASE, lower: T.WALL_TEST, stripe: T.WALL_TEST, upper: T.WALL_TEST,
    lowerTop: 2, stripeY: 0,
  },
  office: {
    floor: T.FLOOR_CARPET, ceiling: T.CEIL_TILE,
    base: T.WALL_BASE, lower: T.WALL_WOOD, stripe: T.WALL_WHITE, upper: T.WALL_WHITE,
    lowerTop: 2, stripeY: 0,
  },
  medical: {
    floor: T.FLOOR_LAB, ceiling: T.CEIL_TILE,
    base: T.WALL_BASE, lower: T.WALL_LAB, stripe: T.STRIPE_GREEN, upper: T.WALL_LAB,
    lowerTop: 2, stripeY: 3,
  },
  server: {
    floor: T.FLOOR_GRATE, ceiling: T.CEIL_METAL,
    base: T.WALL_BASE, lower: T.WALL_GREY, stripe: T.STRIPE_BLUE, upper: T.WALL_GREY,
    lowerTop: 2, stripeY: 3,
  },
  storage: {
    floor: T.FLOOR_CONCRETE, ceiling: T.CEIL_METAL,
    base: T.WALL_BASE, lower: T.CONCRETE, stripe: T.STRIPE_YELLOW, upper: T.CONCRETE,
    lowerTop: 2, stripeY: 3,
  },
  lobby: {
    floor: T.FLOOR_TILE, ceiling: T.CEIL_TILE,
    base: T.WALL_BASE, lower: T.WALL_GREY, stripe: T.STRIPE_DARK, upper: T.WALL_WHITE,
    lowerTop: 2, stripeY: 3,
  },
  chamber: {
    floor: T.FLOOR_CONCRETE, ceiling: T.CEIL_CONCRETE,
    base: T.HAZARD, lower: T.CONCRETE, stripe: T.STRIPE_RED, upper: T.CONCRETE,
    lowerTop: 2, stripeY: 5,
  },
  breakroom: {
    floor: T.FLOOR_CARPET, ceiling: T.CEIL_TILE,
    base: T.WALL_BASE, lower: T.WALL_PAINTED, stripe: T.STRIPE_GREEN, upper: T.WALL_PAINTED,
    lowerTop: 2, stripeY: 3,
  },
};

export function wallTexture(style, y) {
  if (y <= 1) return style.base;
  if (y <= style.lowerTop) return style.lower;
  if (y === style.stripeY) return style.stripe;
  return style.upper;
}
