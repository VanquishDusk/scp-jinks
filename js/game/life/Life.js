// The life simulation: makes the facility feel inhabited.
//
// Each person (see roster.js) has needs — energy, hunger, company, curiosity —
// that drift over the shift, a job, and hidden traits. When they are free
// they pick something to do: work at their desk or post, get coffee, eat
// lunch, nap on the break-room couch, sneak a cigarette, stare through an
// observation window, chat with a colleague, mop a corridor, fix a server...
// They walk to an activity spot, take a pose, hold an item and talk.
//
// Personality never shows as text; it shows as behaviour: lazy guards leave
// their posts, chatty researchers stop everyone, cowards hide first and come
// out last, cruel guards shove Class-D, kind ones slip them food, honest staff
// report a Class-D out of bounds, corrupt ones don't.
//
// The life sim only drives people nobody else needs: scripts, tasks, the
// guard AI, experiments and conversations with the player all take priority.

import { VOXEL } from '../../config.js';
import { SLOTS, ensureRoster, getTie, bumpTie, remember } from './roster.js';
import { buildSpots } from './spots.js';
import { voiceOf, pick, chance, rand, clamp01 } from './traits.js';
import * as L from './lines.js';
import { Experiments } from './experiments.js';
import { Talk, prettyZone } from './talk.js';

const HOUR = 900 / 8; // game seconds per site hour (the shift is 06:00–14:00)
const SNAP = new Set(['sit', 'type', 'eat', 'cards', 'lie', 'nap', 'sleepsit']);
const BREAKS = new Set(['coffee', 'eat', 'smoke', 'wander', 'observe', 'commons', 'rest', 'social', 'listen', 'nap']);
const SAFE = new Set([
  'RESEARCH OFFICES', 'RECORDS OFFICE', 'ADMINISTRATION OFFICES', 'MEDICAL BAY', 'STAFF BREAK ROOM', 'SERVER ROOM', 'KITCHEN',
  'LCZ LOUNGE', 'LCZ SECURITY POST', 'LCZ RESEARCH LAB', 'HCZ SECURITY POST', 'KETER OBSERVATION', 'KETER SECURITY POST', 'ARCHIVE',
  'SECURITY OFFICE', 'EUCLID RECORDS', 'ADMINISTRATION LOBBY',
]);
const DBLOCK = ['D-CLASS CONTAINMENT BLOCK', 'D-BLOCK COMMONS', 'D-BLOCK WASHROOM'];
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Work spot preferences per job: [type, weight]. */
const WORK = {
  research: [['desk', 3], ['lab', 2], ['board', 1], ['files', 1], ['terminal', 0.6], ['window', 0.6]],
  records: [['files', 3], ['desk', 2]],
  errands: [['files', 2], ['desk', 1], ['terminal', 1], ['lab', 1]],
  psych: [['commons', 3], ['desk', 1]],
  medical: [['tend', 3], ['desk', 2], ['files', 1]],
  office: [['desk', 4], ['files', 1], ['terminal', 1]],
  tech: [['server', 3], ['terminal', 2]],
  cook: [['cook', 3], ['counter', 2]],
};

export class Life {
  constructor(game) {
    this.game = game;
    this.people = [];
    this.spots = null;
    this.timers = [];
    this.gen = 0;
    this.convos = [];
    this.time = 0;
    this.experiments = new Experiments(this);
    this.talk = new Talk(this);
    this.zonePts = null;
    this.reset();
  }

  get profile() {
    return this.game.profile;
  }

  get hour() {
    const d = this.game.director;
    return 6 + (d ? d.clock : 0) / HOUR;
  }

  // ---- Lifecycle ----------------------------------------------------------------
  reset() {
    this.gen++;
    const old = this.timers;
    this.timers = [];
    for (const t of old) t.rej('abort');
    this.people = [];
    this.convos = [];
    this.bodies = [];
    this.alarmed = false;
    this.lastEvent = null;
    this.thinkT = 0;
    this.greetT = 0;
    this.socialT = 0;
    this.watchT = 0;
    this.approachT = 0;
    this.reportT = 0;
    this.pathBudget = 0;
    this.evidence = new Set();
    if (this.spots) for (const s of this.spots) s.user = s.owner = null;
    this.experiments.reset();
    this.talk.reset();
  }

  /** Spawn everyone on the roster for a new shift. */
  populate() {
    const g = this.game;
    if (!this.spots) {
      this.spots = buildSpots(g);
      this.buildZonePoints();
    }
    const { newHires, gone } = ensureRoster(this.profile);
    this.newHires = newHires;
    this.gone = gone;
    const shift = this.profile.shifts;
    const playerCell = g.role && g.role.id === 'classd' && g.spawn ? g.spawn.cell : null;
    for (const def of SLOTS) {
      const person = this.profile.staff[def.slot];
      // Things that only last a shift.
      for (const k of ['approached', 'smalltalk', 'fed', 'asked', 'helpedPlayer', 'traded', 'scolded']) delete person.flags[k];
      if (person.flags.grieving && shift - (person.flags.griefShift ?? shift) > 2) {
        delete person.flags.grieving;
        delete person.flags.comforted;
      }
      // A Class-D player has their own cell; its usual occupant was moved.
      if (def.kind === 'classd' && playerCell && g.spawns.classd[def.cell % g.spawns.classd.length].cell === playerCell) continue;
      let x;
      let z;
      let yaw = 0;
      if (def.kind === 'classd') {
        const c = g.spawns.classd[def.cell % g.spawns.classd.length];
        x = c.x + 0.6;
        z = c.z;
        yaw = (c.yaw * 180) / Math.PI;
      } else {
        const p = g.builder.points[def.at];
        x = p.x;
        z = p.z;
        yaw = p.yaw || 0;
      }
      const npc = g.spawnNpc({ id: def.slot, name: person.name, title: def.title, kind: def.kind, x, z, yaw, clearance: def.clearance, chatter: [] });
      npc.person = person;
      npc.def = def;
      npc.life = {
        needs: { energy: rand(0.55, 1), hunger: rand(0, 0.35), social: rand(0.3, 0.9), fun: rand(0.3, 0.9) },
        act: null,
        next: rand(0.5, 4),
        cd: {},
        blocked: new Map(),
        own: {},
        greetT: 0,
      };
      this.people.push(npc);
    }
    this.experiments.start();
  }

  /** Walkable sample points per zone (for wandering, mopping, pacing). */
  buildZonePoints() {
    const g = this.game;
    const nav = g.nav;
    this.zonePts = new Map();
    for (let cz = 1; cz < nav.d; cz += 2) {
      for (let cx = 1; cx < nav.w; cx += 2) {
        if (!nav.isWalkable(cx, cz)) continue;
        const x = (cx + 0.5) * VOXEL;
        const z = (cz + 0.5) * VOXEL;
        const room = g.builder.rooms[g.world.roomAtWorld(x, VOXEL + 0.4, z)];
        const zone = room && room.zone;
        if (!zone) continue;
        if (!this.zonePts.has(zone)) this.zonePts.set(zone, []);
        this.zonePts.get(zone).push([x, z]);
      }
    }
  }

  zonePoint(zones) {
    const list = zones.map((z) => this.zonePts.get(z)).filter(Boolean);
    if (!list.length) return null;
    return pick(pick(list));
  }

