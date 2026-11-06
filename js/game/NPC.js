// Non-player characters: blocky voxel humanoids that walk the facility using
// the nav grid, open doors they are cleared for, idle, wander, lead the player,
// follow the player (escort) and react to emergencies.

import * as THREE from 'three';
import { VOXEL } from '../config.js';
import { weaponBoxes } from './combat/weapons.js';

const PU = 1 / 16;
const SHADE = [0.82, 0.82, 1.0, 0.6, 0.92, 0.92];
const SKIN = [0xe0b090, 0xc8946c, 0xa06a48, 0x7a4e34, 0xf0c8a8];
const HAIR = [0x2a1c14, 0x4a3020, 0x1a1a1a, 0x8a8a84, 0x6a4a28, 0xa88a50];

const KIND = {
  scientist: { body: 0xdcdedc, lower: 0x3a3c44, arm: 0xdcdedc, shoes: 0x1e1e20, speed: 1.35, clearance: 3, hp: 70 },
  guard: { body: 0x2a3040, lower: 0x262a34, arm: 0x2a3040, shoes: 0x141416, speed: 1.55, clearance: 3, hp: 100, weapon: 'pistol' },
  classd: { body: 0xd06a20, lower: 0xc46420, arm: 0xd06a20, shoes: 0x2a2a2a, speed: 1.35, clearance: 0, hp: 80 },
  // SCP-049-2: what SCP-049's "cure" leaves behind.
  zombie: { body: 0x4a4e48, lower: 0x34363a, arm: 0x7a8a6a, shoes: 0x1e1e20, speed: 1.6, clearance: 0, hp: 90 },
};
/** Mobile Task Force operatives are guards in black armour with rifles. */
const MTF = { body: 0x1a1c20, lower: 0x18191c, arm: 0x1a1c20, shoes: 0x0e0e10, speed: 1.75, clearance: 4, hp: 170, weapon: 'rifle' };

