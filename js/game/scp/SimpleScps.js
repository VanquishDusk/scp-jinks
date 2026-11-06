// Safe-class SCPs: cheaper, lower yield, little or no danger.

import * as THREE from 'three';
import { VOXEL } from '../../config.js';
import { boxGeometry } from './voxelModel.js';

const tmp = [0, 0, 0];

class ScpBase {
  constructor(game, chamber, id, name) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.chamber = chamber;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.contained = true;
    this.action = null;
    this.object = new THREE.Group();
  }
  get origin() {
    return this.pos;
  }
  get hold() {
    return this.action ? this.action.hold || 0 : 0;
  }
  boxes() {
    const p = this.pos;
    return [[p.x - 0.4, p.y, p.z - 0.4, p.x + 0.4, p.y + 1.0, p.z + 0.4]];
  }
  prompt() {
    return this.action ? { text: this.action.text, sub: this.name, denied: false } : null;
  }
  use(game) {
    return this.action ? this.action.use(game) : null;
  }
  returnToChamber() {
    const c = this.chamber;
    this.pos.set(c.center[0] * VOXEL, VOXEL, c.center[1] * VOXEL);
    this.contained = true;
    this.place();
  }
  light(mat, boost = 1.1) {
    this.game.world.sampleLight(this.pos.x, 1.0, this.pos.z, tmp);
    mat.color.setRGB(Math.min(1.3, tmp[0] * boost + 0.05), Math.min(1.3, tmp[1] * boost + 0.05), Math.min(1.3, tmp[2] * boost + 0.05));
  }
  place() {
    this.object.position.copy(this.pos);
    this.object.rotation.y = this.yaw;
  }
  update() {}
}

/** SCP-500: a jar of red pills on a pedestal. */
export class Scp500 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '500', 'SCP-500');
    const b = [
      [-5, 0, -5, 5, 14, 5, 0x8a9098],
      [-6, 14, -6, 6, 15, 6, 0x5a5e66],
      [-2.5, 15, -2.5, 2.5, 21, 2.5, 0xc8d8e0],
      [-2.7, 21, -2.7, 2.7, 22.5, 2.7, 0xe8e8e8],
      [-1.5, 15.5, -2.6, -0.5, 16.5, -2.5, 0xd02020, true],
      [0.5, 16.5, -2.6, 1.5, 17.5, -2.5, 0xd02020, true],
      [-0.5, 18, -2.6, 0.5, 19, -2.5, 0xd02020, true],
    ];
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.object.add(new THREE.Mesh(boxGeometry(b), this.mat));
    this.returnToChamber();
    this.light(this.mat);
  }
}

/** SCP-999: a friendly orange blob that bounces around and heals people. */
export class Scp999 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '999', 'SCP-999');
    const O = 0xe8862a;
    const L = 0xf5a84a;
    const b = [
      [-6, 0, -5, 6, 5, 5, O],
      [-5, 5, -4.5, 5, 9, 4.5, O],
      [-3.5, 9, -3.5, 3.5, 11, 3.5, L],
      [-3, 6, -4.7, -1.5, 8, -4.5, 0x2a1a10],
      [1.5, 6, -4.7, 3, 8, -4.5, 0x2a1a10],
      [-2, 3.5, -4.7, 2, 4.5, -4.5, 0x8a3a1a],
    ];
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.body = new THREE.Mesh(boxGeometry(b), this.mat);
    this.object.add(this.body);
    this.t = Math.random() * 6;
    this.target = null;
    this.speed = 1.2;
    this.returnToChamber();
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.body.position.y = Math.abs(Math.sin(this.t * 3)) * 0.12;
    this.body.scale.set(1 + Math.sin(this.t * 6) * 0.05, 1 - Math.sin(this.t * 6) * 0.05, 1);
    const home = { x: this.chamber.center[0] * VOXEL, z: this.chamber.center[1] * VOXEL };
    if (!this.target || Math.hypot(this.target[0] - this.pos.x, this.target[1] - this.pos.z) < 0.3) {
      const c = this.contained ? home : this.pos;
      const r = this.contained ? 2.5 : 10;
      const p = g.nav.randomPointNear(c.x, c.z, r);
      if (p && g.nav.lineWalkable(this.pos.x, this.pos.z, p[0], p[1]) && !g.doorBlocksLine(this.pos.x, this.pos.z, p[0], p[1])) this.target = p;
    }
    if (!this.contained && !g.player.dead) {
      // Loose: drawn to people, hugs and heals them.
      const d = Math.hypot(g.player.pos.x - this.pos.x, g.player.pos.z - this.pos.z);
      if (d < 7 && g.nav.lineWalkable(this.pos.x, this.pos.z, g.player.pos.x, g.player.pos.z)) this.target = [g.player.pos.x, g.player.pos.z];
      if (d < 1.1) {
        if (g.player.hp < g.player.maxHp) g.player.heal(12 * dt);
        if (!this.hugged) {
          this.hugged = true;
          g.ui.toast('SCP-999 HUGS YOU. YOU FEEL WONDERFUL.', false);
        }
      } else if (d > 3) this.hugged = false;
    }
    if (this.target) {
      const dx = this.target[0] - this.pos.x;
      const dz = this.target[1] - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const s = Math.min(d, this.speed * dt);
        this.pos.x += (dx / d) * s;
        this.pos.z += (dz / d) * s;
        this.yaw = Math.atan2(-dx, -dz);
      }
    }
    this.place();
    this.light(this.mat, 1.15);
  }
}
