// Safe-class SCPs (v0.7): useful, mostly harmless, never (or barely) breach.
//
//   SCP-529  Josie the Half-Cat   pet her: health + stamina
//   SCP-330  Take Only Two        two sweets heal; the third costs your hands
//   SCP-207  Cola Bottles         speed + endless stamina; doubling up hurts
//   SCP-131  The Eye Pods         follow you; never blink (they freeze SCP-173)
//   SCP-005  Skeleton Key         opens any lock for two minutes
//   SCP-914  The Clockworks       refines keycards and weapons

import * as THREE from 'three';
import { VOXEL } from '../../config.js';
import { ScpBase, turn } from './ScpBase.js';
import { Trigger } from '../Interactables.js';
import { WEAPONS } from '../combat/weapons.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------------------
export class Scp529 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '529');
    const G = 0x8a8a86;
    const D = 0x5a5a56;
    // Only the front half of a cat: the cut is simply not visible.
    this.addModel([
      [-2.2, 2, -3, 2.2, 6, 1.5, G], // chest
      [-2.6, 5, -6.5, 2.6, 9, -2.5, G], // head
      [-2.4, 9, -5.5, -1.2, 10.5, -4.2, D], // ears
      [1.2, 9, -5.5, 2.4, 10.5, -4.2, D],
      [-1.6, 6.8, -6.6, -0.7, 7.6, -6.5, 0x7ac040, true], // eyes
      [0.7, 6.8, -6.6, 1.6, 7.6, -6.5, 0x7ac040, true],
      [-0.4, 5.6, -6.7, 0.4, 6.2, -6.5, 0xd08a8a],
      [-2, 0, -2.6, -0.8, 2.5, -1.4, G], // front legs
      [0.8, 0, -2.6, 2, 2.5, -1.4, G],
      [-2.2, 3, -1, 2.2, 5.5, -0.2, D], // stripe
    ]);
    this.size = [0.25, 0.55];
    this.cool = 0;
    this.action = {
      text: 'Pet Josie',
      hold: 1.2,
      use: (gm) => {
        if (this.cool > 0) return { ok: false, message: 'JOSIE IS NOT IN THE MOOD RIGHT NOW' };
        this.cool = 60;
        gm.player.heal(12);
        gm.player.stamina = 1;
        return { ok: true, message: 'SHE PURRS. YOU FEEL CALMER.' };
      },
    };
    this.returnToChamber();
  }

  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
    this.t += dt;
    if (!this.wander(dt, 0.6, { pause: 6 + Math.random() * 8 })) {
      this.object.children[0].position.y = Math.abs(Math.sin(this.t * 1.5)) * 0.01;
    }
    this.place();
  }
}

// ---------------------------------------------------------------------------
export class Scp330 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '330');
    const b = [
      [-4, 0, -4, 4, 13, 4, 0x6a6e76],
      [-5, 13, -5, 5, 14, 5, 0x4a4e56],
      [-5, 14, -5, 5, 16, 5, 0xd8e0e8], // bowl
      [-5.5, 16, -5.5, 5.5, 16.5, 5.5, 0xe8f0f8],
    ];
    const cols = [0xe03030, 0x30a0e0, 0xf0d020, 0x40c050, 0xe070c0, 0xf08020];
    for (let i = 0; i < 12; i++) {
      const x = -4 + (i % 4) * 2.2;
      const z = -3.5 + Math.floor(i / 4) * 2.4;
      b.push([x, 16, z, x + 1.4, 17.4, z + 1.4, cols[i % cols.length], true]);
    }
    this.addModel(b);
    this.size = [0.35, 1.1];
    this.taken = 0;
    this.action = {
      text: 'Take a piece of candy',
      sub: 'TAKE NO MORE THAN TWO',
      hold: 0.6,
      use: (gm) => this.take(gm),
    };
    this.returnToChamber();
  }

  take(gm) {
    this.taken++;
    if (this.taken <= 2) {
      gm.player.heal(22);
      gm.player.stamina = 1;
      return { ok: true, message: `${pick(['IT TASTES OF STRAWBERRY', 'IT TASTES OF LEMON', 'IT TASTES OF YOUR CHILDHOOD', 'IT TASTES OF MINT'])} (${this.taken}/2)` };
    }
    // A third piece: the bowl takes its price.
    gm.player.damage(55, 'scp330');
    gm.player.handsGone = true;
    gm.ui.pulse();
    return { ok: false, message: 'YOU SHOULD HAVE READ THE SIGN. YOUR HANDS ARE GONE.' };
  }

  install() {
    this.collider = this.game.addCollider([this.pos.x - 0.3, 0.5, this.pos.z - 0.3, this.pos.x + 0.3, 1.5, this.pos.z + 0.3]);
  }

  uninstall() {
    if (this.collider) this.game.removeCollider(this.collider);
  }
}

