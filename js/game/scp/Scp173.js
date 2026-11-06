// SCP-173 — "The Sculpture".
//
// Rules implemented here:
//   * It cannot move while anyone is looking at it: the player (eyes open, in
//     view, line of sight, enough light) or any NPC facing it with eyes open.
//   * The instant nobody is watching, it teleports behind any person it can
//     reach in a straight, clear line (no walls, glass or closed doors) and
//     snaps their neck.
//   * Otherwise, while unobserved and loose, it travels toward people in fast
//     jumps along walkable routes — it cannot pass walls and cannot open doors.

import * as THREE from 'three';
import { VOXEL } from '../../config.js';
import { boxGeometry } from './voxelModel.js';

const KILL_RANGE = 14; // meters of clear straight line
const BODY = 0xd6c9ae;
const GRIME = 0x6e5e4a;
const DARK = 0x2a2420;
const RED = 0xa8382a;
const GREEN = 0x4f8f5c;

function buildModel() {
  // Units: 1/16 m. Front faces -Z. Roughly 2.1 m tall like the reference.
  const b = [];
  // Legs (thin, slightly apart).
  b.push([-3, 0, -1.4, -0.8, 13, 1.4, BODY], [0.8, 0, -1.4, 3, 13, 1.4, BODY]);
  b.push([-3.2, 0, -2, -0.6, 1.2, 1.6, GRIME], [0.6, 0, -2, 3.2, 1.2, 1.6, GRIME]);
  // Torso: hips wider than chest.
  b.push([-3.6, 12, -2.2, 3.6, 17, 2.2, BODY]);
  b.push([-3.1, 17, -2, 3.1, 22, 2, BODY]);
  b.push([2.6, 11, -1.2, 3.8, 16, 2.4, GRIME]); // spray stain on the hip
  b.push([-3.7, 13, 0.5, -3, 15, 2.3, GRIME]);
  // Stubby arms reaching forward.
  b.push([-4.6, 18.5, -6.5, -2.8, 20.3, -0.5, BODY], [2.8, 18.5, -6.5, 4.6, 20.3, -0.5, BODY]);
  b.push([-4.7, 18.3, -6.8, -2.7, 20.5, -6, GRIME], [2.7, 18.3, -6.8, 4.7, 20.5, -6, GRIME]);
  // Neck.
  b.push([-1.2, 22, -1.2, 1.2, 24.5, 1.2, BODY]);
  // Head: tall rounded egg, layered so the silhouette curves.
  b.push([-2.2, 24, -2.1, 2.2, 25, 2.1, BODY]);
  b.push([-2.9, 25, -2.7, 2.9, 26.5, 2.7, BODY]);
  b.push([-3.5, 26.5, -3.1, 3.5, 31, 3.1, BODY]);
  b.push([-3.2, 31, -2.9, 3.2, 32.5, 2.9, BODY]);
  b.push([-2.6, 32.5, -2.4, 2.6, 33.8, 2.4, BODY]);
  b.push([-1.7, 33.8, -1.6, 1.7, 34.7, 1.6, BODY]);
  b.push([-3.6, 27.5, -1.2, -3.4, 30, 1.5, GRIME]); // weathering on the sides
  b.push([3.4, 28, -0.5, 3.6, 30.5, 2.2, GRIME]);
  // Face paint (front, -Z side), hugging the curved head.
  const fz = -3.2;
  b.push([-1, 30.5, fz, 1, 31, fz + 0.15, RED]); // forehead stripe
  b.push([-0.9, 31, -3.0, 0.9, 32.5, -2.85, RED]);
  b.push([-0.7, 32.5, -2.5, 0.7, 33.5, -2.35, RED]);
  b.push([-3, 29, fz, 3, 30.5, fz + 0.1, RED]); // brow band
  b.push([-3.1, 26.6, fz, -0.5, 29.2, fz + 0.12, GREEN]); // eye rings
  b.push([0.5, 26.6, fz, 3.1, 29.2, fz + 0.12, GREEN]);
  b.push([-2.3, 27.2, fz - 0.05, -1.2, 28.5, fz + 0.05, DARK]); // pupils
  b.push([1.2, 27.2, fz - 0.05, 2.3, 28.5, fz + 0.05, DARK]);
  b.push([-0.5, 26.6, fz, 0.5, 29.5, fz + 0.12, RED]); // nose ridge
  b.push([-2.4, 25.2, -2.8, 2.4, 26.6, -2.68, RED]); // cheeks / mouth area
  b.push([-1.6, 25.3, -2.85, 1.6, 25.8, -2.75, DARK]); // mouth
  b.push([-1.4, 24.2, -2.25, 1.4, 25, -2.15, DARK]); // chin shadow
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(boxGeometry(b, 1 / 16), mat);
  const g = new THREE.Group();
  g.add(mesh);
  return { group: g, mat };
}

const tmp = [0, 0, 0];

export class Scp173 {
  constructor(game, chamber) {
    this.game = game;
    this.id = '173';
    this.name = 'SCP-173';
    this.chamber = chamber;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.contained = true;
    this.observed = false;
    this.cooldown = 0;
    this.travelT = 0;
    this.action = null;
    this.kills = 0;
    const m = buildModel();
    this.object = m.group;
    this.mat = m.mat;
    this.returnToChamber();
  }

  get origin() {
    return this.pos;
  }

