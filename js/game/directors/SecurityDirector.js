// Security Guard shift (sandbox).
//
// Your pager fills up with jobs drawn at random from a pool — patrols, log
// checks, VIP escorts, deliveries, reader repairs, Class-D transfers — each
// with a deadline. Up to three run at once; you decide what to do first and
// what to let slip. Facility events add emergencies on top: handle them
// before the response teams have to step in, or it goes on your record.
// Performance hits zero and you are dismissed. Anomalies and rioters can
// kill you.

import { Director, shuffle, pick, rand, SHIFT_LENGTH } from './Director.js';
import { Task, ReachStep, ActionStep, PickupStep, PatrolStep, EscortStep, CustomStep, withThe } from '../objectives.js';
import { Trigger } from '../Interactables.js';

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
  ['DISPATCH', 'Reminder: Class-D headcount discrepancies go to Checkpoint Alpha.'],
  ['OFFICER (RADIO)', 'Lobby to dispatch, elevator technicians still have not shown up.'],
  ['DISPATCH', 'Research Wing reports a door cycling on its own. Probably nothing.'],
  ['OFFICER (RADIO)', 'HCZ post, all quiet. Gate is sealed and staying that way.'],
  ['DISPATCH', 'Whoever parked a cart in the south corridor, move it.'],
];

export class SecurityDirector extends Director {
  setup() {
    this.standingLabel = 'PERFORMANCE';
    this.standing = 50;
    this.spawnAmbient();
    this.chief = this.game.npcs.get('chief');
    this.taskGap = 6;
    this.maxTasks = 2;
    this.chatter = shuffle(CHATTER);
    this.chatterAt = rand(60, 120);

    this.templates = {
      patrol: { weight: 3, cooldown: 90, make: () => this.makePatrol() },
      checklog: { weight: 3, cooldown: 60, make: () => this.makeLogCheck() },
      escort: { weight: 2, cooldown: 120, can: () => this.vipCandidates().length > 0, make: () => this.makeEscort() },
      delivery: { weight: 2, cooldown: 120, make: () => this.makeDelivery() },
      repair: { weight: 2, cooldown: 100, make: () => this.makeRepair() },
      transfer: { weight: 2, cooldown: 150, can: () => this.classdCandidates().length > 0 && !this.game.events.busy, make: () => this.makeTransfer() },
    };
  }

  start() {
    super.start();
    this.run(async () => {
      await this.wait(2);
      this.chief.faceToward(this.game.player.pos.x, this.game.player.pos.z);
      await this.say(this.chief.name, `Morning, ${this.game.designation}. Jobs come through on your pager — prioritize, and don't let anything slip. It all goes on your record.`);
    });
  }

  onStandingZero() {
    this.game.say(this.chief.name, "That's enough. Hand in your badge — you're done here.", 'radio');
    this.finish('dismissed');
  }

  tick(dt) {
    // More jobs pile up as the shift goes on.
    this.maxTasks = this.clock > 240 ? 3 : 2;
    const normal = this.tasks.active.filter((t) => t.kind === 'task').length;
    this.taskGap -= dt;
    if (this.taskGap <= 0 && normal < this.maxTasks && this.clock < SHIFT_LENGTH - 60) {
      this.issueRandomTask();
      this.taskGap = normal < 1 ? rand(12, 22) : rand(30, 65);
    }
    if (this.clock > this.chatterAt && this.chatter.length && !this.game.events.busy) {
      const [who, text] = this.chatter.pop();
      this.game.say(who, text, 'radio');
      this.chatterAt = this.clock + rand(80, 150);
    }
    // Rioters lash out at officers who get too close.
    const p = this.game.player;
    for (const n of this.game.npcs.values()) {
      if (n.rioting && n.alive && !p.dead && Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 1.0) p.damage(10 * dt, 'riot');
    }
  }

  endOfShift() {
    this.game.say(this.chief.name, 'Shift is over, officer. Hand over to the night crew.', 'radio');
    this.finish('complete');
  }