// ---------------------------------------------------------------------------
export class Scp207 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '207');
    const b = [
      // small table
      [-9, 11, -6, 9, 12, 6, 0x8a6440],
      [-8.5, 0, -5.5, -7.5, 11, -4.5, 0x5e4228], [7.5, 0, -5.5, 8.5, 11, -4.5, 0x5e4228],
      [-8.5, 0, 4.5, -7.5, 11, 5.5, 0x5e4228], [7.5, 0, 4.5, 8.5, 11, 5.5, 0x5e4228],
      // crate
      [-6, 12, -4, 6, 16, 4, 0x8a6c42],
    ];
    for (let i = 0; i < 8; i++) {
      const x = -5 + (i % 4) * 2.8;
      const z = -2.6 + Math.floor(i / 4) * 2.8;
      b.push([x, 13, z, x + 1.6, 20, z + 1.6, 0x3a1a10]); // glass bottle, cola inside
      b.push([x + 0.4, 20, z + 0.4, x + 1.2, 21.5, z + 1.2, 0x3a1a10]);
      b.push([x + 0.2, 16, z - 0.05, x + 1.4, 17.4, z, 0xc02020, true]); // label
    }
    this.addModel(b);
    this.size = [0.55, 1.3];
    this.action = {
      text: 'Drink a bottle of SCP-207',
      hold: 1,
      use: (gm) => {
        const p = gm.player;
        if (p.colaT > 0) {
          p.colaT = Math.min(120, p.colaT + 30);
          p.damage(32, 'scp207');
          return { ok: false, message: 'YOUR HEART HAMMERS AGAINST YOUR RIBS. TOO MUCH.' };
        }
        p.colaT = 75;
        return { ok: true, message: 'YOU FEEL FAST. REALLY FAST.' };
      },
    };
    this.returnToChamber();
  }

  install() {
    this.collider = this.game.addCollider([this.pos.x - 0.58, 0.5, this.pos.z - 0.4, this.pos.x + 0.58, 1.3, this.pos.z + 0.4]);
  }

  uninstall() {
    if (this.collider) this.game.removeCollider(this.collider);
  }
}

