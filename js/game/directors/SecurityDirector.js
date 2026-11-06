// Security Guard shift: log in, walk a randomized patrol and inspect
// checkpoint logs, then handle randomized facility assignments (VIP escort,
// document delivery, reader repair). A containment breach interrupts the
// shift and turns it into breach response, evacuation and grid recovery.

import { Director, shuffle, pick, rand } from './Director.js';
import { Assignment, ReachStep, ActionStep, PickupStep, PatrolStep, EscortStep, CustomStep } from '../objectives.js';
import { BREACH_ORIGINS } from '../Events.js';
import { Trigger } from '../Interactables.js';

const ROUTES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Kilo', 'Sierra'];
const PATROL = [
  'patrol-dblock', 'patrol-commons', 'patrol-cafeteria', 'patrol-storage', 'patrol-hub',
  'patrol-north', 'patrol-research', 'patrol-medical', 'patrol-lobby', 'patrol-breakroom',
];
const LOGS = {
  'log-alpha': 'Checkpoint Alpha',
  'log-hcz': 'the HCZ Checkpoint',
  'log-research': 'the Research Wing entrance',
  'log-lobby': 'Lobby reception',
};
const FAULTY = ['cafeteria', 'medical-bay', 'records-office', 'storage', 'research-office', 'administration', 'break-room', 'kitchen'];
const CHATTER = [
  ['DISPATCH', 'Unit four, the coffee machine in the break room is down again. Low priority.'],
  ['DISPATCH', 'Reminder: Class-D headcount discrepancies go to Checkpoint Alpha, not to me.'],
  ['OFFICER (RADIO)', 'Lobby to dispatch, elevator technicians still have not shown up.'],
  ['DISPATCH', 'Research Wing reports a door cycling on its own. Probably nothing.'],
  ['OFFICER (RADIO)', 'HCZ post, all quiet. Gate is sealed and staying that way.'],
];

export class SecurityDirector extends Director {
  setup() {
    const g = this.game;
    this.spawnAmbient();
    const lind = g.spawnNpc({
      id: 'sci-lindqvist',
      name: this.names[0],
      title: 'Senior Researcher',
      kind: 'scientist',
      at: 'vip-laba',
      chatter: ['Lab A is running sequence trials today.', 'Have you seen my clipboard?'],
    });
    const P = (...ids) => ids.map((id) => [this.pt(id).x, this.pt(id).z]);
    lind.wander(P('vip-laba', 'w-laba', 'w-res-1', 'sci-observation'), [8, 16]);
    this.chief = g.npcs.get('chief');
    this.breachAt = rand(420, 560);
  }

  start() {
    this.begin(this.shift);
    // Hard upper bound: the breach happens even if the officer dawdles.
    this.after(this.breachAt, () => this.breach());
    this.chatterLoop();
  }

  chatterLoop() {
    const lines = shuffle(CHATTER);
    let i = 0;
    const next = () => {
      this.after(rand(70, 120), () => {
        if (this.game.events.state === 'normal' && i < lines.length) {
          const [who, text] = lines[i++];
          this.game.say(who, text, 'radio');
          next();
        }
      });
    };
    next();
  }

  breach(originKey) {
    const g = this.game;
    if (g.events.state !== 'normal') return;
    this.om.suspend('Emergency protocol in effect');
    g.events.triggerBreach(originKey || pick(['hcz', 'research']));
    this.begin(this.emergency);
  }

