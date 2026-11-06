// Things the player can use besides doors: wall terminals, pickups (keycards,
// documents, anomalous objects), first-aid stations and simple trigger objects.
//
// Interactable interface (shared with Door and NPC):
//   origin: Vector3          used for distance culling
//   boxes(): AABB[]          what the crosshair can hit
//   prompt(game): {text, sub, denied} | null   (null = not usable right now)
//   use(game): {ok, message} | void
//   hold?: seconds           requires holding the interact button

import * as THREE from 'three';
import { VOXEL } from '../config.js';
import { drawPixelText } from '../world/pixelFont.js';
import { pixelTexture } from '../world/textures.js';

const FACE_ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
const FACE_N = { s: [0, 0, 1], n: [0, 0, -1], e: [1, 0, 0], w: [-1, 0, 0] };
const tmp = [0, 0, 0];

function litColor(world, x, y, z, boost = 1.1) {
  world.sampleLight(x, y, z, tmp);
  return new THREE.Color(Math.min(1.2, tmp[0] * boost + 0.05), Math.min(1.2, tmp[1] * boost + 0.05), Math.min(1.2, tmp[2] * boost + 0.06));
}

/** Base for simple box-shaped interactables with a scripted action. */
export class Interactable {
  constructor({ id, origin, half = [0.25, 0.25, 0.25], action = null }) {
    this.id = id;
    this.origin = origin;
    this.half = half;
    this.action = action; // { text, sub, hold, use(game) }
    this.enabled = true;
    this.object = new THREE.Group();
  }

  boxes() {
    const o = this.origin;
    const h = this.half;
    return [[o.x - h[0], o.y - h[1], o.z - h[2], o.x + h[0], o.y + h[1], o.z + h[2]]];
  }

  get hold() {
    return this.action ? this.action.hold || 0 : 0;
  }

  prompt() {
    if (!this.enabled || !this.action) return null;
    return { text: this.action.text, sub: this.action.sub || '', denied: !!this.action.denied };
  }

  use(game) {
    if (!this.action) return null;
    return this.action.use(game);
  }

  update() {}
}