  // ---- Event reactions -----------------------------------------------------------
  onFacilityEvent(name, data) {
    super.onFacilityEvent(name, data);
    const g = this.game;
    if (name === 'start') {
      if (data.type === 'breach') this.breachTasks(data);
      else if (data.type === 'grid') this.gridTask();
      else if (data.type === 'power') this.powerTask();
      else if (data.type === 'riot') this.riotTask();
    } else if (name === 'grid-down' && !this.tasks.has('grid')) {
      this.after(6, () => this.gridTask());
    } else if (name === 'contained' && !data.byPlayer) {
      this.failTag('contain', 'MTF had to re-establish containment');
    } else if (name === 'grid-restored' && !data.byPlayer) {
      this.failTag('grid', 'Maintenance rebooted the grid without you');
    } else if (name === 'power-restored' && !data.byPlayer) {
      this.failTag('power', 'Maintenance restored power without you');
    } else if (name === 'riot-ended' && !data.byPlayer) {
      this.failTag('riot', 'The response team had to quell the riot');
    } else if (name === 'end') {
      this.tasks.cancel((t) => t.tag === 'evac', 'Evacuation complete');
      this.releaseGuards();
    }
  }

  failTag(tag, why) {
    for (const t of this.tasks.active) {
      if (t.tag !== tag) continue;
      this.tasks.fail(t, 'failed');
      this.game.ui.toast(why.toUpperCase(), true);
    }
  }

  breachTasks(ev) {
    const g = this.game;
    const o = ev.originDef;
    const sheltering = this.shelterResearchers();
    this.dispatchGuards(this.pt(o.point));
    const locks = shuffle(o.locks).slice(0, 2).map((id) => g.terminals.get(id));
    const site = this.pt(o.point);
    this.run(async () => {
      await this.wait(3);
      await this.say(this.chief.name, `All units, breach in ${o.label}! ${g.designation}, re-engage the containment locks before MTF has to come in. Avoid the anomalies.`, 'radio');
      this.tasks.add(
        new Task({
          title: `Contain the breach in ${o.label}`,
          giver: this.chief.name,
          kind: 'emergency',
          tag: 'contain',
          reward: 200,
          penalty: 60,
          standing: [15, 25],
          steps: [
            new ReachStep({ text: `Get to ${o.site}`, zone: o.zone, targetFn: () => ({ x: site.x, y: 1.3, z: site.z }) }),
            new CustomStep({
              text: 'Re-engage the containment locks',
              detail: 'Hold the interaction at each lock terminal. Keep away from the anomalies.',
              onStart: (gm, step) => {
                step.left = new Set(locks);
                for (const t of locks) {
                  t.action = {
                    text: 'Re-engage containment lock',
                    hold: 4,
                    use: () => {
                      step.left.delete(t);
                      t.action = null;
                      t.setStatus('done', 'LOCK ENGAGED');
                      return { ok: true, message: 'LOCK ENGAGED' };
                    },
                  };
                }
              },
              update: (gm, dt, step) => step.left.size === 0,
              progress: (gm, step) => `${2 - step.left.size}/2 locks`,
              target: (gm, step) => {
                let best = null;
                let bd = Infinity;
                for (const t of step.left) {
                  const d = Math.hypot(t.origin.x - gm.player.pos.x, t.origin.z - gm.player.pos.z);
                  if (d < bd) {
                    bd = d;
                    best = t;
                  }
                }
                return best ? { x: best.origin.x, y: best.origin.y + 0.2, z: best.origin.z } : null;
              },
              onEnd: (gm, ok, step) => {
                for (const t of locks) t.action = null;
              },
            }),
          ],
          onComplete: (gm) => gm.events.secureContainment(true),
        }),
      );
      await this.wait(rand(8, 15));
      for (const npc of sheltering) {
        if (!npc.alive) continue;
        this.evacTask(npc);
      }
    });
  }

