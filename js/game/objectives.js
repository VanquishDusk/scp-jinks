// Objective system.
//
// An Assignment is a titled sequence of Steps issued by someone in the world
// (a scientist, the security chief, the site intercom). Every Step completes
// only through gameplay: reaching places, using terminals, picking things up,
// escorting or following NPCs, surviving hazards. The ObjectiveManager runs the
// primary assignment plus optional side assignments, awards Credits and feeds
// the on-screen tracker and notifications.

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Step {
  constructor(o) {
    this.o = o;
    this.text = o.text;
    this.detail = o.detail || '';
    this.reward = o.reward || 0;
    this.marker = o.marker ?? true; // true | false | 'near'
    this.started = false;
  }
  /** Text shown in the tracker (may change while the step runs). */
  label() {
    return this.text;
  }
  start(game) {
    if (this.o.onStart) this.o.onStart(game, this);
  }
  /** Return true when complete. */
  update() {
    return false;
  }
  failed(game) {
    return this.o.failIf ? this.o.failIf(game) : false;
  }
  target() {
    return null;
  }
  progress() {
    return '';
  }
  end(game, completed) {
    if (this.o.onEnd) this.o.onEnd(game, completed, this);
  }
}

/** Reach a point (meters) or enter a named zone. */
export class ReachStep extends Step {
  update(game) {
    if (this.o.zone && game.zone === this.o.zone) return true;
    if (this.o.point) return dist2(game.player.pos, this.o.point) <= (this.o.radius ?? 1.4);
    return false;
  }
  target() {
    return this.o.point ? { x: this.o.point.x, y: 1.3, z: this.o.point.z } : this.o.targetFn ? this.o.targetFn() : null;
  }
}

/**
 * Use a specific interactable (terminal, NPC, trigger). The step installs its
 * own action on the object for its duration.
 * o.object, o.action {text, sub, hold}, o.onUse(game) → {ok, message}|void,
 * o.screen / o.doneScreen: terminal status lines.
 */
export class ActionStep extends Step {
  start(game) {
    super.start(game);
    this.done = false;
    const obj = this.o.object;
    this.prevAction = obj.action;
    obj.action = {
      ...this.o.action,
      use: (g) => {
        const r = this.o.onUse ? this.o.onUse(g) : null;
        if (!r || r.ok !== false) this.done = true;
        return r || { ok: true };
      },
    };
    if (obj.setStatus) obj.setStatus(this.o.alert ? 'alert' : 'active', this.o.screen || 'TASK PENDING');
  }
  update() {
    return this.done;
  }
  target() {
    const o = this.o.object.origin;
    return { x: o.x, y: o.y + (this.o.object.pos ? 2.0 : 0.2), z: o.z };
  }
  end(game, completed) {
    const obj = this.o.object;
    obj.action = this.o.keepAction ? obj.action : this.prevAction || null;
    if (obj.setStatus) obj.setStatus(completed ? 'done' : 'idle', completed ? this.o.doneScreen || 'COMPLETE' : 'STANDBY');
    super.end(game, completed);
  }
}

/** Pick up a world item. */
export class PickupStep extends Step {
  update() {
    return this.o.item.taken;
  }
  target() {
    const o = this.o.item.origin;
    return this.o.item.taken ? null : { x: o.x, y: o.y + 0.2, z: o.z };
  }
}

/** Visit every point (any order). points: [{x, z, r, label}] or zones. */
export class PatrolStep extends Step {
  start(game) {
    super.start(game);
    this.visited = new Set();
  }
  update(game) {
    this.o.points.forEach((p, i) => {
      if (this.visited.has(i)) return;
      const hit = p.zone ? game.zone === p.zone : dist2(game.player.pos, p) <= (p.r ?? 2.2);
      if (hit) {
        this.visited.add(i);
        if (this.o.onVisit) this.o.onVisit(game, p, this.visited.size);
      }
    });
    return this.visited.size >= this.o.points.length;
  }
  progress() {
    return `${this.visited ? this.visited.size : 0}/${this.o.points.length}`;
  }
  checklist() {
    return this.o.points.map((p, i) => ({ text: p.label, done: this.visited && this.visited.has(i) }));
  }
  target(game) {
    if (this.o.showMarker === false) return null;
    let best = null;
    let bd = Infinity;
    this.o.points.forEach((p, i) => {
      if (this.visited.has(i) || p.zone) return;
      const d = dist2(game.player.pos, p);
      if (d < bd) {
        bd = d;
        best = p;
      }
    });
    return best ? { x: best.x, y: 1.3, z: best.z } : null;
  }
}

