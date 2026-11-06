// The site's SCP collection (tycoon layer).
//
//   * Owned SCPs persist across shifts (Profile.scps) and live in the six
//     chambers of the Heavy Containment Wing.
//   * Buying one (procurement terminal / black market) schedules a transport;
//     it arrives in its chamber during the shift.
//   * Contained SCPs pay Security research grants every minute.
//   * Containment integrity decays (faster for dangerous SCPs). Containment
//     checks restore it; at zero the SCP breaches.
//   * Observation rules (who is looking at what) live here, for SCP-173.

import * as THREE from 'three';
import { VOXEL } from '../../config.js';
import { CATALOG, CATALOG_ORDER, BLACK_MARKET_MARKUP } from './catalog.js';
import { Scp173 } from './Scp173.js';
import { Scp500, Scp999 } from './SimpleScps.js';
import { Scp096 } from './Scp096.js';

const CLASSES = { '173': Scp173, '500': Scp500, '999': Scp999, '096': Scp096 };

export class ScpManager {
  constructor(game) {
    this.game = game;
    this.entities = new Map();
    this.deliveries = [];
    this.integrity = new Map();
    this.frustum = new THREE.Frustum();
    this.m = new THREE.Matrix4();
    this.statusT = 0;
    this.incomeT = 60;
    this.reactT = 0;
    this.blinkRelevant = false;
  }

  get chambers() {
    return this.game.builder.chambers;
  }

  chamberFor(slot) {
    return this.chambers.find((c) => c.slot === slot);
  }

  /** Rebuild the collection for a new shift (or the main menu). */
  reset(spawn = true) {
    for (const e of this.entities.values()) this.game.scene.remove(e.object);
    this.entities.clear();
    this.deliveries = [];
    this.integrity.clear();
    this.pillUsed = false;
    this.incomeT = 60;
    if (!spawn) return;
    for (const s of this.game.profile.scps) {
      this.spawn(s.id, s.slot);
      this.integrity.set(s.id, 65 + Math.random() * 35);
    }
    this.photo = null;
    if (this.entities.has('096') && Math.random() < 0.4) this.spawnPhotograph();
    this.refreshTerminals();
  }

  /** A careless researcher left a photo of SCP-096 lying on a desk. */
  spawnPhotograph() {
    const g = this.game;
    const ids = ['loose-breakroom', 'loose-records', 'loose-admin', 'loose-medical', 'loose-cafeteria', 'doc-records', 'doc-admin'];
    const p = g.point(ids[Math.floor(Math.random() * ids.length)]);
    this.photo = g.addPickup({
      id: 'photo-096',
      kind: 'document',
      x: p.x,
      y: 1.27,
      z: p.z,
      name: 'Unmarked Photograph',
      onPickup: (gm) => {
        const e = this.entities.get('096');
        gm.ui.toast('YOU TURN THE PHOTO OVER. A FACE. ITS FACE.', true);
        if (e) e.enrage(gm.player, 'photo');
      },
    });
    this.photo.action.text = 'Look at the photograph';
  }

  /** Camera feed on a chamber terminal: harmless — except for one SCP. */
  feedAction(e) {
    return {
      feed: true,
      text: 'View the chamber camera feed',
      hold: 1,
      use: (gm) => {
        if (e.id === '096' && e.state === 'docile') {
          e.enrage(gm.player, 'feed');
          return { ok: false, message: 'FEED: IT LIFTS ITS HEAD. IT IS LOOKING AT THE CAMERA.' };
        }
        return { ok: true, message: `FEED: ${e.name} — ${e.contained ? 'IN CHAMBER, STATIONARY' : 'CHAMBER EMPTY'}` };
      },
    };
  }

  spawn(id, slot) {
    const chamber = this.chamberFor(slot);
    const Cls = CLASSES[id];
    if (!chamber || !Cls) return null;
    const e = new Cls(this.game, chamber);
    this.entities.set(id, e);
    this.game.scene.add(e.object);
    const t = this.game.terminals.get(chamber.terminal);
    if (t && !t.action) t.action = this.feedAction(e);
    return e;
  }

