// SCP-096 — "The Shy Guy".
//
//   docile    crouched, face buried in its hands, facing a corner (or wherever
//             it last stopped). Anyone who sees its FACE — directly, through
//             glass, on a camera feed or in a photograph — becomes a target.
//   distress  it stands, clutches its head and screams (~6 s). More people
//             who see it now are added to the list.
//   charge    it runs every target down in turn, faster than anyone can
//             sprint, tearing doors out of their frames. Anyone in its way dies.
//   calm      with every target dead it sinks back down where it stands.
//
// Recontainment: get BEHIND it and bag its head. Never see its face.

import * as THREE from 'three';
import { VOXEL } from '../../config.js';
import { boxGeometry } from './voxelModel.js';

const SKIN = 0xd9ccd0;
const SHADOW = 0xb8a8ae;
const BLOOD = 0x9a3a3a;
const MOUTH = 0x2a0808;
const TONGUE = 0x8a4a50;
const EYE = 0xeef4f4;
const PU = 1 / 16;
const CHARGE_SPEED = 7.4; // m/s — a sprinting human manages ~5

function part(boxes, mat) {
  return new THREE.Mesh(boxGeometry(boxes, PU), mat);
}

function buildModel() {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const shins = [];
  const leg = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 1.7 * PU, 17 * PU, 0);
    g.add(part([[-1, -9, -1, 1, 0, 1, SKIN]], mat)); // thigh
    const shin = new THREE.Group();
    shin.position.set(0, -9 * PU, 0);
    shin.add(
      part(
        [
          [-1.15, -1, -1.15, 1.15, 0.5, 1.15, SHADOW], // knee
          [-0.85, -7, -0.85, 0.85, 0, 0.85, SKIN],
          [-1.2, -8, -3.2, 1.2, -7, 1, SKIN], // long bare foot
        ],
        mat,
      ),
    );
    g.add(shin);
    shins.push(shin);
    return g;
  };

  const torso = new THREE.Group();
  torso.position.set(0, 17 * PU, 0);
  torso.add(
    part(
      [
        [-2.6, 0, -1.4, 2.6, 2, 1.4, SKIN], // pelvis
        [-2, 2, -1.2, 2, 6, 1.2, SKIN], // starved waist
        [-3.3, 6, -1.8, 3.3, 12, 1.8, SKIN], // ribcage
        [-3.1, 7, -1.85, 3.1, 7.3, -1.8, SHADOW], // ribs
        [-3.1, 8.5, -1.85, 3.1, 8.8, -1.8, SHADOW],
        [-3.1, 10, -1.85, 3.1, 10.3, -1.8, SHADOW],
        [-4.2, 11, -1.5, 4.2, 12.5, 1.5, SKIN], // shoulders
        [-0.9, 12.5, -0.9, 0.9, 14.5, 0.9, SKIN], // neck
      ],
      mat,
    ),
  );

  const head = new THREE.Group();
  head.position.set(0, 14.5 * PU, 0);
  const fz = -2.75;
  head.add(
    part(
      [
        [-2.4, 2, -2.5, 2.4, 9, 2.5, SKIN], // bald skull
        [-2, 9, -2, 2, 9.8, 2, SKIN],
        [-2.7, 4.5, -0.6, -2.4, 6.5, 0.6, SHADOW], // ears
        [2.4, 4.5, -0.6, 2.7, 6.5, 0.6, SHADOW],
        [-2, 5.4, fz, -0.6, 6.8, fz + 0.2, 0x8a7a88], // sunken sockets
        [0.6, 5.4, fz, 2, 6.8, fz + 0.2, 0x8a7a88],
        [-1.7, 5.7, fz - 0.05, -0.9, 6.5, fz + 0.1, EYE, true], // white eyes
        [0.9, 5.7, fz - 0.05, 1.7, 6.5, fz + 0.1, EYE, true],
        [-0.4, 3.8, fz - 0.1, 0.4, 5.4, fz + 0.2, SHADOW], // nose
        [-1.9, -5, -2.3, 1.9, 3.6, 2.2, SKIN], // stretched, unhinged jaw
        [-1.2, -4.2, fz + 0.4, 1.2, 3, fz + 0.5, MOUTH], // gaping mouth
        [-0.8, -3.6, fz + 0.38, 0.8, -1.5, fz + 0.45, TONGUE],
      ],
      mat,
    ),
  );
  torso.add(head);

  const arm = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 4 * PU, 11.8 * PU, 0);
    g.add(
      part(
        [
          [-0.8, -12, -0.8, 0.8, 0.5, 0.8, SKIN],
          [-0.9, -13, -0.9, 0.9, -11.5, 0.9, SHADOW], // elbow
          [-0.7, -23, -0.7, 0.7, -12, 0.7, SKIN],
          [-1.4, -26, -0.7, 1.4, -23, 0.6, SKIN], // hand
          [-1.4, -29, -0.5, -0.9, -26, 0.3, BLOOD], // long fingers, bloodied
          [-0.6, -29.5, -0.5, -0.1, -26, 0.3, BLOOD],
          [0.2, -29.5, -0.5, 0.7, -26, 0.3, BLOOD],
          [0.9, -28.5, -0.5, 1.4, -26, 0.3, BLOOD],
          [-1.4, -25, -0.75, 1.4, -23.5, -0.7, BLOOD],
        ],
        mat,
      ),
    );
    return g;
  };

  const legL = leg(-1);
  const legR = leg(1);
  const armL = arm(-1);
  const armR = arm(1);
  torso.add(armL, armR);
  body.add(legL, legR, torso);
  return { root, body, torso, head, legL, legR, shinL: shins[0], shinR: shins[1], armL, armR, mat };
}

