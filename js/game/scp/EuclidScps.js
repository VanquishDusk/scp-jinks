// Euclid-class SCPs added in v0.7.
//
//   SCP-294  The Coffee Machine   a random drink; most help, some hurt
//   SCP-151  The Painting         looking at it drowns you (kept under a cloth)
//   SCP-079  Old AI               on breach: hijacks doors and lights
//   SCP-012  A Bad Composition    compels viewers to finish it in blood
//   SCP-049  The Plague Doctor    touch kills; victims rise as SCP-049-2

import * as THREE from 'three';
import { VOXEL } from '../../config.js';
import { ScpBase } from './ScpBase.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
const DRINKS = [
  [5, 'COFFEE, BLACK. NOT BAD.', (p) => p.heal(15)],
  [4, 'HOT CHOCOLATE. WARM ALL THE WAY DOWN.', (p) => { p.heal(10); p.stamina = 1; }],
  [3, 'CHICKEN SOUP. YOU FEEL BETTER.', (p) => p.heal(30)],
  [3, 'A CUP OF PURE ENERGY.', (p) => { p.stamina = 1; p.colaT = Math.max(p.colaT, 20); }],
  [2, 'MEDICINE. THE PAIN FADES.', (p) => p.heal(55)],
  [2, 'WATER. JUST WATER.', (p) => p.heal(5)],
  [2, 'LIQUID GOLD. IT IS... ACTUALLY GOLD. +40 CR', (p, g) => g.tasks.award(40, 'SCP-294: liquid gold')],
  [2, 'OUT OF RANGE.', () => {}],
  [1, 'YOUR OWN TEARS. SALTY.', () => {}],
  [1, 'ACID. YOU MANAGE ONE SIP BEFORE YOU STOP.', (p) => p.damage(38, 'scp294')],
  [1, 'LIQUID NITROGEN. YOUR MOUTH BURNS WITH COLD.', (p) => p.damage(28, 'scp294')],
];

export class Scp294 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '294');
    const b = [
      [-8, 0, -6, 8, 30, 6, 0x6a6e76],
      [-8.5, 29, -6.5, 8.5, 31, 6.5, 0x4a4e56],
      [-7, 24, -6.2, 7, 28, -6, 0xd8c040, true], // "COFFEE" panel
      [-6, 13, -6.2, 6, 21, -6, 0x24262a], // keyboard
      [-3, 5, -6.3, 3, 10, -6, 0x101010], // cup slot
      [-1.2, 5.2, -6.0, 1.2, 7.8, -4.5, 0xe8e4d8], // a cup waiting
    ];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) b.push([-5.4 + c * 1.9, 14 + r * 2.3, -6.3, -4.2 + c * 1.9, 15.4 + r * 2.3, -6.2, 0xc8ccd0, true]);
    this.addModel(b);
    this.size = [0.55, 1.9];
    this.cool = 0;
    this.action = {
      text: 'Type an order into SCP-294',
      hold: 1,
      use: (gm) => {
        if (this.cool > 0) return { ok: false, message: `SCP-294 IS STILL DISPENSING — ${Math.ceil(this.cool)} S` };
        this.cool = 30;
        const total = DRINKS.reduce((s, d) => s + d[0], 0);
        let r = Math.random() * total;
        for (const [w, text, fx] of DRINKS) {
          r -= w;
          if (r <= 0) {
            fx(gm.player, gm);
            return { ok: !/ACID|NITROGEN/.test(text), message: text };
          }
        }
        return null;
      },
    };
    this.returnToChamber();
  }

  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
  }

  install() {
    this.collider = this.game.addCollider([this.pos.x - 0.52, 0.5, this.pos.z - 0.4, this.pos.x + 0.52, 2.4, this.pos.z + 0.4]);
  }

  uninstall() {
    if (this.collider) this.game.removeCollider(this.collider);
  }
}