/** Meet an NPC, have them follow you, and bring them to a destination. */
export class EscortStep extends Step {
  start(game) {
    super.start(game);
    const npc = this.o.npc;
    this.phase = 'meet';
    npc.action = {
      text: this.o.meetText || `Escort ${npc.name}`,
      sub: npc.title,
      use: (g) => {
        this.phase = 'escort';
        npc.action = null;
        npc.follow(g.player);
        if (this.o.onMeet) this.o.onMeet(g, npc);
        return { ok: true };
      },
    };
  }
  label() {
    const npc = this.o.npc;
    return this.phase === 'escort' ? `Escort ${npc.name} to the ${this.o.dest.label}` : this.o.meetLabel || `Meet ${npc.name} (${this.o.from || npc.title})`;
  }
  update() {
    return this.phase === 'escort' && dist2(this.o.npc.pos, this.o.dest) <= (this.o.dest.r ?? 2.0);
  }
  failed() {
    return this.o.npc.dead;
  }
  progress() {
    const npc = this.o.npc;
    return npc.hp < 100 && !npc.dead ? `Health ${Math.ceil(npc.hp)}%` : '';
  }
  target() {
    if (this.phase === 'meet') return { x: this.o.npc.pos.x, y: 2.1, z: this.o.npc.pos.z };
    return { x: this.o.dest.x, y: 1.3, z: this.o.dest.z };
  }
  end(game, completed) {
    const npc = this.o.npc;
    npc.action = null;
    if (!npc.dead) npc.stop();
    super.end(game, completed);
  }
}

/** Follow an NPC who leads you somewhere. */
export class FollowStep extends Step {
  start(game) {
    super.start(game);
    const { npc, dest } = this.o;
    npc.lead(dest.x, dest.z, { speed: this.o.speed, maxGap: this.o.maxGap ?? 5.5 });
  }
  update(game) {
    const { npc, dest } = this.o;
    return npc.arrived && dist2(game.player.pos, dest) <= (this.o.radius ?? 4.0);
  }
  progress() {
    return this.o.npc.waiting ? 'Your escort is waiting for you' : '';
  }
  target() {
    const p = this.o.npc.pos;
    return { x: p.x, y: 2.1, z: p.z };
  }
}

/** Stay alive (and optionally inside an area) for a duration. */
export class TimerStep extends Step {
  start(game) {
    this.elapsed = 0;
    super.start(game);
  }
  inside(game) {
    if (!this.o.point) return true;
    return dist2(game.player.pos, this.o.point) <= (this.o.radius ?? 1.2);
  }
  update(game, dt) {
    if (this.o.requireInside === false || this.inside(game)) this.elapsed += dt;
    if (this.o.tick) this.o.tick(game, dt, this);
    return this.elapsed >= this.o.duration;
  }
  progress(game) {
    const left = Math.max(0, Math.ceil(this.o.duration - this.elapsed));
    if (this.o.point && this.o.requireInside !== false && !this.inside(game)) return `${left}s — return to the marked area`;
    return `${left}s remaining`;
  }
  target() {
    return this.o.point ? { x: this.o.point.x, y: 1.3, z: this.o.point.z } : null;
  }
}

/** Fully scripted step: o.update(game, dt, step) → bool, o.target, o.progress. */
export class CustomStep extends Step {
  update(game, dt) {
    return this.o.update(game, dt, this);
  }
  target(game) {
    return this.o.target ? this.o.target(game, this) : null;
  }
  progress(game) {
    return this.o.progress ? this.o.progress(game, this) : '';
  }
  label() {
    return this.o.labelFn ? this.o.labelFn(this) : this.text;
  }
}

export class Assignment {
  /**
   * kind: 'assignment' | 'emergency' | 'optional'
   * bonus: credits on completing every step; penalty: credits lost on failure
   */
  constructor({ title, giver, kind = 'assignment', steps, bonus = 0, penalty = 0, onComplete, onFail }) {
    Object.assign(this, { title, giver, kind, steps, bonus, penalty, onComplete, onFail });
    this.index = 0;
    this.delay = 0;
    this.status = 'active';
    this.doneTexts = [];
    this.promise = new Promise((res) => {
      this.resolve = res;
    });
  }
  get step() {
    return this.steps[this.index] || null;
  }
}