  freeSlot() {
    const used = new Set([...this.game.profile.scps.map((s) => s.slot)]);
    const c = this.chambers.find((ch) => !used.has(ch.slot));
    return c ? c.slot : null;
  }

  price(id, mode) {
    const base = CATALOG[id].price;
    return mode === 'classd' ? Math.round(base * BLACK_MARKET_MARKUP) : base;
  }

  /** Shop listing for the UI. */
  listing(mode) {
    const credits = this.game.profile.credits;
    const free = this.freeSlot();
    return CATALOG_ORDER.map((id) => CATALOG[id]).map((c) => {
      const owned = this.game.profile.owns(c.id);
      const price = this.price(c.id, mode);
      let status = 'buy';
      if (owned) status = 'owned';
      else if (free === null) status = 'full';
      else if (credits < price) status = 'poor';
      return { ...c, price, status, integrity: owned ? Math.round(this.integrity.get(c.id) ?? 100) : null };
    });
  }

  buy(id, mode) {
    const g = this.game;
    const c = CATALOG[id];
    const price = this.price(id, mode);
    if (g.profile.owns(id)) return { ok: false, message: `${c.name} IS ALREADY IN CONTAINMENT` };
    const slot = this.freeSlot();
    if (slot === null) return { ok: false, message: 'NO FREE CONTAINMENT CHAMBER' };
    if (g.profile.credits < price) return { ok: false, message: 'INSUFFICIENT CREDITS' };
    g.profile.addCredits(-price);
    g.ui.setCredits(g.profile.credits, -price);
    g.tasks.spent += price;
    g.profile.addScp(id, slot);
    const ch = this.chamberFor(slot);
    this.deliveries.push({ id, slot, t: 35 + Math.random() * 20 });
    g.say(
      mode === 'classd' ? 'CONTACT (TEXT)' : 'PROCUREMENT',
      mode === 'classd'
        ? `Paperwork forged. ${c.name} gets "transferred" to ${ch.name} within the hour. Nobody will trace it to you.`
        : `Acquisition approved. ${c.name} is being transported to ${ch.name}.`,
      mode === 'classd' ? 'radio' : 'radio',
    );
    return { ok: true, message: `${c.name} PURCHASED — ${price} CR` };
  }

  totalIncome() {
    let n = 0;
    for (const e of this.entities.values()) if (e.contained) n += CATALOG[e.id].income;
    return n;
  }

  /** Weight for a breach event in the random event scheduler. */
  breachWeight() {
    let w = 0;
    for (const e of this.entities.values()) {
      if (!e.contained) continue;
      const c = CATALOG[e.id];
      const integ = this.integrity.get(e.id) ?? 100;
      w += c.risk * (integ < 40 ? 2.5 : integ < 70 ? 1.5 : 1);
    }
    return w;
  }

  pickBreachCandidate() {
    const list = [...this.entities.values()].filter((e) => e.contained && CATALOG[e.id].risk > 0);
    if (!list.length) return null;
    let total = list.reduce((s, e) => s + CATALOG[e.id].risk * (2 - (this.integrity.get(e.id) ?? 100) / 100), 0);
    let r = Math.random() * total;
    for (const e of list) {
      r -= CATALOG[e.id].risk * (2 - (this.integrity.get(e.id) ?? 100) / 100);
      if (r <= 0) return e.id;
    }
    return list[0].id;
  }

  restoreIntegrity(id) {
    this.integrity.set(id, 100);
    this.refreshTerminals();
  }

  // ---- Breach / recontainment -------------------------------------------------
  release(id) {
    const e = this.entities.get(id);
    if (!e) return null;
    e.contained = false;
    const door = this.game.doorsById.get(e.chamber.door);
    if (door) {
      door.released = true;
      door.open();
      door.refreshLed();
    }
    const wing = this.game.doorsById.get('hcz-wing');
    if (wing) wing.open();
    const t = this.game.terminals.get(e.chamber.terminal);
    if (t) t.setStatus('alert', `${e.name} BREACH`);
    if (e.onRelease) e.onRelease();
    return e;
  }

