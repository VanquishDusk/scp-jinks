// Base class for shift directors. A director scripts a shift for one playable
// class: who says what, when assignments are issued, and how facility events
// change them. Scripts are async functions running on *game* time (pausing the
// game pauses them) and are aborted cleanly when an emergency takes over.

export const ABORT = Symbol('script-abort');

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

export const SCIENTISTS = ['Dr. Lindqvist', 'Dr. Harrow', 'Dr. Okafor', 'Dr. Vance', 'Dr. Petrov', 'Dr. Adeyemi', 'Dr. Castellanos'];
export const GUARDS = ['Officer Briggs', 'Officer Kowalski', 'Officer Tanaka', 'Officer Mbeki', 'Officer Ruiz', 'Officer Holt'];

export class Director {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.timers = [];
    this.delayed = [];
    this.gen = 0;
    this.names = shuffle(SCIENTISTS);
    this.guardNames = shuffle(GUARDS);
  }

  get om() {
    return this.game.objectives;
  }

  /** Gameplay point in meters (see facilityLayout). */
  pt(id, r) {
    const p = this.game.point(id);
    return r ? { ...p, r } : p;
  }

  /** Start a script; any previously running script is aborted. */
  begin(fn) {
    const gen = ++this.gen;
    this._cancelTimers();
    fn.call(this, gen).catch((e) => {
      if (e !== ABORT) console.error(e);
    });
  }

  stop() {
    this.gen++;
    this._cancelTimers();
    this.delayed = [];
  }

  _cancelTimers() {
    const old = this.timers;
    this.timers = [];
    for (const t of old) t.rej(ABORT);
  }

  wait(sec) {
    return new Promise((res, rej) => this.timers.push({ at: this.time + sec, res, rej }));
  }

  check(gen) {
    if (gen !== this.gen) throw ABORT;
  }

  async waitUntil(pred, gen, poll = 0.25) {
    while (!pred()) {
      await this.wait(poll);
      this.check(gen);
    }
  }

  /** Speak a line; resolves roughly when the line has been read. */
  say(speaker, text, channel = 'voice') {
    const d = this.game.say(speaker, text, channel);
    return this.wait(d * 0.9);
  }

  /** Issue a primary assignment and wait for it to end. */
  async assign(a, gen) {
    const r = await this.om.start(a);
    this.check(gen);
    return r;
  }

  /** Fire a callback after `sec` seconds of game time (survives script changes). */
  after(sec, fn) {
    this.delayed.push({ at: this.time + sec, fn });
  }

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
  }

  /** Background NPCs that make the facility feel inhabited. */
  spawnAmbient({ skipChief = false } = {}) {
    const g = this.game;
    const P = (...ids) => ids.map((id) => {
      const p = g.point(id);
      return [p.x, p.z];
    });
    const n = this.names;
    const res = [
      g.spawnNpc({ id: 'sci-harrow', name: n[1], title: 'Researcher', kind: 'scientist', at: 'w-res-1', chatter: ['Busy morning. Three tests before lunch.', "Don't touch anything in Lab A, please."] }),
      g.spawnNpc({ id: 'sci-okafor', name: n[2], title: 'Research Supervisor', kind: 'scientist', at: 'vip-resoff', chatter: ['The overnight logs are a mess again.', 'If you see Dr. Vance, tell her I need those reports.'] }),
      g.spawnNpc({ id: 'sci-vance', name: n[3], title: 'Records Archivist', kind: 'scientist', at: 'vip-records', chatter: ['Everything is filed. Mostly.', 'Level 2 and up only in here, officer.'] }),
      g.spawnNpc({ id: 'doc-reyes', name: n[4], title: 'Medical Officer', kind: 'scientist', at: 'doc-medical', chatter: ['Use the first aid stations if you get hurt. That is what they are for.', 'Quiet day so far. Let us keep it that way.'] }),
      g.spawnNpc({ id: 'sci-cafe', name: n[5], title: 'Junior Researcher', kind: 'scientist', at: 'w-cafe', chatter: ['The coffee here is technically non-anomalous.', 'Is it lunch already?'] }),
    ];
    res[0].wander(P('w-res-1', 'w-res-2', 'w-res-3', 'w-laba', 'w-resoff'), [5, 12]);
    res[4].wander(P('w-cafe', 'dest-cafeteria', 'w-hub'), [6, 14]);
    for (const [i, at] of [[1, 'w-commons-1'], [2, 'w-commons-5'], [3, 'w-commons-6']]) {
      const d = g.spawnNpc({
        id: `classd-${i}`,
        name: `D-${1000 + Math.floor(Math.random() * 9000)}`,
        title: 'Class-D Personnel',
        kind: 'classd',
        at,
        chatter: ['Keep your head down and they leave you alone.', 'Heard someone got picked for testing again.', "Don't talk to me, man."],
      });
      d.wander(P('w-commons-1', 'w-commons-2', 'w-commons-3', 'w-commons-4', 'w-commons-5', 'w-commons-6', 'w-commons-7'), [4, 12]);
    }
    const gn = this.guardNames;
    g.spawnNpc({ id: 'guard-booth', name: gn[1], title: 'Security Officer', kind: 'guard', at: 'guard-booth', chatter: ['Checkpoint Alpha, all quiet.', 'Stay out of trouble.'] });
    g.spawnNpc({ id: 'guard-hcz', name: gn[2], title: 'Security Officer', kind: 'guard', at: 'guard-hcz', chatter: ['Nobody goes past that gate. Nobody.', 'Long shift. Longer if that gate ever opens.'] });
    g.spawnNpc({ id: 'guard-lobby', name: gn[3], title: 'Security Officer', kind: 'guard', at: 'guard-lobby', chatter: ['Lobby is clear.', 'Elevators have been down all week.'] });
    if (!skipChief) {
      g.spawnNpc({ id: 'chief', name: 'Chief Mercer', title: 'Head of Security', kind: 'guard', at: 'chief', chatter: ['Check your assignments at the duty terminal.', 'Eyes open, officer.'] });
    }
  }

  /** Researchers run for cover when a breach starts. */
  shelterResearchers() {
    const g = this.game;
    const shelters = shuffle(['shelter-1', 'shelter-2', 'shelter-3', 'shelter-4', 'shelter-5']);
    const list = ['sci-harrow', 'sci-okafor', 'sci-vance', 'sci-lindqvist'].map((id) => g.npcs.get(id)).filter((n) => n && n.alive);
    list.forEach((n, i) => {
      const s = this.pt(shelters[i]);
      n.shelter = s;
      n.stop();
      n.goTo(s.x, s.z, { speed: 2.8 });
      n.chatter = ['Is it over? Please tell me it is over.', 'We need to get out of here!'];
    });
    for (const n of g.npcs.values()) {
      if (n.kind === 'classd' && n.alive && n.id.startsWith('classd-')) n.speed = 2.6;
      if (n.kind === 'scientist' && !list.includes(n) && n.alive && n.id !== 'doc-reyes') {
        const e = this.pt('evac');
        n.stop();
        n.goTo(e.x, e.z, { speed: 2.8 });
      }
    }
    return list;
  }
}

