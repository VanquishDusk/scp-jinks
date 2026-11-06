// Major facility events. A containment breach is the big one: alarms, an
// emergency door release from the failing security grid, anomalies loose near
// the breach origin, and new areas opening up. Objectives react to these.

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
    this.state = 'normal'; // normal | breach
    this.origin = null;
    this.contained = false;
    this.gridOffline = false;
    this.alarm = 0;
    this.time = 0;
    this.game.renderer.setAlarm(0, [1, 0.25, 0.2]);
    this.game.ui.banner(null);
  }

  onEvent(fn) {
    this.listeners.push(fn);
  }

  emit(name, data) {
    for (const fn of this.listeners) fn(name, data);
  }

  get breachActive() {
    return this.state === 'breach' && !this.contained;
  }

  triggerBreach(originKey) {
    if (this.state !== 'normal') return;
    const g = this.game;
    const o = BREACH_ORIGINS[originKey];
    this.state = 'breach';
    this.origin = originKey;
    this.originDef = o;
    this.gridOffline = true;

    // Security grid fails open: readers up to Level 2 release.
    for (const d of g.doors) {
      if (!d.locked && !d.requiresCard && d.clearance <= 2) d.released = true;
      if (d.id.startsWith('cell-d-')) d.open();
      d.refreshLed();
    }
    const door = (id) => g.doorsById.get(id);
    for (const id of ['d-block-gate', 'checkpoint-door']) {
      const d = door(id);
      if (d) {
        d.released = true;
        d.open();
        d.refreshLed();
      }
    }
    for (const id of o.doors) {
      const d = door(id);
      if (d) {
        d.sealed = null;
        d.released = true;
        d.open();
        d.refreshLed();
      }
    }
    const maint = door('maintenance-access');
    if (maint) {
      maint.locked = null;
      maint.refreshLed();
    }
    const elevator = door('elevator-a');
    if (elevator) {
      elevator.locked = null;
      elevator.clearance = 3;
      elevator.name = 'Evacuation Elevator';
      elevator.refreshLed();
    }
    for (const t of g.terminals.values()) {
      if (o.locks.includes(t.id)) t.setStatus('alert', 'BREACH LOCK DISENGAGED');
      else if (t.id === 'server-reboot') t.setStatus('alert', 'GRID FAILURE');
    }
    g.testFloor.stop();

    // Anomalies spill out of the breach origin.
    const p = g.point(o.point);
    for (let i = 0; i < 4; i++) {
      const sp = g.nav.randomPointNear(p.x, p.z, 4) || [p.x, p.z];
      const a = new Anomaly(g, sp[0], sp[1], { x: p.x, z: p.z });
      this.anomalies.push(a);
      g.scene.add(a.group);
    }

    g.ui.banner('CONTAINMENT BREACH', `${o.label.toUpperCase()} — EMERGENCY PROTOCOL IN EFFECT`, 'red');
    g.say(
      'SITE INTERCOM',
      `Attention all personnel. Containment breach in ${o.label}. Security grid failure. Emergency door release is in effect. Non-essential staff proceed to safe areas.`,
      'pa',
      9,
    );
    this.emit('breach', { origin: originKey });
  }

  /** Containment locks re-engaged: anomalies collapse, alarm drops. */
  secureContainment() {
    if (this.state !== 'breach' || this.contained) return;
    this.contained = true;
    for (const a of this.anomalies) a.dissipate();
    for (const t of this.game.terminals.values()) {
      if (this.originDef.locks.includes(t.id) && t.status === 'alert') t.setStatus('idle', 'LOCK STANDBY');
    }
    this.game.ui.banner('CONTAINMENT RESTORED', 'EVACUATION AND RECOVERY IN PROGRESS', 'amber');
    this.game.say('SITE INTERCOM', 'Containment re-established. Remain alert. Evacuation procedures remain in effect.', 'pa', 6);
    this.emit('contained');
  }

  /** Security grid rebooted: readers enforce clearance again. */
  restoreSecurity() {
    if (!this.gridOffline) return;
    this.gridOffline = false;
    for (const d of this.game.doors) {
      d.released = false;
      d.refreshLed();
    }
    const t = this.game.terminals.get('server-reboot');
    if (t) t.setStatus('done', 'GRID ONLINE');
    this.game.say('SITE INTERCOM', 'Security grid restored. Keycard readers are back online.', 'pa', 5);
    if (this.contained) this.game.ui.banner(null);
    this.emit('grid-restored');
  }

  update(dt) {
    this.time += dt;
    const g = this.game;
    let alarm = 0;
    let color = [1, 0.22, 0.18];
    if (this.state === 'breach') {
      if (!this.contained) alarm = 0.22 + 0.2 * Math.max(0, Math.sin(this.time * 3.2));
      else if (this.gridOffline) {
        alarm = 0.08 + 0.06 * Math.max(0, Math.sin(this.time * 1.6));
        color = [1, 0.62, 0.2];
      }
    }
    this.alarm += (alarm - this.alarm) * Math.min(1, dt * 6);
    g.renderer.setAlarm(this.alarm, color);

    // Anomalies: move and hurt anyone they touch.
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
        if (!g.player.dead && a.touches(g.player.pos)) g.player.damage(24 * dt, 'anomaly');
        for (const n of g.npcs.values()) if (n.alive && a.touches(n.pos)) n.damage(14 * dt);
      }
    }
  }

  /** Distance (m) from a point to the nearest live anomaly. */
  nearestAnomaly(x, z) {
    let d = Infinity;
    for (const a of this.anomalies) if (a.alive) d = Math.min(d, Math.hypot(a.pos.x - x, a.pos.z - z));
    return d;
  }
}