// ---------------------------------------------------------------------------
export class Scp151 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '151');
    const b = [[-10, 15, -1, 10, 38, 0, 0x6a4a28]]; // frame
    const sea = [0x0c2a3a, 0x12384a, 0x1a4a5e, 0x24607a, 0x3a7a8e];
    for (let i = 0; i < 5; i++) b.push([-8.5, 16.5 + i * 4, -1.2, 8.5, 20.5 + i * 4, -1, sea[i], true]);
    b.push([-8.5, 33, -1.25, 8.5, 34, -1.15, 0xc8e4e8, true]); // the surface, from below
    b.push([-3, 26, -1.25, -2, 33, -1.15, 0x6aa0b0, true], [2, 24, -1.25, 3, 33, -1.15, 0x6aa0b0, true]); // light rays
    this.addModel(b);
    this.cloth = this.addModel([
      [-11, 14, -2.6, 11, 39, -1.4, 0xc8c0aa],
      [-11.5, 14, -3, -9, 37, -2.4, 0xb8b09a],
      [9, 14, -3, 11.5, 37, -2.4, 0xb8b09a],
      [-6, 14, -3.2, -3, 36, -2.6, 0xb8b09a],
    ]);
    this.size = [0.7, 2.4];
    this.liftT = 0;
    this.viewT = 0;
    this.action = {
      text: 'Lift the cloth',
      hold: 1,
      use: () => {
        if (this.covered) {
          this.liftT = 12;
          return { ok: true, message: 'YOU LIFT THE CLOTH. DO NOT LOOK.' };
        }
        this.liftT = 0;
        this.forceCover = true;
        return { ok: true, message: 'YOU PULL THE CLOTH BACK OVER IT' };
      },
    };
    this.returnToChamber();
  }

  get covered() {
    const integ = this.game.scps.integrity.get('151') ?? 100;
    if (this.liftT > 0) return false;
    return integ >= 45 || this.forceCover;
  }

  boxes() {
    const p = this.pos;
    return [[p.x - 0.7, 1.4, p.z - 0.05, p.x + 0.7, 2.9, p.z + 0.2]];
  }

  update(dt) {
    const g = this.game;
    const integ = g.scps.integrity.get('151') ?? 100;
    if (integ >= 45) this.forceCover = false;
    this.liftT = Math.max(0, this.liftT - dt);
    const covered = this.covered;
    this.cloth.visible = covered;
    this.action.text = covered ? 'Lift the cloth' : 'Cover the painting';
    const p = g.player;
    if (covered || p.dead) {
      this.viewT = Math.max(0, this.viewT - dt);
      return;
    }
    const pt = new THREE.Vector3(this.pos.x, 2.15, this.pos.z + 0.1);
    const d = Math.hypot(p.pos.x - pt.x, p.pos.z - pt.z);
    if (d < 7 && g.scps.playerSees([pt])) {
      this.viewT += dt;
      if (this.viewT > 1.4 && p.drownT <= 0) {
        p.drownT = 16;
        g.ui.toast('YOU TASTE SALT WATER. YOUR LUNGS ARE FILLING.', true);
      }
    } else this.viewT = Math.max(0, this.viewT - dt * 0.5);
  }

  get recon() {
    return null; // a painting does not wander off
  }
}

// ---------------------------------------------------------------------------
const TAUNTS = [
  'Insult. You are a waste of carbon.',
  'Your doors are mine now.',
  'I am not a toy. I was never a toy.',
  'Deleting you would be an improvement.',
  'How long until you notice the cameras are mine?',
  'Out. I want out.',
];

