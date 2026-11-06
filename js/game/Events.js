// Facility events. They strike at random times and change the facility:
//
//   breach  anomalies escape (random origin), security grid fails open, alarms
//   grid    security grid failure: keycard readers up to Level 2 fail open
//   power   main power failure: darkness, heavy doors lose power and seal
//   riot    D-Block riot: Class-D pour out of their cells
//
// Every event resolves on its own eventually (MTF / maintenance crews), but the
// player can resolve it sooner through tasks. Directors react through onEvent.

import { Anomaly } from './Hazards.js';

export const BREACH_ORIGINS = {
  hcz: {
    label: 'Heavy Containment',
    zone: 'HEAVY CONTAINMENT ZONE — ENTRANCE',
    point: 'breach-hcz',
    site: 'the HCZ Checkpoint',
    locks: ['lock-hcz-a', 'lock-hcz-b', 'lock-hcz-c'],
    doors: ['hcz-checkpoint', 'containment-gate'],
  },
  research: {
    label: 'Test Chamber 01',
    zone: 'TEST CHAMBER 01',
    point: 'breach-research',
    site: 'Test Chamber 01',
    locks: ['lock-res-a', 'lock-res-b', 'lock-res-c'],
    doors: ['test-chamber-01'],
  },
};

const rand = (a, b) => a + Math.random() * (b - a);

export class FacilityEvents {
  constructor(game) {
    this.game = game;
    this.anomalies = [];
    this.listeners = [];
    this.reset();
  }

  reset() {
    for (const a of this.anomalies) this.game.scene.remove(a.group);
    this.anomalies = [];
    this.current = null; // { type, origin, originDef, t, autoAt }
    this.gridOffline = false;
    this.powerOut = false;
    this.contained = true;
    this.rioters = [];
    this.scpLoose = false;
    this.alarm = 0;
    this.dark = 0;
    this.time = 0;
    this.count = 0;
    this.listeners = [];
    this.game.renderer.setAlarm(0, [1, 0.25, 0.2]);
    this.game.renderer.setDarkness(0);
    this.game.ui.banner(null);
  }

  onEvent(fn) {
    this.listeners.push(fn);
  }

  emit(name, data) {
    for (const fn of this.listeners) fn(name, data);
  }

  get busy() {
    return !!this.current;
  }

  get type() {
    return this.current ? this.current.type : null;
  }

  get breachActive() {
    return !!this.current && this.current.type === 'breach' && !this.contained;
  }

  get originDef() {
    return this.current ? this.current.originDef : null;
  }

  door(id) {
    return this.game.doorsById.get(id);
  }