export class ObjectiveManager {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    if (this.primary) this._close(this.primary, 'suspended', false);
    this.primary = null;
    this.optional = [];
    this.credits = 0;
    this.completed = 0;
    this.failedCount = 0;
    this.history = [];
    this.dirty = true;
  }

  /** Start the primary assignment. Resolves 'complete' | 'failed' | 'suspended'. */
  start(a) {
    if (this.primary) this.suspend();
    this.primary = a;
    a.delay = 0.4;
    this.game.ui.notify({
      type: a.kind === 'emergency' ? 'emergency' : 'new',
      title: a.kind === 'emergency' ? 'EMERGENCY ASSIGNMENT' : 'NEW ASSIGNMENT',
      text: a.title,
      sub: a.giver ? `From: ${a.giver}` : '',
    });
    this.dirty = true;
    return a.promise;
  }

  addOptional(a) {
    a.delay = 0.6;
    this.optional.push(a);
    this.game.ui.notify({ type: 'optional', title: 'OPTIONAL OBJECTIVE', text: a.title });
    this.dirty = true;
    return a.promise;
  }

  /** Cancel the primary assignment (e.g. a facility emergency interrupts it). */
  suspend(reason) {
    const a = this.primary;
    if (!a) return;
    this.primary = null;
    this._close(a, 'suspended', false);
    if (reason) this.game.ui.notify({ type: 'suspended', title: 'ASSIGNMENT SUSPENDED', text: a.title, sub: reason });
    this.dirty = true;
  }

  award(amount, reason) {
    if (!amount) return;
    this.credits += amount;
    this.game.profile.addCredits(amount);
    this.game.ui.setCredits(this.game.profile.credits, amount);
    if (reason) this.game.ui.notify({ type: amount > 0 ? 'bonus' : 'failed', title: reason, credits: amount });
  }

  _close(a, status, completedStep) {
    const s = a.step;
    if (s && s.started) s.end(this.game, completedStep);
    a.status = status;
    a.resolve(status);
  }

  _run(a, dt, isPrimary) {
    if (a.status !== 'active') return;
    if (a.delay > 0) {
      a.delay -= dt;
      if (a.delay > 0) return;
    }
    const s = a.step;
    if (!s) return;
    const game = this.game;
    if (!s.started) {
      s.started = true;
      s.start(game);
      this.dirty = true;
    }
    if (s.failed(game)) {
      s.end(game, false);
      a.status = 'failed';
      this.failedCount++;
      game.ui.notify({ type: 'failed', title: 'OBJECTIVE FAILED', text: s.label(), sub: a.title });
      if (a.penalty) this.award(-a.penalty);
      this.history.push({ title: a.title, status: 'failed' });
      if (a.onFail) a.onFail(game);
      if (isPrimary) this.primary = null;
      a.resolve('failed');
      this.dirty = true;
      return;
    }
    if (s.update(game, dt)) {
      s.end(game, true);
      a.doneTexts.push(s.label());
      this.completed++;
      a.index++;
      a.delay = 1.6;
      this.dirty = true;
      const last = a.index >= a.steps.length;
      if (s.reward) this.award(s.reward);
      if (!last) {
        game.ui.notify({ type: 'complete', title: 'OBJECTIVE COMPLETE', text: s.label(), credits: s.reward });
      } else {
        a.status = 'complete';
        if (a.bonus) this.award(a.bonus);
        // One card for the whole wrap-up: last step reward + completion bonus.
        game.ui.notify({ type: 'assignment', title: 'ASSIGNMENT COMPLETE', text: a.title, credits: (s.reward || 0) + (a.bonus || 0) });
        this.history.push({ title: a.title, status: 'complete' });
        if (a.onComplete) a.onComplete(game);
        if (isPrimary) this.primary = null;
        a.resolve('complete');
      }
    }
  }

  update(dt) {
    if (this.primary) this._run(this.primary, dt, true);
    for (const a of this.optional) this._run(a, dt, false);
    this.optional = this.optional.filter((a) => a.status === 'active');
  }

  /** Current marker target for the HUD. */
  markerTarget() {
    const a = this.primary;
    const s = a && a.status === 'active' && a.delay <= 0 ? a.step : null;
    if (!s || !s.started || !s.marker) return null;
    const t = s.target(this.game);
    if (!t) return null;
    if (s.marker === 'near') {
      const p = this.game.player.pos;
      if (Math.hypot(t.x - p.x, t.z - p.z) > 9) return null;
    }
    return t;
  }

  /** Snapshot for the tracker UI. */
  view() {
    const game = this.game;
    const a = this.primary;
    const out = { primary: null, optional: [] };
    if (a) {
      const s = a.step;
      const showStep = s && (s.started || a.index === 0);
      out.primary = {
        kind: a.kind,
        title: a.title,
        giver: a.giver,
        done: a.doneTexts.slice(-3),
        current: showStep && s.started ? s.label() : a.delay > 0 && a.index > 0 ? null : s ? s.label() : null,
        progress: showStep && s.started ? s.progress(game) : '',
        detail: showStep && s.started ? s.detail : '',
        checklist: showStep && s.started && s.checklist ? s.checklist() : null,
        waiting: a.delay > 0 && a.index > 0,
      };
    }
    for (const o of this.optional) {
      const s = o.step;
      out.optional.push({ title: o.title, current: s ? s.label() : '', progress: s && s.started ? s.progress(game) : '' });
    }
    return out;
  }
}