const POSES = {
  // Sitting curled up: knees drawn to the chest, arms around them, face buried.
  docile: { body: -14.5, legs: 1.85, shins: -1.75, torso: -0.55, arms: 1.15, armSpread: -0.08, head: -0.8 },
  distress: { body: 0, legs: 0, shins: 0, torso: -0.15, arms: 2.85, armSpread: 0.5, head: 0.25 },
  charge: { body: 0, legs: 0, shins: -0.35, torso: -0.6, arms: -0.4, armSpread: 0.3, head: 0.35 },
};

const tmp = [0, 0, 0];

export class Scp096 {
  constructor(game, chamber) {
    this.game = game;
    this.id = '096';
    this.name = 'SCP-096';
    this.chamber = chamber;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.contained = true;
    this.state = 'docile';
    this.targets = [];
    this.stateT = 0;
    this.action = null;
    this.kills = 0;
    this.t = 0;
    this.pose = { ...POSES.docile };
    this.model = buildModel();
    this.object = this.model.root;
    this.returnToChamber();
  }

  get origin() {
    return this.pos;
  }

  get hold() {
    return this.action ? this.action.hold || 0 : 0;
  }

  get raging() {
    return this.state === 'distress' || this.state === 'charge';
  }

  boxes() {
    const p = this.pos;
    const h = this.state === 'docile' ? 1.4 : 2.4;
    return [[p.x - 0.4, p.y, p.z - 0.4, p.x + 0.4, p.y + h, p.z + 0.4]];
  }

  /** Is the player standing behind it (safe side to bag it from)? */
  playerBehind() {
    const p = this.game.player.pos;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (fx * dx + fz * dz) / d < -0.2;
  }

  prompt() {
    if (!this.action || this.state !== 'docile') return null;
    if (!this.playerBehind()) return { text: 'Get behind it first', sub: 'Do not look at its face', denied: true };
    return { text: this.action.text, sub: 'Stay behind it. Never look at its face.', denied: false };
  }

  use(game) {
    if (!this.action || this.state !== 'docile' || !this.playerBehind()) return null;
    return this.action.use(game);
  }

  returnToChamber() {
    const c = this.chamber;
    this.pos.set(c.corner[0] * VOXEL, VOXEL, c.corner[1] * VOXEL);
    this.yaw = (c.corner[2] * Math.PI) / 180;
    this.contained = true;
    this.state = 'docile';
    this.targets = [];
    const door = this.game.doorsById.get(c.door);
    if (door) door.repair();
    this.place();
  }

  /** World position of its face, used for "did someone see its face". */
  facePoint() {
    this.object.updateMatrixWorld(true);
    return new THREE.Vector3(0, 5.5 * PU, -2.8 * PU).applyMatrix4(this.model.head.matrixWorld);
  }

  /** Is (x, z) in front of its face? */
  faces(x, z) {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (fx * dx + fz * dz) / d > 0.15;
  }

  /** Someone has seen its face. */
  enrage(victim, how) {
    if (!victim || victim.dead || this.targets.includes(victim)) return;
    this.targets.push(victim);
    if (victim === this.game.player) this.game.scps.onPlayerTargeted(this, how);
    if (this.state === 'docile') {
      this.state = 'distress';
      this.stateT = 6;
      this.path = null;
    }
  }

  /** Called when a breach event releases it without anyone looking. */
  onRelease() {
    if (this.raging) return;
    const g = this.game;
    const people = [...g.npcs.values()].filter((n) => n.alive && (n.kind === 'scientist' || n.kind === 'guard'));
    if (!people.length) return;
    // A monitor glitch showed its face to someone, somewhere on site.
    const victim = people[Math.floor(Math.random() * people.length)];
    this.enrage(victim, 'feed');
  }

  place() {
    this.object.position.copy(this.pos);
    this.object.rotation.y = this.yaw;
    this.game.world.sampleLight(this.pos.x, 1.2, this.pos.z, tmp);
    this.model.mat.color.setRGB(Math.min(1.3, tmp[0] * 1.12 + 0.05), Math.min(1.3, tmp[1] * 1.12 + 0.05), Math.min(1.3, tmp[2] * 1.12 + 0.06));
  }

