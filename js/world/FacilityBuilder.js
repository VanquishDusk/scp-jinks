// High-level authoring API for the facility: carve rooms, cut doorways, place
// lights, props, signs and spawn points. All coordinates are voxel units.

import { VoxelWorld } from './VoxelWorld.js';
import { B, STYLES } from './blocks.js';
import { DOOR_TYPES } from './Door.js';

export const LIGHT_PRESETS = {
  white: { color: [1.0, 0.97, 0.9], intensity: 1.4, radius: 15, block: B.LIGHT },
  neutral: { color: [1.0, 0.96, 0.88], intensity: 1.4, radius: 16, block: B.LIGHT },
  cold: { color: [0.82, 0.92, 1.08], intensity: 1.4, radius: 15, block: B.LIGHT_BLUE },
  warm: { color: [1.08, 0.9, 0.68], intensity: 1.35, radius: 15, block: B.LIGHT_WARM },
  dim: { color: [0.95, 0.88, 0.7], intensity: 1.05, radius: 13, block: B.LIGHT_WARM },
  red: { color: [1.0, 0.16, 0.1], intensity: 1.5, radius: 13, block: B.LIGHT_RED },
  off: null,
};

export class FacilityBuilder {
  constructor(w, h, d) {
    this.world = new VoxelWorld(w, h, d);
    // Room id 0 = none, 1 = doorway (door frames / arches).
    this.rooms = [null, { id: 1, name: 'doorway', style: STYLES.doorway, zone: null }];
    this.doors = [];
    this.lights = [];
    this.props = [];
    this.signs = [];
    this.spawns = {};
    this.decals = [];
    this.shots = [];
  }

  /** Carve a room. Floor surface is at y = 1; air spans y = 1..h. */
  room(name, x0, z0, x1, z1, h, style, zone = name) {
    if (!STYLES[style]) throw new Error(`Unknown style ${style}`);
    const id = this.rooms.length;
    const room = { id, name, style: STYLES[style], zone, x0, z0, x1, z1, h };
    this.rooms.push(room);
    this.carve(x0, 1, z0, x1, h + 1, z1, id);
    return room;
  }