function partGeometry(boxes) {
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  for (const b of boxes) {
    const [x0, y0, z0, x1, y1, z1] = b.slice(0, 6).map((v) => v * PU);
    c.setHex(b[6]);
    const faces = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    ];
    faces.forEach((f, fi) => {
      const base = pos.length / 3;
      for (const v of f) {
        pos.push(v[0], v[1], v[2]);
        col.push(c.r * SHADE[fi], c.g * SHADE[fi], c.b * SHADE[fi]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

function buildModel(kind, rnd, mtf = false) {
  const k = mtf ? MTF : KIND[kind];
  const skin = kind === 'zombie' ? 0x8a9a7a : SKIN[Math.floor(rnd() * SKIN.length)];
  const hair = HAIR[Math.floor(rnd() * HAIR.length)];
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const leg = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 2 * PU, 13 * PU, 0);
    const boxes = [
      [-1.7, -11.5, -1.7, 1.7, 0, 1.7, k.lower],
      [-1.8, -13, -2.6, 1.8, -11.5, 1.8, k.shoes],
    ];
    if (kind === 'classd') boxes[0][6] = k.lower;
    g.add(new THREE.Mesh(partGeometry(boxes), mat));
    return g;
  };
  const arm = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 5.7 * PU, 22.5 * PU, 0);
    const boxes = [
      [-1.2, -8.5, -1.2, 1.2, 0.5, 1.2, k.arm],
      [-1.1, -10, -1.1, 1.1, -8.5, 1.1, kind === 'guard' ? 0x141416 : skin],
    ];
    g.add(new THREE.Mesh(partGeometry(boxes), mat));
    return g;
  };

  const torso = [[-4.5, 13, -2.2, 4.5, 23, 2.2, k.body]];
  const head = [
    [-2.6, 23, -2.6, 2.6, 28.4, 2.6, skin],
    [-1.6, 25.6, -2.7, -0.6, 26.4, -2.6, 0x161616],
    [0.6, 25.6, -2.7, 1.6, 26.4, -2.6, 0x161616],
    [-0.9, 24, -2.7, 0.9, 24.4, -2.6, 0x6a3a30],
  ];
  if (kind === 'scientist') {
    torso.push([-4.7, 8, -2.4, 4.7, 13.5, 2.4, k.body]); // coat tail
    torso.push([-1.5, 17, -2.3, 1.5, 22.8, -2.25, 0x6a8ab0]); // shirt + tie
    torso.push([2.2, 19, -2.35, 3.6, 20.6, -2.25, 0x2a5ab0]); // ID badge
    head.push([-2.8, 27.6, -2.8, 2.8, 29, 2.8, hair]);
    head.push([-2.8, 24.5, 1.8, 2.8, 29, 2.8, hair]);
    if (rnd() < 0.5) head.push([-2.2, 25.4, -2.8, 2.2, 25.7, -2.7, 0x101010]); // glasses
  } else if (kind === 'guard' && mtf) {
    torso.push([-4.9, 14, -2.7, 4.9, 22.6, 2.7, 0x24262a]); // plate carrier
    torso.push([-3.5, 15, -2.9, 3.5, 18, -2.7, 0x30333a]); // pouches
    torso.push([-4.8, 20.5, -2.8, -2.2, 22, -2.7, 0xb03030]); // task force patch
    torso.push([-4.6, 13, -2.4, 4.6, 14, 2.4, 0x101012]); // belt
    head.push([-3.1, 26.8, -3.1, 3.1, 29.8, 3.1, 0x1c1e22]); // helmet
    head.push([-2.8, 24.8, -3.3, 2.8, 26.8, -2.6, 0x0c0c0e]); // visor
    head.push([-2.8, 23, -3, 2.8, 24.8, -2.6, 0x26282c]); // mask
  } else if (kind === 'guard') {
    torso.push([-4.7, 14, -2.5, 4.7, 22, 2.5, 0x1c2026]); // vest
    torso.push([-4.7, 19.4, -2.6, 4.7, 20.3, -2.5, 0x9aa0a8]); // reflective band
    torso.push([-4.6, 13, -2.4, 4.6, 14, 2.4, 0x101012]); // belt
    head.push([-3, 27.2, -3, 3, 29.6, 3, 0x20242a]); // helmet
    head.push([-3, 26.6, -3.4, 3, 27.4, -2.8, 0x20242a]); // brim
  } else if (kind === 'zombie') {
    torso.push([-3, 15, -2.3, 1, 19, -2.2, 0x6a1a14]); // dried blood
    torso.push([1.5, 19, -2.3, 4, 22, -2.2, 0x5a1a14]);
    torso.push([-4.6, 13, -2.4, -2, 16, 2.4, 0x2a2c2e]); // torn hem
    head.push([-1.6, 25.6, -2.75, -0.6, 26.4, -2.65, 0xe0e8d0]); // clouded eyes
    head.push([0.6, 25.6, -2.75, 1.6, 26.4, -2.65, 0xe0e8d0]);
  } else {
    torso.push([1.2, 19.5, -2.3, 3.8, 21, -2.25, 0xe8e4d8]); // number patch
    head.push([-2.7, 27.8, -2.7, 2.7, 28.8, 2.7, hair]);
  }

  const torsoMesh = new THREE.Mesh(partGeometry(torso), mat);
  // The head pivots at the neck so people can look down (SCP-096 protocol).
  const headMesh = new THREE.Mesh(partGeometry(head), mat);
  headMesh.position.y = -23 * PU;
  const neck = new THREE.Group();
  neck.position.y = 23 * PU;
  neck.add(headMesh);
  const legL = leg(-1);
  const legR = leg(1);
  const armL = arm(-1);
  const armR = arm(1);
  body.add(torsoMesh, neck, legL, legR, armL, armR);
  let weapon = null;
  let flash = null;
  if (k.weapon) {
    // Held in the right hand; barrel follows the arm when it is raised to aim.
    weapon = new THREE.Group();
    weapon.position.set(0, -9.5 * PU, -0.5 * PU);
    weapon.rotation.x = -Math.PI / 2;
    weapon.add(new THREE.Mesh(partGeometry(weaponBoxes(k.weapon)), mat));
    flash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffe070 }));
    flash.position.z = k.weapon === 'rifle' ? -14 * PU : -5.5 * PU;
    flash.visible = false;
    weapon.add(flash);
    armR.add(weapon);
  }
  return { root, body, mat, legL, legR, armL, armR, head: neck, weapon, flash };
}