  get hold() {
    return this.action ? this.action.hold || 0 : 0;
  }

  boxes() {
    const p = this.pos;
    return [[p.x - 0.3, p.y, p.z - 0.3, p.x + 0.3, p.y + 2.2, p.z + 0.3]];
  }

  prompt() {
    if (!this.action) return null;
    return { text: this.action.text, sub: 'Do not blink. Do not look away.', denied: false };
  }

  use(game) {
    return this.action ? this.action.use(game) : null;
  }

  returnToChamber() {
    const c = this.chamber;
    this.pos.set(c.center[0] * VOXEL, VOXEL, c.center[1] * VOXEL);
    this.yaw = (c.yaw * Math.PI) / 180;
    this.contained = true;
    this.path = null;
    // Still in its cage for a little while: everyone gets time to leave.
    this.cooldown = 12;
    this.place();
  }

  place() {
    this.object.position.copy(this.pos);
    this.object.rotation.y = this.yaw;
    this.game.world.sampleLight(this.pos.x, 1.3, this.pos.z, tmp);
    this.mat.color.setRGB(Math.min(1.3, tmp[0] * 1.1 + 0.03), Math.min(1.3, tmp[1] * 1.1 + 0.03), Math.min(1.3, tmp[2] * 1.1 + 0.04));
  }

  /** Sample points on the statue used for "is it being looked at". */
  lookPoints() {
    const p = this.pos;
    return [new THREE.Vector3(p.x, p.y + 1.85, p.z), new THREE.Vector3(p.x, p.y + 1.1, p.z), new THREE.Vector3(p.x, p.y + 0.4, p.z)];
  }

  /** Clear straight line for the statue to cross (no walls, glass or doors). */
  passable(ax, az, bx, bz) {
    return this.game.nav.lineClear(ax, az, bx, bz) && !this.game.doorBlocksLine(ax, az, bx, bz);
  }

  /** Is a point inside this SCP's containment chamber? */
  inChamber(x, z) {
    const g = this.game;
    const room = g.builder.rooms[g.world.roomAtWorld(x, VOXEL + 0.3, z)];
    return !!room && room.zone === this.chamber.zone;
  }

  victims() {
    const g = this.game;
    const list = [];
    if (!g.player.dead) list.push(g.player);
    for (const n of g.npcs.values()) if (n.alive) list.push(n);
    // In its chamber it can only reach people who come inside.
    if (this.contained) return list.filter((v) => this.inChamber(v.pos.x, v.pos.z));
    return list;
  }

  snapBehind(v) {
    const fx = -Math.sin(v.yaw);
    const fz = -Math.cos(v.yaw);
    let x = v.pos.x - fx * 0.75;
    let z = v.pos.z - fz * 0.75;
    if (!this.game.nav.walkableAtWorld(x, z)) {
      x = v.pos.x - fx * 0.3;
      z = v.pos.z - fz * 0.3;
    }
    this.pos.set(x, VOXEL, z);
    this.yaw = Math.atan2(-(v.pos.x - x), -(v.pos.z - z));
    this.place();
    this.kills++;
    if (v === this.game.player) {
      this.game.ui.neckSnap();
      v.damage(999, 'scp173');
    } else {
      v.damage(999);
    }
    this.cooldown = 0.5;
  }

  update(dt) {
    const g = this.game;
    this.observed = g.scps.isObserved(this);
    if (this.observed) {
      this.travelT = 0.15;
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    // Anyone within reach and in a clear line dies.
    const vs = this.victims()
      .map((v) => ({ v, d: Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z) }))
      .sort((a, b) => a.d - b.d);
    for (const { v, d } of vs) {
      if (d > KILL_RANGE) break;
      if (this.passable(this.pos.x, this.pos.z, v.pos.x, v.pos.z)) {
        this.snapBehind(v);
        return;
      }
    }
    if (this.contained) return;

    // Loose and unseen: close in on the nearest person in fast jumps.
    this.travelT -= dt;
    if (this.travelT > 0 || !vs.length) return;
    this.travelT = 0.25;
    if (!this.path || this.pathAge > 1.5) {
      this.path = g.nav.findPath(this.pos.x, this.pos.z, vs[0].v.pos.x, vs[0].v.pos.z);
      this.pathIdx = 0;
      this.pathAge = 0;
    }
    this.pathAge += 0.25;
    if (!this.path) return;
    let budget = 1.5;
    let moved = false;
    while (budget > 0 && this.pathIdx < this.path.length) {
      const [tx, tz] = this.path[this.pathIdx];
      const dx = tx - this.pos.x;
      const dz = tz - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, budget);
      const nx = this.pos.x + (dx / (d || 1)) * step;
      const nz = this.pos.z + (dz / (d || 1)) * step;
      if (g.doorBlocksLine(this.pos.x, this.pos.z, nx, nz)) {
        this.path = null; // a closed door: it cannot open it
        break;
      }
      this.pos.x = nx;
      this.pos.z = nz;
      budget -= step;
      moved = true;
      if (d - step < 0.05) this.pathIdx++;
    }
    if (moved) {
      if (this.path && this.pathIdx < this.path.length) {
        const [tx, tz] = this.path[this.pathIdx];
        this.yaw = Math.atan2(-(tx - this.pos.x), -(tz - this.pos.z));
      }
      this.place();
    }
  }
}
