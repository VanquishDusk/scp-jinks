// Task system.
//
// The shift is a sandbox: tasks arrive over time (from a randomized pool and
// from facility events) and run *concurrently*. The player chooses what to do
// and in which order. Each Task is a short chain of Steps that complete only
// through gameplay — reaching places, using terminals, carrying items,
// escorting people, surviving hazards. Tasks can carry deadlines, and missing
// them costs Credits and Standing.
import { ECONOMY } from '../config.js';

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** "the Cafeteria" but "Laboratory A" / "Test Chamber 01". */
export function withThe(label) {
  return /^(laboratory|test chamber|cell|elevator|the )/i.test(label) ? label : `the ${label}`;
}

export class Step {
  constructor(o) {
    this.o = o;
    this.text = o.text;
    this.detail = o.detail || '';
    this.reward = Math.round((o.reward || 0) * ECONOMY.reward);
    this.marker = o.marker ?? true; // true | false | 'near'
    this.timeLimit = o.timeLimit || 0; // seconds; step fails when exceeded
    this.started = false;
    this.elapsedTotal = 0;
  }
  label() {
    return this.text;
  }
  start(game) {
    if (this.o.onStart) this.o.onStart(game, this);
  }
  update() {
    return false;
  }
  failed(game) {
    return this.o.failIf ? this.o.failIf(game, this) : false;
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

/** Reach a point (meters) or enter one of the named zones. */
export class ReachStep extends Step {
  update(game) {
    const zones = this.o.zones || (this.o.zone ? [this.o.zone] : null);
    if (zones && zones.includes(game.zone)) return true;
    if (this.o.point) return dist2(game.player.pos, this.o.point) <= (this.o.radius ?? 1.4);
    return false;
  }
  target() {
    if (this.o.point) return { x: this.o.point.x, y: 1.3, z: this.o.point.z };
    return this.o.targetFn ? this.o.targetFn() : null;
  }
}

/**
 * Use a specific interactable (terminal, NPC, trigger). The step installs its
 * own action on the object while it runs.
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
    obj.action = this.prevAction || null;
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

/** Visit every point, in any order. points: [{x, z, r, label}] or {zone}. */
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
  label() {
    const left = this.o.points.filter((p, i) => !(this.visited && this.visited.has(i))).map((p) => p.label);
    return `${this.text}: ${left.join(', ')}`;
  }
  progress() {
    return `${this.visited ? this.visited.size : 0}/${this.o.points.length}`;
  }
  target(game) {
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
    return this.phase === 'escort' ? `Bring ${npc.name} to ${withThe(this.o.dest.label)}` : `Find ${npc.name} (${this.o.from || npc.title})`;
  }
  update() {
    return this.phase === 'escort' && dist2(this.o.npc.pos, this.o.dest) <= (this.o.dest.r ?? 2.0);
  }
  failed() {
    return this.o.npc.dead;
  }
  progress() {
    const npc = this.o.npc;
    return npc.hp < 100 && !npc.dead ? `${npc.name}: ${Math.ceil(npc.hp)}% health` : '';
  }
  target() {
    if (this.phase === 'meet') return { x: this.o.npc.pos.x, y: 2.1, z: this.o.npc.pos.z };
    return { x: this.o.dest.x, y: 1.3, z: this.o.dest.z };
  }
  end(game, completed) {
    const npc = this.o.npc;
    npc.action = null;
    if (!npc.dead && npc.mode === 'follow') npc.stop();
    super.end(game, completed);
  }
}

/** Stay alive (optionally inside an area or zone) for a duration. */
export class TimerStep extends Step {
  start(game) {
    this.elapsed = 0;
    super.start(game);
  }
  inside(game) {
    if (this.o.zones) return this.o.zones.includes(game.zone);
    if (!this.o.point) return true;
    return dist2(game.player.pos, this.o.point) <= (this.o.radius ?? 1.2);
  }
  update(game, dt) {
    if (this.o.requireInside === false || this.inside(game)) this.elapsed += dt;
    if (this.o.tick) this.o.tick(game, dt, this);
    if (this.o.until) return this.o.until(game, this);
    return this.elapsed >= this.o.duration;
  }
  progress(game) {
    if (this.o.until) return this.inside(game) ? '' : 'Get back inside!';
    const left = Math.max(0, Math.ceil(this.o.duration - this.elapsed));
    if (this.o.requireInside !== false && !this.inside(game)) return `${left}s — get back to the area`;
    return `${left}s remaining`;
  }
  target() {
    return this.o.point ? { x: this.o.point.x, y: 1.3, z: this.o.point.z } : this.o.targetFn ? this.o.targetFn() : null;
  }
}

/** Fully scripted step. */
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

let taskSeq = 1;

export class Task {
  /**
   * kind: 'task' (assigned job) | 'order' (Class-D instruction) |
   *       'emergency' | 'opportunity' (self-directed, no penalty for ignoring)
   * deadline: seconds to finish the whole task (null = none)
   * reward: Credits on completion; penalty: Credits lost on failure
   * standing: [gain, loss] applied to Standing on completion / failure
   * grants: { zones: [], doors: [] } temporary Class-D authorization
   */
  constructor(o) {
    Object.assign(this, {
      title: o.title,
      giver: o.giver || '',
      kind: o.kind || 'task',
      steps: o.steps,
      reward: Math.round((o.reward || 0) * ECONOMY.reward),
      penalty: Math.round((o.penalty || 0) * ECONOMY.penalty),
      deadline: o.deadline ?? null,
      standing: o.standing || [0, 0],
      grants: o.grants || null,
      tag: o.tag || null,
      uses: o.uses || [],
      onComplete: o.onComplete,
      onFail: o.onFail,
      onEnd: o.onEnd,
      silentFail: !!o.silentFail,
      announce: o.announce || null,
      channel: o.channel || null,
    });
    this.id = taskSeq++;
    this.index = 0;
    this.delay = 0;
    this.status = 'active';
    this.timeLeft = this.deadline;
    this.age = 0;
  }
  get step() {
    return this.steps[this.index] || null;
  }
}

export class TaskManager {
  constructor(game) {
    this.game = game;
    this.tasks = [];
    this.reset();
  }