  insideChamber() {
    const g = this.game;
    const id = g.world.roomAtWorld(this.pos.x, this.pos.y + 0.3, this.pos.z);
    const room = g.builder.rooms[id];
    return !!room && room.zone === this.chamber.zone;
  }

  kill(v) {
    this.kills++;
    if (v === this.game.player) {
      this.game.ui.neckSnap();
      v.damage(999, 'scp096');
    } else v.damage(999);
  }

  update(dt) {
    const g = this.game;
    this.t += dt;

    // Anyone who sees its face joins the list (it is always watching for that).
    for (const v of g.scps.faceViewers(this)) this.enrage(v, 'direct');

    if (this.state === 'distress') {
      this.stateT -= dt;
      if (this.stateT <= 0) this.state = 'charge';
    } else if (this.state === 'charge') {
      this.targets = this.targets.filter((v) => !v.dead && !(v.hidden ?? false));
      if (!this.targets.length) {
        this.state = 'calm';
        this.stateT = 2.5;
      } else this.chase(dt, this.targets[0]);
    } else if (this.state === 'calm') {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.state = 'docile';
        const door = g.doorsById.get(this.chamber.door);
        this.contained = this.insideChamber() && !!door && !door.broken;
      }
    }
    this.animate(dt);
    this.place();
  }

  chase(dt, target) {
    const g = this.game;
    const tp = target.pos;
    const d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
    if (d < 1.0) {
      this.kill(target);
      return;
    }
    // Bystanders in its way die too.
    for (const n of g.npcs.values()) {
      if (n.alive && n !== target && Math.hypot(n.pos.x - this.pos.x, n.pos.z - this.pos.z) < 0.7) this.kill(n);
    }
    this.contained = false;
    this.repath = (this.repath || 0) - dt;
    if (!this.path || this.repath <= 0) {
      this.path = g.nav.findPath(this.pos.x, this.pos.z, tp.x, tp.z);
      this.pathIdx = 0;
      this.repath = 0.4;
    }
    if (!this.path) return;
    let budget = CHARGE_SPEED * dt;
    while (budget > 0 && this.pathIdx < this.path.length) {
      const [tx, tz] = this.path[this.pathIdx];
      const dx = tx - this.pos.x;
      const dz = tz - this.pos.z;
      const dd = Math.hypot(dx, dz);
      const step = Math.min(dd, budget);
      const nx = this.pos.x + (dx / (dd || 1)) * step;
      const nz = this.pos.z + (dz / (dd || 1)) * step;
      // Nothing stops it: doors are torn out of their frames.
      const door = g.doorOnLine(this.pos.x, this.pos.z, nx + (dx / (dd || 1)) * 0.6, nz + (dz / (dd || 1)) * 0.6);
      if (door) door.tearOpen();
      this.pos.x = nx;
      this.pos.z = nz;
      budget -= step;
      if (dd - step < 0.05) this.pathIdx++;
      if (dd > 0.01) this.yaw = Math.atan2(-dx, -dz);
    }
  }

  animate(dt) {
    const m = this.model;
    const target = this.state === 'charge' ? POSES.charge : this.state === 'distress' ? POSES.distress : POSES.docile;
    const k = Math.min(1, dt * (this.state === 'calm' ? 2 : 7));
    for (const key of Object.keys(target)) this.pose[key] += (target[key] - this.pose[key]) * k;
    const p = this.pose;
    let legSwing = 0;
    let armSwing = 0;
    let shake = 0;
    let rock = 0;
    if (this.state === 'charge') {
      legSwing = Math.sin(this.t * 16) * 0.9;
      armSwing = Math.sin(this.t * 16) * 0.7;
    } else if (this.state === 'distress') {
      shake = Math.sin(this.t * 31) * 0.18;
    } else {
      rock = Math.sin(this.t * 1.6) * 0.07; // quiet sobbing
    }
    m.body.position.y = p.body * PU;
    m.legL.rotation.x = p.legs + legSwing;
    m.legR.rotation.x = p.legs - legSwing;
    const knee = this.state === 'charge' ? Math.abs(Math.sin(this.t * 16)) * 0.9 : 0;
    m.shinL.rotation.x = p.shins - knee;
    m.shinR.rotation.x = p.shins - (this.state === 'charge' ? Math.abs(Math.cos(this.t * 16)) * 0.9 : 0);
    m.torso.rotation.x = p.torso + rock;
    m.armL.rotation.x = p.arms - armSwing;
    m.armR.rotation.x = p.arms + armSwing;
    m.armL.rotation.z = -p.armSpread;
    m.armR.rotation.z = p.armSpread;
    m.head.rotation.x = p.head;
    m.head.rotation.z = shake;
    m.head.rotation.y = shake * 0.6;
  }
}
