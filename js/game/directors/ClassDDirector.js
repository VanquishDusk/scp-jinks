// Class-D shift: called for testing over the intercom, escorted to a testing
// area, run through a randomized experiment, then — when the facility's
// containment fails — left to find a way out.

import { Director, shuffle, pick, rand } from './Director.js';
import { Assignment, ReachStep, ActionStep, PickupStep, PatrolStep, FollowStep, TimerStep, CustomStep } from '../objectives.js';
import { Trigger, receptacleMesh } from '../Interactables.js';
import * as THREE from 'three';

const EXPLORE_ZONES = [
  ['RECORDS OFFICE', 'Records Office'],
  ['RESEARCH OFFICES', 'Research Office'],
  ['ADMINISTRATION OFFICES', 'Administration Offices'],
  ['LABORATORY A', 'Laboratory A'],
  ['TEST CHAMBER OBSERVATION', 'Observation Room'],
  ['KITCHEN', 'Kitchen'],
  ['MEDICAL BAY', 'Medical Bay'],
  ['STAFF BREAK ROOM', 'Staff Break Room'],
  ['CAFETERIA', 'Cafeteria'],
];

export class ClassDDirector extends Director {
  setup() {
    const g = this.game;
    this.variant = pick(['endurance', 'retrieval', 'sequence']);
    this.scp = `SCP-${1000 + Math.floor(Math.random() * 4000)}`;
    this.inLab = this.variant === 'sequence';
    this.area = this.inLab
      ? { hall: this.pt('lab-hall'), label: 'Laboratory A', zone: 'LABORATORY A', door: 'laboratory-a' }
      : { hall: this.pt('tc-hall'), label: 'Test Chamber 01', zone: 'TEST CHAMBER 01', door: 'test-chamber-01' };

    this.spawnAmbient();
    this.sci = g.spawnNpc({
      id: 'sci-lindqvist',
      name: this.names[0],
      title: 'Senior Researcher',
      kind: 'scientist',
      at: this.inLab ? 'sci-lab' : 'sci-observation',
      chatter: ['Follow the instructions and you will be fine.', 'Please do not make this difficult.'],
    });
    this.guard = g.spawnNpc({
      id: 'escort',
      name: this.guardNames[0],
      title: 'Escort Officer',
      kind: 'guard',
      at: 'guard-escort',
      chatter: ['Keep moving.', 'Eyes forward, D-class.'],
    });
  }

  start() {
    this.begin(this.shift);
  }

  breach(origin) {
    const g = this.game;
    if (g.events.state !== 'normal') return;
    this.om.suspend('Emergency protocol in effect');
    g.testFloor.stop();
    g.events.triggerBreach(origin);
    this.begin(this.emergency);
  }

