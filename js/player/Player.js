// First-person player: movement, AABB-vs-world collision with step-up,
// crouching, sprint stamina and camera motion (head bob, landing dip).

import * as THREE from 'three';

const RADIUS = 0.3;
const STAND_H = 1.75;
const CROUCH_H = 1.15;
const STAND_EYE = 1.62;
const CROUCH_EYE = 1.02;
const WALK = 3.0;
const SPRINT = 5.2;
const CROUCH_SPEED = 1.5;
const GRAVITY = 18;
const JUMP_V = 5.0;
const STEP_H = 0.55;
const EPS = 1e-4;
const MOUSE_RAD = 0.0022; // radians per (sensitivity-scaled) mouse pixel

function clipAxis(d, pMin, pMax, bMin, bMax) {
  if (d > 0 && pMax <= bMin + EPS) return Math.min(d, bMin - pMax);
  if (d < 0 && pMin >= bMax - EPS) return Math.max(d, bMax - pMin);
  return d;
}

export class Player {
  /**
   * @param {object} physics  { collect(minX,minY,minZ,maxX,maxY,maxZ,out) }
   */
  constructor(physics, camera) {
    this.physics = physics;
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.crouching = false;
    this.crouchToggled = false;
    this.height = STAND_H;
    this.eye = STAND_EYE;
    this.eyeOffset = 0; // smooths step-ups
    this.stamina = 1;
    this.exhausted = false;
    this.staminaDelay = 0;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.landDip = 0;
    this.sprinting = false;
    this.moving = false;
    this._boxes = [];
    this.maxHp = 100;
    this.hp = 100;
    this.dead = false;
    this.damageTaken = 0;
    this.lastHurt = -999;
    this.clock = 0;
    this.keycard = 0;
    this.carrying = null;
    this.onDamage = null;
  }

  damage(amount, source) {
    if (this.dead || amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.damageTaken += amount;
    this.lastHurt = this.clock;
    this.lastSource = source;
    if (this.onDamage) this.onDamage(amount, source);
    if (this.hp <= 0) {
      this.dead = true;
      this.vel.set(0, 0, 0);
    }
  }

  heal(amount) {
    if (this.dead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  spawn(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.crouching = false;
    this.crouchToggled = false;
    this.height = STAND_H;
    this.eye = STAND_EYE;
    this.eyeOffset = 0;
    this.stamina = 1;
    this.exhausted = false;
    this.onGround = false;
    this.landDip = 0;
    this.hp = this.maxHp;
    this.dead = false;
    this.damageTaken = 0;
    this.lastHurt = -999;
    this.keycard = 0;
    this.carrying = null;
    this.deathT = 0;
    this.updateCamera(0, false);
  }

  aabb(out = [0, 0, 0, 0, 0, 0], height = this.height) {
    out[0] = this.pos.x - RADIUS;
    out[1] = this.pos.y;
    out[2] = this.pos.z - RADIUS;
    out[3] = this.pos.x + RADIUS;
    out[4] = this.pos.y + height;
    out[5] = this.pos.z + RADIUS;
    return out;
  }

  /** Swept move along all three axes; returns the actual displacement. */
  move(dx, dy, dz) {
    const p = this.pos;
    const boxes = this._boxes;
    boxes.length = 0;
    const margin = 0.1;
    this.physics.collect(
      Math.min(p.x, p.x + dx) - RADIUS - margin,
      Math.min(p.y, p.y + dy) - margin,
      Math.min(p.z, p.z + dz) - RADIUS - margin,
      Math.max(p.x, p.x + dx) + RADIUS + margin,
      Math.max(p.y, p.y + dy) + this.height + margin,
      Math.max(p.z, p.z + dz) + RADIUS + margin,
      boxes,
    );
    const a = this.aabb();

    // Y first
    for (const b of boxes) {
      if (a[0] < b[3] && a[3] > b[0] && a[2] < b[5] && a[5] > b[2]) dy = clipAxis(dy, a[1], a[4], b[1], b[4]);
    }
    p.y += dy;
    a[1] += dy;
    a[4] += dy;

    for (const b of boxes) {
      if (a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2]) dx = clipAxis(dx, a[0], a[3], b[0], b[3]);
    }
    p.x += dx;
    a[0] += dx;
    a[3] += dx;

    for (const b of boxes) {
      if (a[1] < b[4] && a[4] > b[1] && a[0] < b[3] && a[3] > b[0]) dz = clipAxis(dz, a[2], a[5], b[2], b[5]);
    }
    p.z += dz;
    return [dx, dy, dz];
  }

  /** Is there room to stand up from a crouch? */
  canStand() {
    const boxes = [];
    const p = this.pos;
    this.physics.collect(p.x - RADIUS, p.y + CROUCH_H - 0.05, p.z - RADIUS, p.x + RADIUS, p.y + STAND_H, p.z + RADIUS, boxes);
    const a = this.aabb([0, 0, 0, 0, 0, 0], STAND_H);
    a[1] += 0.02;
    return !boxes.some((b) => a[0] < b[3] - EPS && a[3] > b[0] + EPS && a[1] < b[4] - EPS && a[4] > b[1] + EPS && a[2] < b[5] - EPS && a[5] > b[2] + EPS);
  }

  update(dt, input, settings) {
    this.clock += dt;
    // Slow natural recovery after a while without taking damage.
    if (this.hp < this.maxHp && this.clock - this.lastHurt > 8) this.heal(dt * 1.5);

    // --- Look -------------------------------------------------------------
    const look = input.look(dt, settings.get('mouseSens'), settings.get('padSens'));
    this.yaw -= look.x * MOUSE_RAD;
    const inv = settings.get('invertY') ? -1 : 1;
    this.pitch -= look.y * MOUSE_RAD * inv;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));

    // --- Crouch -----------------------------------------------------------
    let wantCrouch;
    if (settings.get('crouchToggle')) {
      if (input.crouchPressed()) this.crouchToggled = !this.crouchToggled;
      wantCrouch = this.crouchToggled;
    } else {
      wantCrouch = input.crouchHeld();
    }
    if (wantCrouch) {
      this.crouching = true;
    } else if (this.crouching && this.canStand()) {
      this.crouching = false;
    }
    this.height = this.crouching ? CROUCH_H : STAND_H;
    const targetEye = this.crouching ? CROUCH_EYE : STAND_EYE;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 12);