  async shift(gen) {
    const g = this.game;
    const chief = this.chief;
    await this.wait(2.5);
    chief.faceToward(g.player.pos.x, g.player.pos.z);
    await this.say(chief.name, `Morning, ${g.designation}. Log in at the duty terminal and pull today's assignments.`);

    const duty = g.terminals.get('duty');
    await this.assign(
      new Assignment({
        title: 'Start of Shift',
        giver: chief.name,
        steps: [
          new ActionStep({
            text: 'Log in at the duty terminal',
            detail: 'The duty terminal is on the north wall of the Security Office.',
            object: duty,
            action: { text: 'Log in to the duty roster', hold: 1.5 },
            screen: 'AWAITING LOGIN',
            doneScreen: 'SHIFT ACTIVE',
            reward: 20,
          }),
        ],
      }),
      gen,
    );

    // Randomized patrol route and checkpoint inspections.
    const route = pick(ROUTES);
    const points = shuffle(PATROL).slice(0, 4).map((id) => {
      const p = this.pt(id);
      return { x: p.x, z: p.z, r: 2.4, label: p.label };
    });
    const logs = shuffle(Object.keys(LOGS)).slice(0, 2);
    await this.say(chief.name, `You're on patrol route ${route}. Check in at every point, and verify the logs at ${LOGS[logs[0]]} and ${LOGS[logs[1]]}.`);
    await this.assign(
      new Assignment({
        title: `Patrol Route ${route}`,
        giver: chief.name,
        bonus: 100,
        steps: [
          new PatrolStep({
            text: `Walk patrol route ${route}`,
            detail: 'Check in at each patrol point, in any order.',
            points,
            onVisit: (gm, p) => this.om.award(25, `Patrol point checked: ${p.label}`),
          }),
          ...logs.map(
            (id) =>
              new ActionStep({
                text: `Verify the checkpoint log at ${LOGS[id]}`,
                object: g.terminals.get(id),
                action: { text: 'Verify checkpoint log', hold: 2.5 },
                screen: 'LOG REVIEW PENDING',
                doneScreen: 'LOG VERIFIED',
                reward: 40,
              }),
          ),
        ],
      }),
      gen,
    );

    // Two randomized facility assignments, each introduced over the radio.
    const pool = shuffle(['escort', 'delivery', 'repair']).slice(0, 2);
    for (const task of pool) {
      await this.wait(rand(6, 12));
      await this[task](gen);
    }
    await this.wait(rand(10, 20));
    this.breach();
  }

  // ---- Facility assignments --------------------------------------------
  async escort(gen) {
    const g = this.game;
    const options = [
      { npc: 'sci-okafor', from: 'vip-resoff' },
      { npc: 'sci-vance', from: 'vip-records' },
      { npc: 'sci-lindqvist', from: 'vip-laba' },
    ].filter((o) => g.npcs.get(o.npc) && g.npcs.get(o.npc).alive);
    const choice = pick(options);
    const npc = g.npcs.get(choice.npc);
    const from = this.pt(choice.from);
    const dests = ['dest-admin', 'dest-cafeteria', 'dest-lobby', 'dest-medical', 'dest-hcz'].map((id) => this.pt(id, 2.2));
    const dest = pick(dests.filter((d) => Math.hypot(d.x - from.x, d.z - from.z) > 15));
    npc.stop();
    npc.goTo(from.x, from.z).then(() => npc.idleAt());
    await this.say('DISPATCH', `${npc.name} needs an escort from the ${from.label} to the ${dest.label}. Pick them up and stay with them.`, 'radio');
    await this.assign(
      new Assignment({
        title: `VIP Escort: ${npc.name}`,
        giver: 'Dispatch',
        bonus: 50,
        penalty: 50,
        steps: [
          new EscortStep({
            text: `Escort ${npc.name}`,
            npc,
            dest,
            from: from.label,
            reward: 150,
            onMeet: (gm) => gm.say(npc.name, 'Thank you, officer. Lead the way.'),
            onEnd: (gm, ok) => {
              if (ok) gm.say(npc.name, 'This is me. Appreciated.');
            },
          }),
        ],
      }),
      gen,
    );
  }

