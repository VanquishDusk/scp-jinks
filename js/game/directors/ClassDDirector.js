// Class-D shift (sandbox).
//
// You live under orders that arrive over the intercom at random: testing,
// work details, headcounts, meals, medical checks. Each order authorizes a
// route for a limited time. Step outside D-Block without authorization and
// any guard who sees you will chase you down — get caught and the run ends.
// Ignore orders and your Compliance drops; at zero, security comes for you.
//
// Facility events throw everything open. You can obey the lockdown and sit it
// out in your cell, or take the opportunity and run for the surface.

import { Director, shuffle, pick, rand, SHIFT_LENGTH } from './Director.js';
import { Task, ReachStep, ActionStep, PickupStep, TimerStep, CustomStep } from '../objectives.js';
import { Trigger, receptacleMesh } from '../Interactables.js';
import * as THREE from 'three';

const DBLOCK = ['D-CLASS CONTAINMENT BLOCK', 'D-BLOCK COMMONS', 'D-BLOCK WASHROOM'];
const ROUTE_WEST = ['SECURITY CHECKPOINT ALPHA', 'CENTRAL CORRIDOR — WEST'];
const ROUTE_EAST = [...ROUTE_WEST, 'CENTRAL JUNCTION', 'CENTRAL CORRIDOR — EAST'];
const ROUTE_HCZ = [...ROUTE_WEST, 'CENTRAL JUNCTION', 'NORTH CORRIDOR', 'HEAVY CONTAINMENT ZONE — ENTRANCE', 'HEAVY CONTAINMENT WING'];
const ROUTE_LCZ = [...ROUTE_EAST, 'RESEARCH WING', 'LIGHT CONTAINMENT SECTOR'];

/** Research assignments with the Safe-class SCPs (only those the site owns). */
const RESEARCH = {
  914: { text: 'Refine the test keycard in SCP-914', detail: 'Put the card in the intake booth, set the dial, wind the key.', check: (e, s) => e.runs > s.runs0 },
  330: { text: 'Take ONE piece of candy from SCP-330', detail: 'One. Read the sign.', check: (e, s) => e.taken > s.taken0 },
  207: { text: 'Drink one bottle of SCP-207', detail: 'Report any heart palpitations. Do not drink a second.', check: (e, s, g) => g.player.colaT > 0 },
  294: { text: 'Order a drink from SCP-294', detail: 'Type anything. Drink what it gives you.', check: (e) => e.cool > 0 },
  529: { text: 'Observe SCP-529 (pet her)', detail: 'Interact with the cat. She is friendly.', check: (e) => e.cool > 0 },
  999: { text: 'Spend time with SCP-999', detail: 'Stand next to it for a while. It likes hugs.', check: (e, s, g) => (s.near = (s.near || 0) + (Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z) < 1.6 ? 0.25 : 0)) > 4 },
  131: { text: 'Socialize SCP-131', detail: 'Ask the eye pods to follow you.', check: (e) => e.following },
};
const SPILLS = [
  { id: 'spill-commons', label: 'D-Block Commons', zones: [], doors: [] },
  { id: 'spill-washroom', label: 'D-Block Washroom', zones: [], doors: [] },
  { id: 'spill-westcorr', label: 'West Corridor', zones: ROUTE_WEST, doors: ['d-block-gate', 'checkpoint-door'] },
  { id: 'spill-cafeteria', label: 'Cafeteria', zones: [...ROUTE_WEST, 'CAFETERIA'], doors: ['d-block-gate', 'checkpoint-door', 'cafeteria'] },
  { id: 'spill-hub', label: 'Central Junction', zones: [...ROUTE_WEST, 'CENTRAL JUNCTION'], doors: ['d-block-gate', 'checkpoint-door'] },
];
const LOOSE_CARDS = [
  ['loose-breakroom', 'Staff Break Room'],
  ['loose-records', 'Records Office'],
  ['loose-admin', 'Administration Offices'],
  ['loose-medical', 'Medical Bay'],
  ['loose-cafeteria', 'Cafeteria'],
];

export class ClassDDirector extends Director {
  setup() {
    this.standingLabel = 'COMPLIANCE';
    this.standing = 50;
    this.spawnAmbient();
    this.orderGap = rand(18, 30);
    this.hunted = false;
    this.escapeTask = null;
    this.keycard = null;
    this.grants = new Set();
    this.passDoors = new Set();
    this.lightsOutIssued = false;
    this.cell = this.game.spawn;
    this.testCount = 0;

    // Some shifts, someone careless leaves a keycard lying around.
    if (Math.random() < 0.55) {
      const [id, label] = pick(LOOSE_CARDS);
      const p = this.pt(id);
      this.keycard = this.spawnKeycard(p.x, 1.27, p.z, label);
      this.after(rand(70, 260), () => {
        if (!this.keycard || this.keycard.taken) return;
        this.game.say('STAFF (OVERHEARD)', `...left my keycard in the ${label} again. I'll grab it after my shift.`, 'radio');
        this.tasks.add(
          new Task({
            title: 'Steal the unattended keycard',
            giver: 'Overheard',
            kind: 'opportunity',
            tag: 'steal-card',
            silentFail: true,
            steps: [
              new PickupStep({
                text: `Find the keycard in the ${label}`,
                detail: 'You are not authorized there. If a guard sees you, run.',
                item: this.keycard,
                marker: 'near',
              }),
            ],
          }),
        );
      });
    }

    this.templates = {
      testing: {
        weight: 3,
        cooldown: 200,
        can: () => {
          const x = this.game.life && this.game.life.experiments.active;
          return !this.game.events.busy && !(x && (x.type === 'lab' || x.type === 'field'));
        },
        make: () => this.makeTesting(),
      },
      cleanup: { weight: 3, cooldown: 70, make: () => this.makeCleanup() },
      supplies: { weight: 2, cooldown: 120, make: () => this.makeSupplies() },
      medical: { weight: 1, cooldown: 300, make: () => this.makeMedical() },
      headcount: { weight: 2, cooldown: 150, can: () => !DBLOCK.includes(this.game.zone) || Math.random() < 0.4, make: () => this.makeHeadcount() },
      meal: { weight: 1, cooldown: 300, make: () => this.makeMeal() },
      research: { weight: 3, cooldown: 180, can: () => this.researchCandidates().length > 0 && !this.game.events.busy, make: () => this.makeResearch() },
      tray096: {
        weight: 2,
        cooldown: 360,
        can: () => {
          const e = this.game.scps.entities.get('096');
          return !!e && e.contained && e.state === 'docile' && !this.game.events.busy;
        },
        make: () => this.makeTray096(),
      },
      clean173: {
        weight: 3,
        cooldown: 360,
        can: () => {
          const e = this.game.scps.entities.get('173');
          return !!e && e.contained && !this.game.events.busy;
        },
        make: () => this.makeClean173(),
      },
    };

    // A jury-rigged terminal in the washroom: SCPs bought here raise the odds
    // of a breach — and a breach is your way out. Don't get seen using it.
    const bm = this.game.terminals.get('black-market');
    bm.setStatus('active', 'CONTRABAND LINK');
    bm.action = {
      text: 'Use the black-market terminal',
      sub: 'Make sure no guard is watching',
      use: (gm) => {
        const watcher = this.guards().find((gd) => this.canSee(gd, 14) && !this.looksAway(gd));
        if (watcher) {
          this.pursue(watcher, `What are you doing on that terminal, ${gm.designation}?!`);
          this.changeStanding(-20, 'Caught using contraband');
          return { ok: false, message: 'BUSTED' };
        }
        return gm.openShop('classd');
      },
    };
  }

