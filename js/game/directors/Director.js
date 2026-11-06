// Shift director base. A shift is a sandbox on a clock:
//   - tasks are drawn at random from a weighted pool (with cooldowns and
//     conditions) and run concurrently — the player picks the order;
//   - facility events strike at random times and spawn their own tasks;
//   - Standing (Compliance / Performance) rises and falls with what you do.
//     At zero the shift is lost. Death, deadlines and guards end runs fast.

import { ECONOMY } from '../../config.js';

const ABORT = Symbol('script-abort');

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr, rnd = Math.random) {
  return arr[Math.floor(rnd() * arr.length)];
}

export function rand(a, b, rnd = Math.random) {
  return a + rnd() * (b - a);
}

export const SCIENTISTS = ['Dr. Lindqvist', 'Dr. Harrow', 'Dr. Okafor', 'Dr. Vance', 'Dr. Petrov', 'Dr. Adeyemi', 'Dr. Castellanos', 'Dr. Moreau'];
export const GUARDS = ['Officer Briggs', 'Officer Kowalski', 'Officer Tanaka', 'Officer Mbeki', 'Officer Ruiz', 'Officer Holt', 'Officer Novak', 'Officer Varga', 'Officer Osei', 'Officer Lindgren'];

export const SHIFT_LENGTH = 15 * 60; // seconds of game time (06:00 → 14:00)
const EVENT_WEIGHTS = { breach: 3, grid: 2, power: 2, riot: 2 };