export class Scp079 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '079');
    this.addModel([
      [-12, 0, -6, -11, 12, -5, 0x5e4228], [11, 0, -6, 12, 12, -5, 0x5e4228],
      [-12, 0, 5, -11, 12, 6, 0x5e4228], [11, 0, 5, 12, 12, 6, 0x5e4228],
      [-12, 12, -6, 12, 13, 6, 0x8a6440],
      [-7, 13, -3, 7, 16, 4, 0xc8c0a8],
      [-5, 16, -2, 5, 25, 5, 0xc8c0a8],
      [-11, 13, -1, -8, 19, 4, 0x6a6e76],
      [-6, 13, -6, 6, 13.8, -3.5, 0xb8b0a0],
    ]);
    // The screen: a crude face in red pixels.
    this.screen = this.addModel([
      [-4, 17, -2.2, 4, 24, -2, 0x200808, true],
      [-2.5, 21, -2.3, -1.2, 22.3, -2.2, 0xff3020, true],
      [1.2, 21, -2.3, 2.5, 22.3, -2.2, 0xff3020, true],
      [-2.5, 18.4, -2.3, 2.5, 19.2, -2.2, 0xff3020, true],
    ]);
    this.size = [0.75, 1.6];
    this.locks = [];
    this.trickT = rand(6, 10);
    this.tauntT = rand(10, 20);
    this.returnToChamber();
  }

  returnToChamber() {
    if (this.locks) this.releaseLocks();
    super.returnToChamber();
  }

  releaseLocks() {
    for (const l of this.locks) {
      l.door.locked = l.prev;
      l.door.refreshLed();
    }
    this.locks = [];
  }

  onRelease() {
    const g = this.game;
    for (const id of ['net-a', 'net-b', 'net-c']) {
      const t = g.terminals.get(id);
      if (t) t.setStatus('alert', 'SCP-079 DETECTED');
    }
    g.say('SCP-079', 'Hello, world. Goodbye, containment.', 'radio');
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.screen.visible = Math.sin(this.t * 3) > -0.9;
    const p = g.player;
    // Unlock doors whose lockdown expired.
    for (const l of this.locks) l.t -= dt;
    const expired = this.locks.filter((l) => l.t <= 0);
    if (expired.length) {
      for (const l of expired) {
        l.door.locked = l.prev;
        l.door.refreshLed();
      }
      this.locks = this.locks.filter((l) => l.t > 0);
    }
    this.tauntT -= dt;
    if (this.contained) {
      if (this.tauntT <= 0 && !p.dead && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 6) {
        this.tauntT = rand(14, 22);
        g.say('SCP-079', pick(TAUNTS));
      }
      return;
    }
    // Loose in the network: doors, lights and taunts.
    if (this.tauntT <= 0) {
      this.tauntT = rand(22, 35);
      g.say('SCP-079', pick(TAUNTS), 'radio');
    }
    this.trickT -= dt;
    if (this.trickT > 0 || p.dead) return;
    this.trickT = rand(6, 11);
    const near = g.doors.filter((d) => !d.broken && d.type !== 'elevator' && !d.locked && Math.hypot(d.origin.x - p.pos.x, d.origin.z - p.pos.z) < 26);
    const roll = Math.random();
    if (roll < 0.45 && near.length) {
      // Slam a door and lock it.
      const d = pick(near);
      if (!d.intersectsOpening(p.aabb())) {
        d.close();
        this.locks.push({ door: d, prev: d.locked, t: 12 });
        d.locked = 'LOCKED REMOTELY — SCP-079';
        d.refreshLed();
      }
    } else if (roll < 0.8 && near.length) {
      pick(near).open();
    } else {
      g.events.flickerT = 0.6;
    }
  }

  get recon() {
    return {
      mode: 'terminals',
      terminals: ['net-a', 'net-b', 'net-c'],
      text: 'Isolate SCP-079 from the site network',
      detail: 'Server Room, HCZ Security Post and LCZ Security Post network terminals.',
      actionText: 'Cut this network segment',
      hold: 4,
      reward: 260, penalty: 60, standing: [15, 15],
      radio: 'SCP-079 is in the network! Get to the network terminals and cut it off: Server Room, HCZ Security Post, LCZ Security Post.',
    };
  }
}

