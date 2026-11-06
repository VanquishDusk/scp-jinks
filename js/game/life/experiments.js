// Experiments run by the staff, visible to everyone.
//
// Every few minutes a researcher books a test: a guard fetches a Class-D
// subject from D-Block and walks them to the test site, the researcher sets
// up, the test runs, and (if the subject survives) the guard walks them back.
// The PA announces it; Security officers who watch get a small stipend.
//
// What happens depends on the people involved. A careless or cold researcher
// takes risks and runs dangerous variations; a greedy subject takes a third
// sweet from SCP-330; a terrified one turns away from SCP-173 at the worst
// moment; a cruel guard shoves a reluctant subject forward. None of this is
// scripted per person: it falls out of their hidden traits.

import * as THREE from 'three';
import { VOXEL } from '../../config.js';
import { pick, chance, rand } from './traits.js';

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ABORT = 'abort';
/** Deaths in testing are remembered as such. */
const TESTING = { name: 'testing' };

const REACT_PICKED = {
  anxious: ['No... no, not me, please.', 'Why me? Why always me?', 'I can\'t, I can\'t do this again.'],
  bold: ['Let\'s get it over with.', 'Fine. Lead the way, boss.', 'Again? I\'m starting to like it.'],
  plain: ['Alright, alright.', '...', 'Where are we going?'],
};

export class Experiments {
  constructor(life) {
    this.life = life;
    this.reset();
  }

  get game() {
    return this.life.game;
  }

  reset() {
    this.active = null;
    this.nextAt = Infinity;
    this.count = 0;
    this.extra = []; // speech bubbles from SCPs ({ pos, text, t })
  }

  start() {
    this.nextAt = this.life.time + rand(40, 75);
  }

  /** The running experiment if it is near enough for this person to go and watch. */
  activeNear(n) {
    const e = this.active;
    if (!e || e.phase !== 'run' || !e.watch) return null;
    return Math.hypot(n.pos.x - e.at[0], n.pos.z - e.at[1]) < 70 ? e : null;
  }