/** Wall-mounted computer terminal with a small pixel-text screen. */
export class Terminal extends Interactable {
  constructor(def, world) {
    const n = FACE_N[def.face];
    const origin = new THREE.Vector3(def.x * VOXEL + n[0] * 0.07, def.y * VOXEL, def.z * VOXEL + n[2] * 0.07);
    const across = def.face === 'e' || def.face === 'w' ? [0.08, 0.24, 0.3] : [0.3, 0.24, 0.08];
    super({ id: def.id, origin, half: across });
    this.label = def.label;
    this.face = def.face;
    this.status = 'idle';
    this.line = 'STANDBY';
    this.blink = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 96;
    this.canvas.height = 64;
    this.tex = pixelTexture(this.canvas);
    const light = litColor(world, origin.x + n[0] * 0.4, origin.y, origin.z + n[2] * 0.4);
    const casing = new THREE.MeshBasicMaterial({ color: light.clone().multiplyScalar(0.42) });
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.tex });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.44, 0.12), casing);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.31), this.screenMat);
    screen.position.set(0, 0.02, 0.061);
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.16), casing);
    ledge.position.set(0, -0.24, 0.03);
    this.object.add(body, screen, ledge);
    this.object.position.set(def.x * VOXEL + n[0] * 0.06, def.y * VOXEL, def.z * VOXEL + n[2] * 0.06);
    this.object.rotation.y = FACE_ROT[def.face];
    this.draw();
  }

  /** status: idle | active (objective) | alert | done | offline */
  setStatus(status, line) {
    this.status = status;
    if (line) this.line = line;
    this.draw();
  }

  draw(flash = false) {
    const ctx = this.canvas.getContext('2d');
    const pal = {
      idle: ['#0c1a12', '#5fd39a'],
      active: ['#1a1608', '#ffd060'],
      alert: ['#200806', '#ff5a40'],
      done: ['#0c1a12', '#7fff9a'],
      offline: ['#060606', '#3a3a3a'],
    }[this.status];
    ctx.fillStyle = flash ? '#000' : pal[0];
    ctx.fillRect(0, 0, 96, 64);
    ctx.fillStyle = pal[1];
    ctx.fillRect(2, 12, 92, 1);
    drawPixelText(ctx, this.label.slice(0, 15), 48, 3, 1, pal[1], 'center');
    // Word-wrap the status line to 15 characters.
    const lines = [];
    let cur = '';
    for (const w of this.line.toUpperCase().split(' ')) {
      if ((cur + ' ' + w).trim().length > 15) {
        lines.push(cur);
        cur = w;
      } else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur);
    lines.slice(0, 4).forEach((l, i) => drawPixelText(ctx, l, 48, 18 + i * 10, 1, pal[1], 'center'));
    this.tex.needsUpdate = true;
  }

  prompt(game) {
    if (this.action) return super.prompt(game);
    return { text: `${titleCase(this.label)} Terminal`, sub: this.status === 'offline' ? 'OFFLINE' : 'No pending tasks', denied: false };
  }

  use(game) {
    if (this.action) return super.use(game);
    return { ok: false, message: this.status === 'offline' ? 'TERMINAL OFFLINE' : `${this.label}: NO PENDING TASKS` };
  }

  update(dt, time) {
    if (this.status === 'alert' || this.status === 'active') {
      const on = Math.floor(time * (this.status === 'alert' ? 4 : 1.5)) % 2 === 0;
      if (on !== this.blinkOn) {
        this.blinkOn = on;
        this.draw(!on && this.status === 'alert');
      }
    }
  }
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A small item that can be picked up. kind: keycard | document | specimen */
export class Pickup extends Interactable {
  constructor({ id, kind, x, y, z, name, color = 0x40ff70, onPickup }, world) {
    super({ id, origin: new THREE.Vector3(x, y, z), half: [0.22, 0.2, 0.22] });
    this.kind = kind;
    this.name = name;
    this.taken = false;
    this.baseY = y;
    this.t = Math.random() * 6;
    this.onPickup = onPickup;
    const light = litColor(world, x, y + 0.3, z);
    let mesh;
    if (kind === 'keycard') {
      const g = new THREE.Group();
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.1), new THREE.MeshBasicMaterial({ color: light.clone().multiplyScalar(1.2) }));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.014, 0.025), new THREE.MeshBasicMaterial({ color: 0xe2b030 }));
      stripe.position.z = -0.03;
      this.glint = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.016, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      this.glint.position.set(0.05, 0, 0.02);
      g.add(card, stripe, this.glint);
      mesh = g;
    } else if (kind === 'crate') {
      const g = new THREE.Group();
      const c = new THREE.Color(0xa07a4a).multiply(light);
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.4), new THREE.MeshBasicMaterial({ color: c })));
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.42), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.6) }));
      band.position.y = 0.1;
      g.add(band);
      mesh = g;
      this.half = [0.3, 0.28, 0.25];
    } else if (kind === 'document') {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.22), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8a868).multiply(light) })));
      const label = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.032, 0.04), new THREE.MeshBasicMaterial({ color: 0xa82820 }));
      label.position.set(-0.06, 0, -0.05);
      g.add(label);
      mesh = g;
    } else {
      const g = new THREE.Group();
      this.core = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color }));
      const shell = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.24, 0.24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }),
      );
      g.add(this.core, shell);
      this.shell = shell;
      mesh = g;
    }
    this.mesh = mesh;
    this.object.add(mesh);
    this.object.position.set(x, y, z);
    this.action = {
      text: `Pick up ${name}`,
      use: (game) => this.take(game),
    };
  }

  take(game) {
    if (this.taken) return null;
    this.taken = true;
    this.enabled = false;
    this.object.visible = false;
    if (this.onPickup) this.onPickup(game, this);
    return { ok: true, message: `PICKED UP: ${this.name.toUpperCase()}` };
  }

  /** Put the item back into the world (e.g. on a receptacle). */
  place(x, y, z) {
    this.taken = false;
    this.object.visible = true;
    this.origin.set(x, y, z);
    this.baseY = y;
    this.object.position.set(x, y, z);
  }

  update(dt) {
    if (this.taken) return;
    this.t += dt;
    if (this.kind === 'keycard') {
      this.object.rotation.y += dt * 1.2;
      this.glint.visible = Math.sin(this.t * 5) > 0.2;
    } else if (this.kind === 'specimen') {
      this.object.position.y = this.baseY + Math.sin(this.t * 2) * 0.03;
      this.object.rotation.y += dt * 0.8;
      this.shell.scale.setScalar(1 + Math.sin(this.t * 4) * 0.08);
    }
  }
}