// ---------------------------------------------------------------------------
/** SCP-131: two eye pods. They can follow the player and never blink. */
export class Scp131 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '131');
    this.pods = [0xe0b030, 0x3a7ad0].map((color, i) => {
      const group = new THREE.Group();
      const body = new THREE.Group();
      group.add(body);
      this.addModel([
        [-3, 0, -3, 3, 5, 3, color],
        [-2.2, 5, -2.2, 2.2, 8, 2.2, color],
        [-1, 8, -1, 1, 10, 1, color],
        [-1.9, 2, -3.2, 1.9, 5.6, -3, 0xf0f0f0, true], // the eye
        [-0.9, 2.9, -3.3, 0.9, 4.7, -3.2, 0x101010],
        [-0.5, 0, -2, 0.5, 1, 2, 0x303030], // wheel
      ], body);
      this.object.add(group);
      return { group, body, pos: new THREE.Vector3(), yaw: 0, phase: i * 1.7, path: null, pathIdx: 0, repathT: 0, wanderTo: null, wanderT: 0 };
    });
    this.following = false;
    this.size = [0.25, 0.65];
    this.action = {
      text: 'Ask the eye pods to follow you',
      use: (gm) => {
        this.following = !this.following;
        this.action.text = this.following ? 'Ask the eye pods to stay here' : 'Ask the eye pods to follow you';
        return { ok: true, message: this.following ? 'THEY BOUNCE EXCITEDLY AND ROLL AFTER YOU' : 'THEY ROLL BACK TOWARD THEIR ENCLOSURE' };
      },
    };
    this.returnToChamber();
  }

  returnToChamber() {
    super.returnToChamber();
    this.following = false;
    if (this.action) this.action.text = 'Ask the eye pods to follow you';
    this.pods.forEach((p, i) => {
      p.pos.set(this.pos.x + (i ? 0.6 : -0.6), VOXEL, this.pos.z);
      p.path = null;
    });
  }

  boxes() {
    return this.pods.map((p) => [p.pos.x - 0.22, p.pos.y, p.pos.z - 0.22, p.pos.x + 0.22, p.pos.y + 0.65, p.pos.z + 0.22]);
  }

  get origin() {
    return this.pods[0].pos;
  }

  /** Their eyes never close: anything they can see counts as observed. */
  observes(points) {
    if (!this.following && this.contained) return false;
    const g = this.game;
    for (const p of this.pods) {
      for (const pt of points) {
        const d = Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z);
        if (d > 18) continue;
        if (g.doorBlocksLine(p.pos.x, p.pos.z, pt.x, pt.z)) continue;
        if (g.world.visible(p.pos.x / VOXEL, 1.2, p.pos.z / VOXEL, pt.x / VOXEL, pt.y / VOXEL, pt.z / VOXEL)) return true;
      }
    }
    return false;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const pl = g.player;
    this.pods.forEach((p, i) => {
      // Borrow the base movement helpers for each pod.
      const save = [this.pos, this.yaw, this.path, this.pathIdx, this.repathT, this.wanderTo, this.wanderT];
      this.pos = p.pos;
      this.yaw = p.yaw;
      this.path = p.path;
      this.pathIdx = p.pathIdx;
      this.repathT = p.repathT;
      this.wanderTo = p.wanderTo;
      this.wanderT = p.wanderT;
      let moving = false;
      if (this.following && !pl.dead && !pl.inPocket) {
        const fx = -Math.sin(pl.yaw);
        const fz = -Math.cos(pl.yaw);
        const tx = pl.pos.x - fx * 1.4 + (i ? 0.5 : -0.5) * fz;
        const tz = pl.pos.z - fz * 1.4 - (i ? 0.5 : -0.5) * fx;
        const d = Math.hypot(pl.pos.x - p.pos.x, pl.pos.z - p.pos.z);
        if (d > 1.5) {
          this.moveToward(dt, tx, tz, d > 5 ? 3.6 : 2.2, { repath: 0.8, openDoors: true, clearance: g.clearance });
          moving = true;
        }
        // Their eye wanders toward anything interesting (SCP-173 in particular).
        const s173 = g.scps.entities.get('173');
        if (s173 && Math.hypot(s173.pos.x - p.pos.x, s173.pos.z - p.pos.z) < 18) this.yaw = turn(this.yaw, Math.atan2(-(s173.pos.x - p.pos.x), -(s173.pos.z - p.pos.z)), 0.2);
      } else {
        moving = this.wander(dt, 0.9, { radius: 6, pause: 2 + Math.random() * 4 });
      }
      p.yaw = this.yaw;
      p.path = this.path;
      p.pathIdx = this.pathIdx;
      p.repathT = this.repathT;
      p.wanderTo = this.wanderTo;
      p.wanderT = this.wanderT;
      [this.pos, this.yaw, this.path, this.pathIdx, this.repathT, this.wanderTo, this.wanderT] = save;
      p.group.position.copy(p.pos);
      p.group.rotation.y = p.yaw;
      p.body.position.y = moving ? Math.abs(Math.sin(this.t * 9 + p.phase)) * 0.06 : 0;
    });
    this.pos.copy(this.pods[0].pos);
    this.object.position.set(0, 0, 0);
    this.object.rotation.y = 0;
    this.lightT -= 1;
    if (this.lightT <= 0) {
      this.lightT = 8;
      this.light(this.mat, 1.15);
    }
  }

  place() {
    this.object.position.set(0, 0, 0);
    for (const p of this.pods || []) {
      p.group.position.copy(p.pos);
      p.group.rotation.y = p.yaw;
    }
    this.light(this.mat, 1.15);
  }
}