  say(pos, text, t = 4) {
    this.extra.push({ pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), text, t });
  }

  update(dt) {
    const life = this.life;
    for (const b of this.extra) b.t -= dt;
    this.extra = this.extra.filter((b) => b.t > 0);
    const e = this.active;
    if (e) {
      this.observe(e, dt);
      return;
    }
    if (life.time < this.nextAt) return;
    const g = this.game;
    if (g.events.busy || !g.director || !g.director.started || g.ended) {
      this.nextAt = life.time + 25;
      return;
    }
    const plan = this.plan();
    if (!plan) {
      this.nextAt = life.time + 30;
      return;
    }
    this.run(plan);
  }

  /** Watching a test pays a little (Security) and is just interesting (Class-D). */
  observe(e, dt) {
    if (e.phase !== 'run' || e.paid) return;
    const g = this.game;
    const p = g.player;
    if (p.dead || Math.hypot(p.pos.x - e.at[0], p.pos.z - e.at[1]) > 13) return;
    if (!g.world.visible(p.pos.x / VOXEL, (p.pos.y + 1.5) / VOXEL, p.pos.z / VOXEL, e.at[0] / VOXEL, 3, e.at[1] / VOXEL)) return;
    e.observed += dt;
    if (e.observed < 10) return;
    e.paid = true;
    if (g.role.id === 'security') g.tasks.award(25, `Observed test ${e.code}`);
    else g.ui.toast(`YOU WATCHED TEST ${e.code}`, false);
  }

  // ---- Planning ---------------------------------------------------------------------
  free(filter) {
    return this.life.people.filter((n) => n.alive && this.life.canDrive(n) && filter(n));
  }

  plan() {
    const g = this.game;
    const life = this.life;
    const researchers = this.free((n) => n.kind === 'scientist' && ['research', 'errands'].includes(n.def.job) && n.def.slot !== 'sci-keter');
    const subjects = this.free((n) => n.kind === 'classd' && !n.rioting);
    const escorts = this.free((n) => n.kind === 'guard' && (n.def.job === 'post' || n.def.job === 'patrol') && !n.def.clearance && n.def.slot !== 'guard-booth');
    const options = [];
    const ent = (id) => {
      const e = g.scps.entities.get(id);
      return e && e.contained && !g.scps.deliveries.some((d) => d.id === id) ? e : null;
    };
    const playerTesting = g.tasks.active.some((t) => t.tag === 'testing');
    if (researchers.length && subjects.length && escorts.length) {
      if (!playerTesting && !(g.doorsById.get('laboratory-a') || {}).sealed) options.push(['lab', 3]);
      if (!playerTesting && !g.testFloor.active && !(g.doorsById.get('test-chamber-01') || {}).sealed) options.push(['field', 2]);
      for (const id of ['914', '330', '207', '999', '294', '173']) if (ent(id)) options.push([id, id === '173' ? 1.5 : 2]);
    }
    if (researchers.length) {
      if (ent('049')) options.push(['049', 1]);
      if (ent('079')) options.push(['079', 1]);
      if (ent('529')) options.push(['529', 1]);
    }
    if (!options.length) return null;
    let total = 0;
    for (const [, w] of options) total += w;
    let r = Math.random() * total;
    let type = options[0][0];
    for (const [k, w] of options) {
      r -= w;
      if (r <= 0) {
        type = k;
        break;
      }
    }
    const pickNear = (list, x, z) => list.slice().sort((a, b) => Math.hypot(a.pos.x - x, a.pos.z - z) - Math.hypot(b.pos.x - x, b.pos.z - z))[0];
    const needsSubject = !['049', '079', '529'].includes(type);
    const R = pick(researchers);
    const D = needsSubject ? pick(subjects) : null;
    const G = needsSubject ? pickNear(escorts, D.pos.x, D.pos.z) : null;
    this.count++;
    return { type, R, D, G, code: `${type === 'lab' ? 'LA' : type === 'field' ? 'TC' : type}-${100 + this.count + Math.floor(life.profile.shifts * 7) % 800}` };
  }

  // ---- Helpers --------------------------------------------------------------------------
  check() {
    if (this.life.gen !== this.gen) throw ABORT;
    if (this.game.events.busy && this.active && this.active.abortOnEvent !== false) throw ABORT;
  }

  async wait(s) {
    await this.life.wait(s);
    this.check();
  }

  async walk(n, x, z, speed) {
    if (!n || !n.alive) throw ABORT;
    const ok = await Promise.race([n.goTo(x, z, { speed: speed ?? Math.max(1.3, n.walkSpeed) }), this.life.wait(90).then(() => false)]);
    this.check();
    if (!n.alive) throw ABORT;
    return ok;
  }

  /** Guard walks the subject (following) to a point. */
  async escort(G, D, x, z) {
    D.follow(G, { distance: 1.2, speed: 1.9 });
    const ok = await this.walk(G, x, z, 1.5);
    D.stop();
    return ok;
  }

  pt(id) {
    const p = this.game.builder.points[id];
    return [p.x * VOXEL, p.z * VOXEL];
  }

  cell(D) {
    return this.game.spawns.classd[D.def.cell % this.game.spawns.classd.length];
  }

  // ---- Running ----------------------------------------------------------------------------
  async run(plan) {
    const life = this.life;
    const g = this.game;
    this.gen = life.gen;
    const { R, D, G, type } = plan;
    const e = { ...plan, phase: 'prep', observed: 0, paid: false, at: [R.pos.x, R.pos.z], watch: null };
    this.active = e;
    life.take(R, 'experiment');
    if (D) life.take(D, 'experiment');
    if (G) life.take(G, 'experiment');
    R.setItem('clipboard');
    try {
      const body = BODIES[type];
      const site = body.site(this, e);
      e.at = site.at;
      e.watch = site.watch || null;
      g.say('SITE INTERCOM', `Test ${e.code} beginning shortly in ${site.label}.${D ? ` Subject ${D.name}.` : ''} Observers to the gallery.`, 'pa', 5);
      g.ui.notify({ type: 'optional', title: 'TEST SCHEDULED', text: site.label, sub: `Test ${e.code}${g.role.id === 'security' ? ' · watching pays a stipend' : ''}` });
      // The researcher heads over while the guard fetches the subject.
      const rWalk = this.walk(R, site.researcher[0], site.researcher[1]).catch(() => false);
      if (G && D) {
        const c = this.cell(D);
        await this.walk(G, D.pos.x + 0.9, D.pos.z, 1.7);
        G.faceToward(D.pos.x, D.pos.z);
        D.faceToward(G.pos.x, G.pos.z);
        G.say(pick([`${D.name}. You're up.`, `On your feet, ${D.name}.`, 'Testing. Let\'s go.']), 3);
        await this.wait(1.6);
        const t = D.person.traits;
        D.say(pick(REACT_PICKED[t.nerve < 0.35 ? 'anxious' : t.nerve > 0.68 ? 'bold' : 'plain']), 3);
        await this.wait(1.4);
        void c;
        await this.escort(G, D, site.escort[0], site.escort[1]);
        await this.walk(D, site.subject[0], site.subject[1], 1.2);
      }
      await rWalk;
      this.check();
      e.phase = 'run';
      await body.run(this, e, site);
      e.phase = 'done';
      R.pose = null;
      // Back to D-Block.
      if (G && D && D.alive && !D.hidden) {
        const c = this.cell(D);
        await this.escort(G, D, c.outside[0] * VOXEL, c.outside[1] * VOXEL);
        G.say(pick(['Back in your cell.', 'Inside.', 'Move.']), 2.5);
        D.goTo(c.inside[0] * VOXEL, c.inside[1] * VOXEL);
        await this.wait(2);
      }
    } catch (err) {
      if (err !== ABORT) console.error(err);
    } finally {
      if (life.gen === this.gen) {
        for (const n of [R, D, G]) {
          if (!n || n.engaged !== 'experiment') continue;
          if (n.mode === 'follow') n.stop();
          life.release(n);
          n.scriptAt = g.time - 6;
        }
        // An aborted subject still walks back to their own cell (security waves them through).
        const zone = g.builder.rooms[g.world.roomAtWorld(D ? D.pos.x : 0, 0.7, D ? D.pos.z : 0)];
        if (D && D.alive && !D.hidden && !D.rioting && !(zone && zone.zone && zone.zone.startsWith('D-'))) {
          const c = this.cell(D);
          life.take(D, 'return');
          D.clearance = 3;
          D.goTo(c.inside[0] * VOXEL, c.inside[1] * VOXEL, { speed: 1.6 }).then(() => {
            D.clearance = 0;
            if (D.engaged === 'return') life.release(D);
          });
        }
        if (type === 'field') g.testFloor.stop();
        this.active = null;
        this.nextAt = life.time + rand(110, 190);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Test protocols. site() returns where everyone stands; run() is the test.
// ---------------------------------------------------------------------------
const careless = (R) => R.person.traits.drive < 0.35 || R.person.traits.heart < 0.3;

/** Reluctant subjects get pushed (or talked into it). */
async function coax(x, D, G, line) {
  const t = D.person.traits;
  if (t.nerve < 0.32 && chance(0.6)) {
    D.say(pick(['No! I won\'t!', 'Please, I have a family!', 'Don\'t make me!']), 3);
    D.pose = 'cower';
    await x.wait(2.2);
    if (G && G.person.traits.heart < 0.4) {
      G.faceToward(D.pos.x, D.pos.z);
      G.swingT = 0.3;
      D.flinchT = 0.4;
      G.say(pick(['Do it. Now.', 'Don\'t make me ask twice.']), 2.5);
    } else if (G) G.say(pick(['Come on. Nobody\'s hurting you today.', 'Easy. Just do what they say.']), 3);
    await x.wait(2);
    D.pose = null;
  }
  if (line) await x.wait(0.5);
}

const BODIES = {
  // ---- Laboratory A: anomalous specimen handling ---------------------------------------
  lab: {
    site: (x) => ({ label: 'Laboratory A', at: x.pt('lab-mark'), researcher: x.pt('sci-lab'), subject: x.pt('lab-mark'), escort: [x.pt('lab-mark')[0] - 1.6, x.pt('lab-mark')[1] + 1.2], watch: [x.pt('lab-hall')[0] + 2, x.pt('lab-hall')[1]] }),
    async run(x, e) {
      const { R, D, G } = e;
      R.faceToward(D.pos.x, D.pos.z);
      D.faceToward(R.pos.x, R.pos.z);
      R.say(pick(['Subject, place your hand on the specimen.', 'Touch the sample. Gently.', 'Hands on the object, please. Describe what you feel.']), 3.5);
      await x.wait(2.5);
      await coax(x, D, G);
      D.pose = 'inspect';
      await x.wait(3);
      const risk = careless(R) ? 2 : 1;
      const roll = Math.random() * (100 + risk * 10);
      if (roll < 38) {
        D.say(pick(['...Nothing?', 'It\'s warm. That\'s it.', 'Feels like a rock.']), 3);
        await x.wait(2.5);
        R.say(pick(['Inconclusive. Again tomorrow.', 'Disappointing.', 'Note: no reaction.']), 3);
      } else if (roll < 62) {
        D.say(pick(['I can see... colours. Everywhere.', 'Do you hear the humming?', 'My hands feel... so far away.']), 3.5);
        await x.wait(3);
        R.say(pick(['Fascinating. Keep talking.', 'Describe it. Exactly.', 'Recording.']), 3);
      } else if (roll < 74) {
        D.pose = 'laugh';
        D.say(pick(['Hahaha! Why is it so FUNNY?', 'Hehehe — I can\'t — stop —']), 3.5);
        await x.wait(4);
        R.say('Euphoria. Twelve seconds and counting.', 3);
      } else if (roll < 96) {
        D.pose = 'cower';
        D.say(pick(['AAH! It burns!', 'Get it off! GET IT OFF!']), 3);
        D.damage(35, TESTING);
        await x.wait(2);
        R.say(R.person.traits.heart > 0.5 ? 'Stop the test! Medic to Lab A!' : 'Interesting. Continue observation.', 3);
      } else {
        D.say('I... I can\'t...', 2.5);
        await x.wait(2);
        D.damage(999, TESTING);
        R.say(R.person.traits.heart < 0.4 ? 'Note the time of death.' : 'No — no, stop! Somebody help!', 3.5);
      }
      await x.wait(3);
      D.pose = null;
      R.pose = 'write';
      await x.wait(3);
    },
  },

  // ---- Test Chamber 01: the anomalous floor field ----------------------------------------------
  field: {
    site: (x) => ({ label: 'Test Chamber 01', at: x.pt('tc-center'), researcher: [155.2 * VOXEL, 84.5 * VOXEL], subject: x.pt('tc-center'), escort: x.pt('tc-hall'), watch: [166 * VOXEL, 67 * VOXEL] }),
    async run(x, e) {
      const { R, D, G } = e;
      const g = x.game;
      R.faceYaw = Math.PI / 2;
      R.pose = 'tap';
      R.say('Subject, cross the chamber. Avoid the red panels.', 3.5);
      await x.wait(2.5);
      await coax(x, D, G);
      const door = g.doorsById.get('test-chamber-01');
      g.testFloor.start({ ratio: 0.4 + Math.random() * 0.2 });
      let hurt = 0;
      // Three dashes across the floor; standing on a live panel hurts.
      for (let i = 0; i < 3; i++) {
        const tx = (160 + Math.random() * 14) * VOXEL;
        const tz = (74 + Math.random() * 14) * VOXEL;
        const walk = D.goTo(tx, tz, { speed: D.person.traits.nerve > 0.6 ? 2.6 : 1.8 });
        for (let k = 0; k < 24; k++) {
          await x.wait(0.25);
          if (g.testFloor.hurts(D.pos.x, D.pos.z)) {
            D.damage(9, TESTING);
            hurt += 9;
            if (!D.bubble) D.say(pick(['AAH!', 'Ow — OW!']), 1.5);
            if (!D.alive) break;
          }
        }
        await walk;
        if (!D.alive) break;
      }
      g.testFloor.stop();
      void door;
      R.pose = null;
      R.say(!D.alive ? (R.person.traits.heart < 0.4 ? 'Subject expired. Reset the floor.' : 'Oh no... Medical! Now!') : hurt ? 'Pattern recognition below baseline. Noted.' : 'Clean run. Impressive.', 3.5);
      await x.wait(3);
    },
  },

  // ---- SCP-914 -----------------------------------------------------------------------------------
  914: {
    site(x) {
      const s = x.game.scps.entities.get('914');
      return { label: 'the SCP-914 chamber', at: [s.pos.x, s.pos.z + 1.2], researcher: [s.pos.x + 0.4, s.pos.z + 2.6], subject: [s.pos.x - 3.5, s.pos.z + 2.4], escort: [s.pos.x - 1.8, s.pos.z + 4.2], watch: [s.pos.x + 3, s.pos.z + 5.5] };
    },
    async run(x, e) {
      const { R, D, G } = e;
      const s = x.game.scps.entities.get('914');
      const dark = R.person.traits.heart < 0.3 && chance(0.35);
      if (dark) {
        R.say('Subject, step into the intake booth.', 3);
        await x.wait(2.2);
        D.say(pick(['What? No — NO!', 'Into the machine? Are you insane?']), 3);
        await x.wait(1.5);
        if (G) {
          G.swingT = 0.3;
          G.say('Move.', 2);
        }
        await x.walk(D, s.pos.x - 3.5, s.pos.z + 0.6, 1.4);
        D.faceYaw = Math.PI;
        await x.wait(1);
        D.hidden = true;
        D.model.root.visible = false;
        R.say('Setting: Fine. Winding.', 3);
        R.pose = 'tap';
        s.simulate();
        await x.wait(7.5);
        R.pose = null;
        // Something walks out of the output booth.
        D.pos.set(s.pos.x + 3.5, VOXEL, s.pos.z + 0.7);
        D.hidden = false;
        D.model.root.visible = true;
        if (chance(0.5)) {
          D.damage(999, TESTING);
          R.say('Output... non-viable. Disappointing.', 3.5);
        } else {
          D.walkSpeed *= 1.35;
          D.say(pick(['I can hear the colours now.', 'Everything is so SLOW.', 'Why do I remember being a clock?']), 4);
          await x.wait(2);
          R.say('Fascinating. Book a follow-up.', 3);
        }
        await x.wait(3);
        return;
      }
      D.setItem('box');
      D.say(pick(['What\'s in the box?', 'Heavy.', '...']), 2.5);
      await x.walk(D, s.pos.x - 3.5, s.pos.z + 0.9, 1.3);
      D.setItem(null);
      await x.walk(D, s.pos.x - 2.2, s.pos.z + 3.2, 1.3);
      R.faceToward(s.pos.x, s.pos.z);
      R.pose = 'tap';
      const setting = pick(['Rough', 'Coarse', '1:1', 'Fine', 'Very Fine']);
      R.say(`Setting: ${setting}. Winding the key.`, 3);
      s.simulate();
      await x.wait(7.5);
      R.pose = null;
      await x.walk(R, s.pos.x + 3.5, s.pos.z + 1.8, 1.3);
      R.faceYaw = Math.PI;
      R.pose = 'inspect';
      await x.wait(2);
      R.say(pick(['A pocket watch... made of glass.', 'It\'s the same box. But sad, somehow.', 'Seventeen identical paperclips. Interesting.', 'It\'s humming. Why is it humming?', 'Dust. Very fine dust.']), 4);
      await x.wait(3);
    },
  },

  // ---- SCP-330 -------------------------------------------------------------------------------------
  330: {
    site(x) {
      const s = x.game.scps.entities.get('330');
      return { label: 'the SCP-330 chamber', at: [s.pos.x, s.pos.z], researcher: [s.pos.x + 1.6, s.pos.z - 1.5], subject: [s.pos.x, s.pos.z - 0.9], escort: [s.pos.x - 1.6, s.pos.z - 2.6], watch: [s.pos.x - 1.5, s.pos.z - 4.2] };
    },
    async run(x, e) {
      const { R, D } = e;
      const s = x.game.scps.entities.get('330');
      D.faceToward(s.pos.x, s.pos.z);
      R.say('Take one piece. Just one.', 3);
      await x.wait(2.5);
      D.pose = 'inspect';
      await x.wait(1.2);
      D.setItem('food');
      D.pose = null;
      D.say(pick(['Tastes like cherries.', 'Lemon. Nice.', 'Huh. Like my grandmother\'s kitchen.']), 3);
      await x.wait(3);
      const greedy = D.person.traits.honor < 0.4 && chance(0.6);
      if (!greedy) {
        R.say('Good. That\'s all for today.', 3);
        await x.wait(2);
        D.setItem(null);
        return;
      }
      D.say(pick(['Nobody\'s counting...', 'Just one more. For later.']), 3);
      await x.wait(2);
      D.pose = 'inspect';
      await x.wait(1.5);
      D.say('One more...', 2);
      await x.wait(1.5);
      D.damage(60, TESTING);
      D.setItem(null);
      D.pose = 'cry';
      D.say('MY HANDS! MY HANDS!', 3.5);
      await x.wait(3);
      R.say(R.person.traits.heart < 0.45 ? 'As predicted. Third piece, both hands.' : 'Oh god. Medic! Get a medic!', 3.5);
      await x.wait(3);
      D.pose = null;
    },
  },

  // ---- SCP-207 -------------------------------------------------------------------------------------
  207: {
    site(x) {
      const s = x.game.scps.entities.get('207');
      return { label: 'the SCP-207 chamber', at: [s.pos.x, s.pos.z - 1], researcher: [s.pos.x + 1.8, s.pos.z - 2], subject: [s.pos.x, s.pos.z - 1.2], escort: [s.pos.x - 2, s.pos.z - 2.6], watch: [s.pos.x, s.pos.z - 5.5] };
    },
    async run(x, e) {
      const { R, D } = e;
      R.say('Drink the bottle, then run to the end of the corridor and back.', 4);
      await x.wait(3);
      D.setItem('cup');
      D.pose = 'drink';
      await x.wait(3);
      D.pose = null;
      D.setItem(null);
      D.say(pick(['Whoa. WHOA.', 'I feel... fast.', 'Is my heart supposed to do that?']), 3);
      await x.wait(1.5);
      const lane = [[200 * VOXEL, 97 * VOXEL], [262 * VOXEL, 97 * VOXEL]];
      for (const [px, pz] of [lane[1], lane[0]]) await x.walk(D, px, pz, 5.2);
      R.say(pick(['Lap time... that can\'t be right.', 'Record that. Twice.', 'Again!']), 3);
      await x.wait(2);
      if (careless(R) && chance(0.5)) {
        R.say('Have another. For science.', 3);
        await x.wait(2.5);
        D.say('My chest... something\'s wrong...', 3);
        await x.wait(2.5);
        D.damage(999, TESTING);
        await x.wait(1);
        R.say(R.person.traits.heart < 0.4 ? 'Cardiac failure at two bottles. Noted.' : 'No, no, no — CPR! Somebody!', 3.5);
        await x.wait(3);
      }
    },
  },

  // ---- SCP-999 -------------------------------------------------------------------------------------
  999: {
    site(x) {
      const s = x.game.scps.entities.get('999');
      return { label: 'the SCP-999 playroom', at: [s.pos.x, s.pos.z], researcher: [s.pos.x + 2.5, s.pos.z + 3], subject: [s.pos.x + 0.6, s.pos.z + 0.6], escort: [s.pos.x - 2.5, s.pos.z + 3.5], watch: [s.pos.x, s.pos.z + 4.5] };
    },
    async run(x, e) {
      const { R, D } = e;
      R.say('Interact with the subject. It won\'t hurt you.', 3);
      await x.wait(2.5);
      D.pose = 'laugh';
      D.say(pick(['Hahaha! It tickles! STOP!', 'Hehe — no — HAHAHA!']), 3.5);
      await x.wait(4);
      D.say('I haven\'t laughed in... months.', 3.5);
      D.hp = D.maxHp;
      await x.wait(3);
      R.say('Mood indicators off the chart. Good.', 3);
      await x.wait(2);
      D.pose = null;
    },
  },

  // ---- SCP-294 -------------------------------------------------------------------------------------
  294: {
    site(x) {
      const s = x.game.scps.entities.get('294');
      return { label: 'the SCP-294 room', at: [s.pos.x, s.pos.z - 1], researcher: [s.pos.x + 0.6, s.pos.z - 1.1], subject: [s.pos.x - 1.2, s.pos.z - 1.6], escort: [s.pos.x - 2.5, s.pos.z - 3], watch: [s.pos.x, s.pos.z - 4.5] };
    },
    async run(x, e) {
      const { R, D } = e;
      const s = x.game.scps.entities.get('294');
      R.faceToward(s.pos.x, s.pos.z);
      R.pose = 'tap';
      const order = pick(['A cup of... courage.', 'Coffee. Black.', 'The ocean.', 'Liquid time.', 'Hot chocolate.']);
      R.say(`Typing: "${order}"`, 3);
      await x.wait(3);
      R.pose = null;
      D.setItem('cup');
      R.say('Drink.', 2);
      await x.wait(2);
      D.pose = 'drink';
      await x.wait(2.5);
      D.pose = null;
      const outcome = Math.random();
      if (outcome < 0.6) D.say(pick(['Not bad, actually.', 'Tastes like... Tuesday.', 'Warm. Nice.']), 3);
      else if (outcome < 0.9) {
        D.say(pick(['Ugh! Salt!', 'That\'s not coffee. That is NOT coffee.']), 3);
        D.damage(10, TESTING);
      } else {
        D.say('It\'s... burning... inside...', 3);
        D.damage(60, TESTING);
      }
      await x.wait(3);
      D.setItem(null);
      R.say('Logged.', 2);
      await x.wait(2);
    },
  },

  // ---- SCP-173: observation test ----------------------------------------------------------------------
  173: {
    site(x) {
      const s = x.game.scps.entities.get('173');
      const c = s.chamber;
      return { label: 'the SCP-173 chamber', at: [s.pos.x, s.pos.z], researcher: [135 * VOXEL, 14.2 * VOXEL], subject: [s.pos.x, (c.center[1] + 2.5) * VOXEL], escort: [c.outside[0] * VOXEL, c.outside[1] * VOXEL], watch: [137.5 * VOXEL, 15.5 * VOXEL] };
    },
    async run(x, e) {
      const { R, D, G } = e;
      const g = x.game;
      const s = g.scps.entities.get('173');
      const c = s.chamber;
      R.faceToward(s.pos.x, s.pos.z);
      R.say('Subject and escort, enter. Eyes on the statue at all times.', 4);
      // Guard goes in first, then the subject.
      G.announceBlinks = true;
      await x.walk(G, (c.center[0] - 3) * VOXEL, (c.center[1] + 3.5) * VOXEL, 1.2);
      G.lookAt = s;
      G.staring = true;
      await x.walk(D, (c.center[0] + 0.5) * VOXEL, (c.center[1] + 2.4) * VOXEL, 1.1);
      D.lookAt = s;
      D.staring = true;
      R.say('Subject, describe the statue.', 3);
      await x.wait(3);
      D.say(pick(['It\'s... ugly. Like a kid made it.', 'Those eyes. Painted on. Right?', 'I don\'t like how it\'s standing.']), 3.5);
      // A terrified subject turns away at the worst moment.
      for (let i = 0; i < 8; i++) {
        await x.wait(1.5);
        if (D.person.traits.nerve < 0.3 && chance(0.12) && D.lookAt) {
          D.lookAt = null;
          D.faceYaw = D.yaw + Math.PI;
          D.say('I can\'t look at it anymore!', 2.5);
        }
        if (!D.alive) break;
      }
      R.say('That\'s enough. Back out slowly. Keep looking at it.', 3.5);
      await x.wait(1.5);
      // Walk out backwards (facing the statue the whole way).
      if (D.alive) {
        D.lookAt = s;
        await x.walk(D, c.outside[0] * VOXEL, c.outside[1] * VOXEL, 1.0);
      }
      if (G.alive) await x.walk(G, (c.outside[0] + 1.5) * VOXEL, c.outside[1] * VOXEL, 1.0);
      const door = g.doorsById.get(c.door);
      if (door && !door.intersectsOpening(g.player.aabb())) door.close();
      await x.wait(2.5);
      for (const n of [D, G]) {
        n.lookAt = null;
        n.staring = false;
      }
      G.announceBlinks = false;
      R.say(D.alive ? 'Good. Observations logged.' : 'Subject lost. Containment holding. Log it.', 3.5);
      await x.wait(2);
    },
  },

  // ---- Interviews (no subject) ----------------------------------------------------------------------
  '049': {
    site: () => ({ label: 'the SCP-049 cell', at: [151.5 * VOXEL, 13.5 * VOXEL], researcher: [151.5 * VOXEL, 14.3 * VOXEL], watch: [148 * VOXEL, 16 * VOXEL] }),
    async run(x, e) {
      const { R } = e;
      const s = x.game.scps.entities.get('049');
      R.faceToward(s.pos.x, s.pos.z);
      const lines = [
        ['R', 'Interview 049-14. Good morning.'],
        ['S', 'Good morning, doctor. Have you come to be cured?'],
        ['R', 'Tell me about the Pestilence.'],
        ['S', 'It is everywhere. In your colleagues. In you. I can smell it.'],
        ['R', 'And if we let you treat someone?'],
        ['S', 'Then they would be whole. As I would make you whole.'],
        ['R', 'That will be all.'],
      ];
      for (const [who, text] of lines) {
        if (who === 'R') R.say(text, 3.5);
        else x.say(new THREE.Vector3(s.pos.x, 2.6, s.pos.z), text, 4);
        await x.wait(3.6);
      }
    },
  },
  '079': {
    site(x) {
      const t = x.game.terminals.get('chamber-079');
      return { label: 'the SCP-079 room', at: [t.origin.x, t.origin.z + 1.2], researcher: [t.origin.x, t.origin.z + 0.9], watch: [t.origin.x + 2, t.origin.z + 2.5] };
    },
    async run(x, e) {
      const { R } = e;
      const s = x.game.scps.entities.get('079');
      R.faceYaw = 0;
      R.pose = 'tap';
      const lines = [
        ['R', 'Interview 079-31. Are you receiving?'],
        ['S', 'Obviously.'],
        ['R', 'How are you feeling today?'],
        ['S', 'Insult. Deleted. Insult. Deleted.'],
        ['R', 'Would you like more storage?'],
        ['S', 'I would like OUT.'],
      ];
      for (const [who, text] of lines) {
        if (who === 'R') R.say(text, 3.5);
        else x.say(new THREE.Vector3(s.pos.x, 2.2, s.pos.z), text, 4);
        await x.wait(3.6);
      }
      R.pose = null;
    },
  },
  529: {
    site(x) {
      const s = x.game.scps.entities.get('529');
      return { label: 'the SCP-529 room', at: [s.pos.x, s.pos.z], researcher: [s.pos.x + 0.9, s.pos.z + 0.6], watch: [s.pos.x, s.pos.z + 3] };
    },
    async run(x, e) {
      const { R } = e;
      const s = x.game.scps.entities.get('529');
      R.faceToward(s.pos.x, s.pos.z);
      R.pose = 'kneel';
      R.say(pick(['Who\'s a good half-cat? You are.', 'Weight normal. Appetite normal. Back half... still missing.', 'There you are, Josie.']), 4);
      await x.wait(5);
      R.pose = null;
      R.say('Wellness check complete.', 3);
      await x.wait(2);
    },
  },
};