  reset() {
    for (const t of this.tasks) this._end(t, 'cancelled', false);
    this.tasks = [];
    this.focusId = null;
    this.credits = 0;
    this.completed = 0;
    this.failedCount = 0;
    this.spent = 0;
    this.history = [];
  }

  get active() {
    return this.tasks.filter((t) => t.status === 'active');
  }

  has(tag) {
    return this.tasks.some((t) => t.status === 'active' && t.tag === tag);
  }

  /** Objects already claimed by running tasks (avoids conflicting jobs). */
  inUse(id) {
    return this.tasks.some((t) => t.status === 'active' && t.uses.includes(id));
  }

  add(task, { quiet = false } = {}) {
    this.tasks.push(task);
    task.delay = 0.3;
    if (!this.focusId || task.kind === 'emergency') this.focusId = task.id;
    if (!quiet) {
      const titles = { task: 'NEW TASK', order: 'NEW ORDER', emergency: 'EMERGENCY', opportunity: 'OPPORTUNITY' };
      this.game.ui.notify({
        type: task.kind === 'emergency' ? 'emergency' : task.kind === 'opportunity' ? 'optional' : 'new',
        title: titles[task.kind],
        text: task.title,
        sub: task.deadline ? `${task.giver ? `${task.giver} · ` : ''}${fmt(task.deadline)} to complete` : task.giver,
      });
    }
    this.game.director.onTasksChanged();
    return task;
  }

  cancel(pred, reason) {
    for (const t of this.active) {
      if (!pred(t)) continue;
      this._end(t, 'cancelled', false);
      if (reason) this.game.ui.notify({ type: 'suspended', title: 'TASK CANCELLED', text: t.title, sub: reason });
    }
    this._prune();
  }

  cycleFocus() {
    const act = this.active;
    if (!act.length) return;
    const i = act.findIndex((t) => t.id === this.focusId);
    this.focusId = act[(i + 1) % act.length].id;
  }

  get focused() {
    return this.active.find((t) => t.id === this.focusId) || this.active[0] || null;
  }

  award(amount, reason) {
    if (!amount) return;
    this.credits += amount;
    this.game.profile.addCredits(amount);
    this.game.ui.setCredits(this.game.profile.credits, amount);
    if (reason) this.game.ui.notify({ type: amount > 0 ? 'bonus' : 'failed', title: reason, credits: amount });
  }

