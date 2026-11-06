// Interactive facility doors: sliding, split and vertical blast doors with
// keycard readers, clearance checks, and an obstruction sensor.

import * as THREE from 'three';
import { VOXEL, CLEARANCE } from '../config.js';
import { getDoorTextures, getReaderTexture, getButtonTexture } from './doorTextures.js';

export const DOOR_TYPES = {
  standard: { mode: 'split', width: 4, height: 5, duration: 1.1, thick: 0.14, tex: 'standard', label: 'Door' },
  elevator: { mode: 'split', width: 4, height: 5, duration: 1.4, thick: 0.1, tex: 'elevator', label: 'Elevator' },
  cell: { mode: 'slide', width: 3, height: 5, duration: 0.9, thick: 0.12, tex: 'cell', label: 'Cell Door' },
  office: { mode: 'slide', width: 3, height: 5, duration: 0.8, thick: 0.1, tex: 'office', label: 'Door' },
  heavy: { mode: 'up', width: 4, height: 5, duration: 2.4, thick: 0.22, tex: 'heavy', label: 'Heavy Door' },
  gate: { mode: 'up', width: 8, height: 7, duration: 5.0, thick: 0.3, tex: 'gate', label: 'Containment Gate' },
};

const WALL_HALF = VOXEL / 2;
const LED_IDLE = {
  0: 0x3fbf5a,
  1: 0xa8c040,
  2: 0xe2b030,
  3: 0xe07028,
  4: 0xd02a20,
  5: 0xa020d0,
};

const smooth = (t) => t * t * (3 - 2 * t);

function lightColor(rgb, boost = 1) {
  return new THREE.Color(
    Math.min(1.25, rgb[0] * boost),
    Math.min(1.25, rgb[1] * boost),
    Math.min(1.25, rgb[2] * boost),
  );
}

export class Door {
  /**
   * @param {object} o  voxel-space definition
   *   x, y, z  first voxel of the opening
   *   axis     'x' when the wall runs along X (door faces ±Z), 'z' otherwise
   *   type     key of DOOR_TYPES
   *   clearance  required clearance level
   *   slideDir +1 / -1 for single sliding panels (along local X)
   *   locked   optional message; door can never be opened
   *   name     shown in the interaction prompt
   *   id       script id (defaults to a slug of the name)
   *   requiresCard  never released by emergency protocols
   */
  constructor(o) {
    const t = DOOR_TYPES[o.type || 'standard'];
    this.def = t;
    this.type = o.type || 'standard';
    this.x = o.x;
    this.y = o.y ?? 1;
    this.z = o.z;
    this.axis = o.axis;
    this.width = o.width ?? t.width;
    this.height = o.height ?? t.height;
    this.clearance = o.clearance ?? 0;
    this.slideDir = o.slideDir ?? 1;
    this.locked = o.locked || null;
    this.baseLocked = this.locked;
    this.name = o.name || t.label;
    this.baseName = this.name;
    this.baseClearance = this.clearance;
    this.id = o.id || this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    this.requiresCard = !!o.requiresCard;
    // Runtime overrides used by facility events and scripts.
    this.released = false; // emergency release: keycard check bypassed
    this.sealed = null; // temporary seal message (e.g. test in progress)
    this.faulty = false; // reader malfunction
    this.passes = 0; // temporary authorizations (Class-D work routes)
    this.unpowered = false; // power failure: heavy doors fail closed
    this.broken = false; // torn open (SCP-096): stuck open until reset
    this.duration = t.duration;
    this.startOpen = !!o.open;

    this.state = 'closed';
    this.progress = 0;
    this.flash = 0;
    this.flashColor = 0x000000;

    const W = this.width * VOXEL;
    const H = this.height * VOXEL;
    this.W = W;
    this.H = H;

    // Bottom-center of the opening in world space.
    if (this.axis === 'x') {
      this.origin = new THREE.Vector3((this.x + this.width / 2) * VOXEL, this.y * VOXEL, (this.z + 0.5) * VOXEL);
    } else {
      this.origin = new THREE.Vector3((this.x + 0.5) * VOXEL, this.y * VOXEL, (this.z + this.width / 2) * VOXEL);
    }

    // World-space bounds of the doorway volume (for the obstruction sensor).
    const o3 = this.origin;
    if (this.axis === 'x') {
      this.openingBox = [o3.x - W / 2, o3.y, o3.z - WALL_HALF - 0.05, o3.x + W / 2, o3.y + H, o3.z + WALL_HALF + 0.05];
    } else {
      this.openingBox = [o3.x - WALL_HALF - 0.05, o3.y, o3.z - W / 2, o3.x + WALL_HALF + 0.05, o3.y + H, o3.z + W / 2];
    }

    this.group = new THREE.Group();
    this.group.position.copy(this.origin);
    if (this.axis === 'z') this.group.rotation.y = -Math.PI / 2;

    this.panels = [];
    this.colliders = [];
    this.buttonBoxes = [];
  }