const tmpLight = [0, 0, 0];

export class NPC {
  /**
   * def: { id, name, title, kind, x, z (voxels), yaw (deg), speed, chatter[] }
   */
  constructor(game, def, rnd = Math.random) {
    this.game = game;
    this.id = def.id;
    this.name = def.name;
    this.title = def.title || '';
    this.kind = def.kind;
    const k = KIND[this.kind];
    this.clearance = def.clearance ?? k.clearance;
    this.walkSpeed = def.speed ?? k.speed;
    this.pos = new THREE.Vector3(def.x * VOXEL, VOXEL, def.z * VOXEL);
    this.yaw = ((def.yaw || 0) * Math.PI) / 180;
    this.home = { x: this.pos.x, z: this.pos.z, yaw: this.yaw };
    this.chatter = def.chatter || [];
    this.mtf = !!def.mtf;
    const stats = this.mtf ? MTF : k;
    if (this.mtf) {
      this.clearance = def.clearance ?? MTF.clearance;
      this.walkSpeed = def.speed ?? MTF.speed;
    }
    this.maxHp = def.hp ?? stats.hp;
    this.hp = this.maxHp;
    this.weapon = def.weapon ?? stats.weapon ?? null;
    this.stunT = 0;
    this.flinchT = 0;
    this.flashT = 0;
    this.swingT = 0;
    this.aiming = false; // arm raised, weapon pointed
    this.eyesDown = false; // looking at the floor (SCP-096 protocol)
    this.hostile = false; // turned on the Foundation (shoots/attacks staff)
    this.lastAttacker = null;
    this.ai = null; // guard AI state (see GuardAI.js)
    this.lookAt = null; // { pos } kept in view, even while walking
    this.holdBlink = false; // fight the urge to blink (someone must watch SCP-173)
    this.strain = 0;
    this.dead = false;
    this.hidden = false;
    this.collidable = true;

    this.mode = 'idle';
    this.path = null;
    this.pathIdx = 0;
    this.speed = this.walkSpeed;
    this.moving = false;
    this.waiting = false;
    this.arrived = false;
    this.resolve = null;
    this.blockedTime = 0;
    this.repathTime = 0;
    this.followTarget = null;
    this.leadOpts = null;
    this.wanderPoints = null;
    this.wanderPause = 0;
    this.faceYaw = null;
    this.phase = rnd() * 10;
    this.walkAmt = 0;
    this.lightTimer = 0;
    this.fallT = 0;
    this.chatIdx = 0;
    this.action = null; // { text, sub, use(game) } offered to the player
    this.busy = false; // responding to an event
    this.pursuing = false; // chasing the player
    this.rioting = false;
    this.blinking = false;
    this.blinkT = 2 + rnd() * 5;
    this.announceBlinks = false; // say "Blinking!" before each blink

    this.model = buildModel(this.kind, rnd, this.mtf);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    this.updateLight(true);
  }

  get object() {
    return this.model.root;
  }

  get alive() {
    return !this.dead && !this.hidden;
  }

  get label() {
    return this.title ? `${this.name}` : this.name;
  }

  aabb(out = [0, 0, 0, 0, 0, 0]) {
    const r = 0.28;
    out[0] = this.pos.x - r;
    out[1] = this.pos.y;
    out[2] = this.pos.z - r;
    out[3] = this.pos.x + r;
    out[4] = this.pos.y + 1.8;
    out[5] = this.pos.z + r;
    return out;
  }

  // ---- Interactable interface ------------------------------------------
  get origin() {
    return this.pos;
  }

  boxes() {
    return this.alive ? [this.aabb()] : [];
  }

  prompt() {
    if (!this.alive) return null;
    if (this.action) return { text: this.action.text, sub: this.action.sub || this.name, denied: false };
    return { text: `Talk to ${this.name}`, sub: this.title, denied: false };
  }

  use(game) {
    if (this.action) return this.action.use(game) || { ok: true };
    if (this.chatter.length) {
      const line = this.chatter[this.chatIdx++ % this.chatter.length];
      game.say(this.name, line, 'voice');
    }
    this.faceToward(game.player.pos.x, game.player.pos.z);
    return { ok: true };
  }

