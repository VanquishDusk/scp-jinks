// Keter-class SCPs (v0.7).
//
//   SCP-939  With Many Voices          two blind predators that hunt by sound
//   SCP-106  The Old Man                walks through walls; drags prey into
//                                       its pocket dimension
//   SCP-682  Hard-to-Destroy Reptile   rampages; can only be knocked down

import * as THREE from 'three';
import { VOXEL } from '../../config.js';
import { ScpBase, turn } from './ScpBase.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ===========================================================================
// SCP-939
// ===========================================================================
const VOICE_LINES = ['Hello? Is someone there?', 'Help me... please, I am hurt.', 'Over here! I found a way out!', 'It is safe now. Come out.', 'Can anyone hear me?', 'I am in here. Please.'];

export class Scp939 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '939');
    const RED = 0x8a2a20;
    const DRK = 0x6a1a14;
    this.pack = [0, 1].map((i) => {
      const group = new THREE.Group();
      const body = new THREE.Group();
      group.add(body);
      this.addModel([
        [-3.5, 8, -10, 3.5, 15, 10, RED],
        [-2, 15, -8, 2, 16.5, 8, DRK],
        [-2.5, 9, -18, 2.5, 14, -10, RED],
        [-2.2, 6.5, -21, 2.2, 9, -12, DRK],
        [-2, 9, -21.2, 2, 9.6, -20.8, 0xe8e0d0],
        [-1, 11, 10, 1, 13, 18, DRK],
      ], body);
      const legs = [[-3, -7], [3, -7], [-3, 7], [3, 7]].map(([x, z]) => {
        const leg = new THREE.Group();
        leg.position.set(x / 16, 8 / 16, z / 16);
        this.addModel([[-1.2, -8, -1.2, 1.2, 0, 1.2, DRK]], leg);
        body.add(leg);
        return leg;
      });
      this.object.add(group);
      const inst = {
        idx: i, group, body, legs, pos: new THREE.Vector3(), yaw: 0, hp: 220, down: false, biteT: 0,
        path: null, pathIdx: 0, repathT: 0, wanderTo: null, wanderT: 0, phase: i * 2,
        threat: null,
      };
      inst.threat = { pos: inst.pos, aimY: 0.7, keepAway: 6, scp: this, get alive() { return !inst.down; } };
      return inst;
    });
    this.size = [0.6, 1.0];
    this.playerDamage = 0;
    this.totalDamage = 0;
    this.voiceT = rand(15, 25);
    this.downT = 0;
    this.returnToChamber();
  }

  returnToChamber() {
    this.contained = true;
    const dens = this.chamber.den || [this.chamber.center, this.chamber.center];
    this.pack.forEach((p, i) => {
      p.pos.set(dens[i][0] * VOXEL, VOXEL, dens[i][1] * VOXEL);
      p.hp = 220;
      p.down = false;
      p.path = null;
    });
    this.pos.copy(this.pack[0].pos);
    this.playerDamage = 0;
    this.totalDamage = 0;
    this.downT = 0;
    this.place();
  }

  get origin() {
    return this.pack[0].pos;
  }

  boxes() {
    return this.pack.map((p) => [p.pos.x - 0.55, p.pos.y, p.pos.z - 0.55, p.pos.x + 0.55, p.pos.y + 1.05, p.pos.z + 0.55]);
  }

  threats() {
    return this.contained ? [] : this.pack.filter((p) => !p.down).map((p) => p.threat);
  }

  damage(amount, attacker, point) {
    if (this.contained) return;
    let inst = this.pack[0];
    if (point) inst = this.pack.reduce((a, b) => (flat(a.pos, point) < flat(b.pos, point) ? a : b));
    if (inst.down) return;
    inst.hp -= amount;
    this.totalDamage += amount;
    if (attacker === this.game.player) this.playerDamage += amount;
    inst.huntT = 4; // it heard that
    if (inst.hp <= 0) {
      inst.hp = 0;
      inst.down = true;
      this.game.ui.toast('AN SCP-939 INSTANCE GOES DOWN — SEDATED', false);
    }
  }

  /** The loudest thing an instance can hear right now, or null. */
  listen(inst) {
    const g = this.game;
    let best = null;
    let bestScore = 0;
    const consider = (x, z, radius, who) => {
      const d = Math.hypot(x - inst.pos.x, z - inst.pos.z);
      if (d > radius) return;
      const score = radius - d;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z, who };
      }
    };
    const p = g.player;
    if (!p.dead && !p.inPocket) {
      const speed = Math.hypot(p.vel.x, p.vel.z);
      const r = speed < 0.3 ? 0 : p.crouching ? 2.2 : p.sprinting ? 17 : 8;
      if (r) consider(p.pos.x, p.pos.z, r, p);
    }
    for (const n of g.npcs.values()) {
      if (!n.alive || !n.moving) continue;
      consider(n.pos.x, n.pos.z, n.speed > 2.5 ? 11 : 6, n);
    }
    for (const s of g.noises) consider(s.x, s.z, s.r, null);
    return best;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const save = [this.pos, this.yaw, this.path, this.pathIdx, this.repathT, this.wanderTo, this.wanderT];
    for (const inst of this.pack) {
      this.pos = inst.pos;
      this.yaw = inst.yaw;
      this.path = inst.path;
      this.pathIdx = inst.pathIdx;
      this.repathT = inst.repathT;
      this.wanderTo = inst.wanderTo;
      this.wanderT = inst.wanderT;
      let moving = false;
      inst.biteT = Math.max(0, inst.biteT - dt);
      if (!inst.down) {
        if (this.contained) moving = this.wander(dt, 1.0, { pause: 3 + Math.random() * 4 });
        else {
          inst.listenT = (inst.listenT || 0) - dt;
          if (inst.listenT <= 0) {
            inst.listenT = 0.4;
            const heard = this.listen(inst);
            if (heard) {
              inst.goal = heard;
              inst.huntT = 5;
            }
          }
          inst.huntT = (inst.huntT || 0) - dt;
          // Bite anything within reach.
          const prey = this.nearestPerson(1.4);
          if (prey && inst.biteT <= 0 && Math.hypot(prey.v.pos.x - inst.pos.x, prey.v.pos.z - inst.pos.z) < 1.4) {
            inst.biteT = 1.0;
            if (prey.v === g.player) g.player.damage(28, 'scp939');
            else prey.v.damage(55, this);
          } else if (inst.goal && inst.huntT > 0) {
            const left = this.moveToward(dt, inst.goal.x, inst.goal.z, 3.6, { repath: 0.6, openDoors: true, clearance: 4 });
            moving = true;
            if (left < 0.6) inst.goal = null;
          } else moving = this.wander(dt, 1.2, { radius: 10, pause: 2 + Math.random() * 3 });
        }
      }
      inst.yaw = this.yaw;
      inst.path = this.path;
      inst.pathIdx = this.pathIdx;
      inst.repathT = this.repathT;
      inst.wanderTo = this.wanderTo;
      inst.wanderT = this.wanderT;
      // Animation.
      inst.group.position.copy(inst.pos);
      inst.group.rotation.y = inst.yaw;
      const sw = moving ? Math.sin(this.t * 10 + inst.phase) * 0.6 : 0;
      inst.legs.forEach((l, k) => (l.rotation.x = k % 3 === 0 ? sw : -sw));
      inst.body.rotation.z = inst.down ? Math.PI / 2.2 : 0;
      inst.body.position.y = inst.down ? -0.25 : 0;
    }
    [this.pos, this.yaw, this.path, this.pathIdx, this.repathT, this.wanderTo, this.wanderT] = save;
    this.pos.copy(this.pack[0].pos);
    this.object.position.set(0, 0, 0);
    this.lightT -= 1;
    if (this.lightT <= 0) {
      this.lightT = 8;
      this.light(this.mat, 1.15);
    }
    if (this.contained) return;

    // Voices of the dead, drifting down the corridors.
    this.voiceT -= dt;
    const p = g.player;
    if (this.voiceT <= 0 && !p.dead && this.pack.some((i) => !i.down && flat(i.pos, p.pos) < 28)) {
      this.voiceT = rand(18, 34);
      const dead = [...g.npcs.values()].filter((n) => n.dead && n.name && n.kind !== 'zombie');
      const who = dead.length && Math.random() < 0.75 ? pick(dead).name : pick(['Unknown voice', 'Researcher', 'Officer']);
      g.say(who, pick(VOICE_LINES), 'voice');
    }
    // Both down: the containment team drags them back.
    if (this.pack.every((i) => i.down)) {
      this.downT += dt;
      if (this.downT > 5) {
        const byPlayer = this.totalDamage > 0 && this.playerDamage / this.totalDamage >= 0.35;
        g.scps.teamRecontain(this, byPlayer);
      }
    } else this.downT = 0;
  }

  place() {
    this.object.position.set(0, 0, 0);
    for (const p of this.pack || []) {
      p.group.position.copy(p.pos);
      p.group.rotation.y = p.yaw;
    }
    this.light(this.mat, 1.15);
  }

  get recon() {
    return {
      mode: 'auto',
      text: 'Sedate both SCP-939 instances',
      detail: 'They are blind and hunt by sound: walk or crouch, do not sprint. Gunfire draws them. Both must go down.',
      reward: 550, penalty: 100, standing: [25, 25],
      radio: 'Both SCP-939 are loose! Keep quiet, they hunt by sound. Put them down — sedative rounds are loaded. Do not trust any voice you hear.',
      target: () => {
        const up = this.pack.filter((i) => !i.down);
        const i = up[0] || this.pack[0];
        return { x: i.pos.x, y: 1.6, z: i.pos.z };
      },
    };
  }
}