  // ---- Scripting helpers (used by experiments and plots) --------------------------------
  wait(sec) {
    return new Promise((res, rej) => this.timers.push({ at: this.time + sec, res, rej }));
  }

  runTimers() {
    if (!this.timers.length) return;
    const due = this.timers.filter((t) => t.at <= this.time);
    if (!due.length) return;
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const t of due) t.res();
  }

  /** Take someone out of the life sim (experiments, plots). */
  take(n, tag) {
    this.drop(n);
    n.engaged = tag;
    return n;
  }

  release(n) {
    if (!n) return;
    n.engaged = null;
    n.pose = null;
    n.setItem(null);
    n.collidable = true;
    n.scriptAt = -999;
    if (n.life) n.life.next = rand(0.5, 2);
  }

  /** Hand someone back after a script is done with them. */
  resume(n) {
    if (!n.life) return false;
    n.scriptAt = -999;
    n.lifeMove = false;
    if (n.mode !== 'idle') {
      n.lifeCall = true;
      n.stop();
      n.lifeCall = false;
    }
    n.life.next = 0.2;
    return true;
  }

  owns(n) {
    return !!n.life;
  }

  /** Walk somewhere on the life sim's behalf. Resolves true on arrival. */
  go(n, x, z, speed) {
    n.lifeCall = true;
    n.lifeMove = true;
    const p = n.goTo(x, z, { speed: speed ?? n.walkSpeed * (0.85 + n.person.traits.drive * 0.3) });
    n.lifeCall = false;
    return p;
  }

  halt(n) {
    n.lifeCall = true;
    n.stop();
    n.lifeCall = false;
  }

  /** Put someone into a seat or bed (exactly on the spot, not colliding). */
  snap(n, s, pose) {
    n.pos.x = s.x;
    n.pos.z = s.z;
    n.yaw = s.yaw;
    n.faceYaw = s.yaw;
    n.lieY = s.lieY;
    n.collidable = false;
    n.snapSpot = s;
    if (pose !== undefined) n.pose = pose;
  }

  /** Get up out of a seat or bed and step out to its approach point. */
  unsnap(n) {
    const s = n.snapSpot;
    if (!s) return;
    n.snapSpot = null;
    // Only if they are still sitting there (a script may have walked them off already).
    if (!n.dead && Math.hypot(n.pos.x - s.x, n.pos.z - s.z) < 0.35) {
      n.pos.x = s.ax;
      n.pos.z = s.az;
    }
    n.collidable = !n.dead;
    if (n.pose && SNAP.has(n.pose)) n.pose = null;
  }

  // ---- Who the life sim may drive ------------------------------------------------------
  canDrive(n) {
    if (!n.life || !n.alive || n.engaged || n.talking) return false;
    if (n.busy || n.pursuing || n.rioting || n.fleeing || n.shelter || n.compelled || n.staring || n.zombie || n.mtf || n.hostile) return false;
    if (n.ai && n.ai.job) return false;
    if (n.action && !n.action.free) return false;
    const g = this.game;
    if (g.tasks && g.tasks.inUse(n.id)) return false;
    if (n.mode !== 'idle' && !n.lifeMove) return false;
    if (g.time - n.scriptAt < 10) return false;
    return true;
  }

  // ---- Frame update ---------------------------------------------------------------------
  update(dt) {
    if (!this.people.length) return;
    this.time += dt;
    this.runTimers();
    this.pathBudget = 2;
    const g = this.game;
    const alarm = this.alarmState();
    if (alarm && !this.alarmed) this.onAlarm();
    else if (!alarm && this.alarmed) this.onAllClear();
    this.alarmed = alarm;
    if (g.events.current) this.lastEvent = { label: this.eventLabel(g.events.current), at: this.time };

    for (const n of this.people) {
      if (!n.alive) continue;
      this.needs(n, dt);
      const Lf = n.life;
      Lf.next -= dt;
      if (Lf.next <= 0) {
        Lf.next = rand(0.35, 0.7);
        this.think(n, dt);
      }
    }
    this.updateConvos(dt);
    this.greetT -= dt;
    if (this.greetT <= 0) {
      this.greetT = 0.35;
      this.greetings();
      this.watchPlayer();
    }
    this.socialT -= dt;
    if (this.socialT <= 0) {
      this.socialT = 2.5;
      this.ambient();
      this.returns();
    }
    this.cleanup();
    this.experiments.update(dt);
    this.talk.update(dt);
  }

  alarmState() {
    const ev = this.game.events;
    return !!(ev.breachActive || ev.scpLoose || (ev.current && ev.current.type === 'riot'));
  }

  eventLabel(ev) {
    if (ev.type === 'scp') return `${ev.label} breach`;
    return { breach: 'breach', grid: 'grid failure', power: 'blackout', riot: 'riot' }[ev.type] || 'incident';
  }

  needs(n, dt) {
    const N = n.life.needs;
    const t = n.person.traits;
    const act = n.life.act;
    const doing = act && act.phase === 'do' ? act.kind : null;
    N.energy = clamp01(N.energy - dt / (520 + t.drive * 380) + (doing === 'nap' || doing === 'rest' ? dt / 45 : 0));
    N.hunger = clamp01(N.hunger + dt / 640);
    N.social = clamp01(N.social - dt / (260 + (1 - t.social) * 700));
    N.fun = clamp01(N.fun - (dt / 520) * (0.4 + t.curious) + (doing === 'observe' ? dt / 30 : 0));
  }

  // ---- Activities -----------------------------------------------------------------------
  think(n) {
    const Lf = n.life;
    if (!this.canDrive(n)) {
      if (Lf.act) this.drop(n);
      this.summoned(n);
      return;
    }
    Lf.atStation = false;
    if (Lf.waitFor && this.time < Lf.waitUntil && Lf.waitFor.alive) {
      // Someone is coming over to talk: hang on.
      if (!Lf.act) n.faceToward(Lf.waitFor.pos.x, Lf.waitFor.pos.z);
      if (!Lf.act || Lf.act.phase === 'do') return;
    } else Lf.waitFor = null;
    if (Lf.act) {
      this.tickAct(n);
      return;
    }
    if (this.pathBudget <= 0) {
      Lf.next = 0.1;
      return;
    }
    this.choose(n);
  }

  /**
   * A shift task wants this person (a check-up, a delivery...): they go back to
   * their own station and wait there for the player.
   */
  summoned(n) {
    const g = this.game;
    if (!n.action || n.action.free || n.engaged || n.talking || n.busy || n.pursuing || n.shelter || n.fleeing) return;
    if ((n.ai && n.ai.job) || n.mode !== 'idle' || g.tasks.inUse(n.id) || g.time - n.scriptAt < 10 || n.life.atStation) return;
    const p = n.def && g.builder.points[n.def.at];
    if (!p) return;
    const x = p.x * VOXEL;
    const z = p.z * VOXEL;
    if (Math.hypot(x - n.pos.x, z - n.pos.z) < 1.5) {
      n.life.atStation = true;
      n.faceYaw = ((p.yaw || 0) * Math.PI) / 180;
      return;
    }
    if (this.pathBudget <= 0) return;
    this.pathBudget--;
    this.go(n, x, z);
  }

  /** People who left (evacuated, transferred for testing...) come back after a while. */
  returns() {
    const g = this.game;
    for (const n of this.people) {
      if (!n.hidden || n.dead || n.zombie || !n.person || n.person.dead || n.person.fired) {
        if (n.life) n.life.goneAt = null;
        continue;
      }
      const Lf = n.life;
      if (Lf.goneAt == null) {
        Lf.goneAt = this.time;
        continue;
      }
      if (this.alarmed || this.time - Lf.goneAt < (n.kind === 'classd' ? 160 : 110)) continue;
      let x;
      let z;
      if (n.kind === 'classd') {
        const c = g.spawns.classd[n.def.cell % g.spawns.classd.length];
        x = c.inside[0] * VOXEL;
        z = c.inside[1] * VOXEL;
      } else {
        const e = g.point('evac');
        x = e.x;
        z = e.z;
      }
      Lf.goneAt = null;
      n.pos.set(x, VOXEL, z);
      n.hidden = false;
      n.model.root.visible = true;
      n.collidable = true;
      n.shelter = null;
      n.busy = false;
      n.engaged = null;
      n.pose = null;
      n.setItem(null);
      n.stop();
      n.scriptAt = -999;
      Lf.next = rand(0.5, 2);
    }
  }

  /** Abandon the current activity without ceremony (someone else needs this person). */
  drop(n) {
    const act = n.life && n.life.act;
    if (!act) return;
    if (act.spot && act.spot.user === n) act.spot.user = null;
    if (act.convo) this.endConvo(act.convo);
    if (act.onEnd) act.onEnd(n, false);
    n.life.act = null;
    this.unsnap(n);
    n.pose = null;
    n.setItem(null);
    n.collidable = !n.dead;
  }

  start(n, act) {
    const Lf = n.life;
    act.phase = 'go';
    act.start = this.time;
    Lf.act = act;
    if (act.spot) act.spot.user = n;
    const tx = act.spot ? act.spot.ax : act.x;
    const tz = act.spot ? act.spot.az : act.z;
    if (tx === undefined || (Math.hypot(tx - n.pos.x, tz - n.pos.z) < 0.35 && n.mode === 'idle')) {
      this.arrive(n, act);
      return;
    }
    this.pathBudget--;
    const kept = n.item && (n.life.keepUntil || 0) > this.time ? n.item : null;
    n.setItem(act.carry || kept || (this.game.events.powerOut && n.staff ? 'flashlight' : null));
    this.go(n, tx, tz, act.speed).then((ok) => {
      if (n.life && n.life.act === act && act.phase === 'go') {
        if (ok) act.arrived = true;
        else act.failed = true;
      }
    });
  }

  arrive(n, act) {
    act.phase = 'do';
    act.doStart = this.time;
    const s = act.spot;
    const pose = act.pose !== undefined ? act.pose : s ? s.pose : null;
    if (s && act.stand) {
      n.faceToward(s.x, s.z);
    } else if (s) {
      if ((pose && SNAP.has(pose)) || s.lie) this.snap(n, s);
      n.yaw = s.yaw;
      n.faceYaw = s.yaw;
      n.lieY = s.lieY;
    } else if (act.faceYaw !== undefined) n.faceYaw = act.faceYaw;
    n.pose = pose;
    n.setItem(act.item !== undefined ? act.item : s ? s.item : null);
    act.until = this.time + (act.dur || 20);
    if (act.onDo) act.onDo(n, act);
  }

  tickAct(n) {
    const act = n.life.act;
    if (act.phase === 'go') {
      if (act.failed) {
        if (act.spot) n.life.blocked.set(act.spot.id, this.time + 90);
        this.end(n, false);
        return;
      }
      if (act.arrived || (n.mode === 'idle' && !n.path && Math.hypot((act.spot ? act.spot.ax : act.x) - n.pos.x, (act.spot ? act.spot.az : act.z) - n.pos.z) < 0.6)) {
        this.arrive(n, act);
        return;
      }
      if (this.time - act.start > 100) this.end(n, false);
      return;
    }
    if (act.onTick && act.onTick(n, act) === false) return;
    if (this.time >= act.until || (act.done && act.done(n, act))) this.end(n, true);
  }

  end(n, ok) {
    const Lf = n.life;
    const act = Lf.act;
    if (!act) return;
    if (act.spot && act.spot.user === n) act.spot.user = null;
    this.unsnap(n);
    if (act.convo) this.endConvo(act.convo);
    n.pose = null;
    n.collidable = true;
    if (act.keepItem) n.life.keepUntil = this.time + 45;
    else n.setItem(null);
    if (ok && act.reward) act.reward(n);
    if (act.onEnd) act.onEnd(n, ok);
    Lf.cd[act.kind] = this.time + (act.cooldown ?? 30);
    Lf.act = null;
    Lf.next = rand(0.6, 2.5) * (1.4 - n.person.traits.drive * 0.6);
  }

  /** Find a free spot of one of the given types in the allowed zones. */
  findSpot(n, types, zones, opts = {}) {
    const g = this.game;
    let best = null;
    let bw = 0;
    const maxD = opts.maxD ?? 90;
    for (const type of types) {
      const list = g.spotsByType[type === 'tend' ? 'bed' : type];
      if (!list) continue;
      for (const s of list) {
        if (s.user && s.user !== n) continue;
        if (s.owner && s.owner !== n) continue;
        if (zones && !zones.includes(s.zone)) continue;
        if (opts.filter && !opts.filter(s)) continue;
        const bl = n.life.blocked.get(s.id);
        if (bl && bl > this.time) continue;
        const d = Math.hypot(s.ax - n.pos.x, s.az - n.pos.z);
        if (d > maxD) continue;
        const w = (1 / (1 + d / 14)) * rand(0.5, 1.5) * (n.life.own[type] === s ? 4 : 1);
        if (w > bw) {
          bw = w;
          best = s;
        }
      }
    }
    return best;
  }

  spotAct(n, kind, types, zones, o = {}) {
    const s = this.findSpot(n, types, zones, o);
    if (!s) return null;
    return { kind, spot: s, dur: o.dur ?? rand(20, 40), cooldown: o.cooldown, pose: o.pose, item: o.item, reward: o.reward, onDo: o.onDo, onTick: o.onTick, done: o.done, keepItem: o.keepItem };
  }

  pointAct(n, kind, zones, o = {}) {
    const p = this.zonePoint(zones);
    if (!p) return null;
    return { kind, x: p[0], z: p[1], dur: o.dur ?? rand(6, 14), cooldown: o.cooldown, pose: o.pose ?? null, item: o.item, carry: o.carry, onDo: o.onDo, onTick: o.onTick, speed: o.speed, keepItem: o.keepItem };
  }

  /** Decide what to do next. */
  choose(n) {
    const def = n.def;
    const t = n.person.traits;
    const N = n.life.needs;
    const h = this.hour;
    const cd = (k) => (n.life.cd[k] || 0) > this.time;
    // Injured: get patched up first.
    if (n.hp < n.maxHp * 0.65 && !cd('heal') && n.kind !== 'classd') {
      const a = this.spotAct(n, 'heal', ['bed'], ['MEDICAL BAY'], { dur: 35, cooldown: 60, reward: (m) => (m.hp = m.maxHp) });
      if (a) return this.start(n, a);
    }
    if (n.kind === 'classd') return this.chooseClassD(n, h);
    const lunch = h >= 11.4 && h < 13.2;
    const morning = h < 6.9;
    const options = [];
    const add = (k, score, make) => {
      if (cd(k) || score <= 0) return;
      options.push([k, score * rand(0.75, 1.25), make]);
    };
    const free = def.free || [];
    const duty = def.job === 'post' || def.job === 'patrol' || def.job === 'chief';
    add('work', 0.55 + t.drive * 1.05 - (lunch ? 0.3 : 0) - (1 - N.energy) * 0.35 + (duty ? 0.35 : 0), () => this.workAct(n));
    add('coffee', (1 - N.energy) * 1.0 + (morning ? 0.45 : 0) + (1 - t.drive) * 0.2, () =>
      this.spotAct(n, 'coffee', ['vending', 'cooler'], free, { dur: rand(10, 22), cooldown: 120, item: 'cup', keepItem: true, reward: (m) => (m.life.needs.energy = clamp01(m.life.needs.energy + 0.4)) }));
    add('eat', N.hunger * 1.25 + (lunch ? 0.9 : 0) - t.drive * 0.2, () =>
      this.spotAct(n, 'eat', ['eat'], free, { dur: rand(35, 70), cooldown: 240, item: 'food', reward: (m) => (m.life.needs.hunger = 0.05) }));
    add('nap', (1 - N.energy) * 1.6 * (1 - t.drive) - 0.28, () =>
      this.spotAct(n, 'nap', ['nap'], [...free, 'STAFF BREAK ROOM', 'LCZ LOUNGE', 'ADMINISTRATION LOBBY'], { dur: rand(45, 110), cooldown: 220, pose: 'nap', reward: (m) => (m.life.needs.energy = 1) }));
    add('social', (1 - N.social) * (0.25 + t.social * 1.15), () => this.socialAct(n));
    add('smoke', (1 - t.honor) * (1 - t.drive) * 0.75 - 0.12, () =>
      this.spotAct(n, 'smoke', ['smoke'], null, { dur: rand(20, 40), cooldown: 200, maxD: 70 }));
    add('observe', t.curious * (1 - N.fun) * 0.95 + (this.experiments.activeNear(n) ? 0.7 : 0), () => this.observeAct(n));
    add('wander', 0.12 + (1 - t.drive) * 0.1, () =>
      this.pointAct(n, 'wander', [...(def.work || []), ...free], { dur: rand(4, 10), cooldown: 40 }));
    options.sort((a, b) => b[1] - a[1]);
    for (const [, , make] of options.slice(0, 3)) {
      const a = make();
      if (a) return this.start(n, a);
    }
    // Nothing worked out: stand around a bit.
    n.life.next = rand(2, 5);
  }

  chooseClassD(n, h) {
    const t = n.person.traits;
    const N = n.life.needs;
    const cd = (k) => (n.life.cd[k] || 0) > this.time;
    const meal = (h >= 6.5 && h < 7.4) || (h >= 12 && h < 12.9);
    const night = h >= 13.6;
    const cell = this.game.spawns.classd[n.def.cell % this.game.spawns.classd.length];
    const options = [];
    const add = (k, score, make) => {
      if (cd(k) || score <= 0) return;
      options.push([k, score * rand(0.75, 1.25), make]);
    };
    const own = (types) => (s) => s.cell === cell.cell || (s.type === 'bunk' && Math.hypot(s.x - cell.x * VOXEL, s.z - cell.z * VOXEL) < 4.5);
    add('rest', (1 - N.energy) * 1.2 + (night ? 1.5 : 0) + 0.15, () =>
      this.spotAct(n, 'rest', ['bunk'], DBLOCK, { dur: rand(40, 100), cooldown: 60, pose: 'lie', filter: own(), reward: (m) => (m.life.needs.energy = 1) }));
    add('exercise', t.nerve * 0.35 + t.drive * 0.35, () =>
      this.spotAct(n, 'exercise', ['cell'], DBLOCK, { dur: rand(15, 30), cooldown: 150, pose: 'pushup', filter: own() }));
    add('commons', (1 - N.social) * 0.7 + 0.3 + (meal ? 0.3 : 0), () =>
      this.spotAct(n, 'commons', ['commons'], ['D-BLOCK COMMONS'], { dur: rand(30, 80), cooldown: 60, item: meal ? 'food' : 'cards', pose: meal ? 'eat' : 'cards', reward: (m) => meal && (m.life.needs.hunger = 0.05) }));
    add('eat', N.hunger * 1.1 + (meal ? 1 : 0), () =>
      this.spotAct(n, 'eat', ['commons'], ['D-BLOCK COMMONS'], { dur: rand(25, 45), cooldown: 200, item: 'food', pose: 'eat', reward: (m) => (m.life.needs.hunger = 0.05) }));
    add('sinks', 0.15, () => this.spotAct(n, 'sinks', ['sink'], ['D-BLOCK WASHROOM'], { dur: rand(8, 15), cooldown: 200 }));
    add('pace', 0.2 + (1 - t.nerve) * 0.25, () => this.pointAct(n, 'pace', ['D-CLASS CONTAINMENT BLOCK', 'D-BLOCK COMMONS'], { dur: rand(3, 8), cooldown: 25 }));
    add('social', (1 - N.social) * (0.25 + t.social), () => this.socialAct(n));
    options.sort((a, b) => b[1] - a[1]);
    for (const [, , make] of options.slice(0, 3)) {
      const a = make();
      if (a) return this.start(n, a);
    }
    n.life.next = rand(2, 5);
  }

  /** The job itself. */
  workAct(n) {
    const def = n.def;
    const t = n.person.traits;
    const dur = rand(40, 110) * (0.55 + t.drive * 0.9);
    switch (def.job) {
      case 'post':
        return this.postAct(n, dur);
      case 'patrol':
        return this.patrolAct(n);
      case 'chief':
        return chance(0.55) ? this.roundsAct(n) : this.postAct(n, dur);
      case 'janitor':
        return this.mopAct(n);
      default:
        break;
    }
    const prefs = WORK[def.job] || WORK.research;
    let total = 0;
    for (const [, w] of prefs) total += w;
    let r = Math.random() * total;
    let type = prefs[0][0];
    for (const [k, w] of prefs) {
      r -= w;
      if (r <= 0) {
        type = k;
        break;
      }
    }
    if (type === 'window' && t.curious < 0.4) type = 'desk';
    const zones = type === 'window' ? null : def.work;
    const a = this.spotAct(n, 'work', [type], zones, {
      dur,
      cooldown: 4,
      pose: type === 'tend' ? 'inspect' : undefined,
      item: type === 'tend' ? 'clipboard' : undefined,
      onDo: (m, act) => {
        // The spot you work at becomes "yours".
        if (['desk', 'lab', 'server', 'cook'].includes(type) && !m.life.own[type]) {
          m.life.own[type] = act.spot;
          act.spot.owner = m;
        }
        // Workaholics eat at their desk.
        if (type === 'desk' && m.life.needs.hunger > 0.65 && t.drive > 0.72) {
          m.pose = 'eat';
          m.setItem('food');
          m.life.needs.hunger = 0.05;
        }
      },
      onTick: (m) => this.mutter(m, def.job),
    });
    if (a && type === 'tend') {
      // Stand beside the bed, not in it.
      a.stand = true;
      a.pose = 'inspect';
    }
    return a;
  }

  postAct(n, dur) {
    const def = n.def;
    const t = n.person.traits;
    const s = this.game.spotsByType.post && this.game.spotsByType.post.find((p) => p.post === def.at);
    if (!s) return null;
    if (s.user && s.user !== n) s.user = null;
    // Lazy officers lean on the wall and doze off at their post.
    return {
      kind: 'work',
      spot: s,
      dur: dur * (1.2 + t.drive * 0.8),
      cooldown: 3,
      pose: t.drive < 0.3 && chance(0.4) ? 'lean' : null,
      onTick: (m, act) => {
        if (m.pose === 'lean' && t.drive < 0.25 && this.time - act.doStart > 30 && chance(0.03)) m.say(pick(L.NAP), 3);
        this.mutter(m, 'post');
      },
    };
  }

  patrolAct(n) {
    const route = (n.def.route || []).map((id) => this.game.builder.points[id]).filter(Boolean);
    if (!route.length) return null;
    let i = Math.floor(Math.random() * route.length);
    const legs = 2 + Math.floor(Math.random() * 3);
    let done = 0;
    const act = {
      kind: 'work',
      x: route[i].x * VOXEL,
      z: route[i].z * VOXEL,
      dur: rand(3, 7),
      cooldown: 2,
      pose: null,
      onTick: (m, a) => {
        if (this.time < a.until) return true;
        done++;
        if (done >= legs) return true;
        i = (i + 1) % route.length;
        a.phase = 'go';
        a.arrived = false;
        a.failed = false;
        a.x = route[i].x * VOXEL;
        a.z = route[i].z * VOXEL;
        a.start = this.time;
        this.go(m, a.x, a.z).then((ok) => {
          if (m.life.act === a && a.phase === 'go') {
            if (ok) a.arrived = true;
            else a.failed = true;
          }
        });
        return false;
      },
    };
    return act;
  }

  /** The Chief walks the posts and catches people slacking. */
  roundsAct(n) {
    const guards = this.people.filter((g) => g.kind === 'guard' && g !== n && g.alive && g.def.job === 'post' && g.def.clearance !== 4);
    const target = pick(guards);
    if (!target) return null;
    const s = this.game.spotsByType.post.find((p) => p.post === target.def.at);
    if (!s) return null;
    return {
      kind: 'rounds',
      x: s.ax,
      z: s.az,
      dur: rand(6, 12),
      cooldown: 60,
      onDo: (m) => {
        const act = target.life && target.life.act;
        const slacking = target.alive && act && ['nap', 'smoke'].includes(act.kind);
        const away = !act || act.kind !== 'work' || flat(target.pos, m.pos) > 6;
        if (slacking) this.scold(m, target);
        else if (!away) {
          m.faceToward(target.pos.x, target.pos.z);
          this.startConvo(m, target, [[m, 'All quiet?'], [target, pick(['All quiet, Chief.', 'Nothing to report.', 'Quiet as a tomb.'])]]);
        } else m.say(pick([`Where is ${target.name}?`, 'Empty post. Again.']), 3);
      },
    };
  }

  scold(chief, g) {
    const line = pick(L.CHIEF_SCOLD).replace('{other}', g.name.split(' ').pop());
    chief.say(line, 4);
    g.person.flags.scolded = (g.person.flags.scolded || 0) + 1;
    this.end(g, false);
    g.say(pick(L.SCOLDED), 3);
    g.life.cd.nap = this.time + 400;
    g.life.cd.smoke = this.time + 400;
    bumpTie(this.profile, chief.person, g.person, -0.08);
  }

  mopAct(n) {
    const zones = n.def.work;
    const p = this.zonePoint(zones);
    if (!p) return null;
    let stops = 2 + Math.floor(Math.random() * 3);
    const act = {
      kind: 'work',
      x: p[0],
      z: p[1],
      dur: rand(8, 16),
      cooldown: 3,
      pose: 'mop',
      item: 'mop',
      carry: 'mop',
      speed: 1.0,
      keepItem: false,
      onTick: (m, a) => {
        this.mutter(m, 'janitor');
        if (this.time < a.until) return true;
        stops--;
        if (stops <= 0) return true;
        const q = this.zonePoint(zones);
        if (!q) return true;
        a.phase = 'go';
        a.arrived = false;
        a.failed = false;
        a.x = q[0];
        a.z = q[1];
        a.start = this.time;
        m.pose = null;
        this.go(m, q[0], q[1], 1.0).then((ok) => {
          if (m.life.act === a && a.phase === 'go') {
            if (ok) a.arrived = true;
            else a.failed = true;
          }
        });
        return false;
      },
    };
    return act;
  }

  observeAct(n) {
    const exp = this.experiments.activeNear(n);
    if (exp && exp.watch) {
      return { kind: 'observe', x: exp.watch[0], z: exp.watch[1], dur: rand(20, 40), cooldown: 120, pose: 'lean', faceYaw: Math.atan2(-(exp.at[0] - exp.watch[0]), -(exp.at[1] - exp.watch[1])) };
    }
    return this.spotAct(n, 'observe', ['window'], null, { dur: rand(18, 40), cooldown: 160, maxD: 70, reward: (m) => (m.life.needs.fun = 1) });
  }

  /** Find somebody to talk to and go to them. */
  socialAct(n) {
    const t = n.person.traits;
    const isD = n.kind === 'classd';
    let best = null;
    let bw = 0;
    for (const o of this.people) {
      if (o === n || !o.alive || !this.canDrive(o) || o.life.convo) continue;
      const oIsD = o.kind === 'classd';
      // Staff talk to staff, Class-D to Class-D; the psychologist talks to Class-D;
      // snitches like a word with the D-Block guard.
      const psych = n.def.job === 'psych' && oIsD;
      const snitch = isD && n.person.hook === 'snitch' && o.def.slot === 'guard-dblock';
      if (oIsD !== isD && !psych && !snitch) continue;
      const act = o.life.act;
      if (act && !BREAKS.has(act.kind) && !(act.kind === 'work' && o.person.traits.drive < 0.55)) continue;
      const d = flat(o.pos, n.pos);
      if (d > 26) continue;
      const tie = getTie(this.profile, n.person, o.person);
      const w = (1 / (1 + d / 8)) * (1 + tie + (snitch || psych ? 1 : 0)) * rand(0.5, 1.5) * (tie < -0.3 && t.heart > 0.5 ? 0.2 : 1);
      if (w > bw) {
        bw = w;
        best = o;
      }
    }
    if (!best) return null;
    const o = best;
    // Meet halfway-ish: stand a step away from them.
    const dx = n.pos.x - o.pos.x;
    const dz = n.pos.z - o.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    let tx = o.pos.x + (dx / d) * 1.1;
    let tz = o.pos.z + (dz / d) * 1.1;
    if (!this.game.nav.walkableAtWorld(tx, tz)) {
      const p = this.game.nav.randomPointNear(o.pos.x, o.pos.z, 1.4);
      if (!p) return null;
      [tx, tz] = p;
    }
    // Ask them to wait for us.
    if (!o.life.act || o.life.act.phase === 'do') {
      o.life.waitFor = n;
      o.life.waitUntil = this.time + 25;
    }
    return {
      kind: 'social',
      x: tx,
      z: tz,
      dur: 30,
      cooldown: 90,
      onDo: (m, act) => {
        if (!o.alive || o.life.convo || flat(o.pos, m.pos) > 3) {
          act.until = this.time;
          return;
        }
        m.faceToward(o.pos.x, o.pos.z);
        const c = this.startConvo(m, o, null);
        act.convo = c;
        act.until = this.time + c.length + 1;
      },
      done: (m, act) => act.convo && act.convo.over,
    };
  }

  // ---- Conversations between NPCs ----------------------------------------------------------
  /** lines: [[speaker, text], ...] or null to make some up. Returns the convo. */
  startConvo(a, b, lines) {
    const ls = lines || this.makeConvo(a, b);
    const c = { a, b, lines: ls, argument: !!ls.argument, i: 0, t: 0, over: false };
    if (a.life) a.life.waitFor = null;
    if (b.life) b.life.waitFor = null;
    c.length = c.lines.reduce((s, [, text]) => s + 2.6 + text.length * 0.035, 0);
    a.life.convo = c;
    b.life.convo = c;
    // The listener stops (unless sitting) and turns to face the speaker.
    for (const [x, y] of [[a, b], [b, a]]) {
      const seated = x.pose && SNAP.has(x.pose);
      if (!seated && this.canDrive(x)) {
        if (x.mode !== 'idle') this.halt(x);
        x.faceToward(y.pos.x, y.pos.z);
      }
    }
    this.convos.push(c);
    return c;
  }

  endConvo(c) {
    if (c.over) return;
    c.over = true;
    for (const x of [c.a, c.b]) {
      if (x.life && x.life.convo === c) x.life.convo = null;
      if (x.pose === 'talk') x.pose = null;
      if (x.life) x.life.needs.social = clamp01(x.life.needs.social + 0.45);
    }
    if (c.a.person && c.b.person) bumpTie(this.profile, c.a.person, c.b.person, c.argument ? -0.06 : 0.03);
  }

  updateConvos(dt) {
    for (const c of this.convos) {
      if (c.over) continue;
      if (!c.a.alive || !c.b.alive || flat(c.a.pos, c.b.pos) > 4.5 || c.a.talking || c.b.talking) {
        this.endConvo(c);
        continue;
      }
      c.t -= dt;
      if (c.t > 0) continue;
      if (c.i >= c.lines.length) {
        this.endConvo(c);
        continue;
      }
      const [who, text] = c.lines[c.i++];
      who.say(text, 2.4 + text.length * 0.035);
      c.t = 2.6 + text.length * 0.035;
      const other = who === c.a ? c.b : c.a;
      const seated = who.pose && SNAP.has(who.pose);
      if (!seated && who.mode === 'idle' && !who.engaged) {
        who.pose = c.argument ? 'point' : 'talk';
        who.faceToward(other.pos.x, other.pos.z);
      }
      if (other.pose === 'talk' || other.pose === 'point') other.pose = null;
    }
    this.convos = this.convos.filter((c) => !c.over);
  }

  fill(text, ctx = {}) {
    const g = this.game;
    const scps = [...g.scps.entities.keys()].map((id) => `SCP-${id}`);
    const mem = (this.profile.memorial || []).filter((m) => m.why === 'died' && this.profile.shifts - m.shift <= 3);
    return text
      .replace(/\{me\}/g, g.designation || 'you')
      .replace(/\{scp\}/g, ctx.scp || (scps.length ? pick(scps) : 'SCP-173'))
      .replace(/\{dead\}/g, ctx.dead || (mem.length ? pick(mem).name : 'Henderson'))
      .replace(/\{food\}/g, ctx.food || pick(L.FOODS))
      .replace(/\{event\}/g, ctx.event || (this.lastEvent ? this.lastEvent.label : 'incident'))
      .replace(/\{other\}/g, ctx.other || 'someone')
      .replace(/\{title\}/g, ctx.title || 'researcher')
      .replace(/\{place\}/g, ctx.place || 'the cafeteria')
      .replace(/\{item\}/g, ctx.item || 'notebook');
  }

  makeConvo(a, b) {
    const ta = a.person.traits;
    const tie = getTie(this.profile, a.person, b.person);
    const va = voiceOf(ta);
    const vb = voiceOf(b.person.traits);
    // The psychologist's sessions.
    if (a.def.job === 'psych' && b.kind === 'classd') {
      return [[a, pick(['How have you been sleeping?', 'Tell me about the tests this week.', 'On a scale of one to ten, how afraid are you?', 'Do you still have the dreams?'])],
        [b, pick(b.person.traits.nerve < 0.4 ? L.SMALLTALK_D.anxious : b.person.traits.heart < 0.35 ? L.SMALLTALK_D.cold : L.SMALLTALK_D.plain)],
        [a, pick(['I see. Go on.', 'That\'s very normal.', 'Let\'s talk about that next time.'])]];
    }
    // A snitch whispering to the D-Block guard.
    if (a.kind === 'classd' && b.kind === 'guard') {
      return [[a, pick(['Psst. Officer.', 'Got a minute, boss?'])], [b, pick(['What is it, D?', 'Make it quick.'])], [a, pick(['Just... keep an eye on the commons tonight.', 'Nothing. Just saying hi.', 'Some of the others are talking. That\'s all.'])], [b, pick(['Noted. Get lost.', 'Good. Keep it coming.', '...Thanks.'])]];
    }
    if (tie < -0.35 && chance(0.6)) {
      const [x, y] = pick(a.kind === 'classd' ? L.ARGUE_D : L.ARGUE);
      const lines = [[a, x], [b, y], [a, pick(L.REPLIES.cold)]];
      lines.argument = true;
      return lines;
    }
    if (a.kind === 'classd') {
      return [[a, this.fill(pick(L.SMALLTALK_D[ta.nerve < 0.35 ? 'anxious' : ta.nerve > 0.7 ? 'bold' : ta.social > 0.65 ? 'chatty' : 'plain']))], [b, pick(L.REPLIES[vb] || L.REPLIES.plain)]];
    }
    const g = this.game;
    const mem = (this.profile.memorial || []).filter((m) => m.why === 'died' && this.profile.shifts - m.shift <= 2);
    const topics = [['work', 2], ['food', 1.5], ['personal', 1.5], ['boss', 1], ['dclass', 0.6]];
    if (g.scps.entities.size) topics.push(['scp', 1.2]);
    if (this.lastEvent && this.time - this.lastEvent.at < 400) topics.push(['event', 3]);
    if (mem.length) topics.push(['dead', 2]);
    if (this.newHires && this.newHires.length) topics.push(['newhire', 1.2]);
    let total = 0;
    for (const [, w] of topics) total += w;
    let r = Math.random() * total;
    let topic = 'work';
    for (const [k, w] of topics) {
      r -= w;
      if (r <= 0) {
        topic = k;
        break;
      }
    }
    const ctx = {};
    if (topic === 'newhire') {
      const nh = pick(this.newHires);
      ctx.other = nh.name;
      ctx.title = (nh.kind === 'guard' ? 'officer' : nh.kind === 'classd' ? 'D-class' : 'hire');
    }
    const lines = [[a, this.fill(pick(L.TOPICS[topic]), ctx)], [b, pick(L.REPLIES[vb] || L.REPLIES.plain)]];
    if (chance(0.55)) lines.push([a, pick(L.REPLIES[va] || L.REPLIES.plain)]);
    if (ta.social > 0.7 && chance(0.5)) lines.push([a, this.fill(pick(L.TOPICS.personal))], [b, pick(L.REPLIES[vb] || L.REPLIES.plain)]);
    return lines;
  }

  /** Spontaneous banter, kindness and cruelty between people who happen to be close. */
  ambient() {
    const ppl = this.people.filter((n) => n.alive && this.canDrive(n) && !n.life.convo);
    for (const a of ppl) {
      const act = a.life.act;
      for (const b of ppl) {
        if (b === a || b.life.convo || a.life.convo) continue;
        const d = flat(a.pos, b.pos);
        if (d > 3.6) continue;
        const ta = a.person.traits;
        // Cruel guard, Class-D in the way.
        if (a.kind === 'guard' && b.kind === 'classd' && ta.heart < 0.3 && d < 2 && chance(0.12) && (a.life.cd.shove || 0) < this.time) {
          a.life.cd.shove = this.time + 90;
          a.faceToward(b.pos.x, b.pos.z);
          a.swingT = 0.3;
          b.flinchT = 0.4;
          b.stunT = 0.6;
          this.startConvo(a, b, [[a, pick(L.SHOVE)], [b, pick(L.SHOVED[b.person.traits.nerve > 0.65 ? 'bold' : b.person.traits.nerve < 0.35 ? 'anxious' : 'plain'])]]);
          continue;
        }
        // Kindness: food for a Class-D.
        if (a.staff && b.kind === 'classd' && ta.heart > 0.8 && chance(0.06) && (a.life.cd.kind || 0) < this.time) {
          a.life.cd.kind = this.time + 300;
          b.setItem('food');
          this.startConvo(a, b, [[a, pick(L.KINDNESS)], [b, pick(L.THANKS)]]);
          continue;
        }
        // Two people on a break near each other strike up a conversation.
        const bAct = b.life.act;
        const breakA = act && BREAKS.has(act.kind) && act.phase === 'do';
        const breakB = bAct && BREAKS.has(bAct.kind) && bAct.phase === 'do';
        if (breakA && breakB && (a.kind === 'classd') === (b.kind === 'classd') && chance(0.25 * (ta.social + 0.2))) {
          this.startConvo(a, b, null);
        }
      }
    }
  }

  /** Occasional muttering while working, if the player is near enough to hear it. */
  mutter(n, job) {
    if (n.bubble || !chance(0.035)) return;
    if (flat(n.pos, this.game.player.pos) > 9) return;
    const pool = L.WORKING[job] || L.WORKING.research;
    n.say(pick(pool), 2.6);
  }

  // ---- The player --------------------------------------------------------------------------
  rel(n) {
    const role = this.game.role ? this.game.role.id : 'security';
    return n.person ? n.person.rel[role] || 0 : 0;
  }

  addRel(n, d, why) {
    if (!n.person) return;
    const role = this.game.role ? this.game.role.id : 'security';
    n.person.rel[role] = Math.max(-100, Math.min(100, (n.person.rel[role] || 0) + d));
    if (why) n.person.flags[why] = true;
  }

  /** Word gets around: friends of `n` adjust how they feel about the player too. */
  ripple(n, d) {
    for (const o of this.people) {
      if (o === n || !o.person || !n.person) continue;
      const tie = getTie(this.profile, n.person, o.person);
      if (tie > 0.25) this.addRel(o, Math.round(d * tie));
    }
  }

  greetings() {
    const g = this.game;
    const p = g.player;
    if (p.dead) return;
    const classd = g.role && g.role.id === 'classd';
    for (const n of this.people) {
      if (!n.alive || n.bubble || n.talking || n.engaged || n.pursuing || (n.ai && n.ai.job)) continue;
      const d = flat(n.pos, p.pos);
      if (d > 4.2 || (n.life.greetT || 0) > this.time) continue;
      if (n.pose === 'nap' || n.pose === 'lie') continue;
      if (!g.world.visible(n.pos.x / VOXEL, 3.3, n.pos.z / VOXEL, p.pos.x / VOXEL, (p.pos.y + 1.4) / VOXEL, p.pos.z / VOXEL)) continue;
      n.life.greetT = this.time + rand(70, 140);
      const t = n.person.traits;
      const rel = this.rel(n);
      let line;
      if (rel >= 30) line = pick([`Hey, ${n.kind === 'classd' ? g.designation : 'friend'}!`, 'Good to see you.', 'There you are.', 'Hey! Thanks again for before.']);
      else if (rel <= -30) line = pick(['You\'ve got some nerve.', '...', 'Stay away from me.']);
      else if (n.kind === 'classd') line = this.fill(pick(L.GREET_FROM_D[classd ? 'classd' : 'security']));
      else if (classd) {
        const v = voiceOf(t);
        line = pick(L.GREET_D[v] || L.GREET_D.plain);
      } else line = pick(L.GREET[voiceOf(t)] || L.GREET.plain);
      if (chance(t.social * 0.8 + 0.25) || rel >= 30) n.say(this.fill(line), 3);
      // Someone with something to ask comes over (once per shift).
      if (n.person.hook && !n.person.flags.approached && !n.person.flags.hookDone && t.social > 0.42 && rel >= -10 && this.time > 50 && this.time > this.approachT && this.canDrive(n) && this.talk.hookFor(n)) this.approachPlayer(n);
    }
  }

  approachPlayer(n) {
    const g = this.game;
    const p = g.player;
    this.approachT = this.time + 80;
    n.person.flags.approached = true;
    this.drop(n);
    const act = {
      kind: 'approach',
      x: p.pos.x,
      z: p.pos.z,
      dur: 10,
      cooldown: 300,
      onDo: (m) => {
        m.faceToward(p.pos.x, p.pos.z);
        m.pose = 'wave';
        m.say(pick(['Hey — you got a minute?', 'Psst. Over here.', 'Can I talk to you?', 'Hey! Wait up.']), 4);
      },
      onTick: (m) => {
        m.faceToward(p.pos.x, p.pos.z);
        if (m.pose === 'wave' && this.time - m.life.act.doStart > 2.5) m.pose = null;
      },
    };
    // Stop a step short of the player.
    const dx = n.pos.x - p.pos.x;
    const dz = n.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    act.x = p.pos.x + (dx / d) * 1.6;
    act.z = p.pos.z + (dz / d) * 1.6;
    if (!g.nav.walkableAtWorld(act.x, act.z)) {
      act.x = n.pos.x;
      act.z = n.pos.z;
    }
    this.start(n, act);
  }

  /** Staff who catch a Class-D player out of bounds react according to who they are. */
  watchPlayer() {
    const g = this.game;
    const dir = g.director;
    if (!dir || !g.role || g.role.id !== 'classd' || g.player.dead || dir.playerHostile) return;
    if (dir.permitted()) return;
    if (this.reportT > this.time) return;
    const p = g.player;
    for (const n of this.people) {
      if (!n.alive || !n.staff || n.kind === 'guard' || n.talking || n.engaged) continue;
      const d = flat(n.pos, p.pos);
      if (d > 11) continue;
      const fx = -Math.sin(n.yaw);
      const fz = -Math.cos(n.yaw);
      if (d > 2 && (fx * (p.pos.x - n.pos.x) + fz * (p.pos.z - n.pos.z)) / d < 0.3) continue;
      if (n.pose === 'nap' || n.pose === 'lie') continue;
      if (!g.world.visible(n.pos.x / VOXEL, 3.3, n.pos.z / VOXEL, p.pos.x / VOXEL, (p.pos.y + 1.4) / VOXEL, p.pos.z / VOXEL)) continue;
      const t = n.person.traits;
      const rel = this.rel(n);
      this.reportT = this.time + 25;
      if ((t.heart > 0.72 && t.honor < 0.8) || rel >= 35 || this.talk.isBlind(n)) {
        n.say(pick(L.LOOK_AWAY), 3);
      } else if (t.nerve < 0.3) {
        n.say(pick(L.SCARED), 2.5);
        this.drop(n);
        this.start(n, this.shelterAct(n) || { kind: 'flee', x: n.pos.x, z: n.pos.z, dur: 2 });
      } else if (t.honor > 0.55 && dir.reportSighting) {
        const room = g.builder.rooms[g.world.roomAtWorld(p.pos.x, 0.7, p.pos.z)];
        n.say(this.fill(pick(L.REPORT_D), { place: room && room.zone ? prettyZone(room.zone) : 'here' }), 3.5);
        n.faceToward(p.pos.x, p.pos.z);
        dir.reportSighting(n);
      } else {
        n.say(pick(['Hey! You can\'t be here.', 'Shoo. Back to your block.', '...Not my problem.']), 3);
      }
      return;
    }
  }

  // ---- Emergencies ----------------------------------------------------------------------------
  shelterAct(n) {
    const zones = [...SAFE];
    const t = n.person.traits;
    return this.spotAct(n, 'shelter', ['desk', 'seat', 'eat', 'couch', 'files', 'terminal', 'bed', 'lab'], zones, {
      dur: 400,
      cooldown: 5,
      maxD: 80,
      pose: t.nerve < 0.4 ? 'cower' : undefined,
      done: () => !this.alarmed,
      onDo: (m) => {
        if (t.nerve < 0.4) m.say(pick(L.SHELTER), 3);
      },
    });
  }

  onAlarm() {
    for (const n of this.people) {
      if (!n.alive || n.kind === 'guard' || !this.canDrive(n)) continue;
      const t = n.person.traits;
      if (n.kind === 'classd') {
        // Lockdown: back to the cell.
        this.drop(n);
        const a = this.spotAct(n, 'shelter', ['bunk'], DBLOCK, {
          dur: 400,
          pose: t.nerve < 0.35 ? 'cower' : 'lie',
          filter: (s) => Math.hypot(s.x - this.game.spawns.classd[n.def.cell].x * VOXEL, s.z - this.game.spawns.classd[n.def.cell].z * VOXEL) < 4.5,
          done: () => !this.alarmed,
        });
        if (a) this.start(n, a);
        continue;
      }
      // The very brave keep working; the brave and curious go and look.
      if (t.nerve > 0.85 && t.drive > 0.6) continue;
      this.drop(n);
      if (t.nerve < 0.45) n.say(pick(L.SCARED), 2.5);
      const a = this.shelterAct(n);
      if (a) this.start(n, a);
    }
  }

  onAllClear() {
    for (const n of this.people) {
      if (n.fleeing) n.fleeing = false;
      if (n.shelter && !this.game.tasks.inUse(n.id)) n.shelter = null;
      const act = n.life && n.life.act;
      if (act && act.kind === 'shelter') {
        this.end(n, true);
        if (n.person.traits.nerve < 0.45 && chance(0.6)) n.say(pick(['Is it over?', 'Thank god.', 'I need a drink.', 'I can\'t stop shaking.']), 3);
      }
    }
  }

  /** Someone died. */
  onDeath(n, attacker) {
    if (!n.person) return;
    const g = this.game;
    const cause = attacker && attacker.name ? attacker.name : attacker === g.player ? 'you' : 'unknown';
    n.person.dead = true;
    remember(this.profile, n.person, 'died', cause);
    this.bodies.push({ n, at: this.time + rand(70, 140) });
    // Witnesses.
    for (const o of this.people) {
      if (o === n || !o.alive || flat(o.pos, n.pos) > 13) continue;
      if (!g.world.visible(o.pos.x / VOXEL, 3.3, o.pos.z / VOXEL, n.pos.x / VOXEL, 2.4, n.pos.z / VOXEL)) continue;
      if (!o.bubble) o.say(pick(L.WITNESS_DEATH), 3);
      const tie = getTie(this.profile, o.person, n.person);
      if (tie > 0.3) {
        o.person.flags.grieving = n.person.name;
        o.person.flags.griefShift = this.profile.shifts;
        delete o.person.flags.comforted;
      }
      // They saw who did it.
      if (attacker === g.player) this.addRel(o, n.kind === 'classd' && o.kind !== 'classd' ? -12 : -40);
      if (o.person.traits.nerve < 0.35 && this.canDrive(o) && o.kind !== 'guard') {
        this.drop(o);
        const a = this.shelterAct(o);
        if (a) {
          a.done = () => this.time - a.start > 40 && !this.alarmed;
          this.start(o, a);
        }
      }
    }
  }

  /** A custodian bags the dead once things calm down. */
  cleanup() {
    if (this.alarmed || !this.bodies.length) return;
    const due = this.bodies.find((b) => b.at <= this.time && !b.taken);
    if (!due) return;
    const jan = this.people.filter((n) => (n.kind === 'janitor' || n.kind === 'medic') && this.canDrive(n)).sort((a, b) => flat(a.pos, due.n.pos) - flat(b.pos, due.n.pos))[0];
    if (!jan) return;
    due.taken = true;
    this.drop(jan);
    const p = this.game.nav.randomPointNear(due.n.pos.x, due.n.pos.z, 1.2) || [due.n.pos.x, due.n.pos.z];
    this.start(jan, {
      kind: 'bag',
      x: p[0],
      z: p[1],
      dur: 7,
      cooldown: 30,
      pose: 'kneel',
      onDo: (m) => {
        m.faceToward(due.n.pos.x, due.n.pos.z);
        m.say(pick(['Poor soul.', 'Not again.', 'Rest easy.', '...']), 3);
      },
      onEnd: (m, ok) => {
        if (!ok) return;
        due.n.hidden = true;
        due.n.model.root.visible = false;
        this.bodies = this.bodies.filter((b) => b !== due);
      },
    });
  }

  // ---- Talking with the player ----------------------------------------------------------------
  canTalk(n) {
    const dir = this.game.director;
    return !!n.person && n.alive && !n.zombie && !n.hostile && !n.pursuing && !n.rioting && !(n.ai && n.ai.job) && !this.game.ended && !(dir && dir.playerHostile);
  }

  /** Open a conversation with the player. */
  talkTo(n) {
    return this.talk.open(n);
  }

  /** Speech bubbles near the camera, for the UI. */
  bubbles(max = 6) {
    const g = this.game;
    const cam = g.camera.position;
    const out = [];
    for (const n of g.npcs.values()) {
      if (!n.bubble || !n.alive) continue;
      const d = Math.hypot(n.pos.x - cam.x, n.pos.z - cam.z);
      if (d > 15) continue;
      out.push({ n, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, max);
  }

  /** Save relationships and the roster (called at the end of a shift). */
  save() {
    this.profile.save();
  }
}