  async delivery(gen) {
    const g = this.game;
    const src = this.pt(pick(['doc-records', 'doc-admin']));
    const recipient = pick([this.chief, g.npcs.get('sci-okafor')].filter((n) => n && n.alive));
    const doc = g.addPickup({
      id: 'document',
      kind: 'document',
      x: src.x,
      y: 0.5 + src.h,
      z: src.z,
      name: 'Incident Report',
      onPickup: (gm) => {
        gm.player.carrying = 'Incident Report';
        gm.ui.setItem('Carrying: Incident Report');
      },
    });
    await this.say('DISPATCH', `There's an overnight incident report waiting in the ${src.label}. Hand-deliver it to ${recipient.name}.`, 'radio');
    await this.assign(
      new Assignment({
        title: 'Document Delivery',
        giver: 'Dispatch',
        bonus: 40,
        steps: [
          new PickupStep({ text: `Collect the incident report from the ${src.label}`, item: doc, reward: 30 }),
          new ActionStep({
            text: `Deliver the report to ${recipient.name}`,
            object: recipient,
            action: { text: `Hand over the incident report`, sub: recipient.name },
            reward: 90,
            onUse: (gm) => {
              gm.player.carrying = null;
              gm.ui.setItem(null);
              recipient.faceToward(gm.player.pos.x, gm.player.pos.z);
              gm.say(recipient.name, 'Finally. Thank you, officer.');
              return { ok: true, message: 'REPORT DELIVERED' };
            },
          }),
        ],
      }),
      gen,
    );
  }

  async repair(gen) {
    const g = this.game;
    const door = g.doorsById.get(pick(FAULTY));
    door.faulty = true;
    door.close();
    const b = door.buttonBoxes[0];
    const e = 0.04;
    const trigger = g.addTrigger(
      new Trigger({
        id: 'reader-repair',
        x: (b[0] + b[3]) / 2,
        y: (b[1] + b[4]) / 2,
        z: (b[2] + b[5]) / 2,
        half: [(b[3] - b[0]) / 2 + e, (b[4] - b[1]) / 2 + e, (b[5] - b[2]) / 2 + e],
      }),
    );
    await this.say('DISPATCH', `Maintenance reports a fault on the ${door.name} door reader. Reset it and confirm the door cycles.`, 'radio');
    await this.assign(
      new Assignment({
        title: `Reader Fault: ${door.name}`,
        giver: 'Dispatch',
        bonus: 30,
        steps: [
          new ActionStep({
            text: `Reset the faulty reader on the ${door.name} door`,
            detail: 'The faulty reader blinks amber.',
            object: trigger,
            action: { text: 'Reset door reader', sub: 'Maintenance override', hold: 4 },
            reward: 90,
            onUse: () => {
              door.faulty = false;
              door.refreshLed();
              return { ok: true, message: 'READER RESET' };
            },
          }),
          new CustomStep({
            text: `Test the ${door.name} door`,
            update: () => door.isOpen,
            target: () => ({ x: door.origin.x, y: door.origin.y + 1.3, z: door.origin.z }),
            reward: 30,
          }),
        ],
      }),
      gen,
    );
    g.removeInteractable(trigger);
  }