  _end(t, status, completedStep) {
    const s = t.step;
    if (s && s.started) s.end(this.game, completedStep);
    t.status = status;
    if (t.onEnd) t.onEnd(this.game, status);
  }

  _prune() {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.status === 'active');
    if (!this.tasks.some((t) => t.id === this.focusId)) this.focusId = this.tasks[0] ? this.tasks[0].id : null;
    if (before !== this.tasks.length) this.game.director.onTasksChanged();
  }

  fail(t, why) {
    if (t.status !== 'active') return;
    const game = this.game;
    this._end(t, 'failed', false);
    if (t.kind !== 'opportunity') {
      this.failedCount++;
      this.history.push({ title: t.title, status: 'failed' });
    }
    if (!t.silentFail) game.ui.notify({ type: 'failed', title: why === 'expired' ? 'TASK EXPIRED' : 'TASK FAILED', text: t.title, credits: t.penalty ? -t.penalty : 0 });
    if (t.penalty) this.award(-t.penalty);
    if (t.standing[1]) game.director.changeStanding(-t.standing[1]);
    if (t.onFail) t.onFail(game, why);
  }

  update(dt) {
    const game = this.game;
    for (const t of this.tasks) {
      if (t.status !== 'active') continue;
      t.age += dt;
      if (t.timeLeft !== null) {
        t.timeLeft -= dt;
        if (t.timeLeft <= 0) {
          this.fail(t, 'expired');
          continue;
        }
      }
      if (t.delay > 0) {
        t.delay -= dt;
        if (t.delay > 0) continue;
      }
      const s = t.step;
      if (!s) continue;
      if (!s.started) {
        s.started = true;
        s.elapsedTotal = 0;
        s.start(game);
      }
      s.elapsedTotal += dt;
      if (s.failed(game) || (s.timeLimit && s.elapsedTotal > s.timeLimit)) {
        this.fail(t, s.timeLimit && s.elapsedTotal > s.timeLimit ? 'expired' : 'failed');
        continue;
      }
      if (s.update(game, dt)) {
        s.end(game, true);
        this.completed++;
        t.index++;
        t.delay = 1.0;
        if (s.reward) this.award(s.reward);
        if (t.index >= t.steps.length) {
          t.status = 'complete';
          if (t.reward) this.award(t.reward);
          if (t.standing[0]) game.director.changeStanding(t.standing[0]);
          game.ui.notify({ type: 'assignment', title: t.kind === 'opportunity' ? 'SUCCESS' : 'TASK COMPLETE', text: t.title, credits: (s.reward || 0) + t.reward });
          this.history.push({ title: t.title, status: 'complete' });
          if (t.onComplete) t.onComplete(game);
          if (t.onEnd) t.onEnd(game, 'complete');
        } else {
          game.ui.notify({ type: 'complete', title: 'PROGRESS', text: s.label(), credits: s.reward });
        }
      }
    }
    this._prune();
  }

  /** Marker target of the focused task. */
  markerTarget() {
    const t = this.focused;
    const s = t && t.delay <= 0 ? t.step : null;
    if (!s || !s.started || !s.marker) return null;
    const p = s.target(this.game);
    if (!p) return null;
    if (s.marker === 'near') {
      const pl = this.game.player.pos;
      if (Math.hypot(p.x - pl.x, p.z - pl.z) > 9) return null;
    }
    return { ...p, kind: t.kind };
  }

  /** Snapshot for the pager UI. */
  view() {
    const game = this.game;
    const focus = this.focused;
    return this.active.map((t) => {
      const s = t.step;
      const ready = s && s.started;
      return {
        id: t.id,
        title: t.title,
        giver: t.giver,
        kind: t.kind,
        focused: t === focus,
        current: ready ? s.label() : '…',
        progress: ready ? s.progress(game) : '',
        detail: ready && t === focus ? s.detail : '',
        timeLeft: t.timeLeft !== null ? Math.max(0, Math.ceil(t.timeLeft)) : s && s.timeLimit && ready ? Math.max(0, Math.ceil(s.timeLimit - s.elapsedTotal)) : null,
      };
    });
  }
}

export function fmt(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