// ---------------------------------------------------------------------------
export class Scp005 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '005');
    this.addModel([
      [-5, 0, -4, 5, 14, 4, 0x3a3030],
      [-5.5, 14, -4.5, 5.5, 15, 4.5, 0x8a6440],
      [-5.5, 15, -4.5, -5, 22, -4, 0xc8c8c8], [5, 15, -4.5, 5.5, 22, -4, 0xc8c8c8],
      [-5.5, 15, 4, -5, 22, 4.5, 0xc8c8c8], [5, 15, 4, 5.5, 22, 4.5, 0xc8c8c8],
      [-5.5, 22, -4.5, 5.5, 22.5, 4.5, 0xc8c8c8],
      [-3, 15, -2.5, 3, 15.6, 2.5, 0x6a1a24], // velvet
    ]);
    this.key = this.addModel([
      [-2.6, 15.6, -0.3, 1.2, 16.2, 0.3, 0xd8b048, true],
      [1.2, 15.6, -1.1, 2.8, 16.3, 1.1, 0xd8b048, true],
      [-2.6, 15.6, 0.3, -2.0, 16.2, 1.2, 0xd8b048, true],
      [-1.6, 15.6, 0.3, -1.0, 16.2, 0.9, 0xd8b048, true],
    ]);
    this.size = [0.35, 1.45];
    this.borrowed = false;
    this.action = {
      text: 'Borrow SCP-005',
      sub: 'Opens any lock — for two minutes',
      hold: 1.5,
      use: (gm) => {
        if (this.borrowed) return { ok: false, message: 'THE CASE IS EMPTY' };
        this.borrowed = true;
        this.key.visible = false;
        gm.player.skeletonT = 120;
        this.action.text = 'The display case is empty';
        return { ok: true, message: 'THE KEY IS WARM. EVERY LOCK IN THE SITE IS YOURS — FOR NOW.' };
      },
    };
    this.returnToChamber();
  }

  update(dt) {
    const p = this.game.player;
    if (this.borrowed && !this.returned && p.skeletonT <= 0) {
      this.returned = true;
      this.key.visible = true;
      this.game.ui.toast('SCP-005 HAS BEEN RECALLED TO ITS CASE', false);
    }
  }

  install() {
    this.collider = this.game.addCollider([this.pos.x - 0.35, 0.5, this.pos.z - 0.3, this.pos.x + 0.35, 1.9, this.pos.z + 0.3]);
  }

  uninstall() {
    if (this.collider) this.game.removeCollider(this.collider);
  }
}

// ---------------------------------------------------------------------------
const SETTINGS = ['ROUGH', 'COARSE', '1:1', 'FINE', 'VERY FINE'];

/** What SCP-914 makes of an input at a setting. Returns an output descriptor or null (destroyed). */
function refine(input, setting) {
  const r = Math.random();
  if (input.kind === 'keycard') {
    const L = input.level;
    switch (setting) {
      case 0: return null;
      case 1: return L > 1 ? { kind: 'keycard', level: L - 1 } : null;
      case 2: return { kind: 'keycard', level: L };
      case 3: return { kind: 'keycard', level: Math.min(5, L + 1) };
      default: return r < 0.6 ? { kind: 'keycard', level: Math.min(5, L + 2) } : null;
    }
  }
  const w = input.weapon;
  const table = {
    pipe: [null, null, 'pipe', 'baton', r < 0.5 ? 'pistol' : null],
    baton: [null, 'pipe', 'baton', 'pistol', r < 0.5 ? 'rifle' : null],
    pistol: [null, 'pipe', 'pistol', 'rifle', r < 0.7 ? 'rifle' : null],
    rifle: [null, 'pistol', 'rifle', 'rifle', r < 0.5 ? 'rifle' : null],
  }[w];
  const out = table ? table[setting] : null;
  return out ? { kind: 'weapon', weapon: out, full: setting >= 3 } : null;
}