  // ---- Commands ---------------------------------------------------------
  _finish(ok) {
    const r = this.resolve;
    this.resolve = null;
    if (r) r(ok);
  }

  stop() {
    this.path = null;
    this.mode = 'idle';
    this.followTarget = null;
    this.leadOpts = null;
    this.wanderPoints = null;
    this._finish(false);
  }

  setPath(x, z) {
    const path = this.game.nav.findPath(this.pos.x, this.pos.z, x, z);
    this.path = path;
    this.pathIdx = 0;
    this.blockedTime = 0;
    return !!path;
  }

  /** Walk to a world point (meters). Resolves true on arrival, false if stuck. */
  goTo(x, z, opts = {}) {
    this._finish(false);
    this.mode = 'walk';
    this.speed = opts.speed ?? this.walkSpeed;
    this.faceYaw = opts.faceYaw ?? null;
    this.arrived = false;
    this.followTarget = null;
    this.leadOpts = null;
    this.wanderPoints = null;
    return new Promise((res) => {
      this.resolve = res;
      if (!this.setPath(x, z)) this._finish(false);
    });
  }

  /** Lead the player to a point, waiting when they fall behind. */
  lead(x, z, opts = {}) {
    const p = this.goTo(x, z, opts);
    this.mode = 'lead';
    this.leadOpts = { maxGap: opts.maxGap ?? 5.5 };
    return p;
  }

  /** Follow a target (object with .pos) at a comfortable distance. */
  follow(target, opts = {}) {
    this._finish(false);
    this.mode = 'follow';
    this.followTarget = target;
    this.followDist = opts.distance ?? 1.7;
    this.followSpeed = opts.speed ?? null;
    this.speed = opts.speed ?? Math.max(this.walkSpeed, 2.4);
    this.path = null;
    this.repathTime = 0;
    this.collidable = false;
  }

  /** Ambient wandering between points (meters). */
  wander(points, pause = [4, 10]) {
    this.stop();
    this.mode = 'wander';
    this.wanderPoints = points;
    this.lastRoute = points;
    this.wanderPauseRange = pause;
    this.wanderPause = 1 + Math.random() * 4;
  }

  idleAt(yawDeg) {
    this.stop();
    if (yawDeg !== undefined) this.faceYaw = (yawDeg * Math.PI) / 180;
  }

  faceToward(x, z) {
    this.faceYaw = Math.atan2(-(x - this.pos.x), -(z - this.pos.z));
  }

  /** Walk into a space and vanish (boarding an elevator). */
  async board(x, z) {
    this.collidable = false;
    await this.goTo(x, z, { speed: 1.8 });
    this.hidden = true;
    this.model.root.visible = false;
  }