  /** Vector from the door to its local +Z ("front") side, in world space. */
  frontNormal() {
    return this.axis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(-1, 0, 0);
  }

  /** Local (x, y, z) → world, matching the group's transform. */
  localToWorld(lx, ly, lz) {
    const o = this.origin;
    if (this.axis === 'x') return [o.x + lx, o.y + ly, o.z + lz];
    return [o.x - lz, o.y + ly, o.z + lx];
  }

  /** Build meshes. `world` is used to sample baked lighting. */
  build(world) {
    const { W, H } = this;
    const t = this.def;
    const n = this.frontNormal();
    const mid = this.origin.clone().add(new THREE.Vector3(0, Math.min(H * 0.5, 1.2), 0));
    const front = world.sampleLight(mid.x + n.x * 0.7, mid.y, mid.z + n.z * 0.7, [0, 0, 0]);
    const back = world.sampleLight(mid.x - n.x * 0.7, mid.y, mid.z - n.z * 0.7, [0, 0, 0]);
    const avg = [(front[0] + back[0]) / 2, (front[1] + back[1]) / 2, (front[2] + back[2]) / 2];
    this.frontLight = front;
    this.backLight = back;

    const tex = getDoorTextures(t.tex);
    const edgeMat = new THREE.MeshBasicMaterial({ color: lightColor(avg, 0.55) });
    const mat = (map, light) => new THREE.MeshBasicMaterial({ map, color: lightColor(light, 1.05) });
    const thick = t.thick;

    const makePanel = (pw, frontTex, backTex) => {
      const geo = new THREE.BoxGeometry(pw, H, thick);
      const mats = [edgeMat, edgeMat, edgeMat, edgeMat, mat(frontTex, front), mat(backTex, back)];
      const mesh = new THREE.Mesh(geo, mats);
      this.group.add(mesh);
      return mesh;
    };

    if (t.mode === 'split') {
      const left = makePanel(W / 2, tex.a, tex.b);
      const right = makePanel(W / 2, tex.b, tex.a);
      this.panels.push({ mesh: left, w: W / 2, cx: -W / 4, open: [-W / 2, 0] });
      this.panels.push({ mesh: right, w: W / 2, cx: W / 4, open: [W / 2, 0] });
    } else if (t.mode === 'slide') {
      const p = makePanel(W, tex.a, tex.b);
      this.panels.push({ mesh: p, w: W, cx: 0, open: [W * this.slideDir, 0] });
    } else {
      const p = makePanel(W, tex.a, tex.b);
      this.panels.push({ mesh: p, w: W, cx: 0, open: [0, H + 0.02] });
    }
    for (const p of this.panels) {
      p.mesh.position.set(p.cx, H / 2, 0);
      this.colliders.push([0, 0, 0, 0, 0, 0]);
    }

    // Frame trim on both wall faces.
    const trimMatF = new THREE.MeshBasicMaterial({ color: lightColor(front, 0.42) });
    const trimMatB = new THREE.MeshBasicMaterial({ color: lightColor(back, 0.42) });
    const trim = 0.1;
    const depth = 0.05;
    for (const side of [1, -1]) {
      const m = side > 0 ? trimMatF : trimMatB;
      const z = side * (WALL_HALF + depth / 2);
      const top = new THREE.Mesh(new THREE.BoxGeometry(W + trim * 2, trim, depth), m);
      top.position.set(0, H + trim / 2, z);
      const l = new THREE.Mesh(new THREE.BoxGeometry(trim, H, depth), m);
      l.position.set(-W / 2 - trim / 2, H / 2, z);
      const r = new THREE.Mesh(new THREE.BoxGeometry(trim, H, depth), m);
      r.position.set(W / 2 + trim / 2, H / 2, z);
      this.group.add(top, l, r);
    }

    // Status lamps above the door (blink while moving).
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x3a2a10 });
    for (const side of [1, -1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.05), this.lampMat);
      lamp.position.set(0, H + trim + 0.06, side * (WALL_HALF + 0.04));
      this.group.add(lamp);
    }

    // Keycard readers / buttons on both sides, beside the opening.
    const readerMap = this.clearance > 0 || this.locked ? getReaderTexture() : getButtonTexture();
    this.ledMat = new THREE.MeshBasicMaterial({ color: this.idleLedColor() });
    const px = W / 2 + VOXEL / 2;
    const py = Math.min(1.15, H - 0.3);
    for (const side of [1, -1]) {
      const light = side > 0 ? front : back;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.32, 0.06),
        [edgeMat, edgeMat, edgeMat, edgeMat,
          new THREE.MeshBasicMaterial({ map: readerMap, color: lightColor(light, 1.25) }),
          new THREE.MeshBasicMaterial({ map: readerMap, color: lightColor(light, 1.25) })],
      );
      const bx = side > 0 ? px : -px;
      const bz = side * (WALL_HALF + 0.03);
      body.position.set(bx, py, bz);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.02), this.ledMat);
      led.position.set(bx, py + 0.2, side * (WALL_HALF + 0.015));
      this.group.add(body, led);
      const [wx, wy, wz] = this.localToWorld(bx, py, bz);
      const ex = this.axis === 'x' ? 0.16 : 0.08;
      const ez = this.axis === 'x' ? 0.08 : 0.16;
      this.buttonBoxes.push([wx - ex, wy - 0.22, wz - ez, wx + ex, wy + 0.26, wz + ez]);
    }

    if (this.startOpen) {
      this.progress = 1;
      this.state = 'open';
    }
    this.applyPose();
    return this.group;
  }

  idleLedColor() {
    if (this.unpowered || this.broken) return 0x101010;
    if (this.locked || this.sealed) return LED_IDLE[4];
    if (this.passes > 0) return 0x40ff60;
    if (this.released && !this.requiresCard) return 0x40ff60;
    return LED_IDLE[Math.min(5, this.clearance)];
  }

  reset() {
    this.progress = this.startOpen ? 1 : 0;
    this.state = this.startOpen ? 'open' : 'closed';
    this.flash = 0;
    this.locked = this.baseLocked;
    this.clearance = this.baseClearance;
    this.name = this.baseName;
    this.released = false;
    this.sealed = null;
    this.faulty = false;
    this.passes = 0;
    this.unpowered = false;
    this.broken = false;
    this.ledMat.color.setHex(this.idleLedColor());
    this.applyPose();
  }

  /** Why the door refuses someone with this clearance, or null if allowed. */
  denyReason(clearance, skeleton = false) {
    if (this.broken) return 'DOOR DESTROYED — TORN FROM ITS TRACKS';
    if (skeleton) return this.unpowered ? 'NO POWER — DOOR MOTOR OFFLINE' : null; // SCP-005 opens any lock
    if (this.locked) return this.locked;
    if (this.unpowered) return 'NO POWER — DOOR MOTOR OFFLINE';
    if (this.sealed) return this.sealed;
    if (this.faulty) return 'READER MALFUNCTION — MAINTENANCE REQUIRED';
    if (this.released && !this.requiresCard) return null;
    if (this.passes > 0) return null;
    if (clearance < this.clearance) {
      return `ACCESS DENIED — ${CLEARANCE[this.clearance].name.toUpperCase()} CLEARANCE REQUIRED`;
    }
    return null;
  }

  canOpen(clearance) {
    return this.denyReason(clearance) === null;
  }

  /** Scripted control (ignores clearance). */
  open() {
    if (this.state !== 'open') this.state = 'opening';
  }

  close() {
    if (this.broken) return;
    if (this.state !== 'closed') this.state = 'closing';
  }

  /** Ripped open by something very strong: stays open. */
  tearOpen() {
    this.broken = true;
    this.progress = 1;
    this.state = 'open';
    this.applyPose();
    this.refreshLed();
  }

  /** Maintenance repairs a destroyed door. */
  repair() {
    if (!this.broken) return;
    this.broken = false;
    this.refreshLed();
  }

  refreshLed() {
    if (this.flash <= 0) this.ledMat.color.setHex(this.idleLedColor());
  }

  get isOpen() {
    return this.state === 'open' || this.state === 'opening';
  }

  /** True when the door currently blocks the doorway at all. */
  get blocking() {
    return this.progress < 0.999;
  }

  applyPose() {
    const e = smooth(this.progress);
    const { H } = this;
    for (let i = 0; i < this.panels.length; i++) {
      const p = this.panels[i];
      const lx = p.cx + p.open[0] * e;
      const ly = H / 2 + p.open[1] * e;
      p.mesh.position.set(lx, ly, 0);
      const [wx, wy, wz] = this.localToWorld(lx, ly, 0);
      const hw = p.w / 2;
      const hh = H / 2;
      const ht = this.def.thick / 2;
      const c = this.colliders[i];
      if (this.axis === 'x') {
        c[0] = wx - hw; c[3] = wx + hw;
        c[2] = wz - ht; c[5] = wz + ht;
      } else {
        c[0] = wx - ht; c[3] = wx + ht;
        c[2] = wz - hw; c[5] = wz + hw;
      }
      c[1] = wy - hh;
      c[4] = wy + hh;
    }
  }

  intersectsOpening(box) {
    const o = this.openingBox;
    return box[0] < o[3] && box[3] > o[0] && box[1] < o[4] && box[4] > o[1] && box[2] < o[5] && box[5] > o[2];
  }

  /** Attempt to operate the door. Returns { ok, message }. */
  operate(clearance, playerBox, skeleton = false) {
    const deny = this.denyReason(clearance, skeleton);
    if (deny) {
      this.flashLed(0xff2a1a);
      return { ok: false, message: deny };
    }
    if (this.state === 'closed' || this.state === 'closing') {
      this.state = 'opening';
    } else {
      if (playerBox && this.intersectsOpening(playerBox)) {
        this.flashLed(0xffb020);
        return { ok: false, message: 'DOORWAY OBSTRUCTED' };
      }
      this.state = 'closing';
    }
    this.flashLed(0x40ff60);
    return { ok: true, message: null };
  }

  flashLed(color) {
    this.flash = 0.7;
    this.flashColor = color;
  }

  promptText(clearance, skeleton = false) {
    const verb = this.isOpen ? 'Close' : 'Open';
    if (this.broken) return { text: `${this.name}`, sub: 'DESTROYED', denied: true };
    if (skeleton && !this.unpowered) return { text: `${verb} ${this.name}`, sub: 'SCP-005', denied: false };
    if (this.locked) return { text: `${this.name}`, sub: 'LOCKED', denied: true };
    if (this.unpowered) return { text: `${this.name}`, sub: 'NO POWER', denied: true };
    if (this.passes > 0 && clearance < this.clearance) return { text: `${verb} ${this.name}`, sub: 'ROUTE AUTHORIZED', denied: false };
    if (this.sealed) return { text: `${this.name}`, sub: 'SEALED', denied: true };
    if (this.faulty) return { text: `${this.name}`, sub: 'READER FAULT', denied: true };
    if (this.released && !this.requiresCard) return { text: `${verb} ${this.name}`, sub: 'EMERGENCY RELEASE', denied: false };
    if (clearance < this.clearance) {
      return { text: `${verb} ${this.name}`, sub: `${CLEARANCE[this.clearance].name} required`, denied: true };
    }
    const sub = this.clearance > 0 ? `${CLEARANCE[this.clearance].name}` : '';
    return { text: `${verb} ${this.name}`, sub, denied: false };
  }

  // ---- Generic interactable interface (see game/Interactables.js) ----------
  boxes() {
    return this.interactBoxes();
  }

  prompt(game) {
    return this.promptText(game.clearance, game.player.skeletonT > 0);
  }

  use(game) {
    const res = this.operate(game.clearance, game.player.aabb(), game.player.skeletonT > 0);
    return res;
  }

  /** Boxes the player can aim at to interact (world AABBs). */
  interactBoxes() {
    // While open, the doorway itself stays targetable so the door can be closed.
    if (!this.blocking) return [this.openingBox, ...this.buttonBoxes];
    return [...this.colliders, ...this.buttonBoxes];
  }

  /** bodies: AABBs of the player and nearby NPCs (obstruction sensor). */
  update(dt, bodies, time) {
    const moving = this.state === 'opening' || this.state === 'closing';
    if (this.state === 'opening') {
      this.progress = Math.min(1, this.progress + dt / this.duration);
      if (this.progress >= 1) this.state = 'open';
    } else if (this.state === 'closing') {
      if (bodies.some((b) => this.intersectsOpening(b))) {
        // Safety sensor: never close on someone.
        this.state = 'opening';
      } else {
        this.progress = Math.max(0, this.progress - dt / this.duration);
        if (this.progress <= 0) this.state = 'closed';
      }
    }
    if (moving) this.applyPose();

    this.lampMat.color.setHex(moving && Math.floor(time * 6) % 2 === 0 ? 0xffa020 : 0x3a2a10);

    if (this.flash > 0) {
      this.flash -= dt;
      const on = Math.floor(this.flash * 10) % 2 === 0;
      this.ledMat.color.setHex(on ? this.flashColor : 0x101010);
      if (this.flash <= 0) this.ledMat.color.setHex(this.idleLedColor());
    } else if (this.faulty) {
      this.ledMat.color.setHex(Math.floor(time * 3) % 2 ? 0xffa020 : 0x201008);
    }
  }
}