  evacTask(npc) {
    const evac = this.pt('evac', 2.4);
    const car = this.pt('evac-car');
    this.game.say('DISPATCH', `${npc.name} is sheltering in the ${npc.shelter.label}. Get them to the evacuation elevator in the lobby.`, 'radio');
    this.tasks.add(
      new Task({
        title: `Evacuate ${npc.name}`,
        giver: 'Dispatch',
        kind: 'emergency',
        tag: 'evac',
        reward: 130,
        penalty: 40,
        standing: [10, 15],
        steps: [
          new EscortStep({
            text: `Evacuate ${npc.name}`,
            npc,
            dest: { ...evac, label: 'evacuation elevator' },
            from: npc.shelter.label,
            meetText: `Evacuate ${npc.name}`,
            onMeet: (gm) => gm.say(npc.name, 'Oh thank god. Get me out of here.'),
            onEnd: (gm, ok) => {
              if (ok) {
                npc.board(car.x, car.z);
                gm.say(npc.name, 'Thank you, officer!');
              }
            },
          }),
        ],
      }),
    );
  }

  gridTask() {
    const g = this.game;
    if (!g.events.gridOffline || this.tasks.has('grid')) return;
    this.tasks.add(
      new Task({
        title: 'Reboot the security grid',
        giver: this.chief.name,
        kind: 'emergency',
        tag: 'grid',
        reward: 140,
        penalty: 40,
        standing: [10, 15],
        steps: [
          new ActionStep({
            text: 'Reboot the grid from Grid Control (Server Room)',
            object: g.terminals.get('server-reboot'),
            action: { text: 'Reboot security grid', hold: 6 },
            alert: true,
            screen: 'GRID FAILURE',
            doneScreen: 'GRID ONLINE',
            onUse: (gm) => {
              gm.events.restoreSecurity(true);
              return { ok: true, message: 'SECURITY GRID REBOOTED' };
            },
          }),
        ],
      }),
    );
  }

  powerTask() {
    const g = this.game;
    this.tasks.add(
      new Task({
        title: 'Restore main power',
        giver: this.chief.name,
        kind: 'emergency',
        tag: 'power',
        reward: 130,
        penalty: 40,
        standing: [10, 15],
        steps: [
          new ActionStep({
            text: 'Reset the main breaker in Storage',
            detail: 'It is dark. Heavy doors are offline.',
            object: g.terminals.get('power-main'),
            action: { text: 'Reset main breaker', hold: 5 },
            alert: true,
            screen: 'BREAKER TRIPPED',
            doneScreen: 'POWER NOMINAL',
            onUse: (gm) => {
              gm.events.restorePower(true);
              return { ok: true, message: 'MAIN POWER RESTORED' };
            },
          }),
        ],
      }),
    );
  }

  riotTask() {
    const g = this.game;
    const rioters = g.events.rioters.slice();
    for (const n of rioters) {
      n.action = {
        text: 'Order back to your cell',
        sub: n.name,
        use: (gm) => {
          this.sendToCell(n);
          gm.say(n.name, pick(['Alright, alright! I am going!', 'Fine. This is not over.', "Don't shoot, I'm going!"]));
          return { ok: true };
        },
      };
    }
    this.tasks.add(
      new Task({
        title: 'Quell the D-Block riot',
        giver: this.chief.name,
        kind: 'emergency',
        tag: 'riot',
        reward: 160,
        penalty: 50,
        standing: [12, 20],
        steps: [
          new CustomStep({
            text: 'Order the rioting Class-D back to their cells',
            detail: 'They will hit you if you stand too close for too long.',
            update: () => rioters.every((n) => !n.rioting || !n.alive),
            progress: () => `${rioters.filter((n) => !n.rioting || !n.alive).length}/${rioters.length}`,
            target: (gm) => {
              let best = null;
              let bd = Infinity;
              for (const n of rioters) {
                if (!n.rioting || !n.alive) continue;
                const d = Math.hypot(n.pos.x - gm.player.pos.x, n.pos.z - gm.player.pos.z);
                if (d < bd) {
                  bd = d;
                  best = n;
                }
              }
              return best ? { x: best.pos.x, y: 2.1, z: best.pos.z } : null;
            },
          }),
        ],
        onComplete: (gm) => gm.events.quellRiot(true),
        onEnd: () => {
          for (const n of rioters) if (!n.rioting) n.action = null;
        },
      }),
    );
  }