  damage(amount, attacker = null) {
    if (this.dead || this.hidden) return;
    this.hp -= amount;
    if (attacker && typeof attacker === 'object') {
      this.lastAttacker = attacker;
      this.attackedAt = this.game.time;
    }
    if (amount < 50) this.flinchT = 0.2;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.aiming = false;
      this.stop();
      this.collidable = false;
      if (this.model.flash) this.model.flash.visible = false;
      if (this.weapon && this.game.combat) {
        this.game.combat.dropWeapon(this.weapon, this.pos);
        if (this.model.weapon) this.model.weapon.visible = false;
      }
      this.game.onNpcDeath(this, attacker);
    }
  }

  get hurt() {
    return this.hp < this.maxHp * 0.999;
  }

  // ---- Simulation -------------------------------------------------------
  updateLight(force) {
    this.lightTimer -= 1;
    if (!force && this.lightTimer > 0) return;
    this.lightTimer = 12;
    this.game.world.sampleLight(this.pos.x, this.pos.y + 1.2, this.pos.z, tmpLight);
    const k = 1.1;
    this.model.mat.color.setRGB(
      Math.min(1.3, tmpLight[0] * k + 0.04),
      Math.min(1.3, tmpLight[1] * k + 0.04),
      Math.min(1.3, tmpLight[2] * k + 0.05),
    );
  }

  /** Is a closed door in the way of travelling from here toward (tx, tz)? */
  doorAhead(tx, tz) {
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const look = Math.min(1.1, len);
    for (const door of this.game.doors) {
      if (!door.blocking) continue;
      if (Math.abs(door.origin.x - this.pos.x) > 4 || Math.abs(door.origin.z - this.pos.z) > 4) continue;
      const o = door.openingBox;
      for (let s = 0.2; s <= look; s += 0.15) {
        const px = this.pos.x + (dx / len) * s;
        const pz = this.pos.z + (dz / len) * s;
        if (px > o[0] - 0.15 && px < o[3] + 0.15 && pz > o[2] - 0.15 && pz < o[5] + 0.15) return door;
      }
    }
    return null;
  }

  update(dt) {
    if (this.hidden) return;
    if (this.dead) {
      this.fallT = Math.min(1, this.fallT + dt * 2.5);
      this.model.body.rotation.x = -Math.PI / 2 * (this.fallT * this.fallT);
      this.model.body.position.y = 0.15 * this.fallT;
      this.updateLight(false);
      return;
    }
    // Everyone blinks — which matters a great deal around SCP-173.
    this.blinkT -= dt;
    if (this.holdBlink && !this.blinking && this.blinkT < 0.95) {
      this.blinkT = 0.95;
      this.strain += dt;
    } else if (!this.blinking && this.blinkT > 1) this.strain = Math.max(0, this.strain - dt * 0.5);
    if (this.announceBlinks && !this.blinking && !this.warned && this.blinkT < 0.9) {
      this.warned = true;
      this.game.say(this.name, 'Blinking!');
    }
    if (this.blinkT <= 0) {
      if (this.blinking) {
        this.blinking = false;
        this.warned = false;
        this.blinkT = this.announceBlinks ? 4 + Math.random() * 3 : 3 + Math.random() * 4;
      } else {
        this.blinking = true;
        this.blinkT = 0.35;
        this.strain = 0;
      }
    }

    const player = this.game.player;
    this.moving = false;
    this.waiting = false;
    this.stunT = Math.max(0, this.stunT - dt);
    this.flinchT = Math.max(0, this.flinchT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.swingT = Math.max(0, this.swingT - dt);
    const stunned = this.stunT > 0;

    if (this.mode === 'follow' && this.followTarget) {
      const t = this.followTarget.pos;
      const dist = Math.hypot(t.x - this.pos.x, t.z - this.pos.z);
      this.repathTime -= dt;
      const clear = dist <= this.followDist + 0.4 && this.game.nav.lineWalkable(this.pos.x, this.pos.z, t.x, t.z);
      if (!clear) {
        if (this.repathTime <= 0 || !this.path) {
          this.repathTime = 0.6;
          this.setPath(t.x, t.z);
        }
        // Hurry when far behind (pursuers always run).
        this.speed = this.followSpeed ?? (dist > 6 ? 3.2 : Math.max(this.walkSpeed, 2.2));
      } else {
        this.path = null;
        this.faceToward(t.x, t.z);
      }
    }

    if (this.mode === 'wander' && !this.path) {
      this.wanderPause -= dt;
      if (this.wanderPause <= 0 && this.wanderPoints && this.wanderPoints.length) {
        const p = this.wanderPoints[Math.floor(Math.random() * this.wanderPoints.length)];
        this.setPath(p[0], p[1]);
        this.speed = this.walkSpeed;
        const [a, b] = this.wanderPauseRange;
        this.wanderPause = a + Math.random() * (b - a);
      }
    }

    if (!stunned && this.path && this.pathIdx < this.path.length) {
      const [tx, tz] = this.path[this.pathIdx];
      const dx = tx - this.pos.x;
      const dz = tz - this.pos.z;
      const dist = Math.hypot(dx, dz);
      let canMove = true;

      if (this.mode === 'lead') {
        const gap = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
        if (gap > this.leadOpts.maxGap) {
          canMove = false;
          this.waiting = true;
          this.faceToward(player.pos.x, player.pos.z);
        }
      }

      // Courtesy: don't walk into the player.
      const px = player.pos.x - this.pos.x;
      const pz = player.pos.z - this.pos.z;
      const pd = Math.hypot(px, pz);
      if (canMove && this.mode !== 'follow' && pd < 0.85 && dist > 0.01 && (px * dx + pz * dz) / (pd * dist) > 0.3) canMove = false;

      if (canMove) {
        const door = this.doorAhead(tx, tz);
        if (door) {
          canMove = false;
          if (door.canOpen(this.clearance) || (this.mode === 'follow' && !this.zombie)) {
            if (!door.isOpen) door.open();
          }
          this.blockedTime += dt;
          if (this.blockedTime > 6 && this.mode !== 'follow') {
            // Give up: the route is sealed.
            this.path = null;
            if (this.mode !== 'wander') this.mode = 'idle';
            this._finish(false);
          }
        } else {
          this.blockedTime = 0;
        }
      }

      if (canMove && this.path) {
        if (dist < 0.08) {
          this.pathIdx++;
        } else {
          const step = Math.min(dist, this.speed * dt);
          this.pos.x += (dx / dist) * step;
          this.pos.z += (dz / dist) * step;
          this.moving = true;
          const targetYaw = this.lookAt
            ? Math.atan2(-(this.lookAt.pos.x - this.pos.x), -(this.lookAt.pos.z - this.pos.z))
            : Math.atan2(-dx, -dz);
          this.yaw = turnToward(this.yaw, targetYaw, dt * 8);
        }
        if (this.pathIdx >= this.path.length) {
          this.path = null;
          if (this.mode === 'walk' || this.mode === 'lead') {
            this.mode = 'idle';
            this.arrived = true;
            this._finish(true);
          }
        }
      }
    }

    if (!this.moving && this.lookAt) this.yaw = turnToward(this.yaw, Math.atan2(-(this.lookAt.pos.x - this.pos.x), -(this.lookAt.pos.z - this.pos.z)), dt * 8);
    else if (!this.moving && this.faceYaw !== null) this.yaw = turnToward(this.yaw, this.faceYaw, dt * 5);
    if (this.mode !== 'follow') this.collidable = this.mode !== 'lead';

    // Animation.
    const target = this.moving ? 1 : 0;
    this.walkAmt += (target - this.walkAmt) * Math.min(1, dt * 8);
    this.phase += dt * (this.moving ? this.speed * 4.2 : 1.2);
    const sw = Math.sin(this.phase) * 0.62 * this.walkAmt;
    const m = this.model;
    m.legL.rotation.x = sw;
    m.legR.rotation.x = -sw;
    m.armL.rotation.x = -sw * 0.8;
    m.armR.rotation.x = sw * 0.8;
    m.armL.rotation.z = 0;
    m.armR.rotation.y = 0;
    if (this.swingT > 0) {
      // Overhead strike.
      const t = 1 - this.swingT / 0.3;
      m.armR.rotation.x = 2.6 - Math.sin(t * Math.PI) * 1.6;
    } else if (this.aiming) {
      m.armR.rotation.x = Math.PI / 2 + (this.flashT > 0 ? 0.12 : 0);
      if (this.weapon === 'rifle' || this.mtf) {
        m.armL.rotation.x = Math.PI / 2 - 0.1;
        m.armL.rotation.z = -0.45;
      } else {
        m.armL.rotation.x = Math.PI / 2 - 0.25;
        m.armL.rotation.z = -0.3;
      }
    } else if (this.zombie) {
      m.armR.rotation.x = 1.35 + Math.sin(this.phase) * 0.1;
      m.armL.rotation.x = 1.4 + Math.cos(this.phase) * 0.1;
    } else if (this.rioting) {
      m.armR.rotation.x = 2.4 + Math.sin(this.phase * 2) * 0.4;
      m.armL.rotation.x = 2.2 + Math.cos(this.phase * 2) * 0.4;
    }
    if (this.model.flash) {
      this.model.flash.visible = this.flashT > 0;
      this.model.flash.rotation.z = this.phase * 7;
    }
    const lookDown = this.eyesDown ? 0.75 : 0;
    m.head.rotation.x += (-lookDown - m.head.rotation.x) * Math.min(1, dt * 6);
    m.body.rotation.x = stunned ? 0.18 : this.flinchT > 0 ? 0.1 : 0;
    m.body.position.y = Math.abs(Math.cos(this.phase)) * 0.025 * this.walkAmt;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    this.updateLight(false);
  }
}

function turnToward(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}