export class Scp914 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '914');
    const BR = 0x8a7450; // brass
    const BZ = 0x5e4c34; // bronze body
    const DK = 0x2a2620;
    const b = [];
    const booth = (bx, bz, stripe) => {
      b.push([bx - 14, 0, bz - 14, bx + 14, 42, bz - 12, BR]);
      b.push([bx - 14, 0, bz - 12, bx - 12, 42, bz + 12, BR]);
      b.push([bx + 12, 0, bz - 12, bx + 14, 42, bz + 12, BR]);
      b.push([bx - 14, 40, bz - 14, bx + 14, 42, bz + 12, BR]);
      b.push([bx - 14, 36, bz + 10, bx + 14, 40, bz + 12, BR]);
      b.push([bx - 12, 0, bz - 12, bx + 12, 0.4, bz + 10, 0x4a4a48]);
      b.push([bx - 10, 37, bz + 12, bx + 10, 39, bz + 12.2, stripe, true]);
      b.push([bx - 11.8, 2, bz - 11.8, bx + 11.8, 36, bz - 11.6, DK]);
    };
    booth(-56, 8, 0xe08030);
    booth(56, 8, 0x3080e0);
    // Clockwork body.
    b.push([-42, 0, -28, 42, 60, 6, BZ]);
    b.push([-44, 58, -30, 44, 62, 8, BR]);
    b.push([-42, 18, -6, -14, 26, 0, BR], [14, 18, -6, 42, 26, 0, BR]); // pipes into booths
    for (const [x, y] of [[-34, 8], [-34, 48], [34, 8], [34, 48]]) b.push([x - 3, y - 3, 6, x + 3, y + 3, 7, 0x9a8a60]);
    // Control panel.
    b.push([-10, 0, 26, 10, 16, 34, 0x3a3a3c]);
    b.push([-9, 16, 27, 9, 17, 33, BR]);
    for (let i = 0; i < 5; i++) b.push([-7 + i * 3, 17, 27.5, -6 + i * 3, 17.4, 28.5, i === 2 ? 0xe8e8e8 : 0xc8a050, true]);
    this.addModel(b);
    // Gears (spin while it runs).
    this.gears = [[-20, 34, 9], [12, 40, 7], [28, 20, 6], [-4, 16, 8], [-28, 16, 5]].map(([gx, gy, r]) => {
      const gr = new THREE.Group();
      const teeth = [[-r, -r * 0.3, 7, r, r * 0.3, 8.5, 0xb09a68], [-r * 0.3, -r, 7, r * 0.3, r, 8.5, 0xb09a68], [-r * 0.7, -r * 0.7, 6.5, r * 0.7, r * 0.7, 8, 0x8a7450], [-1, -1, 8.5, 1, 1, 9.5, 0x2a2620]];
      this.addModel(teeth.map((t) => [t[0], t[1], t[2], t[3], t[4], t[5], t[6]]), gr);
      gr.position.set(gx / 16, gy / 16, 0);
      this.object.add(gr);
      return gr;
    });
    this.dial = new THREE.Group();
    this.addModel([[-0.6, 0, -4, 0.6, 1, 0, 0xe03020, true], [-1.5, 0, -1.5, 1.5, 1.2, 1.5, 0x1a1a1a]], this.dial);
    this.dial.position.set(0, 17.2 / 16, 30 / 16);
    this.object.add(this.dial);
    this.setting = 2;
    this.input = null;
    this.running = 0;
    this.size = [2.8, 3.8];
    this.returnToChamber();
  }

  returnToChamber() {
    super.returnToChamber();
    this.yaw = 0;
    this.place(true);
  }

  // Interaction is through the booth, dial and key triggers, not the body.
  boxes() {
    return [];
  }

  w(lx, lz) {
    return [this.pos.x + lx, this.pos.z + lz];
  }

  install() {
    const g = this.game;
    const [ix, iz] = this.w(-3.5, 0.8);
    const [px, pz] = this.w(0, 1.9);
    this.colliders = [
      [this.pos.x - 2.65, 0.5, this.pos.z - 1.8, this.pos.x + 2.65, 4.4, this.pos.z + 0.4],
      ...[-3.5, 3.5].flatMap((bx) => [
        [this.pos.x + bx - 0.9, 0.5, this.pos.z - 0.4, this.pos.x + bx + 0.9, 3.2, this.pos.z - 0.25],
        [this.pos.x + bx - 0.9, 0.5, this.pos.z - 0.4, this.pos.x + bx - 0.75, 3.2, this.pos.z + 1.25],
        [this.pos.x + bx + 0.75, 0.5, this.pos.z - 0.4, this.pos.x + bx + 0.9, 3.2, this.pos.z + 1.25],
      ]),
      [px - 0.65, 0.5, pz - 0.3, px + 0.65, 1.55, pz + 0.3],
    ];
    for (const c of this.colliders) g.addCollider(c);
    this.triggers = [
      g.addTrigger(new Trigger({ id: '914-intake', x: ix, y: 1.3, z: iz, half: [0.7, 0.9, 0.6] })),
      g.addTrigger(new Trigger({ id: '914-dial', x: px - 0.25, y: 1.6, z: pz, half: [0.32, 0.12, 0.3] })),
      g.addTrigger(new Trigger({ id: '914-key', x: px + 0.42, y: 1.6, z: pz, half: [0.2, 0.12, 0.3] })),
    ];
    const [intake, dial, key] = this.triggers;
    intake.prompt = (gm) => {
      if (this.running) return { text: 'SCP-914 is running', sub: 'Stand clear', denied: true };
      if (this.input) return { text: `Intake: ${this.inputLabel(this.input)}`, sub: 'Wind the key at the panel to start', denied: true };
      const item = this.offer(gm);
      return item ? { text: `Place your ${this.inputLabel(item)} in the intake booth`, sub: 'SCP-914 INTAKE', denied: false } : { text: 'Intake booth (empty)', sub: 'You have nothing it can take', denied: true };
    };
    intake.action = { text: 'Intake', use: (gm) => this.insert(gm) };
    dial.prompt = () => (this.running ? null : { text: `Turn the dial — ${SETTINGS[this.setting]}`, sub: SETTINGS.join(' · '), denied: false });
    dial.action = {
      text: 'Dial',
      use: () => {
        this.setting = (this.setting + 1) % SETTINGS.length;
        return { ok: true, message: `SETTING: ${SETTINGS[this.setting]}` };
      },
    };
    key.prompt = () => (this.running ? null : { text: 'Wind the key', sub: this.input ? `Refine on ${SETTINGS[this.setting]}` : 'The intake booth is empty', denied: false });
    key.action = { text: 'Wind', hold: 1.2, use: (gm) => this.start(gm) };
  }

  uninstall() {
    const g = this.game;
    for (const c of this.colliders || []) g.removeCollider(c);
    for (const t of this.triggers || []) g.removeInteractable(t);
    if (this.outputPickup && !this.outputPickup.taken) g.removeInteractable(this.outputPickup);
  }

  inputLabel(it) {
    return it.kind === 'keycard' ? `Level ${it.level} keycard` : WEAPONS[it.weapon].name.toLowerCase();
  }

  /** What the player would put in: their keycard first, otherwise the weapon in hand. */
  offer(gm) {
    if (gm.player.keycard > 0) return { kind: 'keycard', level: gm.player.keycard };
    const w = gm.combat.current;
    if (w && w !== 'fists' && WEAPONS[w]) return { kind: 'weapon', weapon: w };
    return null;
  }

  insert(gm) {
    if (this.running || this.input) return null;
    const item = this.offer(gm);
    if (!item) return { ok: false, message: 'NOTHING TO REFINE' };
    if (item.kind === 'keycard') {
      gm.player.keycard = 0;
      gm.ui.setItem(null);
    } else gm.combat.take(item.weapon);
    this.input = item;
    return { ok: true, message: `${this.inputLabel(item).toUpperCase()} PLACED IN THE INTAKE` };
  }

  start(gm) {
    if (this.running) return null;
    if (!this.input) return { ok: false, message: 'THE INTAKE BOOTH IS EMPTY' };
    this.running = 7;
    this.result = refine(this.input, this.setting);
    this.input = null;
    return { ok: true, message: 'THE KEY TURNS. GEARS BEGIN TO GRIND.' };
  }

  finish() {
    const g = this.game;
    const [ox, oz] = this.w(3.5, 0.6);
    const r = this.result;
    if (!r) {
      g.ui.toast('SCP-914 OUTPUT: A HANDFUL OF FINE DUST', true);
      return;
    }
    if (r.kind === 'keycard') {
      this.outputPickup = g.addPickup({
        id: '914-out', kind: 'keycard', x: ox, y: 0.62, z: oz, name: `Level ${r.level} Keycard`,
        onPickup: (gm) => {
          gm.player.keycard = r.level;
          gm.ui.setItem(`Keycard: Level ${r.level}`);
        },
      });
    } else {
      this.outputPickup = g.addPickup({
        id: '914-out', kind: 'weapon', weapon: r.weapon, x: ox, y: 0.6, z: oz, name: WEAPONS[r.weapon].name,
        onPickup: (gm) => {
          const msg = gm.combat.give(r.weapon);
          if (r.full && WEAPONS[r.weapon].kind === 'ranged') gm.combat.ammo[r.weapon] = { mag: WEAPONS[r.weapon].mag, reserve: WEAPONS[r.weapon].reserve };
          return msg;
        },
      });
    }
    g.ui.toast('SCP-914 FALLS SILENT. SOMETHING WAITS IN THE OUTPUT BOOTH.', false);
  }

  update(dt) {
    this.t += dt;
    if (this.running > 0) {
      this.running -= dt;
      this.gears.forEach((gr, i) => (gr.rotation.z += dt * (i % 2 ? -3 : 3)));
      this.object.position.x = this.pos.x + Math.sin(this.t * 40) * 0.01;
      if (this.running <= 0) {
        this.running = 0;
        this.object.position.x = this.pos.x;
        this.finish();
      }
    }
    this.dial.rotation.y += ((-(this.setting - 2) * 0.6) - this.dial.rotation.y) * Math.min(1, dt * 8);
  }
}