    // --- Horizontal movement ---------------------------------------------
    const mv = input.move();
    const moveLen = Math.hypot(mv.x, mv.y);
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    // Forward is -Z rotated by yaw.
    const fx = -sinY;
    const fz = -cosY;
    const rx = cosY;
    const rz = -sinY;
    let wx = fx * mv.y + rx * mv.x;
    let wz = fz * mv.y + rz * mv.x;

    const wantsSprint = input.sprint() && mv.y > 0.3 && !this.crouching && !this.exhausted;
    this.sprinting = wantsSprint && moveLen > 0.1;
    const speed = this.crouching ? CROUCH_SPEED : this.sprinting ? SPRINT : WALK;
    wx *= speed;
    wz *= speed;

    const accel = this.onGround ? 14 : 2.5;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;

    // --- Stamina ----------------------------------------------------------
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - dt * 0.17);
      this.staminaDelay = 1.0;
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this.staminaDelay = Math.max(0, this.staminaDelay - dt);
      if (this.staminaDelay <= 0) this.stamina = Math.min(1, this.stamina + dt * (moveLen > 0.1 ? 0.1 : 0.16));
      if (this.exhausted && this.stamina > 0.3) this.exhausted = false;
    }

    // --- Vertical ---------------------------------------------------------
    if (this.onGround && input.jump() && !this.crouching) {
      this.vel.y = JUMP_V;
      this.onGround = false;
    }
    this.vel.y -= GRAVITY * dt;
    if (this.vel.y < -30) this.vel.y = -30;

    // --- Collide ----------------------------------------------------------
    const fallSpeed = this.vel.y;
    const dx = this.vel.x * dt;
    const dz = this.vel.z * dt;
    const dy = this.vel.y * dt;

    const start = this.pos.clone();
    const res = this.move(dx, dy, dz);
    const blockedH = Math.abs(res[0] - dx) > 1e-5 || Math.abs(res[2] - dz) > 1e-5;
    const groundedNow = dy < 0 && res[1] > dy + 1e-6;
    let stepped = false;

    if (blockedH && (this.onGround || groundedNow)) {
      // Try stepping up onto a ledge.
      const after = this.pos.clone();
      this.pos.copy(start);
      const up = this.move(0, STEP_H, 0)[1];
      const h2 = this.move(dx, 0, dz);
      const down = this.move(0, -up - 0.05, 0)[1];
      const gainedSq = h2[0] * h2[0] + h2[2] * h2[2];
      const prevSq = res[0] * res[0] + res[2] * res[2];
      const rise = this.pos.y - start.y;
      if (gainedSq > prevSq + 1e-6 && rise > 0.01 && down > -up - 0.049) {
        this.eyeOffset -= rise;
        stepped = true;
      } else {
        this.pos.copy(after);
      }
    }

    // Ground probe.
    const wasGround = this.onGround;
    if (groundedNow) {
      this.onGround = true;
      this.vel.y = 0;
    } else if (dy < 0) {
      this.onGround = false;
    }
    if (dy >= 0 && res[1] < dy - 1e-6) this.vel.y = 0; // hit ceiling

    if (!wasGround && this.onGround && fallSpeed < -4) {
      this.landDip = Math.min(0.18, (-fallSpeed - 4) * 0.03 + 0.05);
    }
    if (!stepped) {
      if (Math.abs(res[0]) < Math.abs(dx) - 1e-5) this.vel.x = res[0] / Math.max(dt, 1e-4);
      if (Math.abs(res[2]) < Math.abs(dz) - 1e-5) this.vel.z = res[2] / Math.max(dt, 1e-4);
    }

    // --- Camera -----------------------------------------------------------
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.moving = hSpeed > 0.3 && this.onGround;
    this.updateCamera(dt, settings.get('headBob'), hSpeed);
  }

  updateCamera(dt, headBob, hSpeed = 0) {
    if (this.dead) {
      // Collapse to the floor.
      this.deathT = Math.min(1, (this.deathT || 0) + dt * 1.6);
      const e = this.deathT * this.deathT;
      this.camera.position.set(this.pos.x, this.pos.y + this.eye * (1 - e) + 0.25 * e, this.pos.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch * (1 - e) + 0.35 * e;
      this.camera.rotation.z = 1.2 * e;
      return;
    }
    this.eyeOffset += (0 - this.eyeOffset) * Math.min(1, dt * 14);
    this.landDip += (0 - this.landDip) * Math.min(1, dt * 7);

    const targetBob = headBob && this.onGround ? Math.min(1, hSpeed / WALK) : 0;
    this.bobAmount += (targetBob - this.bobAmount) * Math.min(1, dt * 8);
    this.bobPhase += dt * (4.2 + hSpeed * 0.9);
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.045 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.028 * this.bobAmount;

    const cam = this.camera;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    cam.position.set(
      this.pos.x + cosY * bobX,
      this.pos.y + this.eye + this.eyeOffset - this.landDip + bobY - 0.02 * this.bobAmount,
      this.pos.z - sinY * bobX,
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw;
    cam.rotation.x = this.pitch;
    cam.rotation.z = -bobX * 0.35;
  }
}
