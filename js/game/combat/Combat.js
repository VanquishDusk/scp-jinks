// Combat: the player's weapons (melee + ranged), hitscan and melee resolution
// shared with NPCs, and visual effects (tracers, sparks, blood, bullet holes).
//
// Rules of thumb:
//   * walls, glass and closed doors stop bullets
//   * headshots on people deal extra damage
//   * batons subdue rioting Class-D instead of killing them
//   * SCP-173, SCP-096 and SCP-999 shrug off gunfire; breach anomalies can be shot

import * as THREE from 'three';
import { VOXEL } from '../../config.js';
import { WEAPONS } from './weapons.js';
import { Viewmodel } from './Viewmodel.js';

const tmpL = [0, 0, 0];
const UP = new THREE.Vector3(0, 1, 0);

/** Ray vs AABB → distance or null. */
export function rayBox(o, d, b) {
  let tmin = 0;
  let tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    const origin = a === 0 ? o.x : a === 1 ? o.y : o.z;
    const dir = a === 0 ? d.x : a === 1 ? d.y : d.z;
    const lo = b[a];
    const hi = b[a + 3];
    if (Math.abs(dir) < 1e-9) {
      if (origin < lo || origin > hi) return null;
    } else {
      let t1 = (lo - origin) / dir;
      let t2 = (hi - origin) / dir;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.view = new Viewmodel();
    this.fx = new THREE.Group();
    game.scene.add(this.fx);
    this.effects = [];
    this.holes = [];
    this.holeMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0e, polygonOffset: true, polygonOffsetFactor: -3 });
    this.reset(null);
  }

  // ---- Loadout --------------------------------------------------------------
  reset(role) {
    for (const e of this.effects) this.fx.remove(e.mesh);
    for (const h of this.holes) this.fx.remove(h);
    this.effects = [];
    this.holes = [];
    this.weapons = ['fists'];
    this.ammo = {};
    this.cooldown = 0;
    this.reloadT = 0;
    this.hitT = 0;
    this.role = role ? role.id : null;
    this.current = null;
    if (role && role.id === 'security') {
      this.weapons = ['baton', 'pistol'];
      this.ammo.pistol = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
      this.view.setHands(0x2a3040, 0xc8946c);
      this.select('pistol');
    } else {
      this.view.setHands(0xd06a20, 0xc8946c);
      this.select('fists');
    }
  }

  get def() {
    return WEAPONS[this.current];
  }

  select(id) {
    if (!this.weapons.includes(id) || this.current === id) return;
    this.current = id;
    this.reloadT = 0;
    this.cooldown = 0.25;
    this.view.show(id);
  }

  /** Pick up a weapon (or its ammunition if already carried). */
  give(id) {
    const def = WEAPONS[id];
    if (!this.weapons.includes(id)) {
      this.weapons.push(id);
      if (def.kind === 'ranged') this.ammo[id] = { mag: def.mag, reserve: Math.round(def.reserve / 3) };
      if (id !== 'fists' && this.weapons.includes('fists') && def.kind === 'melee') this.weapons = this.weapons.filter((w) => w !== 'fists');
      this.weapons.sort((a, b) => WEAPONS[a].slot - WEAPONS[b].slot);
      if (this.role === 'classd' && def.kind === 'ranged') {
        // Kept out of sight: guards shoot a Class-D who has a gun drawn.
        this.game.ui.notify({ type: 'optional', title: `${def.name.toUpperCase()} (HIDDEN)`, text: `Press ${def.slot} to draw it.`, sub: 'Guards open fire on an armed Class-D.' });
        return `PICKED UP: ${def.name.toUpperCase()} — HIDDEN`;
      }
      this.select(id);
      return `PICKED UP: ${def.name.toUpperCase()}`;
    }
    if (def.kind === 'ranged') {
      this.ammo[id].reserve += def.mag;
      return `+${def.mag} ${def.name.toUpperCase()} ROUNDS`;
    }
    return null;
  }

  /** Remove a weapon (e.g. fed into SCP-914). Falls back to fists. */
  take(id) {
    if (!this.weapons.includes(id) || id === 'fists') return false;
    this.weapons = this.weapons.filter((w) => w !== id);
    delete this.ammo[id];
    if (!this.weapons.some((w) => WEAPONS[w].kind === 'melee')) this.weapons.unshift('fists');
    if (this.current === id) {
      this.current = null;
      this.select(this.weapons[0]);
    }
    return true;
  }

  restock() {
    for (const id of this.weapons) {
      const def = WEAPONS[id];
      if (def.kind === 'ranged') this.ammo[id] = { mag: def.mag, reserve: def.reserve };
    }
  }

  get armedRanged() {
    return this.weapons.some((w) => WEAPONS[w].kind === 'ranged');
  }

  cycle(dir) {
    const i = this.weapons.indexOf(this.current);
    this.select(this.weapons[(i + dir + this.weapons.length) % this.weapons.length]);
  }

  hud() {
    const def = this.def;
    const a = this.ammo[this.current];
    if (this.game.player.handsGone) return { name: 'NO HANDS', ammo: '', reloading: 0, hit: false };
    return { name: def.name, ammo: a ? `${a.mag} / ${a.reserve}` : '', reloading: this.reloadT > 0 ? 1 - this.reloadT / def.reload : 0, hit: this.hitT > 0 };
  }

  // ---- Player update -----------------------------------------------------------
  update(dt, input) {
    const g = this.game;
    const p = g.player;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.hitT = Math.max(0, this.hitT - dt);
    if (!p.dead && input) {
      const slot = input.weaponSlot();
      if (slot) {
        const id = this.weapons.find((w) => WEAPONS[w].slot === slot) || this.weapons[slot - 1];
        if (id) this.select(id);
      }
      const cyc = input.weaponCycle();
      if (cyc) this.cycle(cyc);

      const def = this.def;
      const ammo = this.ammo[this.current];
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0 && ammo) {
          const need = def.mag - ammo.mag;
          const take = Math.min(need, ammo.reserve);
          ammo.mag += take;
          ammo.reserve -= take;
        }
      } else if (def.kind === 'ranged' && input.reloadPressed() && ammo && ammo.mag < def.mag && ammo.reserve > 0) {
        this.reloadT = def.reload;
        this.view.reload(def.reload);
      }

      const wantFire = (def.auto ? input.attackHeld() : input.attackPressed()) && p.carrying !== 'crate' && !p.handsGone;
      if (wantFire && this.cooldown <= 0 && this.reloadT <= 0) {
        if (def.kind === 'melee') this.playerMelee(def);
        else if (ammo && ammo.mag > 0) this.playerShoot(def, ammo);
        else if (ammo && ammo.reserve > 0) {
          this.reloadT = def.reload;
          this.view.reload(def.reload);
        } else {
          this.cooldown = 0.3;
          g.ui.toast('OUT OF AMMUNITION', true);
        }
      }
    }
    this.updateEffects(dt);
    g.world.sampleLight(p.pos.x, p.pos.y + 1.4, p.pos.z, tmpL);
    this.view.root.visible = !p.dead && !p.handsGone;
    this.view.update(dt, g.camera, p, tmpL);
  }

  playerShoot(def, ammo) {
    const g = this.game;
    const p = g.player;
    ammo.mag--;
    this.cooldown = def.rate;
    this.view.kick(def.id === 'rifle' ? 0.7 : 1);
    // Recoil climbs the view a little.
    p.pitch = Math.min(Math.PI / 2 - 0.02, p.pitch + (def.id === 'rifle' ? 0.012 : 0.022));
    const cam = g.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const moving = Math.hypot(p.vel.x, p.vel.z);
    const spread = def.spread * (1 + moving * 0.35) * (p.crouching ? 0.6 : 1);
    this.jitter(dir, spread);
    const origin = cam.position.clone();
    g.makeNoise(p.pos.x, p.pos.z, 32);
    const hit = this.trace(origin, dir, def.range, p);
    const muzzle = new THREE.Vector3(0.1, -0.07, -0.5).applyQuaternion(cam.quaternion).add(origin);
    this.tracer(muzzle, hit.point, 0xffe08a);
    this.applyHit(hit, def.damage, p, { dir });
  }

  playerMelee(def) {
    const g = this.game;
    const p = g.player;
    this.cooldown = def.cooldown;
    this.view.swing(Math.min(0.32, def.cooldown * 0.8));
    const cam = g.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const hit = this.meleeTrace(cam.position, dir, def.range, p);
    if (hit) this.applyHit(hit, def.damage, p, { melee: def, dir });
  }

  jitter(dir, spread) {
    const r = Math.sqrt(Math.random()) * spread;
    const a = Math.random() * Math.PI * 2;
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    const up = new THREE.Vector3().crossVectors(side, dir).normalize();
    dir.addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
  }

  // ---- Hit resolution -------------------------------------------------------------
  /** Everything a bullet might hit, nearest first. */
  trace(origin, dir, range, ignore) {
    const g = this.game;
    let best = { kind: 'none', dist: range, point: origin.clone().addScaledVector(dir, range) };
    const wd = g.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
    if (wd < best.dist) best = { kind: 'world', dist: wd, normal: g.world.lastNormal && g.world.lastNormal.slice() };
    for (const d of g.doors) {
      if (!d.blocking || Math.abs(d.origin.x - origin.x) > range || Math.abs(d.origin.z - origin.z) > range) continue;
      for (const c of d.colliders) {
        const t = rayBox(origin, dir, c);
        if (t !== null && t < best.dist) best = { kind: 'door', dist: t, target: d };
      }
    }
    const consider = (kind, target, box) => {
      const t = rayBox(origin, dir, box);
      if (t !== null && t < best.dist && t > 0.05) best = { kind, dist: t, target };
    };
    for (const n of g.npcs.values()) if (n.alive && n !== ignore) consider('npc', n, n.aabb());
    if (g.player !== ignore && !g.player.dead) consider('player', g.player, g.player.aabb());
    for (const a of g.events.anomalies) {
      if (!a.alive) continue;
      const p = a.pos;
      consider('anomaly', a, [p.x - 0.35, p.y - 0.35, p.z - 0.35, p.x + 0.35, p.y + 0.35, p.z + 0.35]);
    }
    for (const e of g.scps.entities.values()) for (const b of e.boxes()) consider('scp', e, b);
    best.point = origin.clone().addScaledVector(dir, best.dist);
    if (best.kind === 'npc' || best.kind === 'player') best.headshot = best.point.y > best.target.pos.y + (best.kind === 'player' ? best.target.height - 0.32 : 1.45);
    return best;
  }

  /** Closest thing in front within melee reach. */
  meleeTrace(origin, dir, range, attacker) {
    const g = this.game;
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    let best = null;
    let bd = range;
    const consider = (kind, target, pos) => {
      const dx = pos.x - origin.x;
      const dz = pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > bd || d < 0.01) return;
      if ((dx * flat.x + dz * flat.z) / d < 0.55) return;
      if (g.doorBlocksLine(origin.x, origin.z, pos.x, pos.z)) return;
      bd = d;
      best = { kind, target, dist: d, point: new THREE.Vector3(pos.x, origin.y - 0.25, pos.z) };
    };
    for (const n of g.npcs.values()) if (n.alive && n !== attacker) consider('npc', n, n.pos);
    if (g.player !== attacker && !g.player.dead) consider('player', g.player, g.player.pos);
    for (const a of g.events.anomalies) if (a.alive) consider('anomaly', a, a.pos);
    for (const e of g.scps.entities.values()) {
      consider('scp', e, e.pos);
      for (const t of e.threats()) consider('scp', e, t.pos);
    }
    return best;
  }

  applyHit(hit, damage, attacker, opts = {}) {
    const g = this.game;
    const melee = opts.melee;
    const byPlayer = attacker === g.player;
    switch (hit.kind) {
      case 'npc': {
        const n = hit.target;
        // Stuns cannot chain forever: a short window of immunity after each one.
        const stun = (s) => {
          if (g.time < (n.stunReadyAt || 0)) return;
          n.stunT = s;
          n.stunReadyAt = g.time + s + 0.9;
        };
        if (melee && melee.subdue && n.rioting) {
          n.subdueHits = (n.subdueHits || 0) + 1;
          n.stunT = Math.max(n.stunT, 0.6);
          this.blood(hit.point, 2);
          if (n.subdueHits >= (byPlayer ? 2 : 3)) {
            g.director.sendToCell(n);
            n.chatter = ['Okay! Okay! I am going!'];
            if (byPlayer) g.ui.toast(`${n.name.toUpperCase()} SUBDUED`, false);
          }
          if (byPlayer) this.hitT = 0.15;
          return;
        }
        const dmg = damage * (hit.headshot ? 2.2 : 1);
        const wasAlive = n.alive;
        n.damage(dmg, attacker);
        if (melee) stun(melee.stun);
        this.blood(hit.point, hit.headshot ? 6 : 3);
        if (byPlayer) this.hitT = 0.15;
        if (g.director && g.director.onAttack) g.director.onAttack(attacker, n, dmg, wasAlive && !n.alive);
        break;
      }
      case 'player': {
        const dmg = damage * (hit.headshot ? 1.6 : 1);
        g.player.damage(dmg, melee ? 'beaten' : 'shot');
        this.blood(hit.point, 2);
        break;
      }
      case 'anomaly': {
        const a = hit.target;
        a.hp = (a.hp ?? 80) - damage;
        a.hitT = 0.08;
        this.spark(hit.point, 0xff5080);
        if (byPlayer) this.hitT = 0.15;
        if (a.hp <= 0 && a.alive) {
          a.dissipate();
          if (byPlayer) g.ui.toast('ANOMALY DISPERSED', false);
        }
        break;
      }
      case 'scp': {
        const e = hit.target;
        if (e.damage && !e.contained) {
          e.damage(damage * (melee ? 0.35 : 1), attacker, hit.point);
          this.blood(hit.point, 2);
          if (byPlayer) this.hitT = 0.15;
          break;
        }
        this.spark(hit.point, 0xd0d0c8);
        if (byPlayer && this.scpWarned !== e.id) {
          this.scpWarned = e.id;
          const msg = {
            '173': 'BULLETS CHIP CONCRETE. IT DOES NOT CARE.',
            '096': 'IT DOES NOT EVEN FLINCH.',
            '999': 'IT GIGGLES AND ABSORBS THE ROUND.',
            '914': 'THE ROUND RICOCHETS OFF BRASS GEARS.',
            '079': 'YOU SHOOT THE MONITOR. THE FACE KEEPS GRINNING.',
          }[e.id] || 'NO EFFECT';
          g.ui.toast(msg, true);
        }
        break;
      }
      case 'world': {
        this.spark(hit.point, 0xffe0a0);
        if (hit.normal) this.bulletHole(hit.point, hit.normal);
        break;
      }
      case 'door':
        this.spark(hit.point, 0xffe0a0);
        break;
      default:
        break;
    }
  }

  // ---- NPC weapons ------------------------------------------------------------------
  /** An NPC fires at a target (player, NPC or anomaly). */
  npcFire(npc, target, weaponId = 'pistol') {
    const g = this.game;
    const def = WEAPONS[weaponId];
    const fwd = new THREE.Vector3(-Math.sin(npc.yaw), 0, -Math.cos(npc.yaw));
    const muzzle = new THREE.Vector3(npc.pos.x, npc.pos.y + 1.35, npc.pos.z).addScaledVector(fwd, 0.45);
    const aimY = target === g.player ? target.pos.y + target.height * 0.72 : target.aimY != null ? target.pos.y + target.aimY : target.kind ? target.pos.y + 1.2 : target.pos.y;
    const aim = new THREE.Vector3(target.pos.x, aimY, target.pos.z);
    const dist = muzzle.distanceTo(aim);
    const dir = aim.sub(muzzle).normalize();
    let spread = (npc.mtf ? 0.03 : 0.055) + dist * 0.0025;
    if (target === g.player) {
      spread += Math.hypot(g.player.vel.x, g.player.vel.z) * 0.012;
      if (g.player.crouching) spread *= 0.85;
    }
    this.jitter(dir, spread);
    g.makeNoise(npc.pos.x, npc.pos.z, 32);
    const hit = this.trace(muzzle, dir, def.range, npc);
    npc.flashT = 0.06;
    this.tracer(muzzle, hit.point, 0xffd060);
    this.applyHit(hit, def.damage * (npc.mtf ? 0.9 : 0.75), npc, { dir });
    return hit;
  }

  npcMelee(npc, target, weaponId = 'baton') {
    const def = WEAPONS[weaponId];
    const hit = { kind: target === this.game.player ? 'player' : target.kind ? 'npc' : 'anomaly', target, point: new THREE.Vector3(target.pos.x, target.pos.y + 1.2, target.pos.z) };
    npc.swingT = 0.3;
    this.applyHit(hit, def.damage * 0.6, npc, { melee: def });
  }

  /** A guard's weapon falls to the floor when they die. */
  dropWeapon(id, pos) {
    this.game.addPickup({ id: `drop-${id}`, kind: 'weapon', weapon: id, x: pos.x + 0.3, y: 0.55, z: pos.z, name: WEAPONS[id].name, onPickup: () => this.give(id) || `${WEAPONS[id].name.toUpperCase()} — NOTHING NEW` });
  }

  // ---- Effects ----------------------------------------------------------------------------
  addEffect(mesh, life, update) {
    this.fx.add(mesh);
    this.effects.push({ mesh, life, t: 0, update });
  }

  tracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
    this.addEffect(line, 0.05);
  }

  spark(point, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(point);
    this.addEffect(m, 0.18, (e, k) => m.scale.setScalar(1 - k));
  }

  blood(point, n) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x8a1010 }));
      m.position.copy(point);
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2);
      this.addEffect(m, 0.5, (e, k, dt) => {
        v.y -= 9 * dt;
        m.position.addScaledVector(v, dt);
        if (m.position.y < VOXEL + 0.02) m.position.y = VOXEL + 0.02;
      });
    }
  }

  bulletHole(point, normal) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), this.holeMat);
    const n = new THREE.Vector3(normal[0], normal[1], normal[2]);
    m.position.copy(point).addScaledVector(n, 0.004);
    m.lookAt(m.position.clone().add(n));
    this.fx.add(m);
    this.holes.push(m);
    if (this.holes.length > 80) this.fx.remove(this.holes.shift());
  }

  updateEffects(dt) {
    this.effects = this.effects.filter((e) => {
      e.t += dt;
      if (e.update) e.update(e, Math.min(1, e.t / e.life), dt);
      if (e.t >= e.life) {
        this.fx.remove(e.mesh);
        e.mesh.geometry.dispose();
        return false;
      }
      return true;
    });
  }
}