  start() {
    super.start();
    this.run(async () => {
      await this.wait(2.5);
      await this.say('SITE INTERCOM', 'Good morning, D-Block. Remain in the block unless ordered otherwise. Orders will be given over this system.', 'pa');
    });
  }

  spawnKeycard(x, y, z, label) {
    return this.game.addPickup({
      id: 'keycard',
      kind: 'keycard',
      x,
      y,
      z,
      name: 'Level 2 Keycard',
      onPickup: (gm) => {
        gm.player.keycard = 2;
        gm.ui.setItem('Keycard: Level 2');
        if (this.isSeen()) this.changeStanding(-10, 'Seen stealing a keycard');
      },
    });
  }

  // ---- Permissions & detection --------------------------------------------
  onTasksChanged() {
    // Recompute authorized zones and door passes from active orders.
    const zones = new Set();
    const doors = new Set();
    for (const t of this.tasks.active) {
      if (!t.grants) continue;
      for (const z of t.grants.zones || []) zones.add(z);
      for (const d of t.grants.doors || []) doors.add(d);
    }
    this.grants = zones;
    for (const id of this.passDoors) {
      const d = this.game.doorsById.get(id);
      if (d && !doors.has(id)) {
        d.passes = 0;
        d.refreshLed();
      }
    }
    for (const id of doors) {
      const d = this.game.doorsById.get(id);
      if (d) {
        d.passes = 1;
        d.refreshLed();
      }
    }
    this.passDoors = doors;
  }

  permitted(zone = this.game.zone) {
    return !zone || DBLOCK.includes(zone) || this.grants.has(zone);
  }

  isSeen() {
    return this.guards().some((gd) => this.canSee(gd, 14) && !this.looksAway(gd));
  }

  /** A guard who was paid (or owes you) and is not going to see anything. */
  looksAway(gd) {
    const life = this.game.life;
    return !this.hunted && !!life && life.talk.isBlind(gd);
  }

  /** A guard who likes you, or has a soft heart, warns you once before giving chase. */
  warn(gd) {
    const g = this.game;
    if (!gd.person || this.hunted) return false;
    const t = gd.person.traits;
    const rel = g.life.rel(gd);
    if (!(rel >= 25 || (t.heart > 0.72 && rel > -10))) return false;
    const now = g.time;
    if (gd.warnedAt == null || now - gd.warnedAt > 45) {
      gd.warnedAt = now;
      gd.faceToward(g.player.pos.x, g.player.pos.z);
      gd.say(pick([`${g.designation}. You shouldn't be here. Go back. Now.`, 'Hey. Back to the block — I didn\'t see you.', 'Turn around. I mean it. Last warning.']), 4);
      if (gd.mode !== 'idle') gd.stop();
      else gd.markScript();
      return true;
    }
    return now - gd.warnedAt < 9;
  }