/** Wall-mounted first-aid cabinet: heals the player, then recharges. */
export class FirstAid extends Interactable {
  constructor(def, world) {
    const n = FACE_N[def.face];
    const origin = new THREE.Vector3(def.x * VOXEL + n[0] * 0.08, def.y * VOXEL, def.z * VOXEL + n[2] * 0.08);
    super({ id: 'firstaid', origin, half: def.face === 'e' || def.face === 'w' ? [0.1, 0.22, 0.22] : [0.22, 0.22, 0.1] });
    this.cooldown = 0;
    const c = document.createElement('canvas');
    c.width = 12;
    c.height = 12;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e8e8e2';
    ctx.fillRect(0, 0, 12, 12);
    ctx.fillStyle = '#c82a20';
    ctx.fillRect(5, 2, 2, 8);
    ctx.fillRect(2, 5, 8, 2);
    ctx.fillStyle = '#9a9a96';
    ctx.fillRect(0, 11, 12, 1);
    const light = litColor(world, origin.x + n[0] * 0.4, origin.y, origin.z + n[2] * 0.4, 1.25);
    const face = new THREE.MeshBasicMaterial({ map: pixelTexture(c), color: light });
    const side = new THREE.MeshBasicMaterial({ color: light.clone().multiplyScalar(0.7) });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.12), [side, side, side, side, face, side]);
    this.object.add(box);
    this.object.position.set(def.x * VOXEL + n[0] * 0.06, def.y * VOXEL, def.z * VOXEL + n[2] * 0.06);
    this.object.rotation.y = FACE_ROT[def.face];
    this.action = {
      text: 'Use First Aid Station',
      hold: 1.2,
      use: (game) => {
        if (this.cooldown > 0) return { ok: false, message: 'FIRST AID STATION RESTOCKING' };
        if (game.player.hp >= game.player.maxHp) return { ok: false, message: 'NO TREATMENT NEEDED' };
        game.player.heal(100);
        this.cooldown = 45;
        return { ok: true, message: 'WOUNDS TREATED' };
      },
    };
  }

  prompt(game) {
    const p = super.prompt(game);
    if (p && this.cooldown > 0) p.sub = `Restocking (${Math.ceil(this.cooldown)}s)`;
    return p;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
  }
}

/** Glowing anomalous specimen on a pedestal (laboratory sequence test). */
export class SpecimenStand extends Interactable {
  constructor({ id, x, z, color, name }, world) {
    super({ id, origin: new THREE.Vector3(x, 0.5 + 0.95, z), half: [0.32, 0.5, 0.32] });
    this.name = name;
    this.color = color;
    const light = litColor(world, x, 1.2, z);
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9aa0a8).multiply(light) }));
    ped.position.y = 0.875;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.58), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5a5e66).multiply(light) }));
    top.position.y = 1.275;
    this.coreMat = new THREE.MeshBasicMaterial({ color });
    this.core = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), this.coreMat);
    this.core.position.y = 1.45;
    this.object.add(ped, top, this.core);
    this.object.position.set(x, 0, z);
    this.t = Math.random() * 5;
    this.pulse = 0;
    this.collider = [x - 0.29, 0.5, z - 0.29, x + 0.29, 1.3, z + 0.29];
  }

  flash() {
    this.pulse = 1;
  }

  update(dt) {
    this.t += dt;
    this.core.rotation.y += dt;
    this.core.rotation.x += dt * 0.6;
    this.pulse = Math.max(0, this.pulse - dt * 1.5);
    this.core.scale.setScalar(1 + this.pulse * 0.8 + Math.sin(this.t * 3) * 0.05);
  }
}

/** Generic box-shaped interactable with a custom mesh (receptacle, ladder…). */
export class Trigger extends Interactable {
  constructor({ id, x, y, z, half, mesh, collider }) {
    super({ id, origin: new THREE.Vector3(x, y, z), half });
    if (mesh) this.object.add(mesh);
    this.collider = collider || null;
  }
}

/** Containment receptacle: a squat metal box with a glowing slot. */
export function receptacleMesh(world, x, z) {
  const light = litColor(world, x, 1.0, z);
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6a7078).multiply(light) }));
  body.position.set(x, 0.9, z);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), new THREE.MeshBasicMaterial({ color: 0x40d0ff }));
  slot.position.set(x, 1.31, z);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.72), new THREE.MeshBasicMaterial({ color: 0xd4ad2e }));
  stripe.position.set(x, 0.62, z);
  g.add(body, slot, stripe);
  g.userData.slot = slot;
  return g;
}