  async shift(gen) {
    const g = this.game;
    const sp = g.spawn;
    const inside = { x: sp.inside[0] * 0.5, z: sp.inside[1] * 0.5 };
    const outside = { x: sp.outside[0] * 0.5, z: sp.outside[1] * 0.5 };
    const cellDoor = g.doorsById.get(sp.cell.toLowerCase().replace(/\s+/g, '-'));
    const guard = this.guard;
    const area = this.area;

    await this.wait(2.5);
    await this.say('SITE INTERCOM', 'Good morning, D-Block. Headcount is complete. Remain in your cells until called.', 'pa');
    await this.wait(5);
    await this.say('SITE INTERCOM', `${g.designation}, you are on today's testing schedule. Stand by at your cell door for escort.`, 'pa');
    this.check(gen);

    guard.goTo(outside.x, outside.z).then((ok) => {
      if (ok) guard.faceToward(inside.x, inside.z);
    });

    await this.assign(
      new Assignment({
        title: 'Testing Schedule',
        giver: 'Site Intercom',
        steps: [
          new ReachStep({ text: 'Stand by at your cell door', point: inside, radius: 1.0, reward: 15, detail: 'An escort officer is on the way.' }),
          new CustomStep({
            text: `Wait for ${guard.name}`,
            detail: 'Stay at the door until your escort arrives.',
            update: () => guard.arrived,
            target: () => ({ x: guard.pos.x, y: 2.1, z: guard.pos.z }),
          }),
        ],
      }),
      gen,
    );

    cellDoor.open();
    await this.say(guard.name, `${g.designation}. Out. You're with me — keep up and keep your hands where I can see them.`);

    const entry = this.inLab ? this.pt('lab-mark') : this.pt('tc-receptacle');
    await this.assign(
      new Assignment({
        title: `Report to ${area.label}`,
        giver: guard.name,
        steps: [
          new FollowStep({
            text: `Follow ${guard.name} to ${area.label}`,
            npc: guard,
            dest: area.hall,
            reward: 50,
            detail: 'Your escort will open the doors along the route.',
          }),
          new ReachStep({
            text: `Enter ${area.label}`,
            zone: area.zone,
            targetFn: () => ({ x: entry.x, y: 1.3, z: entry.z }),
            reward: 20,
            onStart: (gm) => {
              gm.doorsById.get(area.door).open();
              gm.say(guard.name, 'In you go. I will be right here.');
              guard.faceToward(entry.x, entry.z);
            },
          }),
        ],
      }),
      gen,
    );

    if (this.variant === 'endurance') await this.endurance(gen);
    else if (this.variant === 'retrieval') await this.retrieval(gen);
    else await this.sequence(gen);

    await this.say(this.sci.name, 'That concludes the test. Your escort will return you to D-Block.', 'pa');
    // The breach strikes while the subject is being walked back.
    this.after(rand(10, 26), () => this.breach(pick(['hcz', 'research'])));
    await this.assign(
      new Assignment({
        title: 'Return to D-Block',
        giver: guard.name,
        steps: [
          new FollowStep({ text: `Follow ${guard.name} back to D-Block`, npc: guard, dest: outside, reward: 30 }),
          new ReachStep({ text: 'Return to your cell', point: inside, radius: 1.0, reward: 20 }),
        ],
      }),
      gen,
    );
    // Back in the cell before the alarm: it goes off any second now.
    cellDoor.close();
  }

  sealTestDoor(on) {
    const door = this.game.doorsById.get(this.area.door);
    if (on) {
      door.close();
      door.sealed = 'TEST IN PROGRESS — DOOR SEALED';
    } else {
      door.sealed = null;
      door.open();
    }
    door.refreshLed();
  }

  exitStep(text) {
    return new ReachStep({
      text,
      point: this.area.hall,
      radius: 1.8,
      reward: 20,
      onStart: (g) => {
        this.sealTestDoor(false);
        g.say(this.sci.name, 'You may exit now. Your escort is waiting outside.', 'pa');
      },
    });
  }

  // ---- Experiments ------------------------------------------------------
  async endurance(gen) {
    const g = this.game;
    const c = this.pt('tc-center');
    const sci = this.sci;
    let hpStart = 0;
    const marker = g.addFloorMarker(c.x, c.z, 1.0);
    await this.say(sci.name, `Subject ${g.designation}, welcome to Test Chamber 01. Proceed to the marked platform in the center of the room.`, 'pa');
    await this.assign(
      new Assignment({
        title: `Experiment ${this.scp}: Field Endurance`,
        giver: sci.name,
        bonus: 40,
        steps: [
          new ReachStep({
            text: 'Stand on the marked platform',
            point: c,
            radius: 1.0,
            reward: 25,
            onEnd: (gm) => {
              this.sealTestDoor(true);
              gm.removeFloorMarker(marker);
            },
          }),
          new TimerStep({
            text: 'Survive the anomalous field',
            detail: 'Amber panels are about to activate. Never stand on a red panel.',
            duration: 30,
            requireInside: false,
            reward: 150,
            onStart: (gm) => {
              hpStart = gm.player.damageTaken;
              gm.testFloor.start({ ratio: 0.45 });
              gm.say(sci.name, `Activating ${this.scp}. Avoid the active floor panels. Thirty seconds.`, 'pa');
            },
            onEnd: (gm, ok) => {
              gm.testFloor.stop();
              if (ok && gm.player.damageTaken === hpStart) this.om.award(75, 'Flawless test bonus');
            },
          }),
          this.exitStep('Exit the test chamber'),
        ],
      }),
      gen,
    );
  }