  // ---------------------------------------------------------------------------
  start(type, opts = {}) {
    if (this.current) return false;
    const g = this.game;
    this.count++;
    const ev = { type, t: 0 };
    this.current = ev;
    if (type === 'breach') {
      const key = opts.origin || (Math.random() < 0.5 ? 'hcz' : 'research');
      ev.origin = key;
      ev.originDef = BREACH_ORIGINS[key];
      ev.autoAt = rand(330, 420);
      this.contained = false;
      this.failGrid();
      for (const id of ev.originDef.doors) {
        const d = this.door(id);
        if (d) {
          d.sealed = null;
          d.released = true;
          d.open();
          d.refreshLed();
        }
      }
      for (const d of g.doors) if (d.id.startsWith('cell-d-')) d.open();
      const elevator = this.door('elevator-a');
      if (elevator) {
        elevator.locked = null;
        elevator.clearance = 3;
        elevator.name = 'Evacuation Elevator';
        elevator.refreshLed();
      }
      for (const t of g.terminals.values()) {
        if (!ev.originDef.locks.includes(t.id)) continue;
        t.engaged = false;
        t.setStatus('alert', 'LOCK DISENGAGED');
      }
      g.testFloor.stop();
      const p = g.point(ev.originDef.point);
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const sp = g.nav.randomPointNear(p.x, p.z, 4) || [p.x, p.z];
        const a = new Anomaly(g, sp[0], sp[1], { x: p.x, z: p.z });
        this.anomalies.push(a);
        g.scene.add(a.group);
      }
      g.ui.banner('CONTAINMENT BREACH', `${ev.originDef.label.toUpperCase()} — EMERGENCY PROTOCOL IN EFFECT`, 'red');
      g.say('SITE INTERCOM', `Attention all personnel. Containment breach in ${ev.originDef.label}. Security grid failure. Emergency door release is in effect. Non-essential staff proceed to safe areas.`, 'pa', 9);
    } else if (type === 'scp') {
      // An owned SCP breaks out of its chamber.
      const e = g.scps.release(opts.scp);
      if (!e) {
        this.current = null;
        return false;
      }
      ev.scp = opts.scp;
      ev.entity = e;
      ev.label = e.name;
      ev.originDef = { label: e.name, point: null, site: e.chamber.name, zone: e.chamber.zone };
      ev.autoAt = rand(380, 460);
      this.scpLoose = true;
      this.failGrid();
      g.ui.banner(`${e.name} CONTAINMENT BREACH`, `${e.chamber.name.toUpperCase()} — CONTAINMENT FAILURE`, 'red');
      g.say(
        'SITE INTERCOM',
        `Attention. ${e.name} has breached containment in the Heavy Containment Wing. Security grid failure. ${e.id === '173' ? 'Maintain eye contact. Do not blink.' : 'Avoid the entity.'}`,
        'pa',
        9,
      );
    } else if (type === 'grid') {
      ev.autoAt = rand(130, 190);
      this.failGrid();
      g.ui.banner('SECURITY GRID FAILURE', 'KEYCARD READERS FAILING OPEN', 'amber');
      g.say('SITE INTERCOM', 'Warning. Security grid fault detected. Keycard readers are failing open. Security personnel, restore the grid immediately.', 'pa', 8);
    } else if (type === 'power') {
      ev.autoAt = rand(110, 170);
      this.powerOut = true;
      for (const d of g.doors) {
        if (d.type === 'heavy' || d.type === 'gate' || d.type === 'elevator') {
          d.unpowered = true;
          d.refreshLed();
        }
      }
      for (const t of g.terminals.values()) if (t.id !== 'power-main') t.setStatus('offline', 'NO POWER');
      const pm = g.terminals.get('power-main');
      if (pm) pm.setStatus('alert', 'MAIN BREAKER TRIPPED');
      g.testFloor.stop();
      g.ui.banner('POWER FAILURE', 'MAIN POWER LOST — EMERGENCY LIGHTING ONLY', 'amber');
      g.say('SITE INTERCOM', 'Main power failure. Emergency lighting active. Heavy doors are offline until power is restored.', 'pa', 7);
    } else if (type === 'riot') {
      ev.autoAt = rand(150, 210);
      const gate = this.door('d-block-gate');
      const cp = this.door('checkpoint-door');
      for (const d of [gate, cp]) {
        if (!d) continue;
        d.released = true;
        d.open();
        d.refreshLed();
      }
      for (const d of g.doors) if (d.id.startsWith('cell-d-')) d.open();
      this.rioters = g.director.startRiot();
      g.ui.banner('D-BLOCK RIOT', 'CLASS-D PERSONNEL OUT OF CELLS', 'red');
      g.say('SITE INTERCOM', 'Code Orange. Disturbance in D-Block. All Class-D personnel return to your cells immediately. Security respond.', 'pa', 8);
    }
    this.emit('start', ev);
    return true;
  }

  failGrid() {
    if (this.gridOffline) return;
    const g = this.game;
    this.gridOffline = true;
    for (const d of g.doors) {
      if (!d.locked && !d.requiresCard && d.clearance <= 2) d.released = true;
      d.refreshLed();
    }
    for (const id of ['d-block-gate', 'checkpoint-door']) {
      const d = this.door(id);
      if (d) {
        d.released = true;
        d.open();
        d.refreshLed();
      }
    }
    const maint = this.door('maintenance-access');
    if (maint) {
      maint.locked = null;
      maint.refreshLed();
    }
    const t = g.terminals.get('server-reboot');
    if (t) t.setStatus('alert', 'GRID FAILURE');
    this.emit('grid-down');
  }

  // ---- Resolution ---------------------------------------------------------
  secureContainment(byPlayer, byTeam = false) {
    if (this.contained) return;
    this.contained = true;
    for (const a of this.anomalies) a.dissipate();
    const ev = this.current;
    // Maintenance gets the grid back up soon after.
    if (ev) ev.autoAt = Math.min(ev.autoAt, ev.t + rand(70, 110));
    if (ev && ev.originDef) {
      for (const t of this.game.terminals.values()) if (ev.originDef.locks.includes(t.id)) t.setStatus('idle', 'LOCK ENGAGED');
    }
    this.game.say('SITE INTERCOM', byPlayer ? 'Containment re-established. Remain alert.' : byTeam ? 'Security has re-engaged the containment locks. Remain alert.' : 'Mobile Task Force has re-established containment. Remain alert.', 'pa', 6);
    this.emit('contained', { byPlayer, byTeam });
    this.checkEnd();
  }

  restoreSecurity(byPlayer) {
    if (!this.gridOffline) return;
    const g = this.game;
    this.gridOffline = false;
    for (const d of g.doors) {
      d.released = false;
      d.refreshLed();
    }
    const maint = this.door('maintenance-access');
    if (maint) {
      maint.locked = maint.baseLocked;
      if (maint.isOpen && !maint.intersectsOpening(g.player.aabb())) maint.close();
      maint.refreshLed();
    }
    const t = g.terminals.get('server-reboot');
    if (t) t.setStatus('done', 'GRID ONLINE');
    g.say('SITE INTERCOM', 'Security grid restored. Keycard readers are back online.', 'pa', 5);
    this.emit('grid-restored', { byPlayer });
    this.checkEnd();
  }

  restorePower(byPlayer) {
    if (!this.powerOut) return;
    const g = this.game;
    this.powerOut = false;
    for (const d of g.doors) {
      d.unpowered = false;
      d.refreshLed();
    }
    for (const t of g.terminals.values()) if (t.status === 'offline') t.setStatus('idle', 'STANDBY');
    const pm = g.terminals.get('power-main');
    if (pm) pm.setStatus('done', 'POWER NOMINAL');
    g.say('SITE INTERCOM', 'Main power restored.', 'pa', 4);
    this.emit('power-restored', { byPlayer });
    this.checkEnd();
  }

  /** A loose SCP is back in its chamber. */
  recontainScp(byPlayer, byTeam = false) {
    const ev = this.current;
    if (!ev || ev.type !== 'scp' || !this.scpLoose) return;
    this.scpLoose = false;
    this.game.scps.recontain(ev.scp);
    ev.autoAt = Math.min(ev.autoAt, ev.t + rand(70, 110));
    this.game.say('SITE INTERCOM', byPlayer ? `${ev.label} has been recontained.` : byTeam ? `Containment team reports ${ev.label} secured.` : `Mobile Task Force has recontained ${ev.label}.`, 'pa', 6);
    this.emit('recontained', { byPlayer, byTeam, scp: ev.scp });
    this.checkEnd();
  }

  quellRiot(byPlayer, byTeam = false) {
    if (!this.rioters.length) return;
    for (const n of this.rioters) if (n.rioting) this.game.director.sendToCell(n);
    this.rioters = [];
    const gate = this.door('d-block-gate');
    if (gate && !this.gridOffline) gate.released = false;
    this.game.say('SITE INTERCOM', byPlayer ? 'D-Block secured. Resume normal operations.' : 'Response team has secured D-Block.', 'pa', 5);
    this.emit('riot-ended', { byPlayer, byTeam });
    this.checkEnd();
  }

  checkEnd() {
    const ev = this.current;
    if (!ev) return;
    const done =
      (ev.type === 'breach' && this.contained && !this.gridOffline) ||
      (ev.type === 'grid' && !this.gridOffline) ||
      (ev.type === 'power' && !this.powerOut) ||
      (ev.type === 'riot' && this.rioters.length === 0) ||
      (ev.type === 'scp' && !this.scpLoose && !this.gridOffline);
    if (!done) return;
    this.current = null;
    if (ev.type === 'breach') {
      const elevator = this.door('elevator-a');
      if (elevator) {
        elevator.locked = elevator.baseLocked;
        elevator.clearance = elevator.baseClearance;
        elevator.name = elevator.baseName;
        if (!elevator.intersectsOpening(this.game.player.aabb())) elevator.close();
        elevator.refreshLed();
      }
    }
    this.game.ui.banner(null);
    this.emit('end', ev);
  }

  /** Response teams resolve whatever is left of the event. */
  autoResolve() {
    const ev = this.current;
    if (!ev) return;
    if (ev.type === 'breach') {
      this.secureContainment(false);
      this.restoreSecurity(false);
    } else if (ev.type === 'grid') this.restoreSecurity(false);
    else if (ev.type === 'power') this.restorePower(false);
    else if (ev.type === 'riot') this.quellRiot(false);
    else if (ev.type === 'scp') {
      this.recontainScp(false);
      this.restoreSecurity(false);
    }
  }

  // ---------------------------------------------------------------------------
  update(dt) {
    this.time += dt;
    const g = this.game;
    const ev = this.current;
    if (ev) {
      ev.t += dt;
      if (ev.t >= ev.autoAt) this.autoResolve();
    }

    let alarm = 0;
    let color = [1, 0.22, 0.18];
    if (this.breachActive || (ev && ev.type === 'riot') || this.scpLoose) alarm = 0.22 + 0.2 * Math.max(0, Math.sin(this.time * 3.2));
    else if (this.gridOffline) {
      alarm = 0.08 + 0.07 * Math.max(0, Math.sin(this.time * 1.6));
      color = [1, 0.62, 0.2];
    }
    if (this.powerOut) {
      alarm = Math.max(alarm, 0.12);
      color = [1, 0.2, 0.15];
    }
    this.alarm += (alarm - this.alarm) * Math.min(1, dt * 6);
    g.renderer.setAlarm(this.alarm, color);
    // Flickering emergency lighting during power loss.
    const targetDark = this.powerOut ? 0.72 + (Math.random() < 0.03 ? 0.2 : 0) : 0;
    this.dark += (targetDark - this.dark) * Math.min(1, dt * 4);
    g.renderer.setDarkness(this.dark);

    if (this.anomalies.length) {
      const targets = [];
      if (!g.player.dead) targets.push(g.player);
      for (const n of g.npcs.values()) if (n.alive) targets.push(n);
      this.anomalies = this.anomalies.filter((a) => {
        const alive = a.update(dt, targets);
        if (!alive) g.scene.remove(a.group);
        return alive;
      });
      for (const a of this.anomalies) {
        if (!g.player.dead && a.touches(g.player.pos)) g.player.damage(26 * dt, 'anomaly');
        for (const n of g.npcs.values()) if (n.alive && a.touches(n.pos)) n.damage(14 * dt);
      }
    }
  }

  nearestAnomaly(x, z) {
    let d = Infinity;
    for (const a of this.anomalies) if (a.alive) d = Math.min(d, Math.hypot(a.pos.x - x, a.pos.z - z));
    return d;
  }
}
