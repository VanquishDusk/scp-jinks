// Shared plumbing for SCP entities.
//
// Interactable interface (origin, boxes, prompt, use, hold) so the player can
// use them; chamber helpers; simple path movement; and two hooks the rest of
// the game relies on:
//
//   recon     how this SCP is recontained after a breach (Security tasks and
//             the guards' team logic read it):
//               mode: 'cage' | 'bag' | 'carry' | 'escort' | 'subdue' | 'cover'
//                     | 'terminals' | 'auto'
//   threats() objects guards may shoot at: { pos, alive, aimY, keepAway, scp }
//
// install()/uninstall() add and remove extra interactables or colliders when
// the SCP arrives in (or leaves) its room.

import * as THREE from 'three';
import { VOXEL } from '../../config.js';
import { boxGeometry } from './voxelModel.js';

const tmp = [0, 0, 0];

export class ScpBase {
  constructor(game, chamber, id) {
    this.game = game;
    this.id = id;
    this.name = `SCP-${id}`;
    this.chamber = chamber;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.contained = true;
    this.action = null;
    this.object = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.t = Math.random() * 10;
    this.size = [0.4, 1.0]; // half width, height (interaction / hit box)
    this.lightT = 0;
    this.path = null;
    this.pathIdx = 0;
    this.repathT = 0;
  }

  // ---- Interactable -----------------------------------------------------------
  get origin() {
    return this.pos;
  }

  get hold() {
    return this.action ? this.action.hold || 0 : 0;
  }

  boxes() {
    const p = this.pos;
    const [r, h] = this.size;
    return [[p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r]];
  }

  /** Recontainment actions can be gated: return a reason to refuse, or null. */
  denyAction() {
    return null;
  }

  prompt() {
    if (!this.action) return null;
    const deny = this.denyAction();
    if (deny) return { text: deny, sub: this.name, denied: true };
    return { text: this.action.text, sub: this.action.sub || this.name, denied: false };
  }

  use(game) {
    if (!this.action || this.denyAction()) return null;
    return this.action.use(game);
  }

  // ---- Model / placement --------------------------------------------------------
  addModel(boxes, parent = this.object, unit = 1 / 16) {
    const mesh = new THREE.Mesh(boxGeometry(boxes, unit), this.mat);
    parent.add(mesh);
    return mesh;
  }

  /** World position of a chamber coordinate (voxels). */
  cp(x, z) {
    return { x: x * VOXEL, z: z * VOXEL };
  }

  returnToChamber() {
    const c = this.chamber;
    this.pos.set(c.center[0] * VOXEL, VOXEL, c.center[1] * VOXEL);
    this.yaw = ((c.yaw || 0) * Math.PI) / 180;
    this.contained = true;
    this.path = null;
    this.place(true);
  }

  place(force = false) {
    this.object.position.copy(this.pos);
    this.object.rotation.y = this.yaw;
    this.lightT -= 1;
    if (force || this.lightT <= 0) {
      this.lightT = 8;
      this.light(this.mat, this.lightBoost || 1.1);
    }
  }

  light(mat, boost = 1.1) {
    this.game.world.sampleLight(this.pos.x, this.pos.y + 0.8, this.pos.z, tmp);
    mat.color.setRGB(Math.min(1.3, tmp[0] * boost + 0.05), Math.min(1.3, tmp[1] * boost + 0.05), Math.min(1.3, tmp[2] * boost + 0.05));
  }

  // ---- Chamber helpers -------------------------------------------------------------
  inChamber(x, z) {
    const g = this.game;
    const room = g.builder.rooms[g.world.roomAtWorld(x, VOXEL + 0.3, z)];
    return !!room && room.zone === this.chamber.zone;
  }

  /** A random walkable point inside the chamber (meters), or null. */
  chamberPoint() {
    const [x0, z0, x1, z1] = this.chamber.bounds;
    const g = this.game;
    for (let i = 0; i < 10; i++) {
      const x = (x0 + 1 + Math.random() * (x1 - x0 - 2)) * VOXEL;
      const z = (z0 + 1 + Math.random() * (z1 - z0 - 2)) * VOXEL;
      if (g.nav.walkableAtWorld(x, z)) return [x, z];
    }
    return null;
  }