  carve(x0, y0, z0, x1, y1, z1, roomId) {
    const wd = this.world;
    for (let y = y0; y < y1; y++) {
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          if (!wd.inBounds(x, y, z)) continue;
          const i = wd.index(x, y, z);
          wd.blocks[i] = B.AIR;
          wd.room[i] = roomId;
        }
      }
    }
  }

  fill(x0, y0, z0, x1, y1, z1, block = B.CONCRETE) {
    const wd = this.world;
    for (let y = y0; y < y1; y++) {
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) wd.set(x, y, z, block);
      }
    }
  }

  /** Doorless opening framed like a doorway. */
  arch(x0, y0, z0, x1, y1, z1) {
    this.carve(x0, y0, z0, x1, y1, z1, 1);
  }

  /** Open passage that belongs to an existing room (no frame styling). */
  passage(room, x0, y0, z0, x1, y1, z1) {
    this.carve(x0, y0, z0, x1, y1, z1, room.id);
  }

  /**
   * Cut a doorway and register a door.
   * axis 'x': wall runs along X, opening spans x..x+width-1 at wall voxel z.
   * axis 'z': wall runs along Z, opening spans z..z+width-1 at wall voxel x.
   */
  door(o) {
    const t = DOOR_TYPES[o.type || 'standard'];
    const width = o.width ?? t.width;
    const height = o.height ?? t.height;
    const y = o.y ?? 1;
    if (o.axis === 'x') this.carve(o.x, y, o.z, o.x + width, y + height, o.z + 1, 1);
    else this.carve(o.x, y, o.z, o.x + 1, y + height, o.z + width, 1);
    const d = { ...o, width, height, y };
    this.doors.push(d);
    return d;
  }

  /** First solid voxel above the floor at column (x, z). */
  ceilingAt(x, z) {
    for (let y = 1; y < this.world.h; y++) if (this.world.isSolid(x, y, z)) return y;
    return this.world.h;
  }

  /**
   * Ceiling light fixture. preset: key of LIGHT_PRESETS, size [sx, sz] voxels.
   */
  light(x, z, preset = 'white', opts = {}) {
    const p = LIGHT_PRESETS[preset];
    const [sx, sz] = opts.size || [2, 1];
    const cy = opts.y ?? this.ceilingAt(x, z);
    const block = p ? p.block : B.LIGHT_OFF;
    for (let i = 0; i < sx; i++) for (let k = 0; k < sz; k++) this.world.set(x + i, cy, z + k, block);
    if (!p) return;
    this.lights.push({
      x: x + sx / 2,
      y: cy - 0.2,
      z: z + sz / 2,
      color: opts.color || p.color,
      intensity: opts.intensity ?? p.intensity,
      radius: opts.radius ?? p.radius,
      falloff: opts.falloff,
    });
  }

  /** Lights evenly spaced along a line. */
  lightRow(x0, z0, x1, z1, step, preset = 'white', opts = {}) {
    const dx = Math.sign(x1 - x0);
    const dz = Math.sign(z1 - z0);
    const n = Math.floor(Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) / step);
    for (let i = 0; i <= n; i++) {
      const p = opts.pattern ? opts.pattern[i % opts.pattern.length] : preset;
      this.light(x0 + dx * i * step, z0 + dz * i * step, p, opts);
    }
  }

  /** Point light without a fixture (e.g. glow from screens). */
  glow(x, y, z, color, intensity = 0.6, radius = 6) {
    this.lights.push({ x, y, z, color, intensity, radius });
  }

  prop(type, x, z, opts = {}) {
    const face = opts.face || 'n';
    const rot = { n: 0, w: 1, s: 2, e: 3 }[face];
    this.props.push({ type, x, z, y: opts.y, rot, opts: opts.opts || {}, collide: opts.collide });
  }

  sign(def) {
    this.signs.push(def);
  }

  spawn(name, x, z, yawDeg) {
    this.spawns[name] = { x, z, yaw: (yawDeg * Math.PI) / 180 };
  }

  /** Override the floor texture of a rectangle (applied after painting). */
  floorDecal(x0, z0, x1, z1, tex) {
    this.decals.push({ x0, z0, x1, z1, tex });
  }

  /** Main-menu camera shot: from → to (voxel coords), looking at `look`. */
  shot(from, to, look) {
    this.shots.push({ from, to, look });
  }

  /** Paint surfaces, apply decals and sanity-check door slide space. */
  paint() {
    const styles = this.rooms.map((r) => (r ? r.style : null));
    this.world.paintRooms(styles);
    for (const d of this.decals) {
      for (let z = d.z0; z < d.z1; z++) {
        for (let x = d.x0; x < d.x1; x++) {
          this.world.setFaceTex(x, this.floorAt(x, z), z, 2, d.tex);
        }
      }
    }
    this.validateDoors();
  }

  /** Voxel that forms the walkable floor at column (x, z). */
  floorAt(x, z) {
    for (let y = 1; y < this.world.h; y++) if (!this.world.isSolid(x, y, z)) return y - 1;
    return 0;
  }

  validateDoors() {
    const wd = this.world;
    for (const d of this.doors) {
      const t = DOOR_TYPES[d.type || 'standard'];
      const cells = [];
      const along = (i) => (d.axis === 'x' ? [d.x + i, d.z] : [d.z + i, d.x]);
      if (t.mode === 'split') {
        const half = d.width / 2;
        for (let i = -half; i < 0; i++) cells.push(i);
        for (let i = d.width; i < d.width + half; i++) cells.push(i);
      } else if (t.mode === 'slide') {
        const dir = d.slideDir ?? 1;
        for (let i = 0; i < d.width; i++) cells.push(dir > 0 ? d.width + i : -1 - i);
      }
      const bad = [];
      for (const i of cells) {
        const [a, b] = along(i);
        for (let y = d.y; y < d.y + d.height; y++) {
          const solid = d.axis === 'x' ? wd.isSolid(a, y, b) : wd.isSolid(b, y, a);
          if (!solid) bad.push([a, y, b]);
        }
      }
      if (t.mode === 'up') {
        for (let i = 0; i < d.width; i++) {
          for (let y = d.y + d.height; y < d.y + d.height * 2; y++) {
            const [a, b] = along(i);
            const solid = d.axis === 'x' ? wd.isSolid(a, y, b) : wd.isSolid(b, y, a);
            if (!solid) bad.push([a, y, b]);
          }
        }
      }
      if (bad.length) console.warn(`Door "${d.name || d.type}" at ${d.x},${d.z} has no wall to slide into`, bad.slice(0, 4));
    }
  }

  computeLighting() {
    this.world.computeLighting(this.lights);
  }
}
