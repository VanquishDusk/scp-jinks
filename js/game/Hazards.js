// Environmental dangers: the test chamber's anomalous floor field and the
// anomalous manifestations that roam after a containment breach.

import * as THREE from 'three';
import { VOXEL } from '../config.js';

/**
 * Grid of floor panels that warn (amber) and then activate (red). Standing on
 * an active panel hurts. Patterns always leave several panels safe.
 */
export class HazardFloor {
  constructor({ x0, z0, cols, rows, size }) {
    this.x0 = x0 * VOXEL;
    this.z0 = z0 * VOXEL;
    this.cols = cols;
    this.rows = rows;
    this.size = size * VOXEL;
    this.group = new THREE.Group();
    this.panels = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0, depthWrite: false });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(this.size - 0.12, this.size - 0.12), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(this.x0 + (c + 0.5) * this.size, VOXEL + 0.015, this.z0 + (r + 0.5) * this.size);
        this.group.add(m);
        this.panels.push({ mesh: m, mat, state: 0 });
      }
    }
    this.active = false;
    this.t = 0;
    this.phase = 'rest';
    this.params = null;
  }

  start(params = {}) {
    this.params = { ratio: 0.5, warn: 1.2, on: 1.4, rest: 0.6, ...params };
    this.active = true;
    this.phase = 'rest';
    this.t = 0.8;
  }

  stop() {
    this.active = false;
    for (const p of this.panels) this.setPanel(p, 0);
  }

  setPanel(p, state) {
    p.state = state;
    if (state === 0) {
      p.mat.opacity = 0;
    } else if (state === 1) {
      p.mat.color.setHex(0xffb020);
      p.mat.opacity = 0.5;
    } else {
      p.mat.color.setHex(0xff2a1a);
      p.mat.opacity = 0.88;
    }
  }

  pick() {
    const n = this.panels.length;
    const count = Math.round(n * this.params.ratio);
    const order = [...this.panels.keys()].sort(() => Math.random() - 0.5);
    this.armed = new Set(order.slice(0, Math.min(n - 3, count)));
  }

  panelAt(x, z) {
    const c = Math.floor((x - this.x0) / this.size);
    const r = Math.floor((z - this.z0) / this.size);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
    return this.panels[r * this.cols + c];
  }

  /** True when standing on an active panel at this position. */
  hurts(x, z) {
    const p = this.panelAt(x, z);
    return !!p && p.state === 2;
  }

  update(dt, time) {
    if (!this.active) return;
    this.t -= dt;
    if (this.t <= 0) {
      if (this.phase === 'rest') {
        this.pick();
        this.phase = 'warn';
        this.t = this.params.warn;
      } else if (this.phase === 'warn') {
        this.phase = 'on';
        this.t = this.params.on;
      } else {
        this.phase = 'rest';
        this.t = this.params.rest;
      }
    }
    this.panels.forEach((p, i) => {
      const armed = this.armed && this.armed.has(i);
      if (this.phase === 'warn' && armed) {
        this.setPanel(p, 1);
        p.mat.opacity = Math.floor(time * 8) % 2 ? 0.6 : 0.3;
      } else if (this.phase === 'on' && armed) this.setPanel(p, 2);
      else this.setPanel(p, 0);
    });
  }
}

/** Anomalous manifestation: drifts around its origin, hunts nearby people. */
export class Anomaly {
  constructor(game, x, z, home) {
    this.game = game;
    this.pos = new THREE.Vector3(x, 1.25, z);
    this.home = home;
    this.homeRadius = 15;
    this.target = null;
    this.wanderTo = null;
    this.speed = 1.5;
    this.alive = true;
    this.dying = 0;
    this.t = Math.random() * 10;
    this.group = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff3060 });
    this.core = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), coreMat);
    this.group.add(this.core);
    this.shards = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xc020ff : 0xff5070 }),
      );
      this.shards.push({ m, a: Math.random() * 6.28, r: 0.25 + Math.random() * 0.25, s: 1.5 + Math.random() * 2, y: (Math.random() - 0.5) * 0.4 });
      this.group.add(m);
    }
    this.halo = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xff2050, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    this.group.add(this.halo);
    this.group.position.copy(this.pos);
  }

  dissipate() {
    if (this.alive) {
      this.alive = false;
      this.dying = 1;
    }
  }

  canSee(x, y, z) {
    const w = this.game.world;
    if (this.game.doorBlocksLine(this.pos.x, this.pos.z, x, z)) return false;
    return w.visible(this.pos.x / VOXEL, this.pos.y / VOXEL, this.pos.z / VOXEL, x / VOXEL, y / VOXEL, z / VOXEL);
  }

  update(dt, targets) {
    this.t += dt;
    if (!this.alive) {
      this.dying -= dt * 0.8;
      this.group.scale.setScalar(Math.max(0.001, this.dying));
      return this.dying > 0;
    }
    // Pick the nearest visible target within range that is near our home.
    let best = null;
    let bd = 7.5;
    for (const t of targets) {
      const d = this.pos.distanceTo(t.pos.clone().setY(t.pos.y + 1.1));
      if (d < bd && Math.hypot(t.pos.x - this.home.x, t.pos.z - this.home.z) < this.homeRadius + 6 && this.canSee(t.pos.x, t.pos.y + 1.1, t.pos.z)) {
        bd = d;
        best = t;
      }
    }
    let goal = null;
    let speed = this.speed;
    if (best) {
      goal = [best.pos.x, best.pos.z];
      speed = 1.9;
      this.wanderTo = null;
    } else {
      if (!this.wanderTo || Math.hypot(this.wanderTo[0] - this.pos.x, this.wanderTo[1] - this.pos.z) < 0.4) {
        this.wanderTo = this.game.nav.randomPointNear(this.home.x, this.home.z, this.homeRadius);
        if (this.wanderTo && !this.game.nav.lineWalkable(this.pos.x, this.pos.z, this.wanderTo[0], this.wanderTo[1])) {
          this.wanderTo = null;
        }
      }
      goal = this.wanderTo;
    }
    if (goal) {
      const dx = goal[0] - this.pos.x;
      const dz = goal[1] - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const step = Math.min(d, speed * dt);
        const nx = this.pos.x + (dx / d) * step;
        const nz = this.pos.z + (dz / d) * step;
        if (this.game.nav.walkableAtWorld(nx, nz) || best) {
          this.pos.x = nx;
          this.pos.z = nz;
        } else {
          this.wanderTo = null;
        }
      }
    }
    this.pos.y = 1.25 + Math.sin(this.t * 2.3) * 0.12;
    this.group.position.copy(this.pos);
    this.core.rotation.set(this.t * 1.3, this.t * 1.7, 0);
    this.halo.rotation.set(this.t * 0.4, this.t * 0.6, this.t * 0.3);
    this.halo.scale.setScalar(1 + Math.sin(this.t * 6) * 0.12);
    for (const s of this.shards) {
      s.a += dt * s.s;
      s.m.position.set(Math.cos(s.a) * s.r, s.y + Math.sin(s.a * 1.7) * 0.1, Math.sin(s.a) * s.r);
      s.m.rotation.set(s.a, s.a * 0.5, 0);
    }
    return true;
  }

  touches(pos) {
    return this.alive && Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z) < 0.85 && pos.y < this.pos.y + 0.6;
  }
}