export class Director {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.timers = [];
    this.delayed = [];
    this.gen = 0;
    this.names = shuffle(SCIENTISTS);
    this.guardNames = shuffle(GUARDS);
    this.standing = 50;
    this.standingLabel = 'STANDING';
    this.clock = 0;
    this.started = false;
    this.finished = false;
    this.cooldowns = {};
    this.lastEvent = null;
    this.nextEventAt = rand(110, 210);
    this.templates = {};
  }

  get tasks() {
    return this.game.tasks;
  }

  pt(id, r) {
    const p = this.game.point(id);
    return r ? { ...p, r } : p;
  }

  // ---- Lifecycle ----------------------------------------------------------
  setup() {}

  start() {
    this.started = true;
    this.game.events.onEvent((name, data) => this.onFacilityEvent(name, data));
    this.game.ui.setStanding(this.standingLabel, this.standing);
  }

  stop() {
    this.gen++;
    const old = this.timers;
    this.timers = [];
    for (const t of old) t.rej(ABORT);
    this.delayed = [];
  }

  // ---- Scripting helpers ----------------------------------------------------
  wait(sec) {
    return new Promise((res, rej) => this.timers.push({ at: this.time + sec, res, rej }));
  }

  /** Run a short async sequence (aborted cleanly if the shift ends). */
  run(fn) {
    fn().catch((e) => {
      if (e !== ABORT) console.error(e);
    });
  }

  say(speaker, text, channel = 'voice') {
    const d = this.game.say(speaker, text, channel);
    return this.wait(d * 0.9);
  }

  after(sec, fn) {
    this.delayed.push({ at: this.time + sec, fn });
  }

  // ---- Standing ---------------------------------------------------------------
  changeStanding(delta, reason) {
    if (this.finished || !delta) return;
    const before = this.standing;
    this.standing = Math.max(0, Math.min(100, this.standing + delta));
    this.game.ui.setStanding(this.standingLabel, this.standing, delta);
    if (reason) this.game.ui.notify({ type: delta > 0 ? 'bonus' : 'failed', title: `${this.standingLabel} ${delta > 0 ? '+' : ''}${delta}`, text: reason });
    if (before > 0 && this.standing <= 0) this.onStandingZero();
  }

  onStandingZero() {}

  // ---- Combat consequences ---------------------------------------------------------
  /** Someone hit an NPC (player attacks are judged by the role directors). */
  onAttack() {}

  /** Security now treats the player as an armed threat: shoot on sight. */
  makeHostile(by, reason) {
    if (this.playerHostile || this.finished) return;
    this.playerHostile = true;
    const g = this.game;
    const classd = g.role.id === 'classd';
    if (by && by.name) g.say(by.name, classd ? (reason === 'armed' ? 'D-class has a gun! Weapons free!' : 'D-class is attacking staff! Weapons free!') : 'Officer down — it was one of ours! Take them out!');
    g.ui.banner(classd ? 'HOSTILE' : 'ROGUE OFFICER', 'SECURITY HAS ORDERS TO SHOOT ON SIGHT', 'red');
    this.after(2.5, () => g.say('SITE INTERCOM', `${g.designation} is to be considered armed and hostile. Lethal force authorized.`, 'pa', 6));
    for (const gd of this.guards()) {
      gd.pursuing = false;
      gd.followSpeed = null;
    }
  }

  // ---- Task pool ----------------------------------------------------------------
  /**
   * templates: { key: { weight, cooldown, can(): bool, make(): Task } }
   * Picks a random eligible template and issues it.
   */
  issueRandomTask() {
    const entries = Object.entries(this.templates).filter(([key, t]) => {
      if ((this.cooldowns[key] || 0) > this.clock) return false;
      return !t.can || t.can();
    });
    if (!entries.length) return null;
    let total = 0;
    for (const [, t] of entries) total += t.weight;
    let r = Math.random() * total;
    for (const [key, t] of entries) {
      r -= t.weight;
      if (r <= 0) {
        this.cooldowns[key] = this.clock + (t.cooldown || 60);
        const task = t.make();
        if (task) {
          task.tag = task.tag || key;
          if (task.announce) this.game.say(task.giver || 'SITE INTERCOM', task.announce, task.channel || 'pa');
          this.tasks.add(task);
        }
        return task;
      }
    }
    return null;
  }

  onTasksChanged() {}

  // ---- Events --------------------------------------------------------------------
  startRandomEvent() {
    // Owned SCPs add their own breach risk on top of the facility's events.
    const weights = { ...EVENT_WEIGHTS, scp: this.game.scps.breachWeight() };
    const options = Object.entries(weights).filter(([k, w]) => w > 0 && k !== this.lastEvent);
    let total = options.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of options) {
      r -= w;
      if (r <= 0) {
        this.lastEvent = k;
        if (k === 'scp') this.game.events.start('scp', { scp: this.game.scps.pickBreachCandidate() });
        else this.game.events.start(k);
        return;
      }
    }
  }

  /** Where guards rush to when an event starts. */
  eventSite(data) {
    if (data.type === 'scp') {
      const c = data.entity.chamber;
      return { x: c.outside[0] * 0.5, z: c.outside[1] * 0.5 };
    }
    if (data.type === 'breach') return this.pt(data.originDef.point);
    if (data.type === 'riot') return this.pt('patrol-dblock');
    return this.pt('server-door');
  }

  onFacilityEvent(name, data) {
    if (name === 'end') this.nextEventAt = this.clock + rand(120, 230);
  }

  // ---- Frame update ----------------------------------------------------------------
  update(dt) {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        for (const t of due) t.res();
      }
    }
    if (this.delayed.length) {
      const due = this.delayed.filter((t) => t.at <= this.time);
      if (due.length) {
        this.delayed = this.delayed.filter((t) => t.at > this.time);
        for (const t of due) t.fn();
      }
    }
    if (!this.started || this.finished) return;
    this.clock += dt;
    const ev = this.game.events;
    if (!ev.busy && this.clock >= this.nextEventAt && this.clock < SHIFT_LENGTH - 120) this.startRandomEvent();
    this.tick(dt);
    this.game.ui.setClock(this.clock, SHIFT_LENGTH);
    if (this.clock >= SHIFT_LENGTH) this.endOfShift();
  }

  tick() {}

  endOfShift() {}

  /** End-of-shift pay: a base amount plus more for good Standing. */
  payShiftBonus(label) {
    const amount = Math.round(ECONOMY.shiftBonusBase + this.standing * ECONOMY.shiftBonusPerStanding);
    this.tasks.award(amount, label);
  }

  finish(result) {
    if (this.finished) return;
    this.finished = true;
    this.game.endShift(result);
  }

  // ---- NPCs ---------------------------------------------------------------------------
  /** Everyone who works (or is held) on site: see game/life/. */
  spawnAmbient() {
    this.game.life.populate();
  }

  guards() {
    return [...this.game.npcs.values()].filter((n) => n.kind === 'guard' && n.alive);
  }

  /** Researchers run for cover when a breach starts. Returns those sheltering. */
  shelterResearchers() {
    const g = this.game;
    const shelters = shuffle(['shelter-1', 'shelter-2', 'shelter-3', 'shelter-4', 'shelter-5']);
    const list = shuffle(['sci-harrow', 'sci-okafor', 'sci-vance', 'sci-lindqvist', 'sci-cafe'].map((id) => g.npcs.get(id)).filter((n) => n && n.alive && !n.hidden));
    const shelter = list.slice(0, 2);
    shelter.forEach((n, i) => {
      const s = this.pt(shelters[i]);
      n.shelter = s;
      n.stop();
      n.goTo(s.x, s.z, { speed: 2.8 });
      n.chatter = ['Is it over? Please tell me it is over.', 'We need to get out of here!'];
    });
    const e = this.pt('evac');
    for (const n of list.slice(2)) {
      n.stop();
      n.goTo(e.x, e.z, { speed: 2.8 }).then((ok) => {
        if (ok) n.board(this.pt('evac-car').x, this.pt('evac-car').z);
      });
    }
    return shelter;
  }

  /** Guards respond to an emergency: they leave their posts for a while. */
  dispatchGuards(point) {
    for (const gd of this.guards()) {
      if (gd.id === 'chief' || gd.pursuing) continue;
      if (Math.random() < 0.6) {
        gd.busy = true;
        const p = this.game.pointNear(point.x, point.z, 5);
        gd.goTo(p[0], p[1], { speed: 3.2 });
      }
    }
  }

  releaseGuards() {
    for (const gd of this.guards()) {
      if (!gd.busy) continue;
      gd.busy = false;
      this.returnToPost(gd);
    }
  }

  returnToPost(npc) {
    // People on the roster go back to their own routine.
    if (this.game.life && this.game.life.resume(npc)) return;
    npc.stop();
    if (npc.id.startsWith('guard-patrol')) {
      const route = npc.lastRoute || null;
      if (route) return npc.wander(route, [3, 9]);
    }
    npc.goTo(npc.home.x, npc.home.z).then((ok) => {
      if (ok) npc.faceYaw = npc.home.yaw;
    });
  }

  /** D-Block riot: Class-D flood the block. Returns the rioters. */
  startRiot() {
    const g = this.game;
    const P = (...ids) => ids.map((id) => [this.pt(id).x, this.pt(id).z]);
    const area = P('patrol-dblock', 'w-commons-3', 'guard-escort', 'patrol-commons', 'w-commons-5');
    const rioters = [...g.npcs.values()].filter((n) => n.kind === 'classd' && n.alive && n.id.startsWith('classd-'));
    const cells = g.spawns.classd;
    for (let i = 0; i < 3; i++) {
      const c = pick(cells);
      rioters.push(
        g.spawnNpc({
          id: `rioter-${Date.now()}-${i}`,
          name: `D-${1000 + Math.floor(Math.random() * 9000)}`,
          title: 'Class-D Personnel',
          kind: 'classd',
          x: c.x,
          z: c.z,
          chatter: ['Get out of my way!', 'They cannot hold all of us!'],
        }),
      );
    }
    for (const n of rioters) {
      n.rioting = true;
      n.wander(area, [1, 4]);
      n.walkSpeed = 2.4;
    }
    return rioters;
  }

  /** Send a Class-D NPC back to a cell. */
  sendToCell(npc) {
    npc.rioting = false;
    npc.action = null;
    const c = pick(this.game.spawns.classd);
    npc.stop();
    npc.goTo(c.x * 0.5, c.z * 0.5, { speed: 2 }).then(() => npc.idleAt());
  }
}

export { ABORT };