  async retrieval(gen) {
    const g = this.game;
    const c = this.pt('tc-center');
    const r = this.pt('tc-receptacle');
    const sci = this.sci;
    const pedMat = new THREE.MeshBasicMaterial({ color: 0x8a9098 });
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), pedMat);
    ped.position.set(c.x, 0.9, c.z);
    g.addSessionObject(ped);
    g.addCollider([c.x - 0.25, 0.5, c.z - 0.25, c.x + 0.25, 1.3, c.z + 0.25]);
    const item = g.addPickup({ id: 'specimen', kind: 'specimen', x: c.x, y: 1.48, z: c.z, name: this.scp, color: 0x40e0ff });
    const receptacle = g.addTrigger(
      new Trigger({
        id: 'receptacle',
        x: r.x,
        y: 1.0,
        z: r.z,
        half: [0.4, 0.45, 0.4],
        mesh: receptacleMesh(g.world, r.x, r.z),
        collider: [r.x - 0.35, 0.5, r.z - 0.35, r.x + 0.35, 1.32, r.z + 0.35],
      }),
    );
    await this.say(sci.name, `Subject, retrieve ${this.scp} from the pedestal. Handle it calmly.`, 'pa');
    await this.assign(
      new Assignment({
        title: `Experiment ${this.scp}: Object Retrieval`,
        giver: sci.name,
        bonus: 40,
        steps: [
          new PickupStep({
            text: `Retrieve ${this.scp} from the pedestal`,
            item,
            reward: 50,
            onStart: () => this.sealTestDoor(true),
            onEnd: (gm, ok) => {
              if (!ok) return;
              gm.player.carrying = this.scp;
              gm.testFloor.start({ ratio: 0.35, warn: 1.4 });
              gm.say(sci.name, 'It is reacting to handling. Get it into the receptacle by the door — and watch the floor.', 'pa');
            },
          }),
          new ActionStep({
            text: `Place ${this.scp} in the containment receptacle`,
            detail: 'Avoid the red panels on the way.',
            object: receptacle,
            action: { text: `Place ${this.scp} in the receptacle`, hold: 1.0 },
            reward: 125,
            onUse: (gm) => {
              item.place(r.x, 1.5, r.z);
              item.enabled = false;
              gm.player.carrying = null;
              gm.testFloor.stop();
              return { ok: true, message: `${this.scp} CONTAINED` };
            },
          }),
          this.exitStep('Exit the test chamber'),
        ],
      }),
      gen,
    );
  }

  async sequence(gen) {
    const g = this.game;
    const sci = this.sci;
    const mark = this.pt('lab-mark');
    const colors = shuffle([
      { name: 'GREEN', color: 0x40ff70 },
      { name: 'BLUE', color: 0x40a0ff },
      { name: 'RED', color: 0xff4040 },
    ]);
    const stands = ['seq-1', 'seq-2', 'seq-3'].map((id, i) => {
      const p = this.pt(id);
      return g.addStand({ id, x: p.x, z: p.z, color: colors[i].color, name: colors[i].name });
    });
    const order = shuffle(stands);
    let idx = 0;
    let done = false;
    const markerMesh = g.addFloorMarker(mark.x, mark.z, 1.0);

    await this.say(sci.name, `Subject ${g.designation}, stand on the marked position in front of the specimens.`, 'pa');
    await this.assign(
      new Assignment({
        title: `Experiment ${this.scp}: Sequence Response`,
        giver: sci.name,
        bonus: 40,
        steps: [
          new ReachStep({ text: 'Stand on the marked position', point: mark, radius: 1.0, reward: 20, onEnd: () => this.sealTestDoor(true) }),
          new CustomStep({
            text: 'Touch the specimens in the order given',
            labelFn: () => `Touch the specimens: ${order.map((s, i) => (i < idx ? `[${s.name}]` : s.name)).join(' → ')}`,
            detail: 'A wrong touch triggers a discharge and resets the sequence.',
            reward: 150,
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
                      return { ok: true, message: `${s.name} SPECIMEN — RESPONSE LOGGED` };
                    }
                    idx = 0;
                    gg.player.damage(25, 'shock');
                    gg.say(sci.name, 'Incorrect. Discharge noted. Begin again from the first specimen.', 'pa');
                    return { ok: false, message: 'WRONG SEQUENCE — ANOMALOUS DISCHARGE' };
                  },
                };
              }
            },
            update: () => done,
            progress: () => `${idx}/${order.length}`,
            target: () => {
              const s = order[Math.min(idx, order.length - 1)];
              return { x: s.origin.x, y: s.origin.y + 0.4, z: s.origin.z };
            },
            onEnd: () => {
              for (const s of stands) s.action = null;
            },
          }),
          new TimerStep({
            text: 'Hold position while the specimens stabilize',
            detail: 'The marked area is shielded. Resonance pulses hit anyone outside it.',
            point: mark,
            radius: 1.1,
            duration: 15,
            reward: 100,
            onStart: (gm, step) => {
              step.pulseT = 3;
              gm.say(sci.name, 'Good. Return to the marked position and stay there while the specimens settle.', 'pa');
            },
            tick: (gm, dt, step) => {
              step.pulseT -= dt;
              if (step.pulseT <= 0) {
                step.pulseT = 3.5;
                gm.ui.pulse();
                for (const s of stands) s.flash();
                if (!step.inside(gm)) {
                  gm.player.damage(30, 'pulse');
                  gm.ui.toast('RESONANCE PULSE — RETURN TO THE SHIELDED AREA', true);
                }
              }
            },
            onEnd: (gm) => gm.removeFloorMarker(markerMesh),
          }),
          this.exitStep('Leave the laboratory'),
        ],
      }),
      gen,
    );
  }

  // ---- Emergency --------------------------------------------------------
  async emergency(gen) {
    const g = this.game;
    const guard = this.guard;
    const origin = g.events.originDef;
    guard.stop();
    this.shelterResearchers();

    await this.wait(1.5);
    await this.say(guard.name, 'Control, say again? ...A breach? Copy. D-class — stay right here. Do NOT move!');
    const site = this.pt(origin.point);
    guard.goTo(site.x, site.z, { speed: 3.4 });
    await this.wait(2);
    await this.say('SECURITY RADIO (OVERHEARD)', 'All units, grid is down! Every reader up to Level 2 is failing open. Lock down what you can!', 'radio');

    // A fleeing researcher dropped a keycard somewhere nearby.
    const spots = shuffle(['key-1', 'key-2', 'key-3', 'key-4', 'key-5', 'key-6']).map((id) => this.pt(id));
    spots.sort((a, b) => g.events.nearestAnomaly(b.x, b.z) - g.events.nearestAnomaly(a.x, a.z));
    const spot = pick(spots.slice(0, 3));
    const card = g.addPickup({
      id: 'keycard',
      kind: 'keycard',
      x: spot.x,
      y: 0.55,
      z: spot.z,
      name: 'Level 2 Keycard',
      onPickup: (gm) => {
        gm.player.keycard = 2;
        gm.ui.setItem('Keycard: Level 2');
      },
    });

    const zones = shuffle(EXPLORE_ZONES).slice(0, 4);
    this.om.addOptional(
      new Assignment({
        title: 'Explore areas opened by the emergency',
        kind: 'optional',
        bonus: 100,
        steps: [
          new PatrolStep({
            text: 'Explore restricted areas',
            showMarker: false,
            points: zones.map(([zone, label]) => ({ zone, label })),
            onVisit: (gm, p) => this.om.award(40, `Area explored: ${p.label}`),
          }),
        ],
      }),
    );

    await this.wait(2);
    await this.say(g.designation, 'Doors are open... This is my chance.', 'thought');
    await this.assign(
      new Assignment({
        title: 'Escape the Facility',
        giver: 'Your own initiative',
        kind: 'emergency',
        steps: [
          new PickupStep({
            text: 'Find a Level 2 keycard',
            item: card,
            marker: 'near',
            reward: 100,
            detail: `Staff fled in a hurry. Someone may have dropped a keycard — try the ${spot.area}.`,
          }),
          new ReachStep({
            text: 'Reach the maintenance access in Storage',
            point: this.pt('maint-door'),
            radius: 1.8,
            reward: 50,
            detail: 'Storage is off the west corridor, between D-Block and the Central Junction.',
            onStart: (gm) => gm.say('SITE INTERCOM', 'Maintenance shafts are now unsealed for emergency egress of essential personnel.', 'pa'),
          }),
          new ReachStep({
            text: 'Get through the maintenance access',
            zone: 'MAINTENANCE SHAFT',
            targetFn: () => ({ ...this.pt('maint-shaft'), y: 1.3 }),
            reward: 50,
            detail: 'The access door needs Level 2 clearance.',
          }),
          new ActionStep({
            text: 'Climb to the surface',
            object: g.ladder,
            action: { text: 'Climb the ladder to the surface', hold: 1.5 },
            reward: 300,
          }),
        ],
      }),
      gen,
    );
    g.endShift('escaped');
  }
}