  recontain(id) {
    const e = this.entities.get(id);
    if (!e) return;
    e.action = null;
    e.returnToChamber();
    const door = this.game.doorsById.get(e.chamber.door);
    if (door) {
      door.released = false;
      if (!door.intersectsOpening(this.game.player.aabb())) door.close();
      door.refreshLed();
    }
    this.integrity.set(id, 80);
    this.refreshTerminals();
  }

  // ---- Observation --------------------------------------------------------------
  /** Is the player looking at any of these points right now? */
  playerSees(points) {
    const g = this.game;
    const p = g.player;
    if (p.dead || p.eyesClosed) return false;
    const cam = g.camera;
    cam.updateMatrixWorld();
    this.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    const eye = cam.position;
    for (const pt of points) {
      if (!this.frustum.containsPoint(pt)) continue;
      const d = eye.distanceTo(pt);
      if (g.events.powerOut && d > 5) continue; // too dark to see it
      if (g.doorBlocksLine(eye.x, eye.z, pt.x, pt.z)) continue;
      if (g.world.visible(eye.x / VOXEL, eye.y / VOXEL, eye.z / VOXEL, pt.x / VOXEL, pt.y / VOXEL, pt.z / VOXEL)) return true;
    }
    return false;
  }

  npcSees(n, pt) {
    if (!n.alive || n.blinking) return false;
    const dx = pt.x - n.pos.x;
    const dz = pt.z - n.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 16 || d < 0.01) return false;
    const fx = -Math.sin(n.yaw);
    const fz = -Math.cos(n.yaw);
    if ((fx * dx + fz * dz) / d < 0.55) return false;
    if (this.game.events.powerOut && d > 5) return false;
    if (this.game.doorBlocksLine(n.pos.x, n.pos.z, pt.x, pt.z)) return false;
    return this.game.world.visible(n.pos.x / VOXEL, 3.3, n.pos.z / VOXEL, pt.x / VOXEL, pt.y / VOXEL, pt.z / VOXEL);
  }

  /** Everyone who can see SCP-096's face right now. */
  faceViewers(e) {
    const g = this.game;
    const face = e.facePoint();
    const out = [];
    const p = g.player;
    if (!p.dead && !p.eyesClosed && e.faces(p.pos.x, p.pos.z) && this.playerSees([face])) out.push(p);
    for (const n of g.npcs.values()) {
      if (!n.alive || n.eyesDown || !e.faces(n.pos.x, n.pos.z)) continue;
      if (this.npcSees(n, face)) out.push(n);
    }
    return out;
  }

  onPlayerTargeted(e, how) {
    const msg = { feed: 'YOU SAW ITS FACE ON THE FEED', photo: 'YOU SAW ITS FACE IN THE PHOTO', direct: 'YOU SAW ITS FACE' }[how] || 'YOU SAW ITS FACE';
    this.game.ui.toast(msg, true);
  }

  isObserved(e) {
    const pts = e.lookPoints();
    if (this.playerSees(pts)) return true;
    for (const n of this.game.npcs.values()) if (this.npcSees(n, pts[0])) return true;
    return false;
  }

  // ---- Terminals ------------------------------------------------------------------
  refreshTerminals() {
    for (const ch of this.chambers) {
      const t = this.game.terminals.get(ch.terminal);
      if (!t || (t.action && !t.action.feed)) continue;
      const owned = this.game.profile.scps.find((s) => s.slot === ch.slot);
      const e = owned && this.entities.get(owned.id);
      if (!owned) t.setStatus('idle', 'CHAMBER AVAILABLE');
      else if (!e) t.setStatus('active', `${CATALOG[owned.id].name} IN TRANSIT`);
      else if (!e.contained) t.setStatus('alert', `${e.name} BREACH`);
      else {
        const integ = Math.round(this.integrity.get(e.id) ?? 100);
        t.setStatus(integ < 40 ? 'alert' : 'idle', `${e.name} INTEGRITY ${integ}%`);
      }
    }
  }

  // ---- Frame update -----------------------------------------------------------------
  update(dt) {
    const g = this.game;
    for (const d of this.deliveries) {
      d.t -= dt;
      if (d.t <= 0 && !d.done) {
        d.done = true;
        const e = this.spawn(d.id, d.slot);
        this.integrity.set(d.id, 100);
        if (e) g.say('SITE INTERCOM', `${e.name} has been transferred into ${e.chamber.name}. Containment procedures are now in effect.`, 'pa', 6);
      }
    }
    this.deliveries = this.deliveries.filter((d) => !d.done);

    for (const e of this.entities.values()) e.update(dt);

    // Integrity decays while contained; at zero the SCP breaks out.
    for (const e of this.entities.values()) {
      if (!e.contained) continue;
      const decay = CATALOG[e.id].decay;
      if (!decay) continue;
      const v = Math.max(0, (this.integrity.get(e.id) ?? 100) - (decay / 60) * dt);
      this.integrity.set(e.id, v);
      if (v <= 0 && !g.events.busy && g.director && g.director.started) {
        this.integrity.set(e.id, 25);
        g.events.start('scp', { scp: e.id });
      }
    }

    // Research grants for Security.
    if (g.role && g.role.id === 'security' && g.director && g.director.started) {
      this.incomeT -= dt;
      if (this.incomeT <= 0) {
        this.incomeT = 60;
        const n = this.totalIncome();
        if (n > 0) g.tasks.award(n, 'Research grants');
      }
    }

    this.statusT -= dt;
    if (this.statusT <= 0) {
      this.statusT = 1;
      this.refreshTerminals();
    }

    // A loose SCP always becomes a facility event (alarms, grid, recontainment).
    if (g.director && g.director.started && !g.events.busy) {
      for (const e of this.entities.values()) {
        if (!e.contained) {
          g.events.start('scp', { scp: e.id });
          break;
        }
      }
    }

    // SCP-096: the hunted warning and screen shake while it screams.
    let hunted = null;
    const s096 = this.entities.get('096');
    if (s096 && s096.targets.includes(g.player) && !g.player.dead) {
      hunted = s096.state === 'distress' ? 'IT IS SCREAMING. RUN.' : 'SCP-096 IS COMING FOR YOU';
      g.player.shake = s096.state === 'distress' ? 0.05 : 0.02;
    }
    g.ui.setHunted(hunted);

    // Blink meter matters when SCP-173 is close.
    const s173 = this.entities.get('173');
    const p = g.player.pos;
    this.blinkRelevant = !!s173 && Math.hypot(s173.pos.x - p.x, s173.pos.z - p.z) < 26;

    // People react to a loose SCP-173: guards stare it down, others run.
    this.reactT -= dt;
    if (s173 && !s173.contained && this.reactT <= 0) {
      this.reactT = 0.4;
      const head = s173.lookPoints()[0];
      for (const n of g.npcs.values()) {
        if (!n.alive || n.pursuing) continue;
        const d = Math.hypot(n.pos.x - s173.pos.x, n.pos.z - s173.pos.z);
        if (d > 14) continue;
        const los = !g.doorBlocksLine(n.pos.x, n.pos.z, head.x, head.z) && g.world.visible(n.pos.x / VOXEL, 3.3, n.pos.z / VOXEL, head.x / VOXEL, head.y / VOXEL, head.z / VOXEL);
        if (!los) continue;
        if (n.kind === 'guard') continue; // officers follow the watch protocol (GuardAI)
        if (!n.fleeing) {
          n.fleeing = true;
          const e = g.point('evac');
          n.stop();
          n.goTo(e.x, e.z, { speed: 3 });
        }
      }
    }
  }
}