// ===========================================================================
// SCP-106
// ===========================================================================
const POCKET_ESCAPES = ['patrol-hub', 'patrol-north', 'patrol-research', 'patrol-medical', 'patrol-lobby', 'patrol-cafeteria', 'patrol-storage', 'patrol-lcz', 'patrol-hczwing', 'patrol-keter'];

export class Scp106 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '106');
    const SKIN = 0x1e1a16;
    const ROT = 0x2a2018;
    this.body = new THREE.Group();
    this.object.add(this.body);
    this.addModel([
      [-4, 12, -2.4, 4, 22, 2.4, SKIN],
      [-3.6, 12, -2.6, 3.6, 13.5, 2.6, 0x0c0a08],
      [-2.6, 22, -4.2, 2.6, 28, 1.2, ROT],
      [-1.6, 25, -4.35, -0.6, 25.8, -4.2, 0x8a8a50, true],
      [0.6, 25, -4.35, 1.6, 25.8, -4.2, 0x8a8a50, true],
      [-1.4, 23.2, -4.35, 1.4, 24, -4.2, 0x060504],
      [-3, 14, -2.7, -2, 20, -2.4, 0x0c0a08], [1.5, 16, -2.7, 2.5, 21, -2.4, 0x0c0a08],
    ], this.body);
    const limb = (x, y, boxes) => {
      const gr = new THREE.Group();
      gr.position.set(x / 16, y / 16, 0);
      this.addModel(boxes, gr);
      this.body.add(gr);
      return gr;
    };
    this.legL = limb(-2, 13, [[-1.5, -13, -1.5, 1.5, 0, 1.5, SKIN]]);
    this.legR = limb(2, 13, [[-1.5, -13, -1.5, 1.5, 0, 1.5, SKIN]]);
    this.armL = limb(-5.2, 21, [[-1.1, -14, -1.1, 1.1, 0.5, 1.1, SKIN], [-1.3, -15.5, -1.3, 1.3, -14, 1.3, 0x0c0a08]]);
    this.armR = limb(5.2, 21, [[-1.1, -14, -1.1, 1.1, 0.5, 1.1, SKIN], [-1.3, -15.5, -1.3, 1.3, -14, 1.3, 0x0c0a08]]);
    this.size = [0.35, 1.85];
    this.state = 'cell';
    this.stateT = 0;
    this.slowT = 0;
    this.trail = 0;
    this.decals = new THREE.Group();
    game.scene.add(this.decals);
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x0c0a08, transparent: true, opacity: 0.85, depthWrite: false });
    this.threat = { pos: this.pos, aimY: 1.2, keepAway: 7, scp: this, get alive() { return true; } };
    this.returnToChamber();
  }

  returnToChamber() {
    super.returnToChamber();
    this.pos.y = (this.chamber.cellFloorY ?? 1) * VOXEL;
    this.state = 'cell';
    this.body.position.y = 0;
    this.place(true);
  }

  boxes() {
    if (this.state === 'travel') return [];
    return super.boxes();
  }

  threats() {
    return this.state === 'hunt' ? [this.threat] : [];
  }

  damage() {
    if (this.state === 'hunt') this.slowT = 1.3;
  }

  onRelease() {
    this.state = 'sink';
    this.stateT = 2;
    this.game.say('SITE INTERCOM', 'SCP-106 has left its cell. It can pass through walls. Do not let it reach you.', 'pa', 6);
  }

  dispose() {
    this.game.scene.remove(this.decals);
    this.clearMarkers();
  }

  corrode(x, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.8 + Math.random() * 0.5, 0.02, 0.8 + Math.random() * 0.5), this.decalMat);
    m.position.set(x, VOXEL + 0.012, z);
    m.rotation.y = Math.random() * 3;
    this.decals.add(m);
    if (this.decals.children.length > 60) this.decals.remove(this.decals.children[0]);
  }

  /** Reappear near someone after travelling through the walls. */
  emergeNear() {
    const g = this.game;
    const people = [];
    if (!g.player.dead && !g.player.inPocket) people.push(g.player, g.player);
    for (const n of g.npcs.values()) if (n.alive && !n.zombie) people.push(n);
    if (!people.length) return false;
    const v = pick(people);
    const p = g.nav.randomPointNear(v.pos.x, v.pos.z, 12);
    if (!p || Math.hypot(p[0] - v.pos.x, p[1] - v.pos.z) < 6) return false;
    this.pos.set(p[0], VOXEL, p[1]);
    this.state = 'emerge';
    this.stateT = 2;
    this.corrode(p[0], p[1]);
    return true;
  }

  capture(v) {
    const g = this.game;
    if (v === g.player) this.toPocket();
    else {
      v.damage(999, this);
      v.hidden = true;
      v.model.root.visible = false;
    }
    this.state = 'sink';
    this.stateT = 2.2;
  }

  // ---- Pocket dimension -------------------------------------------------------------
  clearMarkers() {
    for (const m of this.markers || []) this.game.scene.remove(m);
    this.markers = [];
  }

  toPocket() {
    const g = this.game;
    const pk = g.builder.pocket;
    const p = g.player;
    p.inPocket = true;
    p.pos.set(pk.center[0] * VOXEL, VOXEL + 0.001, pk.center[1] * VOXEL);
    p.vel.set(0, 0, 0);
    this.exit = Math.floor(Math.random() * pk.exits.length);
    this.clearMarkers();
    this.markers = pk.exits.map(([x, z], i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1.4), new THREE.MeshBasicMaterial({ color: i === this.exit ? 0x8a9a7a : 0x6a2a20, transparent: true, opacity: 0.35, depthWrite: false }));
      m.position.set(x * VOXEL, VOXEL + 1.1, z * VOXEL);
      g.scene.add(m);
      return m;
    });
    g.ui.toast('THE FLOOR GIVES WAY. YOU ARE SOMEWHERE ELSE.', true);
    g.say('???', 'There are four ways out. Only one leads back.', 'voice');
  }

  updatePocket(dt) {
    const g = this.game;
    const p = g.player;
    const pk = g.builder.pocket;
    g.renderer.setDesaturate(0.55);
    p.damage(1.6 * dt, 'pocket');
    if (this.markers) {
      this.markers.forEach((m, i) => {
        m.material.opacity = 0.25 + 0.15 * Math.sin(g.time * (i === this.exit ? 5 : 2) + i);
      });
    }
    pk.exits.forEach(([x, z], i) => {
      if (p.dead || Math.hypot(p.pos.x - x * VOXEL, p.pos.z - z * VOXEL) > 1.3) return;
      if (i === this.exit) {
        const opts = POCKET_ESCAPES.filter((id) => g.builder.points[id]).map((id) => g.point(id)).filter((q) => Math.hypot(q.x - this.pos.x, q.z - this.pos.z) > 20);
        const q = pick(opts.length ? opts : [g.point('patrol-hub')]);
        p.inPocket = false;
        p.pos.set(q.x, VOXEL + 0.001, q.z);
        p.vel.set(0, 0, 0);
        p.damage(15, 'pocket');
        g.renderer.setDesaturate(0);
        this.clearMarkers();
        g.ui.toast('YOU CLAW YOUR WAY OUT OF THE FLOOR', false);
      } else {
        p.damage(999, 'pocket');
      }
    });
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.slowT = Math.max(0, this.slowT - dt);
    if (g.player.inPocket) this.updatePocket(dt);
    let moving = false;
    switch (this.state) {
      case 'cell':
        this.body.position.y = Math.sin(this.t * 0.8) * 0.02;
        break;
      case 'sink':
        this.stateT -= dt;
        this.body.position.y = -1.9 * (1 - this.stateT / 2.2);
        if (this.stateT <= 0) {
          this.state = 'travel';
          this.stateT = this.contained ? 0 : rand(12, 22);
          this.object.visible = false;
        }
        break;
      case 'travel':
        this.stateT -= dt;
        if (this.stateT <= 0 && !this.contained && this.emergeNear()) this.object.visible = true;
        break;
      case 'emerge':
        this.stateT -= dt;
        this.body.position.y = -1.9 * Math.max(0, this.stateT / 2);
        if (this.stateT <= 0) {
          this.state = 'hunt';
          this.huntT = rand(40, 70);
        }
        break;
      case 'hunt': {
        this.body.position.y = 0;
        const near = this.nearestPerson(90);
        this.huntT -= dt;
        if (!near || this.huntT <= 0) {
          this.state = 'sink';
          this.stateT = 2.2;
          break;
        }
        const v = near.v;
        if (near.d < 0.8) {
          this.capture(v);
          break;
        }
        // Straight through walls, doors and anything else.
        const speed = (this.slowT > 0 ? 0.45 : 1.3) * dt;
        const dx = v.pos.x - this.pos.x;
        const dz = v.pos.z - this.pos.z;
        this.pos.x += (dx / near.d) * speed;
        this.pos.z += (dz / near.d) * speed;
        this.yaw = turn(this.yaw, Math.atan2(-dx, -dz), 0.2);
        moving = true;
        this.trail += speed;
        if (this.trail > 1.3) {
          this.trail = 0;
          this.corrode(this.pos.x, this.pos.z);
        }
        break;
      }
      default:
        break;
    }
    const sw = moving ? Math.sin(this.t * 3.5) * 0.35 : 0;
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * 0.5 - (moving ? 0.25 : 0);
    this.armR.rotation.x = sw * 0.5 - (moving ? 0.25 : 0);
    this.place();
  }

  get recon() {
    return {
      mode: 'terminals',
      terminals: ['recall-106'],
      requiresPower: true,
      text: 'Run the SCP-106 Recall Protocol',
      detail: 'Recall terminal outside its chamber in the Keter Sector. Needs main power. It walks through walls: keep moving.',
      actionText: 'Initiate the Recall Protocol',
      hold: 6,
      reward: 600, penalty: 120, standing: [28, 28],
      radio: 'SCP-106 is loose! It walks through walls. Get to the recall terminal outside its chamber and run the Recall Protocol!',
    };
  }
}