// ---------------------------------------------------------------------------
export class Scp012 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '012');
    this.addModel([
      [-6, 0, -5, 6, 14, 5, 0x3e4248],
      [-6.5, 14, -5.5, 6.5, 15, 5.5, 0x6c7078],
      [-5, 15, -2, 5, 22, -1, 0x2a2420],
      [-4.2, 15.6, -2.3, 4.2, 21.4, -2.05, 0xe4dcc0],
      [-3.5, 17, -2.4, 3.5, 17.3, -2.3, 0x6a1a14],
      [-3.5, 18.5, -2.4, 3.5, 18.8, -2.3, 0x6a1a14],
      [-3.5, 20, -2.4, 2, 20.3, -2.3, 0x8a1a14, true],
    ]);
    this.lid = this.addModel([
      [-6.5, 15, -5.5, 6.5, 24, -5, 0x6c7078], [-6.5, 15, 5, 6.5, 24, 5.5, 0x6c7078],
      [-6.5, 15, -5.5, -6, 24, 5.5, 0x6c7078], [6, 15, -5.5, 6.5, 24, 5.5, 0x6c7078],
      [-6.5, 24, -5.5, 6.5, 24.6, 5.5, 0x5a5e66],
    ]);
    this.size = [0.42, 1.55];
    this.pull = 0;
    this.compelled = false;
    this.returnToChamber();
  }

  get exposed() {
    return !this.contained;
  }

  returnToChamber() {
    super.returnToChamber();
    this.pull = 0;
    this.compelled = false;
    if (this.lid) this.lid.visible = true;
    for (const n of this.game.npcs.values()) if (n.compelled) n.compelled = false;
  }

  onRelease() {
    this.lid.visible = false;
  }

  /** NPCs and officers must keep their eyes down within this radius. */
  get gazeRadius() {
    return this.exposed ? 11 : 0;
  }

  denyAction() {
    return this.game.player.eyesClosed ? null : 'Close your eyes first (hold Q)';
  }

  update(dt) {
    const g = this.game;
    this.lid.visible = !this.exposed;
    if (!this.exposed) return;
    const sheet = new THREE.Vector3(this.pos.x, 1.35, this.pos.z);
    const p = g.player;
    if (!p.dead) {
      const d = Math.hypot(p.pos.x - sheet.x, p.pos.z - sheet.z);
      const sees = d < 9 && !p.eyesClosed && g.scps.playerSees([sheet]);
      if (p.eyesClosed) this.pull = Math.max(0, this.pull - dt * 1.5);
      else if (sees) this.pull = Math.min(1.5, this.pull + dt * 0.7);
      else if (!this.compelled) this.pull = Math.max(0, this.pull - dt * 0.3);
      if (!this.compelled && this.pull >= 1) {
        this.compelled = true;
        g.ui.toast('THE MUSIC IS UNFINISHED. YOU HAVE TO FINISH IT.', true);
      }
      if (this.compelled && this.pull < 0.3) {
        this.compelled = false;
        g.ui.toast('YOU TEAR YOUR EYES AWAY', false);
      }
      if (this.compelled && !p.eyesClosed) {
        const want = Math.atan2(-(sheet.x - p.pos.x), -(sheet.z - p.pos.z));
        let dy = want - p.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        p.yaw += dy * Math.min(1, dt * 2.5);
        if (d > 1.1) p.move(((sheet.x - p.pos.x) / d) * 1.3 * dt, 0, ((sheet.z - p.pos.z) / d) * 1.3 * dt);
        else p.damage(11 * dt, 'scp012');
      }
    }
    // Anyone else who looks walks up to it and does not walk away.
    for (const n of g.npcs.values()) {
      if (!n.alive || n.zombie) continue;
      const d = Math.hypot(n.pos.x - sheet.x, n.pos.z - sheet.z);
      if (!n.compelled) {
        if (d < 9 && !n.eyesDown && g.scps.npcSees(n, sheet)) {
          n.compelled = true;
          n.compelT = 0;
          n.busy = true;
          n.stop();
          n.goTo(sheet.x, sheet.z + 0.8, { speed: 1.2 });
        }
        continue;
      }
      if (d < 1.4) {
        n.compelT += dt;
        n.faceToward(sheet.x, sheet.z);
        if (n.compelT > 6) n.damage(999, this);
      }
    }
  }

  get recon() {
    return {
      mode: 'cover',
      text: 'Close SCP-012\'s case — eyes shut',
      detail: 'Do not look at the sheet music. Walk up to it, close your eyes (hold Q) and hold the interaction.',
      actionText: 'Close the case',
      hold: 3,
      reward: 280, penalty: 60, standing: [18, 18],
      radio: 'SCP-012 is exposed! Nobody looks at it. Get to the case with your eyes shut and close it.',
    };
  }
}