  // ---- Job pool -----------------------------------------------------------------
  makePatrol() {
    const n = 2 + Math.floor(Math.random() * 2);
    const points = shuffle(PATROL).slice(0, n).map((id) => {
      const p = this.pt(id);
      return { x: p.x, z: p.z, r: 2.4, label: p.label };
    });
    return new Task({
      title: `Patrol ${points.length} sectors`,
      giver: 'Dispatch',
      channel: 'radio',
      announce: `Patrol request: sweep ${points.map((p) => p.label).join(', ')}.`,
      reward: 30 * points.length,
      penalty: 25,
      standing: [6, 10],
      deadline: 70 + points.length * 45,
      steps: [new PatrolStep({ text: 'Sweep', points })],
    });
  }

  makeLogCheck() {
    const g = this.game;
    const free = Object.keys(LOGS).filter((id) => !this.tasks.inUse(id));
    if (!free.length) return null;
    const id = pick(free);
    return new Task({
      title: `Verify the log at ${LOGS[id]}`,
      giver: 'Dispatch',
      channel: 'radio',
      announce: `Log discrepancy flagged at ${LOGS[id]}. Verify it in person.`,
      reward: 50,
      penalty: 20,
      standing: [5, 8],
      deadline: 130,
      uses: [id],
      steps: [
        new ActionStep({
          text: `Verify the checkpoint log at ${LOGS[id]}`,
          object: g.terminals.get(id),
          action: { text: 'Verify checkpoint log', hold: 2.5 },
          screen: 'LOG REVIEW PENDING',
          doneScreen: 'LOG VERIFIED',
        }),
      ],
    });
  }

  vipCandidates() {
    return ['sci-okafor', 'sci-vance', 'sci-lindqvist', 'sci-harrow']
      .map((id) => this.game.npcs.get(id))
      .filter((n) => n && n.alive && !n.hidden && !this.tasks.inUse(n.id) && !n.shelter);
  }

  makeEscort() {
    const npc = pick(this.vipCandidates());
    const dests = ['dest-admin', 'dest-cafeteria', 'dest-lobby', 'dest-medical', 'dest-hcz'].map((id) => this.pt(id, 2.2));
    const dest = pick(dests.filter((d) => Math.hypot(d.x - npc.pos.x, d.z - npc.pos.z) > 14));
    if (!dest) return null;
    npc.stop();
    const zone = this.game.world.roomAtWorld(npc.pos.x, 0.7, npc.pos.z);
    const room = this.game.builder.rooms[zone];
    const from = room && room.zone ? titleCase(room.zone) : npc.title;
    return new Task({
      title: `Escort ${npc.name} to ${withThe(dest.label)}`,
      giver: 'Dispatch',
      channel: 'radio',
      announce: `${npc.name} needs an escort to ${withThe(dest.label)}. They are waiting near ${withThe(from)}.`,
      reward: 140,
      penalty: 40,
      standing: [8, 12],
      deadline: 210,
      uses: [npc.id],
      steps: [
        new EscortStep({
          text: `Escort ${npc.name}`,
          npc,
          dest,
          from,
          onMeet: (gm) => gm.say(npc.name, 'Thank you, officer. Lead the way.'),
          onEnd: (gm, ok) => {
            if (ok) gm.say(npc.name, 'This is me. Appreciated.');
          },
        }),
      ],
      onEnd: (gm, status) => {
        if (status !== 'complete' && npc.alive && !npc.shelter) npc.idleAt();
      },
    });
  }