  get doorEntity() {
    return this.game.doorsById.get(this.chamber.door);
  }

  // ---- Movement ---------------------------------------------------------------------
  /** Follow a nav path toward (tx, tz). Returns the distance left. */
  moveToward(dt, tx, tz, speed, opts = {}) {
    const g = this.game;
    this.repathT -= dt;
    if (!this.path || this.repathT <= 0 || opts.force) {
      this.repathT = opts.repath ?? 0.6;
      this.path = g.nav.findPath(this.pos.x, this.pos.z, tx, tz);
      this.pathIdx = 0;
    }
    if (!this.path) return Math.hypot(tx - this.pos.x, tz - this.pos.z);
    let budget = speed * dt;
    while (budget > 0 && this.pathIdx < this.path.length) {
      const [px, pz] = this.path[this.pathIdx];
      const dx = px - this.pos.x;
      const dz = pz - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        this.pathIdx++;
        continue;
      }
      const ux = dx / d;
      const uz = dz / d;
      const step = Math.min(d, budget);
      const nx = this.pos.x + ux * step;
      const nz = this.pos.z + uz * step;
      const door = g.doorOnLine(this.pos.x, this.pos.z, nx + ux * 0.5, nz + uz * 0.5);
      if (door) {
        if (opts.tearDoors) door.tearOpen();
        else if (opts.openDoors && door.canOpen(opts.clearance ?? 3)) door.open();
        else {
          this.path = null;
          break;
        }
        if (!opts.tearDoors) break;
      }
      this.pos.x = nx;
      this.pos.z = nz;
      budget -= step;
      this.yaw = turn(this.yaw, Math.atan2(-ux, -uz), opts.turn ?? 0.35);
      if (d - step < 0.05) this.pathIdx++;
    }
    return Math.hypot(tx - this.pos.x, tz - this.pos.z);
  }

  /** Amble around inside the chamber (or near a point when loose). */
  wander(dt, speed, opts = {}) {
    const g = this.game;
    this.wanderT = (this.wanderT ?? 0) - dt;
    if (!this.wanderTo || this.wanderT <= 0) {
      this.wanderT = opts.pause ?? 4 + Math.random() * 5;
      if (this.contained) this.wanderTo = this.chamberPoint();
      else {
        const p = g.nav.randomPointNear(this.pos.x, this.pos.z, opts.radius ?? 8);
        this.wanderTo = p && !g.doorBlocksLine(this.pos.x, this.pos.z, p[0], p[1]) ? p : null;
      }
      this.path = null;
    }
    if (!this.wanderTo) return false;
    const left = this.moveToward(dt, this.wanderTo[0], this.wanderTo[1], speed, { repath: 2 });
    if (left < 0.2) this.wanderTo = null;
    return left >= 0.2;
  }

  /** Nearest living person (player and NPCs) to this SCP. */
  nearestPerson(maxDist = Infinity, filter = null) {
    const g = this.game;
    let best = null;
    let bd = maxDist;
    const consider = (v) => {
      if (filter && !filter(v)) return;
      const d = Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    };
    if (!g.player.dead && !g.player.inPocket) consider(g.player);
    for (const n of g.npcs.values()) if (n.alive && !n.zombie) consider(n);
    return best ? { v: best, d: bd } : null;
  }

  /** Kill someone (player or NPC) with a death cause. */
  kill(v, cause) {
    if (v === this.game.player) v.damage(999, cause);
    else v.damage(999, this);
  }

  // ---- Hooks ------------------------------------------------------------------------
  install() {}
  uninstall() {}
  onRelease() {}
  threats() {
    return [];
  }
  update() {}

  get recon() {
    return { mode: 'carry', text: `Return ${this.name} to its chamber`, detail: 'It is harmless. Pick it up.', actionText: `Carry ${this.name} back to containment`, hold: 2, reward: 150, penalty: 30, standing: [10, 10] };
  }
}

export function turn(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}