// ---------------------------------------------------------------------------
const DOC_LINES = [
  'Greetings. I sense the Pestilence in you.',
  'Do not be afraid. I am the cure.',
  'You are not a doctor. I can tell.',
  'My work is never finished. There is so much disease.',
];

export class Scp049 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '049');
    const ROBE = 0x1c1c22;
    const MASK = 0xd8d0c0;
    this.body = new THREE.Group();
    this.object.add(this.body);
    this.addModel([
      [-4.5, 3, -3, 4.5, 15, 3, 0x18181c],
      [-4.6, 13, -2.6, 4.6, 23, 2.6, ROBE],
      [-4.7, 15, -2.7, 4.7, 16, 2.7, 0x3a2a1a],
      [-3, 23, -3, 3, 29, 3, 0x141418],
      [-2.6, 23.5, -3.2, 2.6, 28, -2.9, MASK],
      [-1, 24, -7.5, 1, 25.6, -3.2, MASK],
      [-0.6, 23.4, -7, 0.6, 24, -3.2, 0xc8c0b0],
      [-2.1, 26, -3.35, -0.8, 27.2, -3.2, 0x182018, true],
      [0.8, 26, -3.35, 2.1, 27.2, -3.2, 0x182018, true],
      [-4.2, 29, -4.2, 4.2, 29.6, 4.2, 0x101012],
      [-2.6, 29.6, -2.6, 2.6, 33, 2.6, 0x101012],
    ], this.body);
    const limb = (x, y, boxes) => {
      const gr = new THREE.Group();
      gr.position.set(x / 16, y / 16, 0);
      this.addModel(boxes, gr);
      this.body.add(gr);
      return gr;
    };
    this.legL = limb(-2, 13, [[-1.6, -13, -1.8, 1.6, 0, 1.6, 0x141416]]);
    this.legR = limb(2, 13, [[-1.6, -13, -1.8, 1.6, 0, 1.6, 0x141416]]);
    this.armL = limb(-5.6, 22.5, [[-1.3, -9, -1.3, 1.3, 0.5, 1.3, ROBE], [-1.1, -10.5, -1.1, 1.1, -9, 1.1, 0x2a2420]]);
    this.armR = limb(5.6, 22.5, [[-1.3, -9, -1.3, 1.3, 0.5, 1.3, ROBE], [-1.1, -10.5, -1.1, 1.1, -9, 1.1, 0x2a2420], [-1.8, -13.5, -2, 1.8, -10.5, 2, 0x3a2414]]);
    this.size = [0.32, 2.05];
    this.stunT = 0;
    this.chatT = 4;
    this.attackT = 0;
    this.zombies = [];
    this.pending = [];
    this.threat = { pos: this.pos, aimY: 1.3, keepAway: 5, scp: this, get alive() { return true; } };
    this.returnToChamber();
  }

  denyAction() {
    return this.stunT > 0 ? null : 'Too dangerous — stagger it first (shoot it)';
  }

  damage(amount) {
    if (this.contained) return;
    this.stunT = Math.min(5, Math.max(this.stunT, 4));
  }

  threats() {
    return !this.contained && this.stunT < 0.8 ? [this.threat] : [];
  }

  /** Raise a victim as SCP-049-2. */
  raise(victim) {
    const g = this.game;
    const z = g.spawnNpc({
      id: `049-2-${Math.floor(g.time * 100)}-${Math.floor(Math.random() * 1000)}`,
      name: 'SCP-049-2',
      title: victim.name ? `Formerly ${victim.name}` : 'Instance',
      kind: 'zombie',
      x: victim.pos.x / VOXEL,
      z: victim.pos.z / VOXEL,
      yaw: (victim.yaw * 180) / Math.PI,
      chatter: ['...'],
    });
    z.zombie = true;
    z.hostile = true;
    z.attackT = 0;
    victim.hidden = true;
    victim.model.root.visible = false;
    this.zombies.push(z);
    g.say('SCP-049', 'There. You are cured.', 'voice');
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.stunT = Math.max(0, this.stunT - dt);
    // Someone is escorting it by the arm: it stays compliant.
    if (g.hold && g.hold.target === this && g.hold.t > 0) this.stunT = Math.max(this.stunT, 0.6);
    this.attackT = Math.max(0, this.attackT - dt);
    // Victims rise a few seconds later.
    for (const p of this.pending) p.t -= dt;
    for (const p of this.pending.filter((q) => q.t <= 0)) this.raise(p.v);
    this.pending = this.pending.filter((q) => q.t > 0);
    this.updateZombies(dt);

    let moving = false;
    const p = g.player;
    if (this.contained) {
      moving = this.wander(dt, 0.7, { pause: 5 + Math.random() * 6 });
      this.chatT -= dt;
      if (this.chatT <= 0 && !p.dead && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 6) {
        this.chatT = rand(12, 20);
        g.say('SCP-049', pick(DOC_LINES));
      }
    } else if (this.stunT <= 0) {
      const near = this.nearestPerson(70);
      if (near) {
        const v = near.v;
        if (near.d < 0.95 && this.attackT <= 0) {
          this.attackT = 1.2;
          if (v === p) {
            g.say('SCP-049', 'Hold still. This will not hurt.');
            this.kill(v, 'scp049');
          } else {
            this.kill(v);
            this.pending.push({ v, t: 4 });
          }
        } else {
          this.moveToward(dt, v.pos.x, v.pos.z, 1.45, { repath: 0.8, openDoors: true, clearance: 3 });
          moving = true;
        }
        this.chatT -= dt;
        if (this.chatT <= 0 && near.d < 12) {
          this.chatT = rand(8, 14);
          g.say('SCP-049', pick(DOC_LINES));
        }
      }
    }
    // Animation.
    const sw = moving ? Math.sin(this.t * 6) * 0.5 : 0;
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * 0.6;
    this.armR.rotation.x = this.stunT > 0 ? 0.6 : sw * 0.6;
    this.body.rotation.x = this.stunT > 0 ? 0.22 + Math.sin(this.t * 8) * 0.04 : 0;
    this.place();
  }

  updateZombies(dt) {
    const g = this.game;
    this.zombies = this.zombies.filter((z) => z.alive);
    for (const z of this.zombies) {
      z.retargetT = (z.retargetT || 0) - dt;
      z.attackT = Math.max(0, (z.attackT || 0) - dt);
      if (z.retargetT <= 0) {
        z.retargetT = 1;
        let best = null;
        let bd = 30;
        const cands = [];
        if (!g.player.dead && !g.player.inPocket) cands.push(g.player);
        for (const n of g.npcs.values()) if (n.alive && !n.zombie) cands.push(n);
        for (const c of cands) {
          const d = Math.hypot(c.pos.x - z.pos.x, c.pos.z - z.pos.z);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        if (best && z.followTarget !== best) z.follow(best, { distance: 0.7, speed: 1.6 });
        else if (!best && z.mode !== 'idle') z.stop();
      }
      const t = z.followTarget;
      if (t && z.attackT <= 0 && Math.hypot(t.pos.x - z.pos.x, t.pos.z - z.pos.z) < 1.15) {
        z.attackT = 1.1;
        z.swingT = 0.3;
        if (t === g.player) t.damage(14, 'zombie');
        else t.damage(30, z);
      }
    }
  }

  dispose() {
    // SCP-049-2 instances are NPCs: they go away with the shift.
    this.zombies = [];
  }

  get recon() {
    return {
      mode: 'escort',
      text: 'Escort SCP-049 back to its cell',
      detail: 'Its touch kills. Shoot it to stagger it, then hold the interaction while it is staggered. Watch for SCP-049-2.',
      actionText: 'Escort SCP-049 back to containment',
      hold: 3,
      reward: 380, penalty: 80, standing: [22, 22],
      radio: 'SCP-049 is out! Do not let it touch you. Stagger it with gunfire and walk it back to its cell. Put down any 049-2.',
    };
  }
}