  /** Staff saw you out of bounds and called it in: the nearest free officer comes to look. */
  reportSighting(by) {
    const g = this.game;
    if (this.playerHostile || this.finished) return;
    const p = g.player.pos;
    this.changeStanding(-4, `Reported by ${by.name}`);
    const gd = this.guards()
      .filter((x) => !x.pursuing && !(x.ai && x.ai.job) && x.id !== 'chief' && !x.busy && !this.looksAway(x) && !x.engaged)
      .sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z))[0];
    if (!gd || Math.hypot(gd.pos.x - p.x, gd.pos.z - p.z) > 70) return;
    this.after(1.2, () => g.say(gd.name, pick(['Copy. On my way.', 'Checking it out.', 'Roger, heading over.']), 'radio'));
    const at = g.pointNear(p.x, p.z, 2);
    gd.goTo(at[0], at[1], { speed: 3.2 }).then(() => gd.markScript());
  }

  canSee(gd, range) {
    const p = this.game.player.pos;
    const dx = p.x - gd.pos.x;
    const dz = p.z - gd.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (d > 3) {
      const fx = -Math.sin(gd.yaw);
      const fz = -Math.cos(gd.yaw);
      if ((fx * dx + fz * dz) / d < 0.15) return false;
    }
    if (this.game.doorBlocksLine(gd.pos.x, gd.pos.z, p.x, p.z)) return false;
    return this.game.world.visible(gd.pos.x / 0.5, 3.3, gd.pos.z / 0.5, p.x / 0.5, (p.y + 1.4) / 0.5, p.z / 0.5);
  }

  pursue(gd, line) {
    gd.pursuing = true;
    gd.lostTime = 0;
    gd.calmTime = 0;
    gd.stop();
    gd.follow(this.game.player, { distance: 0.6, speed: 4.1 });
    this.game.say(gd.name, line || pick(['Hey! D-class! Stop right there!', 'You! Out of bounds — on the ground, now!', 'Unauthorized Class-D! Stop!']));
  }

  tickDetection(dt) {
    const g = this.game;
    if (g.player.dead) return;
    const ev = g.events;
    const out = !this.permitted();
    if (this.playerHostile) {
      // Officers shoot on sight now (GuardAI); nobody tries to cuff you.
      const engaged = this.guards().some((gd) => gd.ai && gd.ai.job === 'engage');
      g.ui.setWanted(engaged ? 'UNDER FIRE' : 'HOSTILE');
      return;
    }
    let chased = false;
    for (const gd of this.guards()) {
      if (gd.ai && gd.ai.job) continue; // busy with an SCP, an anomaly or a riot
      if (gd.pursuing) {
        chased = true;
        const d = Math.hypot(gd.pos.x - g.player.pos.x, gd.pos.z - g.player.pos.z);
        if (d < 1.0) {
          g.say(gd.name, 'Got you. You are done.');
          this.finish('detained');
          return;
        }
        const sees = this.canSee(gd, 30);
        gd.lostTime = sees ? 0 : gd.lostTime + dt;
        gd.calmTime = !out && !this.hunted ? gd.calmTime + dt : 0;
        if (gd.lostTime > 7 || gd.calmTime > 3) {
          gd.pursuing = false;
          gd.followSpeed = null;
          this.returnToPost(gd);
          if (gd.lostTime > 7) g.ui.toast('YOU LOST THEM', false);
        }
        continue;
      }
      if (gd.busy && !this.hunted) continue;
      if (!out && !this.hunted) continue;
      const range = ev.powerOut ? 6 : ev.busy ? 9 : 13;
      if (this.canSee(gd, range)) {
        if (this.looksAway(gd) || this.warn(gd)) continue;
        const cruel = gd.person && gd.person.traits.heart < 0.3;
        this.pursue(gd, cruel ? pick(['Hey, orange! I\'ve been waiting for this.', 'Run, D-class. Please. Run.', 'Out of your cage? Big mistake.']) : undefined);
        if (!this.hunted && !chased) this.changeStanding(-12, 'Spotted out of bounds');
        chased = true;
      }
    }
    g.ui.setWanted(chased ? 'PURSUED' : out ? 'OUT OF BOUNDS' : null);
  }

  /** Hitting staff makes you hostile; hitting other Class-D only matters if seen. */
  onAttack(attacker, npc, dmg, killed) {
    const g = this.game;
    if (attacker !== g.player || this.finished || npc.hostile || npc.zombie) return;
    if (npc.kind === 'classd') {
      if (this.isSeen() && !this.playerHostile) {
        const gd = this.guards().find((x) => this.canSee(x, 14));
        if (gd && !gd.pursuing) this.pursue(gd, 'Hey! Break it up!');
        this.changeStanding(killed ? -30 : -6, killed ? 'Murder in D-Block' : 'Fighting');
      }
      return;
    }
    if (this.playerHostile) return; // already shoot-on-sight
    this.makeHostile(npc.kind === 'guard' && npc.alive ? npc : this.guards().find((x) => this.canSee(x, 20)) || null, 'assault');
    this.changeStanding(-30, killed ? `You killed ${npc.name}` : `You attacked ${npc.name}`);
  }

  onStandingZero() {
    this.hunted = true;
    if (this.playerHostile) return; // already shoot-on-sight
    this.game.say('SITE INTERCOM', `${this.game.designation} is non-compliant. Security, detain on sight.`, 'pa');
    this.game.ui.banner('NON-COMPLIANT', 'SECURITY HAS ORDERS TO DETAIN YOU', 'red');
    for (const gd of this.guards()) {
      if (gd.id === 'chief' || gd.pursuing) continue;
      gd.busy = false;
      gd.pursuing = true;
      gd.lostTime = -20;
      gd.calmTime = 0;
      gd.stop();
      gd.follow(this.game.player, { distance: 0.6, speed: 3.6 });
    }
  }

  // ---- Main loop ----------------------------------------------------------------
  tick(dt) {
    const g = this.game;
    this.tickDetection(dt);
    if (this.finished) return;

    // Orders arrive one at a time, at random intervals.
    const hasOrder = this.tasks.active.some((t) => t.kind === 'order');
    if (!hasOrder && !this.hunted) {
      this.orderGap -= dt;
      if (this.orderGap <= 0 && this.clock < SHIFT_LENGTH - 120) {
        this.issueRandomTask();
        this.orderGap = rand(35, 80);
      }
    }

    if (!this.lightsOutIssued && this.clock >= SHIFT_LENGTH - 100) {
      this.lightsOutIssued = true;
      this.tasks.cancel((t) => t.kind === 'order', 'Lights out');
      this.lightsOut();
    }
  }

  endOfShift() {
    const p = this.game.player.pos;
    const inCell = Math.hypot(p.x - this.cell.x * 0.5, p.z - this.cell.z * 0.5) < 3.2;
    if (inCell) this.payShiftBonus('Survival stipend');
    this.finish(inCell ? 'survived' : 'lightsout');
  }

  // ---- Event reactions ------------------------------------------------------------
  onFacilityEvent(name, data) {
    super.onFacilityEvent(name, data);
    const g = this.game;
    const ev = g.events;
    if (name === 'start') {
      this.tasks.cancel((t) => t.kind === 'order', 'Emergency protocol in effect');
      if (data.type === 'breach' || data.type === 'scp') this.shelterResearchers();
      if (data.type !== 'power') this.dispatchGuards(this.eventSite(data));
      this.after(4, () => {
        if (!ev.busy) return;
        this.lockdownOrder(data.type);
        if (ev.gridOffline) this.offerEscape();
      });
    } else if (name === 'grid-down') {
      if (this.started && !this.escapeTask) this.after(5, () => this.offerEscape());
    } else if (name === 'grid-restored') {
      if (this.escapeTask && this.escapeTask.status === 'active') {
        const t = this.escapeTask;
        this.escapeTask = null;
        g.tasks.cancel((x) => x === t, 'The doors are locking again');
      }
    } else if (name === 'end') {
      this.releaseGuards();
    }
  }

  lockdownOrder(type) {
    const g = this.game;
    const c = this.cell;
    const inside = { x: c.inside[0] * 0.5, z: c.inside[1] * 0.5 };
    const center = { x: c.x * 0.5, z: c.z * 0.5 };
    const text = type === 'power' ? 'Power failure: return to your cell' : 'Lockdown: return to your cell';
    g.say('SITE INTERCOM', 'All Class-D personnel: return to your cells and remain there until further notice.', 'pa');
    this.tasks.add(
      new Task({
        title: text,
        giver: 'Site Intercom',
        kind: 'order',
        tag: 'lockdown',
        reward: 60,
        penalty: 20,
        standing: [15, 15],
        grants: { zones: ['SECURITY CHECKPOINT ALPHA', 'CENTRAL CORRIDOR — WEST', 'CENTRAL JUNCTION', 'CENTRAL CORRIDOR — EAST', 'RESEARCH WING', 'TEST CHAMBER 01', 'LABORATORY A'], doors: [] },
        steps: [
          new ReachStep({ text: `Get back to ${c.cell}`, point: inside, radius: 1.6, timeLimit: 75 }),
          new TimerStep({
            text: 'Stay in your cell until the lockdown lifts',
            point: center,
            radius: 2.6,
            until: (gm) => !gm.events.busy,
            failIf: (gm, step) => {
              if (step.inside(gm)) {
                step.outSince = null;
                return false;
              }
              if (step.outSince == null) step.outSince = gm.time;
              return gm.time - step.outSince > 6;
            },
          }),
        ],
      }),
    );
  }

  offerEscape() {
    const g = this.game;
    if (!g.events.gridOffline || (this.escapeTask && this.escapeTask.status === 'active')) return;
    let card = this.keycard;
    if (g.player.keycard < 2 && (!card || card.taken)) {
      // A fleeing staff member dropped one somewhere.
      const spots = shuffle(['key-1', 'key-2', 'key-3', 'key-4', 'key-5', 'key-6']).map((id) => this.pt(id));
      const spot = spots[0];
      card = this.keycard = this.spawnKeycard(spot.x, 0.55, spot.z, spot.area);
      card.areaLabel = spot.area;
    }
    const steps = [];
    if (g.player.keycard < 2) {
      steps.push(
        new PickupStep({
          text: 'Find a Level 2 keycard',
          item: card,
          marker: 'near',
          detail: card.areaLabel ? `Someone dropped one fleeing — try the ${card.areaLabel}.` : 'There is one lying around somewhere. You heard about it.',
        }),
      );
    }
    steps.push(
      new ReachStep({ text: 'Reach the maintenance access in Storage', point: this.pt('maint-door'), radius: 1.8, detail: 'Storage is off the west corridor. Only open while the grid is down.' }),
      new ReachStep({ text: 'Get into the maintenance shaft', zone: 'MAINTENANCE SHAFT', targetFn: () => ({ ...this.pt('maint-shaft'), y: 1.3 }) }),
      new ActionStep({ text: 'Climb to the surface', object: g.ladder, action: { text: 'Climb the ladder to the surface', hold: 1.5 } }),
    );
    this.escapeTask = this.tasks.add(
      new Task({
        title: 'Escape while the grid is down',
        giver: 'Your own initiative',
        kind: 'opportunity',
        tag: 'escape',
        reward: 600,
        silentFail: false,
        steps,
        onComplete: (gm) => this.finish('escaped'),
      }),
    );
    this.run(async () => {
      await this.wait(1);
      await this.say(g.designation, pick(['The doors are open... this is my chance.', 'Grid is down. Now or never.', 'Every door is open. Move.']), 'thought');
    });
  }

  lightsOut() {
    const g = this.game;
    const c = this.cell;
    g.say('SITE INTERCOM', 'Lights out in ninety seconds. All Class-D return to your cells.', 'pa');
    this.tasks.add(
      new Task({
        title: 'Lights out: be in your cell',
        giver: 'Site Intercom',
        kind: 'order',
        tag: 'lightsout',
        steps: [new ReachStep({ text: `Get back to ${c.cell} before lights out`, point: { x: c.inside[0] * 0.5, z: c.inside[1] * 0.5 }, radius: 1.6 })],
        grants: { zones: [...ROUTE_EAST, 'RESEARCH WING', 'CAFETERIA', 'STORAGE', 'KITCHEN', 'MEDICAL BAY'], doors: [] },
        reward: 30,
      }),
    );
  }

  // ---- Orders ---------------------------------------------------------------------
  returnStep(limit = 150) {
    return new ReachStep({ text: 'Return to D-Block', zones: DBLOCK, targetFn: () => ({ ...this.pt('patrol-dblock'), y: 1.3 }), timeLimit: limit, detail: 'Your authorization expires once you are back.' });
  }

  makeCleanup() {
    const g = this.game;
    const s = pick(SPILLS);
    const p = this.pt(s.id);
    const mesh = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x2a3424, transparent: true, opacity: 0.85, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5 + Math.random() * 0.6, 0.4 + Math.random() * 0.5), mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.random() * 3;
      m.position.set(p.x + (Math.random() - 0.5) * 0.7, 0.515 + i * 0.001, p.z + (Math.random() - 0.5) * 0.7);
      mesh.add(m);
    }
    const spill = g.addTrigger(new Trigger({ id: 'spill', x: p.x, y: 0.6, z: p.z, half: [0.7, 0.15, 0.7], mesh }));
    return new Task({
      title: `Work detail: clean the ${s.label}`,
      giver: 'Site Intercom',
      kind: 'order',
      reward: 45,
      penalty: 15,
      standing: [6, 12],
      grants: { zones: s.zones, doors: s.doors },
      steps: [
        new ActionStep({ text: `Mop up the spill in the ${s.label}`, object: spill, action: { text: 'Mop up the spill', hold: 4 }, timeLimit: 150, reward: 20 }),
        ...(s.zones.length ? [this.returnStep(120)] : []),
      ],
      onEnd: (gm) => gm.removeInteractable(spill),
      announce: `${g.designation}, report for work detail: there is a spill in the ${s.label}.`,
    });
  }

  makeSupplies() {
    const g = this.game;
    const src = this.pt('crate-storage');
    const dst = this.pt(pick(['drop-kitchen', 'drop-cafeteria']));
    const crate = g.addPickup({ id: 'crate', kind: 'crate', x: src.x, y: 0.75, z: src.z, name: 'Supply Crate', onPickup: (gm) => (gm.player.carrying = 'crate') });
    const drop = g.addTrigger(new Trigger({ id: 'drop', x: dst.x, y: 0.8, z: dst.z, half: [0.6, 0.4, 0.6] }));
    const marker = g.addFloorMarker(dst.x, dst.z, 0.6);
    return new Task({
      title: `Work detail: haul supplies to the ${dst.label}`,
      giver: 'Site Intercom',
      kind: 'order',
      reward: 70,
      penalty: 15,
      standing: [8, 12],
      grants: { zones: [...ROUTE_WEST, 'STORAGE', 'CAFETERIA', 'KITCHEN'], doors: ['d-block-gate', 'checkpoint-door', 'storage', 'cafeteria', 'kitchen'] },
      steps: [
        new PickupStep({ text: 'Collect a supply crate from Storage', item: crate, timeLimit: 120, reward: 10 }),
        new ActionStep({
          text: `Deliver the crate to the ${dst.label}`,
          detail: 'Crates are heavy: no running.',
          object: drop,
          action: { text: 'Set the crate down', hold: 1 },
          onUse: (gm) => {
            gm.player.carrying = null;
            crate.place(dst.x, 0.75, dst.z);
            crate.enabled = false;
            return { ok: true, message: 'DELIVERED' };
          },
          timeLimit: 150,
          reward: 20,
        }),
        this.returnStep(120),
      ],
      onEnd: (gm) => {
        gm.removeInteractable(drop);
        gm.removeFloorMarker(marker);
        if (gm.player.carrying === 'crate') gm.player.carrying = null;
        this.after(20, () => gm.removeInteractable(crate));
      },
      announce: `${g.designation}, work detail: carry supplies from Storage to the ${dst.label}.`,
    });
  }

  makeMedical() {
    const g = this.game;
    const doc = g.npcs.get('doc-reyes');
    if (!doc || !doc.alive) return null;
    return new Task({
      title: 'Medical check',
      giver: 'Medical Bay',
      kind: 'order',
      reward: 35,
      penalty: 10,
      standing: [5, 10],
      grants: { zones: [...ROUTE_EAST, 'MEDICAL BAY'], doors: ['d-block-gate', 'checkpoint-door', 'medical-bay'] },
      steps: [
        new ActionStep({
          text: `Report to ${doc.name} in the Medical Bay`,
          object: doc,
          action: { text: 'Get checked', sub: doc.name },
          timeLimit: 160,
          onUse: (gm) => {
            gm.player.heal(100);
            gm.say(doc.name, 'Pulse fine, pupils fine. You will live. Back to the block.');
            return { ok: true, message: 'CHECKUP COMPLETE' };
          },
        }),
        this.returnStep(150),
      ],
      announce: `${g.designation}, report to the Medical Bay for a scheduled checkup.`,
    });
  }

  researchCandidates() {
    return Object.keys(RESEARCH).map((id) => this.game.scps.entities.get(id)).filter((e) => e && e.contained);
  }

  makeResearch() {
    const g = this.game;
    const e = pick(this.researchCandidates());
    const r = RESEARCH[e.id];
    const ch = e.chamber;
    let card = null;
    return new Task({
      title: `Research assignment: ${e.name}`,
      giver: 'Light Containment',
      kind: 'order',
      reward: 50,
      penalty: 15,
      standing: [8, 12],
      grants: { zones: [...ROUTE_LCZ, ch.zone], doors: ['d-block-gate', 'checkpoint-door', 'research-wing', 'lcz-checkpoint', ch.door] },
      steps: [
        new CustomStep({
          text: r.text,
          detail: `${ch.name}, Light Containment Sector. ${r.detail}`,
          timeLimit: 260,
          onStart: (gm, step) => {
            step.runs0 = e.runs || 0;
            step.taken0 = e.taken || 0;
            if (e.id === '914' && !gm.player.keycard) {
              // A scrap Level 1 card to feed the machine.
              const [x, z] = [(ch.panel[0] - 2) * 0.5, (ch.panel[1] + 2) * 0.5];
              card = gm.addPickup({ id: 'test-card', kind: 'keycard', x, y: 0.62, z, name: 'Test Keycard (Level 1)', onPickup: (g2) => { g2.player.keycard = 1; g2.ui.setItem('Keycard: Level 1'); } });
            }
          },
          update: (gm, dt, step) => r.check(e, step, gm),
          target: () => ({ x: e.pos.x, y: e.pos.y + 1.6, z: e.pos.z }),
          onEnd: (gm) => {
            if (card && !card.taken) gm.removeInteractable(card);
          },
        }),
        this.returnStep(200),
      ],
      announce: `${g.designation}, report to the Light Containment Sector. Research assignment with ${e.name}.`,
    });
  }

  makeHeadcount() {
    const c = this.cell;
    return new Task({
      title: 'Headcount',
      giver: 'Site Intercom',
      kind: 'order',
      reward: 20,
      penalty: 10,
      standing: [4, 14],
      steps: [
        new ReachStep({ text: `Stand in ${c.cell}`, point: { x: c.inside[0] * 0.5, z: c.inside[1] * 0.5 }, radius: 1.4, timeLimit: 60 }),
        new TimerStep({ text: 'Wait for the count', point: { x: c.x * 0.5, z: c.z * 0.5 }, radius: 2.6, duration: 10 }),
      ],
      announce: 'Headcount. All D-Block personnel to your cells. Sixty seconds.',
    });
  }

  makeMeal() {
    return new Task({
      title: 'Meal time',
      giver: 'Site Intercom',
      kind: 'order',
      reward: 25,
      penalty: 5,
      standing: [3, 8],
      steps: [new TimerStep({ text: 'Eat in the D-Block Commons', zones: ['D-BLOCK COMMONS'], targetFn: () => ({ ...this.pt('w-commons-3'), y: 1.3 }), duration: 15, timeLimit: 90 })],
      announce: 'Meal service in the D-Block Commons. Fifteen minutes. Move.',
    });
  }

  // ---- SCP-096 meal tray --------------------------------------------------------------
  makeTray096() {
    const g = this.game;
    const e = g.scps.entities.get('096');
    const ch = e.chamber;
    const door = g.doorsById.get(ch.door);
    const outside = { x: ch.outside[0] * 0.5, z: ch.outside[1] * 0.5 };
    const tp = { x: ch.tray[0] * 0.5, z: ch.tray[1] * 0.5 };
    let tray = null;
    let marker = null;
    let done = false;
    const cleanup = () => {
      if (marker) g.removeFloorMarker(marker);
      marker = null;
      if (e.contained && door.isOpen && !door.broken && !door.intersectsOpening(g.player.aabb())) door.close();
    };
    return new Task({
      title: "Work detail: SCP-096's meal tray",
      giver: 'Site Intercom',
      kind: 'order',
      reward: 200,
      penalty: 30,
      standing: [18, 20],
      grants: { zones: [...ROUTE_HCZ, ch.zone], doors: ['d-block-gate', 'checkpoint-door', 'hcz-checkpoint', 'hcz-wing', ch.door] },
      announce: `${g.designation}, report to the Heavy Containment Wing to deliver a meal tray to ${ch.name}. Do not look at the occupant.`,
      steps: [
        new ReachStep({
          text: `Report to ${ch.name} in the Heavy Containment Wing`,
          point: outside,
          radius: 2.2,
          timeLimit: 230,
          detail: 'Through the Central Junction, up the North Corridor, through the HCZ Checkpoint.',
          onEnd: (gm, ok) => {
            if (!ok) return;
            door.open();
            gm.say('SITE INTERCOM', 'Door open. Place the tray on the marker inside the door. It is facing the corner. Keep it that way. Do NOT look at its face.', 'pa');
          },
        }),
        new CustomStep({
          text: 'Leave the tray on the marker — eyes down',
          detail: 'Never walk around to its front. If you see its face, it will kill you.',
          timeLimit: 90,
          reward: 40,
          onStart: (gm) => {
            marker = gm.addFloorMarker(tp.x, tp.z, 0.5);
            tray = gm.addTrigger(new Trigger({ id: 'tray', x: tp.x, y: 0.6, z: tp.z, half: [0.5, 0.2, 0.5] }));
            tray.action = {
              text: 'Set down the meal tray',
              hold: 1.2,
              use: (gg) => {
                done = true;
                tray.action = null;
                const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.3), new THREE.MeshBasicMaterial({ color: 0x8a8f96 }));
                m.position.set(tp.x, 0.53, tp.z);
                gg.addSessionObject(m);
                return { ok: true, message: 'TRAY DELIVERED' };
              },
            };
          },
          update: () => done,
          target: () => ({ x: tp.x, y: 0.7, z: tp.z }),
          onEnd: (gm) => {
            if (tray) gm.removeInteractable(tray);
            if (marker) gm.removeFloorMarker(marker);
            marker = null;
          },
        }),
        new ReachStep({ text: 'Back out of the chamber', point: outside, radius: 1.6, onEnd: () => cleanup() }),
        this.returnStep(220),
      ],
      onEnd: () => cleanup(),
    });
  }

  // ---- SCP-173 chamber cleaning ----------------------------------------------------
  makeClean173() {
    const g = this.game;
    const e = g.scps.entities.get('173');
    const ch = e.chamber;
    const door = g.doorsById.get(ch.door);
    const outside = { x: ch.outside[0] * 0.5, z: ch.outside[1] * 0.5 };
    const spots = shuffle(ch.spots).slice(0, 3).map(([x, z]) => ({ x: x * 0.5, z: z * 0.5 }));
    let guard = null;
    const grime = [];
    let cleaned = 0;
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      for (const t of grime) g.removeInteractable(t);
      if (guard && guard.alive) {
        guard.announceBlinks = false;
        guard.board(outside.x + 6, outside.z);
      }
      if (e.contained && door.isOpen && !door.intersectsOpening(g.player.aabb())) door.close();
    };
    return new Task({
      title: "Work detail: clean SCP-173's chamber",
      giver: 'Site Intercom',
      kind: 'order',
      reward: 240,
      penalty: 30,
      standing: [20, 20],
      grants: { zones: [...ROUTE_HCZ, ch.zone], doors: ['d-block-gate', 'checkpoint-door', 'hcz-checkpoint', 'hcz-wing', ch.door] },
      announce: `${g.designation}, report to the Heavy Containment Wing. You are on SCP-173 chamber maintenance.`,
      steps: [
        new ReachStep({
          text: `Report to ${ch.name} in the Heavy Containment Wing`,
          point: outside,
          radius: 2.2,
          timeLimit: 230,
          detail: 'Through the Central Junction, up the North Corridor, through the HCZ Checkpoint.',
          onEnd: (gm, ok) => {
            if (!ok) return;
            const [wx, wz, wyaw] = ch.watch;
            guard = gm.spawnNpc({ id: `watcher-${Date.now()}`, name: this.guardNames[6], title: 'Containment Officer', kind: 'guard', x: wx, z: wz, yaw: wyaw });
            guard.faceToward(e.pos.x, e.pos.z);
            guard.yaw = guard.faceYaw;
            guard.announceBlinks = true;
            guard.blinkT = 6;
            door.open();
            this.run(async () => {
              await this.say(guard.name, "Listen. I keep my eyes on it. When I call 'Blinking!', YOU watch it until I'm done. Scrub the marked spots and get out.");
            });
          },
        }),
        new CustomStep({
          text: 'Scrub the marked spots',
          detail: "Keep it in sight whenever the officer blinks. Blink yourself (Q) while he's watching.",
          timeLimit: 150,
          reward: 60,
          onStart: (gm) => {
            for (const sp of spots) {
              const mesh = new THREE.Group();
              const mat = new THREE.MeshBasicMaterial({ color: 0x3a2618, transparent: true, opacity: 0.85, depthWrite: false });
              for (let i = 0; i < 3; i++) {
                const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4 + Math.random() * 0.4, 0.3 + Math.random() * 0.4), mat);
                m.rotation.x = -Math.PI / 2;
                m.rotation.z = Math.random() * 3;
                m.position.set(sp.x + (Math.random() - 0.5) * 0.4, 0.515 + i * 0.001, sp.z + (Math.random() - 0.5) * 0.4);
                mesh.add(m);
              }
              const t = gm.addTrigger(new Trigger({ id: 'grime', x: sp.x, y: 0.6, z: sp.z, half: [0.55, 0.15, 0.55], mesh }));
              t.action = {
                text: 'Scrub the floor',
                hold: 2.5,
                use: (gg) => {
                  cleaned++;
                  t.action = null;
                  gg.removeInteractable(t);
                  return { ok: true, message: `SPOT CLEANED ${cleaned}/3` };
                },
              };
              grime.push(t);
            }
          },
          update: () => cleaned >= 3,
          progress: () => `${cleaned}/3`,
          target: () => {
            const t = grime.find((x) => x.action);
            return t ? { x: t.origin.x, y: 0.8, z: t.origin.z } : null;
          },
        }),
        new ReachStep({
          text: 'Back out of the chamber — keep your eyes on it',
          point: outside,
          radius: 1.6,
          onEnd: () => cleanup(),
        }),
        this.returnStep(220),
      ],
      onEnd: () => cleanup(),
    });
  }

  // ---- Testing -----------------------------------------------------------------------
  makeTesting() {
    const g = this.game;
    const variant = pick(['endurance', 'retrieval', 'sequence']);
    const inLab = variant === 'sequence';
    const scp = `SCP-${1000 + Math.floor(Math.random() * 4000)}`;
    this.testCount++;
    const area = inLab
      ? { hall: this.pt('lab-hall'), inside: this.pt('lab-mark'), label: 'Laboratory A', zone: 'LABORATORY A', door: 'laboratory-a', post: 'sci-lab' }
      : { hall: this.pt('tc-hall'), inside: this.pt('tc-receptacle'), label: 'Test Chamber 01', zone: 'TEST CHAMBER 01', door: 'test-chamber-01', post: 'sci-observation' };
    const sci = this.testerAt(area.post);
    const ctx = { g, sci, scp, area, cleanup: [] };
    const exp = variant === 'endurance' ? this.endurance(ctx) : variant === 'retrieval' ? this.retrieval(ctx) : this.sequence(ctx);
    return new Task({
      title: `Testing: ${scp} (${area.label})`,
      giver: sci.name,
      kind: 'order',
      reward: 120,
      penalty: 25,
      standing: [15, 20],
      grants: { zones: [...ROUTE_EAST, 'RESEARCH WING', area.zone], doors: ['d-block-gate', 'checkpoint-door', 'research-wing', area.door] },
      steps: [
        new ReachStep({ text: `Report to ${area.label}`, zone: area.zone, targetFn: () => ({ x: area.inside.x, y: 1.3, z: area.inside.z }), timeLimit: 170, detail: 'Your route is authorized. Do not wander.' }),
        ...exp,
        this.returnStep(170),
      ],
      onEnd: (gm) => {
        this.sealTestDoor(area, false);
        gm.testFloor.stop();
        for (const fn of ctx.cleanup) fn();
        if (sci.engaged === 'test') gm.life.release(sci);
      },
      announce: `${g.designation}, report to ${area.label} for testing.`,
    });
  }

  testerAt(post) {
    const g = this.game;
    const life = g.life;
    // A researcher from the roster drops what they are doing and runs the test.
    if (life) {
      const p = this.pt(post);
      const free = life.people.filter((n) => n.alive && n.kind === 'scientist' && ['research', 'errands'].includes(n.def.job) && n.def.slot !== 'sci-keter'
        && !n.engaged && !n.talking && !n.busy && !n.shelter && !n.action && !this.tasks.inUse(n.id));
      const sci = free.sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z))[0];
      if (sci) {
        life.take(sci, 'test');
        sci.setItem('clipboard');
        sci.goTo(p.x, p.z, { speed: 1.8 }).then(() => {
          sci.faceYaw = ((p.yaw || 0) * Math.PI) / 180;
          sci.pose = 'tap';
        });
        return sci;
      }
    }
    let sci = g.npcs.get('tester');
    if (!sci || !sci.alive) {
      sci = g.spawnNpc({ id: 'tester', name: this.names[6], title: 'Senior Researcher', kind: 'scientist', at: post, chatter: ['Follow the instructions and you will be fine.', 'Please do not make this difficult.'] });
    } else {
      const p = this.pt(post);
      sci.stop();
      sci.goTo(p.x, p.z).then(() => (sci.faceYaw = ((p.yaw || 0) * Math.PI) / 180));
    }
    return sci;
  }

  sealTestDoor(area, on) {
    const door = this.game.doorsById.get(area.door);
    if (on) {
      door.close();
      door.sealed = 'TEST IN PROGRESS — DOOR SEALED';
    } else if (door.sealed) {
      door.sealed = null;
      door.open();
    }
    door.refreshLed();
  }

  exitStep(ctx) {
    return new ReachStep({
      text: `Exit ${ctx.area.label}`,
      point: ctx.area.hall,
      radius: 1.8,
      onStart: (g) => {
        this.sealTestDoor(ctx.area, false);
        g.say(ctx.sci.name, 'Test concluded. Return to D-Block.', 'pa');
      },
    });
  }

  endurance(ctx) {
    const { g, sci, scp } = ctx;
    const c = this.pt('tc-center');
    let hpStart = 0;
    let marker = null;
    ctx.cleanup.push(() => marker && g.removeFloorMarker(marker));
    return [
      new ReachStep({
        text: 'Stand on the marked platform',
        point: c,
        radius: 1.0,
        timeLimit: 40,
        onStart: (gm) => {
          marker = gm.addFloorMarker(c.x, c.z, 1.0);
          gm.say(sci.name, 'Subject, stand on the marked platform in the center of the chamber.', 'pa');
        },
        onEnd: (gm) => {
          this.sealTestDoor(ctx.area, true);
          if (marker) gm.removeFloorMarker(marker);
          marker = null;
        },
      }),
      new TimerStep({
        text: 'Survive the anomalous field',
        detail: 'Amber panels are about to activate. Never stand on a red one.',
        duration: 30,
        requireInside: false,
        reward: 40,
        onStart: (gm) => {
          hpStart = gm.player.damageTaken;
          gm.testFloor.start({ ratio: 0.45 + Math.random() * 0.15 });
          gm.say(sci.name, `Activating ${scp}. Avoid the active floor panels. Thirty seconds.`, 'pa');
        },
        onEnd: (gm, ok) => {
          gm.testFloor.stop();
          if (ok && gm.player.damageTaken === hpStart) this.tasks.award(100, 'Flawless test');
        },
      }),
      this.exitStep(ctx),
    ];
  }

  retrieval(ctx) {
    const { g, sci, scp } = ctx;
    const c = this.pt('tc-center');
    const r = this.pt('tc-receptacle');
    let item = null;
    let receptacle = null;
    let ped = null;
    let pedBox = null;
    ctx.cleanup.push(() => {
      if (item) g.removeInteractable(item);
      if (receptacle) g.removeInteractable(receptacle);
      if (ped) g.removeSessionObject(ped);
      if (pedBox) g.removeCollider(pedBox);
      g.player.carrying = null;
    });
    const objects = {};
    return [
      new CustomStep({
        text: `Retrieve ${scp} from the pedestal`,
        timeLimit: 60,
        onStart: (gm) => {
          ped = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), new THREE.MeshBasicMaterial({ color: 0x8a9098 }));
          ped.position.set(c.x, 0.9, c.z);
          gm.addSessionObject(ped);
          pedBox = [c.x - 0.25, 0.5, c.z - 0.25, c.x + 0.25, 1.3, c.z + 0.25];
          gm.addCollider(pedBox);
          item = gm.addPickup({ id: 'specimen', kind: 'specimen', x: c.x, y: 1.48, z: c.z, name: scp, color: 0x40e0ff });
          receptacle = gm.addTrigger(
            new Trigger({ id: 'receptacle', x: r.x, y: 1.0, z: r.z, half: [0.4, 0.45, 0.4], mesh: receptacleMesh(gm.world, r.x, r.z), collider: [r.x - 0.35, 0.5, r.z - 0.35, r.x + 0.35, 1.32, r.z + 0.35] }),
          );
          objects.receptacle = receptacle;
          this.sealTestDoor(ctx.area, true);
          gm.say(sci.name, `Subject, retrieve ${scp} from the pedestal. Calmly.`, 'pa');
        },
        update: () => item && item.taken,
        target: () => (item && !item.taken ? { x: c.x, y: 1.6, z: c.z } : null),
        onEnd: (gm, ok) => {
          if (!ok) return;
          gm.player.carrying = scp;
          gm.testFloor.start({ ratio: 0.35 + Math.random() * 0.15, warn: 1.3 });
          gm.say(sci.name, 'It is reacting. Into the receptacle by the door — watch the floor!', 'pa');
        },
      }),
      new CustomStep({
        text: `Place ${scp} in the containment receptacle`,
        detail: 'Avoid the red panels.',
        timeLimit: 45,
        onStart: () => {
          receptacle.action = {
            text: `Place ${scp} in the receptacle`,
            hold: 1,
            use: (gm) => {
              item.place(r.x, 1.5, r.z);
              item.enabled = false;
              gm.player.carrying = null;
              gm.testFloor.stop();
              objects.done = true;
              return { ok: true, message: `${scp} CONTAINED` };
            },
          };
        },
        update: () => !!objects.done,
        target: () => ({ x: r.x, y: 1.4, z: r.z }),
        reward: 40,
      }),
      this.exitStep(ctx),
    ];
  }

  sequence(ctx) {
    const { g, sci } = ctx;
    const mark = this.pt('lab-mark');
    const colors = shuffle([
      { name: 'GREEN', color: 0x40ff70 },
      { name: 'BLUE', color: 0x40a0ff },
      { name: 'RED', color: 0xff4040 },
    ]);
    let stands = [];
    let order = [];
    let idx = 0;
    let done = false;
    let marker = null;
    ctx.cleanup.push(() => {
      for (const s of stands) g.removeStand(s);
      if (marker) g.removeFloorMarker(marker);
    });
    return [
      new ReachStep({
        text: 'Stand on the marked position',
        point: mark,
        radius: 1.0,
        timeLimit: 40,
        onStart: (gm) => {
          stands = ['seq-1', 'seq-2', 'seq-3'].map((id, i) => {
            const p = this.pt(id);
            return gm.addStand({ id, x: p.x, z: p.z, color: colors[i].color, name: colors[i].name });
          });
          order = shuffle(stands);
          marker = gm.addFloorMarker(mark.x, mark.z, 1.0);
          gm.say(sci.name, 'Subject, stand on the marked position.', 'pa');
        },
        onEnd: () => this.sealTestDoor(ctx.area, true),
      }),
      new CustomStep({
        text: 'Touch the specimens in the order given',
        labelFn: () => `Touch the specimens: ${order.map((s, i) => (i < idx ? `[${s.name}]` : s.name)).join(' → ')}`,
        detail: 'A wrong touch triggers a discharge.',
        reward: 40,
        timeLimit: 60,
        onStart: (gm) => {
          gm.say(sci.name, `Touch the specimens in this order: ${order.map((s) => s.name).join(', then ')}.`, 'pa');
          for (const s of stands) {
            s.action = {
              text: `Touch the ${s.name.toLowerCase()} specimen`,
              use: (gg) => {
                if (done) return null;
                if (s === order[idx]) {
                  s.flash();
                  idx++;
                  if (idx >= order.length) done = true;
                  return { ok: true, message: `${s.name} — RESPONSE LOGGED` };
                }
                idx = 0;
                gg.player.damage(30, 'shock');
                gg.say(sci.name, 'Incorrect. Again, from the first specimen.', 'pa');
                return { ok: false, message: 'WRONG SEQUENCE — DISCHARGE' };
              },
            };
          }
        },
        update: () => done,
        progress: () => `${idx}/${order.length}`,
        target: () => {
          const s = order[Math.min(idx, order.length - 1)];
          return s ? { x: s.origin.x, y: s.origin.y + 0.4, z: s.origin.z } : null;
        },
        onEnd: () => {
          for (const s of stands) s.action = null;
        },
      }),
      new TimerStep({
        text: 'Hold position while the specimens stabilize',
        detail: 'The marked area is shielded. Pulses hit anyone outside it.',
        point: mark,
        radius: 1.1,
        duration: 15,
        reward: 30,
        onStart: (gm, step) => {
          step.pulseT = 3;
          gm.say(sci.name, 'Back to the marked position. Stay there.', 'pa');
        },
        tick: (gm, dt, step) => {
          step.pulseT -= dt;
          if (step.pulseT <= 0) {
            step.pulseT = 3.2;
            gm.ui.pulse();
            for (const s of stands) s.flash();
            if (!step.inside(gm)) {
              gm.player.damage(35, 'pulse');
              gm.ui.toast('RESONANCE PULSE — GET TO THE SHIELDED AREA', true);
            }
          }
        },
      }),
      this.exitStep(ctx),
    ];
  }
}