// ===========================================================================
// SCP-682
// ===========================================================================
const MAX_HP = 1500;

export class Scp682 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '682');
    const SK = 0x5a6a3a;
    const DK = 0x4a5a2a;
    this.body = new THREE.Group();
    this.object.add(this.body);
    this.addModel([
      [-12, 10, -20, 12, 26, 24, SK],
      [-6, 26, -16, 6, 30, 20, 0x3a4a2a],
      [-8, 12, -40, 8, 24, -20, SK],
      [-7, 8, -44, 7, 13, -24, DK],
      [-7, 13, -44.2, 7, 14, -43.8, 0xe0dcc0],
      [-7.2, 19, -36, -6.8, 21, -33, 0xd8c020, true],
      [6.8, 19, -36, 7.2, 21, -33, 0xd8c020, true],
      [-5, 14, 24, 5, 20, 48, DK],
      [-3, 15, 48, 3, 18, 60, DK],
      [-12.2, 14, -6, -11.8, 22, 10, 0x3a2a1a], [11.8, 14, -6, 12.2, 22, 10, 0x3a2a1a], // scars
    ], this.body);
    this.legs = [[-12, -12], [12, -12], [-12, 16], [12, 16]].map(([x, z]) => {
      const leg = new THREE.Group();
      leg.position.set(x / 16, 12 / 16, z / 16);
      this.addModel([[-3.5, -12, -3.5, 3.5, 2, 3.5, DK], [-4, -12, -6, 4, -10, -3.5, 0xd8d0b8]], leg);
      this.body.add(leg);
      return leg;
    });
    this.size = [1.6, 1.9];
    this.hp = MAX_HP;
    this.state = 'tank';
    this.downT = 0;
    this.biteT = 0;
    this.threat = { pos: this.pos, aimY: 1.2, keepAway: 9, scp: this, get alive() { return true; } };
    this.returnToChamber();
  }

  returnToChamber() {
    super.returnToChamber();
    this.hp = MAX_HP;
    this.state = 'tank';
    this.body.position.y = -0.55;
    this.body.rotation.z = 0;
    this.place(true);
  }

  boxes() {
    const p = this.pos;
    return [[p.x - 1.3, p.y, p.z - 1.3, p.x + 1.3, p.y + 1.9, p.z + 1.3]];
  }

  threats() {
    return this.state === 'rampage' ? [this.threat] : [];
  }

  denyAction() {
    return this.state === 'down' ? null : 'It is still fighting — knock it down first';
  }

  damage(amount, attacker) {
    if (this.state !== 'rampage') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'down';
      this.downT = 45;
      this.game.ui.toast('SCP-682 COLLAPSES. IT WILL NOT STAY DOWN FOR LONG.', false);
    }
  }

  onRelease() {
    // It climbs out over the rim of the tank.
    const t = this.chamber.tank;
    this.pos.set(((t[0] + t[2]) / 2) * VOXEL, VOXEL, (t[3] + 2.5) * VOXEL);
    this.state = 'rampage';
    this.body.position.y = 0;
    this.game.ui.pulse();
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.biteT = Math.max(0, this.biteT - dt);
    let moving = false;
    if (this.state === 'tank') {
      this.body.position.y = -0.55 + Math.sin(this.t * 0.6) * 0.04;
    } else if (this.state === 'down') {
      this.body.position.y = -0.35;
      this.body.rotation.z = 0.25;
      this.downT -= dt;
      if (this.downT <= 0) {
        this.state = 'rampage';
        this.hp = MAX_HP * 0.4;
        this.body.rotation.z = 0;
        g.ui.toast('SCP-682 IS GETTING BACK UP', true);
      }
    } else if (this.state === 'rampage') {
      this.body.position.y = 0;
      this.hp = Math.min(MAX_HP, this.hp + 6 * dt);
      const near = this.nearestPerson(90);
      if (near) {
        const v = near.v;
        // Trample anyone in the way.
        for (const n of g.npcs.values()) if (n.alive && n !== v && flat(n.pos, this.pos) < 1.0) n.damage(40 * dt, this);
        if (near.d < 2.0 && this.biteT <= 0) {
          this.biteT = 1.5;
          if (v === g.player) {
            v.damage(45, 'scp682');
            g.player.shake = 0.08;
          } else v.damage(75, this);
        } else if (near.d >= 1.6) {
          this.moveToward(dt, v.pos.x, v.pos.z, 3.3, { repath: 0.5, tearDoors: true, turn: 0.15 });
          moving = true;
        }
      }
    }
    const sw = moving ? Math.sin(this.t * 7) * 0.5 : 0;
    this.legs.forEach((l, k) => (l.rotation.x = k % 3 === 0 ? sw : -sw));
    this.place();
  }

  get recon() {
    return {
      mode: 'subdue',
      text: 'Knock SCP-682 down and restrain it',
      detail: 'It regenerates. Concentrate fire until it collapses, then hold the interaction to restrain it before it gets up (40 s).',
      actionText: 'Restrain SCP-682 for acid transfer',
      hold: 5,
      reward: 900, penalty: 150, standing: [30, 30],
      radio: 'SCP-682 is out of the tank! All units, concentrate fire. When it goes down, restrain it before it gets back up!',
      target: () => ({ x: this.pos.x, y: this.pos.y + 2.6, z: this.pos.z }),
    };
  }
}
