// First-person weapon/hands view. Lives in its own overlay scene that is drawn
// after the world with a cleared depth buffer, so it never clips into walls.

import * as THREE from 'three';
import { boxGeometry } from '../scp/voxelModel.js';
import { weaponBoxes, handBoxes } from './weapons.js';

const PU = 1 / 16;
/** Models are drawn at a reduced scale so they sit low in the frame. */
const MODEL_SCALE = 0.48;

const HOLD = {
  pistol: { pos: [0.11, -0.1, -0.3], rot: [0.02, 0.06, 0] },
  rifle: { pos: [0.1, -0.11, -0.26], rot: [0.02, 0.04, 0] },
  baton: { pos: [0.15, -0.14, -0.32], rot: [-0.95, 0.15, -0.25] },
  pipe: { pos: [0.15, -0.14, -0.32], rot: [-0.95, 0.15, -0.25] },
  fists: { pos: [0, -0.1, -0.34], rot: [0, 0, 0] },
};

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.holder = new THREE.Group();
    this.root.add(this.holder);
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.models = {};
    this.current = null;
    this.kickT = 0;
    this.swingT = 0;
    this.swingDur = 0.3;
    this.reloadT = 0;
    this.reloadDur = 1;
    this.flashT = 0;
    this.drawT = 0;
    this.sway = new THREE.Vector2();
    this.flash = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.035, 0.035),
      new THREE.MeshBasicMaterial({ color: 0xffe070 }),
    );
    this.flash.visible = false;
    this.holder.add(this.flash);
    this.setHands(0x2a3040, 0xc8946c);
  }

  setHands(sleeve, skin) {
    for (const m of Object.values(this.models)) this.holder.remove(m);
    this.models = {};
    const hands = handBoxes(sleeve, skin);
    const fists = new THREE.Group();
    const r = new THREE.Mesh(boxGeometry(hands.right, PU), this.mat);
    r.position.set(0.13, 0, 0);
    r.rotation.set(0.55, 0.3, 0);
    const l = new THREE.Mesh(boxGeometry(hands.left, PU), this.mat);
    l.position.set(-0.13, 0, 0.01);
    l.rotation.set(0.55, -0.3, 0);
    fists.add(r, l);
    fists.userData.right = r;
    fists.userData.left = l;
    this.models.fists = fists;
    for (const id of ['pistol', 'rifle', 'baton', 'pipe']) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(boxGeometry(weaponBoxes(id), PU), this.mat));
      // The hand holding it.
      const hand = new THREE.Mesh(boxGeometry(hands.right, PU), this.mat);
      hand.position.set(0, id === 'rifle' ? -0.1 : id === 'pistol' ? -0.13 : -0.04, id === 'rifle' ? 0.12 : 0.03);
      hand.rotation.x = 0.6;
      g.add(hand);
      if (id === 'rifle') {
        const off = new THREE.Mesh(boxGeometry(hands.left, PU), this.mat);
        off.position.set(-0.02, -0.03, -0.38);
        off.rotation.set(0.7, 0.5, 0);
        g.add(off);
      }
      this.models[id] = g;
    }
    for (const m of Object.values(this.models)) {
      m.visible = false;
      m.scale.setScalar(MODEL_SCALE);
      this.holder.add(m);
    }
    if (this.current) this.show(this.current);
  }

  show(id) {
    for (const [k, m] of Object.entries(this.models)) m.visible = k === id;
    this.current = id;
    this.drawT = 0.25;
    const h = HOLD[id];
    this.base = h;
    const muzzle = { pistol: [0, 0.035 * MODEL_SCALE, -0.32 * MODEL_SCALE], rifle: [0, 0.04 * MODEL_SCALE, -0.82 * MODEL_SCALE] }[id];
    this.muzzle = muzzle || null;
  }

  kick(amount = 1) {
    this.kickT = 0.12 * amount;
    this.flashT = 0.05;
  }

  swing(dur) {
    this.swingT = dur;
    this.swingDur = dur;
  }

  reload(dur) {
    this.reloadT = dur;
    this.reloadDur = dur;
  }

  update(dt, camera, player, light) {
    this.root.position.copy(camera.position);
    this.root.quaternion.copy(camera.quaternion);
    this.mat.color.setRGB(Math.min(1.2, light[0] * 1.1 + 0.08), Math.min(1.2, light[1] * 1.1 + 0.08), Math.min(1.2, light[2] * 1.1 + 0.1));
    if (!this.current) return;
    const b = this.base;
    const m = this.models[this.current];
    this.kickT = Math.max(0, this.kickT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.swingT = Math.max(0, this.swingT - dt);
    this.reloadT = Math.max(0, this.reloadT - dt);
    this.drawT = Math.max(0, this.drawT - dt);

    // Walk bob and a little sway.
    const bob = player.bobAmount || 0;
    const bx = Math.cos(player.bobPhase) * 0.012 * bob;
    const by = Math.abs(Math.sin(player.bobPhase)) * 0.012 * bob;
    let px = b.pos[0] + bx;
    let py = b.pos[1] - by - this.drawT * 0.5;
    let pz = b.pos[2];
    let rx = b.rot[0];
    let ry = b.rot[1];
    let rz = b.rot[2];

    if (this.kickT > 0) {
      const k = this.kickT / 0.12;
      pz += 0.05 * k;
      rx += 0.18 * k;
    }
    if (this.reloadT > 0) {
      const t = 1 - this.reloadT / this.reloadDur;
      const s = Math.sin(t * Math.PI);
      py -= 0.12 * s;
      rx -= 0.6 * s;
      rz += 0.5 * s;
    }
    if (this.swingT > 0) {
      const t = 1 - this.swingT / this.swingDur;
      if (this.current === 'fists') {
        const punch = Math.sin(t * Math.PI);
        m.userData.right.position.set(0.13 - punch * 0.1, punch * 0.04, -punch * 0.2);
      } else {
        // Wind up, then a hard diagonal strike.
        const wind = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
        const strike = t < 0.3 ? 0 : Math.sin(((t - 0.3) / 0.7) * Math.PI);
        rx += 0.5 * wind - 1.3 * strike;
        rz += -0.3 * wind + 0.9 * strike;
        px -= 0.18 * strike;
        py += 0.06 * wind;
      }
    } else if (this.current === 'fists') {
      m.userData.right.position.set(0.13, 0, 0);
    }
    this.holder.position.set(px, py, pz);
    this.holder.rotation.set(rx, ry, rz);
    if (this.muzzle) {
      this.flash.position.set(this.muzzle[0], this.muzzle[1], this.muzzle[2]);
      this.flash.visible = this.flashT > 0;
      this.flash.rotation.z = Math.random() * 3;
    } else this.flash.visible = false;
  }
}