  makeDelivery() {
    const g = this.game;
    const src = this.pt(pick(['doc-records', 'doc-admin']));
    const recipients = [this.chief, g.npcs.get('sci-okafor'), g.npcs.get('doc-reyes')].filter((n) => n && n.alive && !n.hidden && !this.tasks.inUse(n.id));
    if (!recipients.length) return null;
    const recipient = pick(recipients);
    const doc = g.addPickup({
      id: 'document',
      kind: 'document',
      x: src.x,
      y: 0.5 + src.h,
      z: src.z,
      name: 'Incident Report',
      onPickup: (gm) => gm.ui.setItem('Carrying: Incident Report'),
    });
    return new Task({
      title: `Deliver a report to ${recipient.name}`,
      giver: 'Dispatch',
      channel: 'radio',
      announce: `There's an incident report in the ${src.label}. Hand-deliver it to ${recipient.name}.`,
      reward: 110,
      penalty: 30,
      standing: [6, 10],
      deadline: 200,
      uses: [recipient.id],
      steps: [
        new PickupStep({ text: `Collect the report from the ${src.label}`, item: doc }),
        new ActionStep({
          text: `Deliver the report to ${recipient.name}`,
          object: recipient,
          action: { text: 'Hand over the incident report', sub: recipient.name },
          onUse: (gm) => {
            gm.ui.setItem(null);
            recipient.faceToward(gm.player.pos.x, gm.player.pos.z);
            gm.say(recipient.name, 'Finally. Thank you.');
            return { ok: true, message: 'REPORT DELIVERED' };
          },
        }),
      ],
      onEnd: (gm, status) => {
        gm.removeInteractable(doc);
        if (status !== 'complete') gm.ui.setItem(null);
      },
    });
  }

  makeRepair() {
    const g = this.game;
    const options = FAULTY.filter((id) => !this.tasks.inUse(id));
    if (!options.length) return null;
    const id = pick(options);
    const door = g.doorsById.get(id);
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
    return new Task({
      title: `Fix the ${door.name} door reader`,
      giver: 'Dispatch',
      channel: 'radio',
      announce: `Maintenance reports a fault on the ${door.name} door reader. Reset it and test the door.`,
      reward: 120,
      penalty: 30,
      standing: [6, 10],
      deadline: 180,
      uses: [id],
      steps: [
        new ActionStep({
          text: `Reset the faulty reader on the ${door.name} door`,
          detail: 'The faulty reader blinks amber.',
          object: trigger,
          action: { text: 'Reset door reader', sub: 'Maintenance override', hold: 4 },
          onUse: () => {
            door.faulty = false;
            door.refreshLed();
            return { ok: true, message: 'READER RESET' };
          },
        }),
        new CustomStep({ text: `Test the ${door.name} door`, update: () => door.isOpen, target: () => ({ x: door.origin.x, y: door.origin.y + 1.3, z: door.origin.z }) }),
      ],
      onEnd: (gm) => {
        gm.removeInteractable(trigger);
        door.faulty = false;
        door.refreshLed();
      },
    });
  }

  classdCandidates() {
    return [...this.game.npcs.values()].filter((n) => n.kind === 'classd' && n.alive && !n.rioting && !n.hidden && !this.tasks.inUse(n.id));
  }

  makeTransfer() {
    const npc = pick(this.classdCandidates());
    const dest = pick([this.pt('tc-hall', 2.2), this.pt('lab-hall', 2.2)]);
    npc.stop();
    return new Task({
      title: `Transfer ${npc.name} to ${dest.label}`,
      giver: 'Research Department',
      channel: 'radio',
      announce: `Research needs subject ${npc.name} at ${dest.label}. Collect them from D-Block.`,
      reward: 130,
      penalty: 35,
      standing: [7, 12],
      deadline: 240,
      uses: [npc.id],
      steps: [
        new EscortStep({
          text: `Transfer ${npc.name}`,
          npc,
          dest,
          from: 'D-Block',
          meetText: `Escort ${npc.name} to testing`,
          onMeet: (gm) => gm.say(npc.name, pick(['Testing? Again?', "Alright, I'm coming. No need to push.", 'Where are we going?'])),
        }),
      ],
      onEnd: (gm, status) => {
        if (status === 'complete') {
          // The subject is handed over and taken in.
          npc.collidable = false;
          this.after(4, () => npc.board(dest.x + 2.5, dest.z));
        } else if (npc.alive) this.sendToCell(npc);
      },
    });
  }
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