  // ---- Emergency --------------------------------------------------------
  async emergency(gen) {
    const g = this.game;
    const o = g.events.originDef;
    const chief = this.chief;
    this.shelterResearchers();
    for (const id of ['guard-booth', 'guard-lobby']) {
      const n = g.npcs.get(id);
      if (n && n.alive) {
        const p = this.pt(id === 'guard-lobby' ? 'evac' : 'patrol-dblock');
        n.goTo(p.x, p.z, { speed: 3 });
      }
    }
    await this.wait(2);
    await this.say(chief.name, `All units, containment breach in ${o.label}! ${g.designation}, get to ${o.site} and re-engage the containment locks. Do not engage the anomalies — avoid them.`, 'radio');

    const locks = shuffle(o.locks).slice(0, 2).map((id) => g.terminals.get(id));
    const site = this.pt(o.point);
    await this.assign(
      new Assignment({
        title: 'Breach Response',
        giver: chief.name,
        kind: 'emergency',
        bonus: 100,
        steps: [
          new ReachStep({ text: `Get to ${o.site}`, zone: o.zone, targetFn: () => ({ x: site.x, y: 1.3, z: site.z }), reward: 50 }),
          ...locks.map(
            (t, i) =>
              new ActionStep({
                text: `Re-engage containment lock ${i === 0 ? 'A' : 'B'}`,
                detail: 'Hold the interaction until the lock engages. Keep away from the anomalies.',
                object: t,
                action: { text: 'Re-engage containment lock', hold: 4 },
                alert: true,
                screen: 'LOCK DISENGAGED',
                doneScreen: 'LOCK ENGAGED',
                reward: 100,
              }),
          ),
        ],
        onComplete: (gm) => gm.events.secureContainment(),
      }),
      gen,
    );

    await this.wait(3);
    for (const task of shuffle(['evacuate', 'restoreGrid'])) {
      await this.wait(2);
      await this[task](gen);
    }
    await this.wait(2);
    await this.say(chief.name, 'All sections report secure. Good work out there, officer — that is the end of your shift.', 'radio');
    g.endShift('complete');
  }

  async evacuate(gen) {
    const g = this.game;
    const people = ['sci-harrow', 'sci-okafor', 'sci-vance', 'sci-lindqvist']
      .map((id) => g.npcs.get(id))
      .filter((n) => n && n.alive && n.shelter);
    const pair = shuffle(people).slice(0, 2);
    if (!pair.length) return;
    const evac = this.pt('evac', 2.4);
    const car = this.pt('evac-car');
    const where = pair.map((n) => `${n.name} in the ${n.shelter.label}`).join(' and ');
    await this.say('DISPATCH', `Researchers are sheltering: ${where}. Escort them to the evacuation elevator in the lobby.`, 'radio');
    await this.assign(
      new Assignment({
        title: 'Assist Evacuation',
        giver: 'Dispatch',
        kind: 'emergency',
        bonus: 80,
        penalty: 60,
        steps: pair.map(
          (npc) =>
            new EscortStep({
              text: `Evacuate ${npc.name}`,
              npc,
              dest: { ...evac, label: 'evacuation elevator' },
              from: npc.shelter.label,
              meetText: `Evacuate ${npc.name}`,
              reward: 120,
              onMeet: (gm) => gm.say(npc.name, 'Oh thank god. Get me out of here.'),
              onEnd: (gm, ok) => {
                if (ok) {
                  npc.board(car.x, car.z);
                  gm.say(npc.name, 'Thank you, officer!');
                }
              },
            }),
        ),
      }),
      gen,
    );
  }

  async restoreGrid(gen) {
    const g = this.game;
    if (!g.events.gridOffline) return;
    await this.say(this.chief.name, 'The breach knocked the security grid offline — every reader is failing open. Reboot it from Grid Control in the server room.', 'radio');
    await this.assign(
      new Assignment({
        title: 'Restore Security Systems',
        giver: this.chief.name,
        kind: 'emergency',
        bonus: 60,
        steps: [
          new ActionStep({
            text: 'Reboot the security grid in the Server Room',
            object: g.terminals.get('server-reboot'),
            action: { text: 'Reboot security grid', hold: 6 },
            alert: true,
            screen: 'GRID FAILURE',
            doneScreen: 'GRID ONLINE',
            reward: 120,
            onUse: (gm) => {
              gm.events.restoreSecurity();
              return { ok: true, message: 'SECURITY GRID REBOOTED' };
            },
          }),
          new ActionStep({
            text: 'Confirm grid status at the duty terminal',
            object: g.terminals.get('duty'),
            action: { text: 'Confirm security grid status', hold: 1.5 },
            screen: 'CONFIRM GRID',
            doneScreen: 'ALL SYSTEMS NOMINAL',
            reward: 40,
          }),
        ],
      }),
      gen,
    );
  }
}

