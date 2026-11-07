// Talking to people, and the plots that come out of it.
//
// A conversation is a small tree of nodes ({ text, options: [{ label, fn }] }).
// What someone says, what they'll do for you and what they ask of you depends
// on their hidden traits, their personal situation (hook), how they feel about
// you (persisted across shifts) and who you are (Class-D or Security).
//
// Plots are tasks of kind 'plot' on the pager: errands, notes, covering a
// post, smuggling, keycard deals, escape pacts (some of which are traps),
// a corruption investigation, escorting a curious researcher...

import { VOXEL } from '../../config.js';
import { Task, ReachStep, ActionStep, PickupStep, CustomStep, TimerStep, EscortStep } from '../objectives.js';
import { voiceOf, pick, chance, rand } from './traits.js';
import { getTie, bumpTie, remember } from './roster.js';
import * as L from './lines.js';

const DBLOCK = ['D-CLASS CONTAINMENT BLOCK', 'D-BLOCK COMMONS', 'D-BLOCK WASHROOM'];
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const last = (name) => name.split(' ').pop();
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const ACRONYMS = new Set(['LCZ', 'HCZ', 'SCP', 'MTF', 'D-BLOCK']);
/** "LCZ LOUNGE" → "LCZ Lounge", "D-BLOCK WASHROOM" → "D-Block Washroom". */
export function prettyZone(z) {
  return z.split(' ').map((w) => (ACRONYMS.has(w) || w.startsWith('SCP-') ? (w === 'D-BLOCK' ? 'D-Block' : w) : w.toLowerCase().replace(/(^|-)(\w)/g, (m, a, c) => a + c.toUpperCase()))).join(' ');
}

export class Talk {
  constructor(life) {
    this.life = life;
    this.reset();
  }

  get game() {
    return this.life.game;
  }

  get role() {
    return this.game.role ? this.game.role.id : 'security';
  }

  reset() {
    this.npc = null;
    this.cur = null;
    this.blind = new Map(); // guard → time their blind eye ends
    this.plotNpcs = new Set();
    this.told = new Set();
    this.evidence = new Map(); // guard slot → what the player knows
    this.handoffs = [];
  }

  // ---- Opening / closing ------------------------------------------------------------------
  open(n) {
    const g = this.game;
    const life = this.life;
    if (this.npc) this.close();
    this.npc = n;
    life.drop(n);
    n.talking = true;
    if (n.mode !== 'idle') life.halt(n);
    n.faceToward(g.player.pos.x, g.player.pos.z);
    if (!n.pose) n.pose = 'talk';
    const first = n.person.metAs !== g.designation;
    n.person.metAs = g.designation;
    // One voice for the whole conversation.
    this.voice = voiceOf(n.person.traits);
    this.show(this.root(n, first));
  }

  show(node) {
    this.cur = node;
    const n = this.npc;
    if (this.game.onTalk) this.game.onTalk({ name: n.name, title: n.title, text: node.text, options: node.options.map((o) => o.label) });
  }

  choose(i) {
    const node = this.cur;
    if (!node || !this.npc) return;
    const o = node.options[i];
    if (!o) return;
    const next = o.fn ? o.fn() : null;
    if (next && this.npc) this.show(next);
    else this.close();
  }

  close() {
    const n = this.npc;
    if (!n) return;
    this.npc = null;
    this.cur = null;
    n.talking = false;
    if (n.pose === 'talk') n.pose = null;
    if (n.life) n.life.next = rand(1, 3);
    n.scriptAt = this.game.time - 7;
    if (this.game.onTalkEnd) this.game.onTalkEnd();
  }

  update() {
    this.tickHandoffs();
    const n = this.npc;
    if (!n) return;
    const g = this.game;
    if (!n.alive || g.player.dead || flat(n.pos, g.player.pos) > 4.5 || g.ended || this.life.alarmed || !this.life.canTalk(n)) {
      this.close();
      return;
    }
    n.faceToward(g.player.pos.x, g.player.pos.z);
  }

  // ---- Helpers ----------------------------------------------------------------------------------
  v(n) {
    return n === this.npc && this.voice ? this.voice : voiceOf(n.person.traits);
  }

  rel(n) {
    return this.life.rel(n);
  }

  addRel(n, d, why) {
    this.life.addRel(n, d, why);
  }

  /** Has this person agreed (or been paid) to look the other way? */
  isBlind(n) {
    return (this.blind.get(n) || 0) > this.life.time;
  }

  node(text, options) {
    return { text: this.life.fill(text), options };
  }

  back(n) {
    return { label: 'Something else...', fn: () => this.root(n, false, true) };
  }

  bye() {
    return { label: 'Goodbye.', fn: () => null };
  }

  credits() {
    return this.game.profile.credits;
  }

  pay(amount, reason) {
    const g = this.game;
    g.profile.addCredits(-amount);
    g.ui.setCredits(g.profile.credits, -amount);
    if (reason) g.ui.toast(`-${amount} CR · ${reason}`, false);
  }

  /** Is anyone with integrity watching the player right now? */
  witnesses(range = 12) {
    const g = this.game;
    const p = g.player.pos;
    return this.life.people.filter((n) => n.alive && (n.kind === 'guard' || n.def.slot === 'adm-director') && n.person.traits.honor > 0.6 && !this.blind.has(n) && flat(n.pos, p) < range
      && g.world.visible(n.pos.x / VOXEL, 3.3, n.pos.z / VOXEL, p.x / VOXEL, (p.y + 1.4) / VOXEL, p.z / VOXEL));
  }

  addPlot(task, npcs = []) {
    task.kind = 'plot';
    task.silentFail = true;
    task.tag = task.tag || 'plot';
    for (const n of npcs) this.plotNpcs.add(n);
    const onEnd = task.onEnd;
    task.onEnd = (gm, status) => {
      for (const n of npcs) this.plotNpcs.delete(n);
      if (onEnd) onEnd(gm, status);
    };
    this.game.tasks.add(task);
    return task;
  }

  /** A random walkable point in one of the zones. */
  placeIn(zones) {
    const p = this.life.zonePoint(zones);
    return p ? { x: p[0], z: p[1] } : null;
  }

  zoneLabel(x, z) {
    const g = this.game;
    const room = g.builder.rooms[g.world.roomAtWorld(x, 0.7, z)];
    return room && room.zone ? prettyZone(room.zone) : 'somewhere';
  }

  /** Is there anything this person's situation lets the player do right now? */
  hookFor(n) {
    const h = n.person.hook;
    const sec = this.role === 'security';
    switch (h) {
      case 'lostitem':
      case 'sweetheart':
      case 'smuggler':
      case 'fence':
      case 'feeder':
        return true;
      case 'tired':
        return sec && n.def.job === 'post';
      case 'curious':
        return sec && this.curiousTargets().length > 0;
      case 'whistle':
        return sec && this.life.people.some((o) => o.alive && o.kind === 'guard' && o.person.hook === 'smuggler');
      case 'escapee':
      case 'snitch':
        return !sec;
      default:
        return false;
    }
  }

  /** Contained SCPs a researcher could reasonably be walked up to. */
  curiousTargets() {
    const g = this.game;
    return ['173', '049', '914', '999', '012', '079', '330', '529', '131', '294'].map((id) => g.scps.entities.get(id)).filter((e) => e && e.contained && !g.scps.deliveries.some((d) => d.id === e.id));
  }

  // ---- The conversation root ------------------------------------------------------------------
  root(n, first, again = false) {
    const g = this.game;
    const t = n.person.traits;
    const classdPlayer = this.role === 'classd';
    const isD = n.kind === 'classd';
    const rel = this.rel(n);
    const v = this.v(n);
    // Opening line.
    let text;
    if (again) text = pick(L.AGAIN[v] || L.AGAIN.plain);
    else if (first) {
      if (isD) text = pick([`Name's ${n.person.first}. Not that anyone in here uses it.`, `${n.name}. Or ${n.person.first}, if you're not a guard.`, '...You\'re new. Or I am. Hard to tell.']);
      else if (t.heart > 0.65) text = `Hi! I'm ${n.person.first}. ${n.title}. ${classdPlayer ? 'You can talk to me.' : 'Nice to meet you.'}`;
      else if (t.heart < 0.35) text = `${n.name}. ${n.title}. What do you want?`;
      else text = `${n.name}, ${n.title.toLowerCase()}. Can I help you?`;
      if (n.person.newHire) text += pick([' First day. Still learning where everything is.', ' I just started here. Is it always like this?']);
    } else if (rel >= 40) text = pick(['Hey! Good to see you.', `${classdPlayer ? g.designation : 'Officer'}! There you are.`, 'You again. Good.']);
    else if (rel <= -40) text = pick(['You\'ve got some nerve talking to me.', 'What. Do. You. Want.', 'I have nothing to say to you.']);
    else text = this.life.fill(pick((isD ? L.GREET_FROM_D[classdPlayer ? 'classd' : 'security'] : classdPlayer ? L.GREET_D[v] || L.GREET_D.plain : L.GREET[v] || L.GREET.plain)));
    if (!again && n.person.flags.grieving && chance(0.6)) text += ` ...Sorry. I keep thinking about ${n.person.flags.grieving}.`;

    const opts = [];
    opts.push({ label: 'How\'s it going?', fn: () => this.smalltalk(n) });
    opts.push({ label: 'Heard anything interesting?', fn: () => this.gossip(n) });
    // Things in progress with this person.
    for (const o of this.plotOptions(n)) opts.push(o);
    // Their situation.
    if (n.person.hook && !this.plotNpcs.has(n) && !n.person.flags.hookDone && !(rel < -25) && this.hookFor(n)) opts.push({ label: 'You look like something\'s on your mind.', fn: () => this.hook(n) });
    // Who you are.
    if (classdPlayer) this.classdOptions(n, opts);
    else this.securityOptions(n, opts);
    opts.push(this.bye());
    return this.node(text, opts);
  }

  smalltalk(n) {
    const t = n.person.traits;
    const isD = n.kind === 'classd';
    const v = this.v(n);
    let text;
    if (n.person.flags.grieving) text = `Honestly? Not great. ${n.person.flags.grieving} and I... we were close.`;
    else if (isD) text = pick(L.SMALLTALK_D[v] || L.SMALLTALK_D[t.nerve < 0.35 ? 'anxious' : 'plain']);
    else text = pick(L.SMALLTALK[v] || L.SMALLTALK.plain);
    if (!n.person.flags.smalltalk) {
      n.person.flags.smalltalk = true;
      this.addRel(n, t.social > 0.5 ? 4 : 2);
    }
    const opts = [];
    if (n.person.flags.grieving && !n.person.flags.comforted) {
      opts.push({
        label: 'I\'m sorry. They didn\'t deserve that.',
        fn: () => {
          n.person.flags.comforted = true;
          this.addRel(n, 10);
          return this.node(pick(['...Thanks. Really. Not many people here say things like that.', 'Yeah. Thanks. I\'ll be okay.']), [this.back(n), this.bye()]);
        },
      });
    }
    opts.push(this.back(n), this.bye());
    return this.node(text, opts);
  }

  /** Rumours: other people's habits and secrets, the state of the site. */
  gossip(n) {
    const t = n.person.traits;
    const v = this.v(n);
    if (t.social < 0.35 && this.rel(n) < 20) return this.node(pick(L.NO_GOSSIP[v] || L.NO_GOSSIP.plain), [this.back(n), this.bye()]);
    const facts = this.facts(n).filter((f) => !this.told.has(f.key));
    if (!facts.length) return this.node(pick(['Nothing new, sorry. Quiet week.', 'Can\'t think of anything.', 'You know as much as I do.']), [this.back(n), this.bye()]);
    // Fresh news first: a weighted pick.
    let total = 0;
    for (const x of facts) total += x.w || 1;
    let r = Math.random() * total;
    let f = facts[0];
    for (const x of facts) {
      r -= x.w || 1;
      if (r <= 0) {
        f = x;
        break;
      }
    }
    this.told.add(f.key);
    if (f.learn) f.learn();
    if (t.social > 0.55) this.addRel(n, 1);
    return this.node(`${pick(L.GOSSIP_LEAD)} ${f.text}`, [{ label: 'Anything else?', fn: () => this.gossip(n) }, this.back(n), this.bye()]);
  }

  facts(n) {
    const g = this.game;
    const out = [];
    const others = this.life.people.filter((o) => o !== n && o.alive && o.person);
    for (const o of others) {
      const t = o.person.traits;
      const h = o.person.hook;
      const nm = o.name;
      if (o.kind === 'guard' && t.drive < 0.3) out.push({ key: `lazy-${o.id}`, text: `${nm}? Spends more time on the break-room couch than on post.` });
      if (o.kind === 'guard' && (h === 'smuggler' || h === 'bribable')) out.push({ key: `corrupt-${o.id}`, w: 1.6, text: `${nm} will look the other way. For the right price.`, learn: () => this.evidence.has(o.id) || this.evidence.set(o.id, 'rumour') });
      if (h === 'smuggler') out.push({ key: `smuggle-${o.id}`, w: 1.6, text: `somebody's been getting cigarettes into D-Block. I'd look at ${nm}.`, learn: () => this.evidence.has(o.id) || this.evidence.set(o.id, 'rumour') });
      if (o.kind === 'classd' && h === 'snitch') out.push({ key: `snitch-${o.id}`, text: `watch what you say around ${nm}. Talks to the guards. A lot.` });
      if (o.kind === 'classd' && h === 'escapee') out.push({ key: `escape-${o.id}`, text: `${nm} has been talking about getting out. Serious about it.` });
      if (h === 'curious') out.push({ key: `curious-${o.id}`, text: `${nm} keeps asking to see the anomalies up close. One day they'll get their wish.` });
      if (h === 'lostitem' && o.kind !== 'classd') out.push({ key: `lose-${o.id}`, text: `${nm} loses everything. Their head, if it wasn't attached.` });
      if (h === 'fence') out.push({ key: `fence-${o.id}`, text: `${nm} finds all sorts in the bins. Keycards, even. And sells them.` });
      if (h === 'feeder') out.push({ key: `feeder-${o.id}`, text: `${nm} slips extra food to people they like.` });
      if (t.heart < 0.25 && o.kind === 'guard') out.push({ key: `cruel-${o.id}`, text: `stay away from ${nm}. Likes to hurt people. Especially the orange ones.` });
      if (t.nerve > 0.85) out.push({ key: `brave-${o.id}`, text: `${nm} walked straight at an anomaly once. Didn't even flinch.` });
      if (t.nerve < 0.18) out.push({ key: `coward-${o.id}`, text: `first sign of trouble, ${nm} hides under a desk. Every time.` });
    }
    // Who can't stand whom, and who is sweet on whom (only the most obvious ones).
    const rivals = [];
    const close = [];
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        const a = others[i];
        const b = others[j];
        if (a.kind === 'classd' || b.kind === 'classd') continue;
        const tie = getTie(this.game.profile, a.person, b.person);
        if (tie < -0.55) rivals.push([tie, a, b]);
        if (tie > 0.75) close.push([-tie, a, b]);
      }
    }
    rivals.sort((x, y) => x[0] - y[0]);
    close.sort((x, y) => x[0] - y[0]);
    for (const [, a, b] of rivals.slice(0, 2)) out.push({ key: `rivals-${a.id}-${b.id}`, w: 0.7, text: `${a.name} and ${b.name} can't stand each other. Don't seat them together.` });
    for (const [, a, b] of close.slice(0, 2)) out.push({ key: `close-${a.id}-${b.id}`, w: 0.8, text: `I think ${a.name} has a thing for ${b.name}.` });
    // The site itself.
    let low = null;
    for (const e of g.scps.entities.values()) {
      const integ = g.scps.integrity.get(e.id);
      if (e.contained && integ !== undefined && integ < 60 && (!low || integ < low.integ)) low = { e, integ };
    }
    if (low) out.push({ key: `integ-${low.e.id}`, w: 1.5, text: `${low.e.name}'s containment is down to ${Math.round(low.integ)}%. Nobody wants to do the check.` });
    for (const m of (g.profile.memorial || []).slice(0, 4)) {
      const w = g.profile.shifts - m.shift <= 1 ? 4 : 1.2;
      if (m.why === 'died') out.push({ key: `dead-${m.name}`, w, text: `you heard about ${m.name}? ${m.cause === 'testing' ? 'Didn\'t come back from testing.' : m.cause && m.cause !== 'unknown' ? `${m.cause === 'you' ? 'Somebody' : cap(m.cause)} got them.` : 'They never found out what happened.'}` });
      if (m.why === 'fired') out.push({ key: `fired-${m.name}`, w, text: `${m.name} got fired. Smuggling, they say. Good riddance.` });
      if (m.why === 'escaped') out.push({ key: `escaped-${m.name}`, w, text: `${m.name} made it out. Nobody's supposed to know.` });
    }
    return out;
  }

  // ---- Personal situations --------------------------------------------------------------------
  hook(n) {
    const h = n.person.hook;
    const classdPlayer = this.role === 'classd';
    const nope = (text) => this.node(text, [this.back(n), this.bye()]);
    switch (h) {
      case 'lostitem':
        return this.offerErrand(n);
      case 'sweetheart':
        return this.offerNote(n);
      case 'tired':
        return classdPlayer ? nope('Just tired. Long shift. Nothing you can help with.') : this.offerCover(n);
      case 'smuggler':
        return classdPlayer ? this.offerSale(n, 'smuggler') : this.offerSmuggling(n);
      case 'bribable':
        return nope(pick(L.HOOK_LINES.bribable));
      case 'curious':
        return classdPlayer ? nope(this.life.fill('Do you ever wonder what {scp} dreams about? ...Sorry. Occupational hazard.')) : this.offerEscortResearcher(n);
      case 'escapee':
      case 'snitch':
        return classdPlayer ? this.offerEscape(n) : nope(pick(['Nothing to tell you, officer.', 'Mind? Nothing on my mind. Nothing at all.']));
      case 'whistle':
        return classdPlayer ? nope('It\'s nothing. Forget it.') : this.offerInvestigation(n);
      case 'fence':
        return this.offerSale(n, 'fence');
      case 'feeder':
        return this.feed(n);
      default:
        return nope('Nothing. Really.');
    }
  }

  // ---- Errand: find something they lost -------------------------------------------------------------
  offerErrand(n) {
    const item = pick(L.ITEMS_LOST.filter((i) => n.kind === 'classd' || i !== 'tin of tobacco'));
    const zones = n.kind === 'classd' ? DBLOCK : [...(n.def.work || []), ...(n.def.free || [])].filter((z) => this.life.zonePts.has(z));
    const p = this.placeIn(zones);
    if (!p) return this.node('Never mind. It\'ll turn up.', [this.back(n), this.bye()]);
    const place = this.zoneLabel(p.x, p.z);
    const text = this.life.fill(pick(L.HOOK_LINES.lostitem), { item, place: `the ${place}` });
    return this.node(text, [
      { label: 'I\'ll keep an eye out for it.', fn: () => this.startErrand(n, item, p, place) },
      { label: 'Not my problem.', fn: () => {
        this.addRel(n, -2);
        return this.node(pick(['Right. Of course.', 'Fine.', 'Thanks for nothing.']), [this.back(n), this.bye()]);
      } },
    ]);
  }

  startErrand(n, item, p, place) {
    const g = this.game;
    const pickup = g.addPickup({ id: `lost-${n.id}`, kind: 'document', x: p.x, y: 0.62, z: p.z, name: item, onPickup: (gm) => gm.ui.setItem(`Carrying: ${item}`) });
    this.addPlot(new Task({
      title: `Find ${n.name}'s ${item}`,
      giver: n.name,
      reward: this.role === 'security' ? 70 : 0,
      steps: [
        new PickupStep({ text: `Find the ${item}`, detail: `Somewhere in the ${place}.`, item: pickup, marker: 'near' }),
        new ActionStep({
          text: `Give it back to ${n.name}`,
          object: n,
          action: { text: `Give back the ${item}`, sub: n.name, free: true },
          onUse: (gm) => {
            gm.ui.setItem(null);
            n.person.flags.hookDone = true;
            n.person.hook = null;
            this.addRel(n, 25, 'helped');
            this.life.ripple(n, 6);
            n.say(pick(['You found it! Thank you!', 'Oh, thank god. I owe you one.', 'You\'re a lifesaver.']), 3.5);
            if (this.role === 'classd') this.favor(n);
            return { ok: true, message: `${item.toUpperCase()} RETURNED` };
          },
        }),
      ],
      onEnd: (gm) => gm.removeInteractable(pickup),
    }), [n]);
    return this.node(pick(['Thank you. Really.', 'You\'re a good one.', 'I\'ll owe you.']), [this.bye()]);
  }

  /** A grateful person does something for a Class-D player. */
  favor(n) {
    const g = this.game;
    if (n.kind === 'classd') {
      // A tip: where something useful is hidden.
      const p = this.placeIn(['D-BLOCK WASHROOM', 'D-BLOCK COMMONS']);
      if (p) {
        g.addPickup({ id: 'favor-pipe', kind: 'weapon', weapon: 'pipe', x: p.x, y: 0.55, z: p.z, name: 'Lead Pipe', onPickup: (gm) => gm.combat.give('pipe') });
        g.say(n.name, `Here's something for you. There's a pipe stashed in the ${this.zoneLabel(p.x, p.z)}. You didn't hear it from me.`, 'voice');
      }
    } else if (n.kind === 'cook' || n.kind === 'medic') {
      g.player.heal(50);
      g.ui.toast('THEY PATCH YOU UP AND SLIP YOU SOMETHING TO EAT', false);
    } else {
      // Staff who owe you look the other way.
      this.blind.set(n, this.life.time + 240);
      g.say(n.name, 'If I see you somewhere you shouldn\'t be... I didn\'t see you.', 'voice');
    }
  }

  // ---- A note for someone special --------------------------------------------------------------------
  offerNote(n) {
    const g = this.game;
    const cands = this.life.people.filter((o) => o !== n && o.alive && o.person && (o.kind === 'classd') === (n.kind === 'classd') && o.kind !== 'director');
    if (!cands.length) return this.node('Never mind.', [this.bye()]);
    const target = cands.sort((a, b) => getTie(g.profile, n.person, b.person) - getTie(g.profile, n.person, a.person))[0];
    const text = this.life.fill(pick(L.HOOK_LINES.sweetheart), { other: target.name });
    return this.node(text, [
      { label: 'Sure. I\'ll deliver it.', fn: () => {
        this.startNote(n, target);
        return this.node(pick(['Thank you. Don\'t read it!', 'Don\'t tell anyone. Please.']), [this.bye()]);
      } },
      { label: 'Deliver it yourself.', fn: () => this.node(pick(['I can\'t. I just... can\'t.', 'Right. Yeah. Maybe I will.']), [this.back(n), this.bye()]) },
    ]);
  }

  startNote(n, target) {
    const g = this.game;
    g.ui.setItem(`Carrying: note for ${target.name}`);
    this.addPlot(new Task({
      title: `Deliver ${n.person.first}'s note to ${target.name}`,
      giver: n.name,
      reward: this.role === 'security' ? 40 : 0,
      steps: [
        new ActionStep({
          text: `Find ${target.name} and give them the note`,
          object: target,
          action: { text: 'Hand over the note', sub: target.name, free: true },
          onUse: (gm) => {
            gm.ui.setItem(null);
            n.person.flags.hookDone = true;
            n.person.hook = null;
            const tie = getTie(gm.profile, n.person, target.person);
            const yes = tie > -0.1 && target.person.traits.heart > 0.35;
            bumpTie(gm.profile, n.person, target.person, yes ? 0.5 : -0.25);
            target.say(yes ? pick(['Oh! ...Tell them yes.', 'Really? From them? Okay. Okay!', 'I... wow. Thank you.']) : pick(['Tell them to stop.', 'Ugh. Not this again.', 'Oh. No. No no no.']), 3.5);
            this.addRel(n, yes ? 20 : 10, 'helped');
            this.addRel(target, yes ? 8 : -3);
            return { ok: true, message: 'NOTE DELIVERED' };
          },
        }),
      ],
      onEnd: (gm, status) => status !== 'complete' && gm.ui.setItem(null),
    }), [n, target]);
  }

  // ---- Cover a tired officer's post (Security) ------------------------------------------------------
  offerCover(n) {
    const post = this.game.builder.points[n.def.at];
    if (!post || n.def.job !== 'post') return this.node('Just tired. I\'ll live.', [this.back(n), this.bye()]);
    return this.node(pick(L.HOOK_LINES.tired), [
      { label: 'Go on. I\'ve got your post.', fn: () => {
        this.startCover(n, post);
        return this.node(pick(['You\'re a saint. Ten minutes.', 'I owe you. Big time.']), [this.bye()]);
      } },
      { label: 'Stay awake, officer.', fn: () => {
        this.addRel(n, -3);
        return this.node(pick(['...Fine.', 'Yeah, yeah.']), [this.bye()]);
      } },
    ]);
  }

  startCover(n, post) {
    const life = this.life;
    const point = { x: post.x * VOXEL, z: post.z * VOXEL };
    // They go and sleep it off on a couch somewhere.
    life.take(n, 'plot');
    const nap = life.findSpot(n, ['nap', 'couch'], null, { maxD: 160 });
    if (nap) {
      nap.user = n;
      n.goTo(nap.ax, nap.az, { speed: 1.4 }).then((ok) => {
        if (!ok || n.engaged !== 'plot' || !n.alive) return;
        life.snap(n, nap, nap.lie ? 'nap' : 'sleepsit');
        n.say(pick(L.NAP), 3);
      });
    }
    this.addPlot(new Task({
      title: `Cover ${n.name}'s post`,
      giver: n.name,
      reward: 0,
      steps: [new TimerStep({ text: `Hold ${n.name}'s post`, detail: 'Stay at the post until they get back.', point, radius: 2.4, duration: 75 })],
      onComplete: (gm) => {
        gm.tasks.award(90, `Cash from ${n.name}`);
        this.addRel(n, 22, 'covered');
        n.person.flags.hookDone = true;
        n.person.hook = null;
      },
      onEnd: (gm, status) => {
        if (nap && nap.user === n) nap.user = null;
        life.unsnap(n);
        if (n.engaged === 'plot') life.release(n);
        if (n.alive) n.say(status === 'complete' ? pick(['I feel like a new person.', 'Thanks, really.', '...Did anything happen?']) : pick(['Huh? What? I\'m up, I\'m up.', 'Who left my post empty?!']), 3);
      },
    }), [n]);
  }

  // ---- Smuggling (Security takes a cut) -------------------------------------------------------------------
  offerSmuggling(n) {
    return this.node(pick(L.HOOK_LINES.smuggler), [
      { label: 'I\'m listening.', fn: () => this.node('There\'s a package in Storage, behind the crates. Walk it into D-Block and hand it to one of them. Two hundred credits. Don\'t get seen by anyone straight-laced.', [
        { label: 'Deal.', fn: () => {
          this.evidence.set(n.id, 'offer');
          this.startSmuggling(n);
          return this.node('Smart. Don\'t make me regret it.', [this.bye()]);
        } },
        { label: 'No. And you should stop.', fn: () => {
          this.evidence.set(n.id, 'offer');
          this.addRel(n, -8);
          return this.node(pick(['Suit yourself. You never heard any of this.', 'Your loss. Keep your mouth shut.']), [this.bye()]);
        } },
      ]) },
      { label: 'Not interested.', fn: () => this.node('Then this conversation never happened.', [this.bye()]) },
    ]);
  }

  startSmuggling(n) {
    const g = this.game;
    const base = g.point('crate-storage');
    const p = g.nav.randomPointNear(base.x, base.z, 2) || [base.x, base.z];
    const pkg = g.addPickup({ id: 'contraband', kind: 'crate', x: p[0], y: 0.75, z: p[1], name: 'Unmarked Package', onPickup: (gm) => gm.ui.setItem('Carrying: unmarked package') });
    const recipients = this.life.people.filter((o) => o.kind === 'classd' && o.alive);
    const d = pick(recipients);
    if (!d) return;
    this.addPlot(new Task({
      title: `Run ${last(n.name)}'s package into D-Block`,
      giver: n.name,
      steps: [
        new PickupStep({ text: 'Pick up the package in Storage', item: pkg }),
        new ActionStep({
          text: `Slip it to ${d.name}`,
          detail: 'Make sure no honest officer sees the hand-off.',
          object: d,
          action: { text: 'Slip them the package', sub: d.name, free: true },
          onUse: (gm) => {
            gm.ui.setItem(null);
            const w = this.witnesses();
            if (w.length) {
              const who = w[0];
              who.say(pick(['What did you just hand that D-class?!', 'I saw that, officer.']), 3.5);
              gm.director.changeStanding(-30, `Caught smuggling by ${who.name}`);
              this.addRel(who, -30);
              return { ok: true, message: 'YOU WERE SEEN' };
            }
            gm.tasks.award(200, `Envelope from ${n.name}`);
            this.addRel(n, 20);
            this.addRel(d, 15);
            n.person.flags.hookDone = true;
            d.say(pick(['Pleasure doing business.', 'You didn\'t see me.', 'Christmas came early.']), 3);
            return { ok: true, message: 'PACKAGE DELIVERED' };
          },
        }),
      ],
      onEnd: (gm, status) => {
        gm.removeInteractable(pkg);
        if (status !== 'complete') gm.ui.setItem(null);
      },
    }), [d]);
  }

  // ---- Keycards and contraband for sale (Class-D) ---------------------------------------------------------
  offerSale(n, kind) {
    const price = kind === 'fence' ? 220 : 340;
    const level = kind === 'fence' ? 1 : 2;
    const pitch = kind === 'fence' ? pick(L.HOOK_LINES.fence) : 'You want out? Level 2 keycard. Three-forty. Dead drop in your washroom.';
    if (this.role === 'security') {
      return this.node(kind === 'fence' ? 'Keycards? Me? Never seen one in a bin in my life, officer.' : 'Nothing going on here, officer.', [
        { label: 'I know what you\'re doing.', fn: () => {
          this.evidence.set(n.id, 'confronted');
          this.addRel(n, -10);
          return this.node(pick(['Prove it.', '...What do you want?', 'You can\'t prove anything.']), [this.back(n), this.bye()]);
        } },
        this.bye(),
      ]);
    }
    const opts = [];
    if (this.credits() >= price) {
      opts.push({ label: `Deal. (${price} CR)`, fn: () => {
        this.pay(price, 'Keycard deal');
        this.startDeadDrop(n, level);
        return this.node(pick(['Pleasure. Washroom, behind the stalls. Don\'t get caught with it.', 'It\'ll be in the washroom. You never saw me.']), [this.bye()]);
      } });
    } else opts.push({ label: `I don't have ${price} credits.`, fn: () => this.node('Then come back when you do.', [this.bye()]) });
    opts.push({ label: 'Too rich for me.', fn: () => this.node('Your loss.', [this.back(n), this.bye()]) });
    return this.node(pitch, opts);
  }

  startDeadDrop(n, level) {
    const g = this.game;
    const p = this.placeIn(['D-BLOCK WASHROOM']) || this.placeIn(DBLOCK);
    if (!p) return;
    const card = g.addPickup({
      id: 'deaddrop', kind: 'keycard', x: p.x, y: 0.62, z: p.z, name: `Level ${level} Keycard`,
      onPickup: (gm) => {
        gm.player.keycard = Math.max(gm.player.keycard || 0, level);
        gm.ui.setItem(`Keycard: Level ${gm.player.keycard}`);
      },
    });
    n.person.flags.hookDone = true;
    this.addPlot(new Task({
      title: `Collect the keycard from the dead drop`,
      giver: n.name,
      steps: [new PickupStep({ text: 'Get the keycard (D-Block Washroom)', item: card })],
      onEnd: (gm) => gm.removeInteractable(card),
    }), []);
  }

  // ---- Feeding ---------------------------------------------------------------------------------------------
  feed(n) {
    const medic = n.kind === 'medic';
    if (n.person.flags.fed) return this.node(medic ? 'I already patched you up today. Try not to need it again.' : 'That\'s all I can spare today. Come back tomorrow.', [this.back(n), this.bye()]);
    n.person.flags.fed = true;
    this.game.player.heal(medic ? 60 : 40);
    this.addRel(n, 6);
    return this.node(medic ? pick(['Hold still. ...There. You\'ll live.', 'Let me see that. Nothing a bandage can\'t fix.', 'Sit. This will sting.']) : pick(L.HOOK_LINES.feeder), [this.back(n), this.bye()]);
  }

  // ---- Escape pact (Class-D) — or a setup -----------------------------------------------------------------
  offerEscape(n) {
    if (this.rel(n) < 0) return this.node('I don\'t trust you. Not yet.', [this.back(n), this.bye()]);
    return this.node(pick(L.HOOK_LINES[n.person.hook]), [
      { label: 'I\'m in. What\'s the plan?', fn: () => this.node('Meet me in the washroom. I can short the panel behind the stalls — the grid drops, the doors fail open, and we run for the maintenance shaft in Storage. If it goes wrong, you keep the guards busy.', [
        { label: 'Let\'s do it.', fn: () => {
          this.startEscape(n);
          return this.node('Washroom. Don\'t be late. Don\'t tell anyone.', [this.bye()]);
        } },
        { label: 'Too risky. Forget it.', fn: () => this.node('Coward. Fine. Forget I said anything.', [this.bye()]) },
      ]) },
      { label: 'You\'ll get us both killed.', fn: () => this.node('Maybe. Better than dying in here.', [this.back(n), this.bye()]) },
    ]);
  }

  startEscape(n) {
    const life = this.life;
    const g = this.game;
    const wash = this.placeIn(['D-BLOCK WASHROOM']) || { x: n.pos.x, z: n.pos.z };
    const zoneOf = (m) => {
      const room = g.builder.rooms[g.world.roomAtWorld(m.pos.x, 0.7, m.pos.z)];
      return room ? room.zone : null;
    };
    life.take(n, 'plot');
    n.goTo(wash.x, wash.z, { speed: 1.5 });
    const betray = n.person.hook === 'snitch';
    let waited = 0;
    let began = false;
    let retry = 0;
    this.addPlot(new Task({
      title: `Break out with ${n.name}`,
      giver: n.name,
      steps: [
        new ReachStep({ text: `Meet ${n.name} in the D-Block Washroom`, zone: 'D-BLOCK WASHROOM', targetFn: () => ({ x: n.pos.x, y: 2, z: n.pos.z }) }),
        new CustomStep({
          text: `Wait for ${n.name}`,
          labelFn: () => (!began ? `Wait for ${n.name} in the washroom` : betray ? `${n.name} is getting ready...` : `Keep watch while ${n.name} shorts the panel`),
          failIf: () => !n.alive,
          target: () => ({ x: n.pos.x, y: 2, z: n.pos.z }),
          update: (gm, dt) => {
            if (!began) {
              // Still on the way (re-route if they got stuck).
              if (zoneOf(n) !== 'D-BLOCK WASHROOM' || n.mode !== 'idle') {
                retry += dt;
                if (n.mode === 'idle' && retry > 3) {
                  retry = 0;
                  n.goTo(wash.x, wash.z, { speed: 1.5 });
                }
                return false;
              }
              if (gm.zone !== 'D-BLOCK WASHROOM' || flat(n.pos, gm.player.pos) > 6) return false;
              began = true;
              n.faceToward(gm.player.pos.x, gm.player.pos.z);
              n.say(betray ? pick(['Wait here. Almost... ready.', 'Just a second. Stay right there.']) : pick(['Here goes nothing.', 'Watch the door.']), 3);
              if (!betray) n.pose = 'kneel';
              return false;
            }
            waited += dt;
            if (waited < 7) return false;
            n.pose = null;
            if (betray) {
              // It was a setup: the guards were told where to look.
              n.say(pick(['Sorry. They promised me extra rations.', 'Nothing personal. I want to live.']), 4);
              const guards = gm.director.guards().filter((x) => !x.pursuing && !(x.ai && x.ai.job) && x.id !== 'chief').sort((a, b) => flat(a.pos, gm.player.pos) - flat(b.pos, gm.player.pos)).slice(0, 2);
              guards.forEach((gd, k) => {
                gd.busy = true;
                const p = gm.pointNear(gm.player.pos.x, gm.player.pos.z, 1.6);
                gd.goTo(p[0], p[1], { speed: 3.4 }).then(() => {
                  gd.faceToward(gm.player.pos.x, gm.player.pos.z);
                  if (k === 0) gd.say(pick([`Planning a little trip, ${gm.designation}?`, 'Nice try. Back to your cell.', 'We heard all about it.']), 4);
                  gd.swingT = 0.3;
                  gm.director.after(6, () => {
                    gd.busy = false;
                    gm.director.returnToPost(gd);
                  });
                });
              });
              gm.director.changeStanding(-20, 'Caught planning an escape');
              this.addRel(n, -60);
              return true;
            }
            if (!gm.events.busy) gm.events.start('grid');
            n.say('GO! GO! The maintenance shaft, now!', 3);
            this.addRel(n, 30);
            // They make their own run for it.
            const m = gm.point('maint-shaft');
            n.goTo(m.x, m.z, { speed: 3 }).then((ok) => {
              if (!ok || !n.alive) return;
              n.hidden = true;
              n.model.root.visible = false;
              n.person.dead = true;
              remember(gm.profile, n.person, 'escaped');
            });
            return true;
          },
        }),
      ],
      onEnd: () => {
        if (n.engaged === 'plot' && !n.hidden) {
          n.pose = null;
          life.release(n);
        }
        n.person.flags.hookDone = true;
      },
    }), [n]);
  }

  // ---- Investigation: who's smuggling? (Security) -----------------------------------------------------------
  offerInvestigation(n) {
    const smuggler = this.life.people.find((o) => o.alive && o.kind === 'guard' && o.person.hook === 'smuggler');
    if (!smuggler) return this.node('Forget it. I think I was wrong.', [this.back(n), this.bye()]);
    return this.node(pick(L.HOOK_LINES.whistle), [
      { label: 'I\'ll look into it.', fn: () => {
        this.startInvestigation(n, smuggler);
        return this.node('Watch the D-Block washroom. Deals happen there. Be careful.', [this.bye()]);
      } },
      { label: 'That\'s a serious accusation.', fn: () => this.node('I know. That\'s why I\'m telling you and not the Chief.', [this.back(n), this.bye()]) },
    ]);
  }

  startInvestigation(n, guard) {
    const g = this.game;
    const wash = g.point('spill-washroom');
    // The smuggler makes a run soon.
    this.handoffs.push({ guard, at: this.life.time + rand(50, 100), done: false });
    const boss = () => [g.npcs.get('chief'), g.npcs.get('adm-director')].find((x) => x && x.alive) || null;
    const report = boss();
    if (!report) return;
    this.addPlot(new Task({
      title: 'Catch the D-Block smuggler',
      giver: n.name,
      steps: [
        new CustomStep({
          text: 'Catch the smuggler in the act',
          detail: 'Watch the D-Block washroom. Be close enough to see the hand-off.',
          failIf: () => !guard.alive || guard.person.fired,
          update: () => this.evidence.get(guard.id) === 'witnessed',
          target: () => ({ x: wash.x, y: 1.6, z: wash.z }),
        }),
        new ActionStep({
          text: `Report ${guard.name} to ${report.name}`,
          object: report,
          action: { text: `Report ${guard.name} for smuggling`, sub: report.name, free: true },
          onUse: (gm) => {
            this.fire(guard, 'smuggling');
            gm.tasks.award(250, 'Internal affairs bonus');
            gm.director.changeStanding(15, 'Exposed a corrupt officer');
            this.addRel(n, 25);
            n.person.flags.hookDone = true;
            this.evidence.delete(guard.id);
            return { ok: true, message: `${guard.name.toUpperCase()} REPORTED` };
          },
        }),
      ],
    }), [guard]);
  }

  /** Someone is walked off site. */
  fire(guard, why) {
    const g = this.game;
    const life = this.life;
    guard.person.fired = true;
    remember(g.profile, guard.person, 'fired', why);
    life.ripple(guard, -12);
    const chief = g.npcs.get('chief');
    if (chief && chief.alive && chief !== guard) chief.say(pick([`${last(guard.name)}. Badge and sidearm. Now.`, `You're done here, ${last(guard.name)}.`]), 4);
    g.say('SITE INTERCOM', `${guard.name} has been relieved of duty. Report any contact to the Head of Security.`, 'pa', 5);
    life.take(guard, 'fired');
    guard.say(pick(['This is a mistake!', 'You\'ll regret this.', '...Fine.']), 3);
    const e = g.point('evac');
    const car = g.point('evac-car');
    guard.goTo(e.x, e.z, { speed: 1.5 }).then((ok) => {
      if (ok) guard.board(car.x, car.z);
    });
  }

  // ---- Escort a curious researcher (Security) ---------------------------------------------------------------
  offerEscortResearcher(n) {
    const g = this.game;
    const list = this.curiousTargets();
    if (!list.length) return this.node('I\'ve read every file in the archive. Twice. I just wish we had something worth seeing.', [this.back(n), this.bye()]);
    const e = pick(list);
    const ch = e.chamber;
    void g;
    return this.node(this.life.fill(pick(L.HOOK_LINES.curious), { scp: e.name }), [
      { label: 'Fine. Stay close.', fn: () => {
        this.startEscortResearcher(n, e, ch);
        return this.node('Thank you! I\'ll be right behind you.', [this.bye()]);
      } },
      { label: 'Not a chance.', fn: () => {
        this.addRel(n, -4);
        return this.node(pick(['Spoilsport.', 'One day I\'ll go on my own.']), [this.bye()]);
      } },
    ]);
  }

  startEscortResearcher(n, e, ch) {
    const g = this.game;
    const life = this.life;
    const dest = { x: ch.outside[0] * VOXEL, z: ch.outside[1] * VOXEL, r: 2.4, label: `${e.name}'s chamber` };
    life.take(n, 'plot');
    this.addPlot(new Task({
      title: `Show ${n.name} ${e.name}`,
      giver: n.name,
      reward: 120,
      steps: [new EscortStep({ text: `Escort ${n.name}`, npc: n, dest, from: 'right here', meetText: `Escort ${n.name}`, onMeet: (gm) => gm.say(n.name, 'Lead the way!') })],
      onComplete: (gm) => {
        this.addRel(n, 22, 'escorted');
        n.person.flags.hookDone = true;
        n.person.hook = null;
        n.faceToward(e.pos.x, e.pos.z);
        n.pose = 'lean';
        n.say(this.life.fill(pick(['It\'s... smaller than I imagined.', 'Incredible. Absolutely incredible.', 'I can feel it looking at me. Can you?', 'I\'ll never forget this.']), { scp: e.name }), 4);
        life.wait(9).then(() => {
          if (n.engaged === 'plot') life.release(n);
        }).catch(() => {});
      },
      onEnd: (gm, status) => {
        if (status !== 'complete' && n.engaged === 'plot') life.release(n);
      },
    }), [n]);
  }

  // ---- Role-specific options --------------------------------------------------------------------------------
  classdOptions(n, opts) {
    const t = n.person.traits;
    if (n.kind === 'guard') {
      opts.push({ label: 'Any chance you could look the other way?', fn: () => this.bribe(n) });
    } else if (n.kind === 'classd') {
      if (n.person.hook !== 'escapee' && n.person.hook !== 'snitch') {
        opts.push({ label: 'Want to get out of here?', fn: () => this.node(t.nerve < 0.4 ? 'Are you insane? Keep your voice down. Leave me out of it.' : pick(['Not yet. Not with you.', 'Everyone wants out. Nobody makes it.']), [this.back(n), this.bye()]) });
      }
      if (t.honor < 0.4 && !n.person.flags.traded) {
        opts.push({ label: 'Got anything to trade?', fn: () => {
          const price = 60;
          if (this.credits() < price) return this.node(`Got a pipe stashed. Sixty credits. You don't have sixty credits.`, [this.back(n), this.bye()]);
          return this.node('Got a pipe stashed. Sixty credits and it\'s yours.', [
            { label: `Deal. (${price} CR)`, fn: () => {
              this.pay(price, 'Contraband');
              n.person.flags.traded = true;
              this.favor(n);
              return this.node('Pleasure.', [this.bye()]);
            } },
            this.back(n),
          ]);
        } });
      }
    } else if (n.staff) {
      opts.push({ label: 'Can you help me?', fn: () => {
        if (t.heart > 0.68 && this.rel(n) >= 5 && !n.person.flags.helpedPlayer) {
          n.person.flags.helpedPlayer = true;
          if (n.kind === 'cook' || n.kind === 'medic') return this.feed(n);
          this.blind.set(n, this.life.time + 240);
          return this.node(pick(['Okay. If anyone asks, I never saw you here.', 'I can\'t get you out. But I won\'t stop you. Go.']), [this.bye()]);
        }
        if (t.heart < 0.35) return this.node(pick(['Help yourself, D-class. Nobody else will.', 'Step back before I call security.']), [this.bye()]);
        return this.node(pick(['I\'m sorry. I can\'t.', 'I could lose my job. I\'m sorry.']), [this.back(n), this.bye()]);
      } });
    }
  }

  securityOptions(n, opts) {
    if (n.kind === 'classd') {
      opts.push({ label: 'Anything you want to tell me?', fn: () => this.snitchTalk(n) });
      opts.push({ label: 'How are they treating you?', fn: () => {
        if (!n.person.flags.asked) {
          n.person.flags.asked = true;
          this.addRel(n, 6);
        }
        return this.node(pick(['How do you think? They feed us, they test us, we die. Thanks for asking, though.', 'Nobody asks that. ...It\'s bad. It\'s really bad.', 'Fine, officer. Everything is fine.']), [this.back(n), this.bye()]);
      } });
    }
    if (n.def.slot === 'chief') {
      const leads = [...this.evidence.entries()].filter(([, v]) => v === 'offer' || v === 'witnessed' || v === 'confronted');
      for (const [id] of leads) {
        const guard = this.game.npcs.get(id);
        if (!guard || !guard.alive || guard.person.fired || this.plotNpcs.has(guard)) continue;
        opts.push({ label: `I need to report ${guard.name}.`, fn: () => {
          const how = this.evidence.get(id);
          if (how === 'witnessed' || how === 'offer') {
            this.fire(guard, how === 'offer' ? 'bribery' : 'smuggling');
            this.game.director.changeStanding(10, 'Reported misconduct');
            this.game.tasks.award(150, 'Internal affairs bonus');
            this.evidence.delete(id);
            return this.node(pick(['Good work. I\'ll handle it.', 'That\'s disappointing. And not a surprise. Thank you, officer.']), [this.bye()]);
          }
          return this.node('Your word against theirs. Bring me something solid.', [this.back(n), this.bye()]);
        } });
      }
    }
  }

  bribe(n) {
    const g = this.game;
    const t = n.person.traits;
    const rel = this.rel(n);
    const price = Math.max(60, Math.round((180 - rel * 1.2) / 10) * 10);
    if (this.blind.has(n) && this.blind.get(n) > this.life.time) return this.node('I already said I didn\'t see you. Don\'t push it.', [this.bye()]);
    if (t.honor > 0.68) {
      return this.node(pick(['Are you trying to bribe me, D-class?', 'Say that again. I dare you.']), [
        { label: '...No. Forget it.', fn: () => {
          this.addRel(n, -12);
          g.director.changeStanding(-8, `Tried to bribe ${n.name}`);
          return this.node('That\'s what I thought.', [this.bye()]);
        } },
        { label: 'Everyone has a price.', fn: () => {
          this.addRel(n, -25);
          g.director.changeStanding(-12, `Tried to bribe ${n.name}`);
          if (g.director.pursue) g.director.pursue(n, 'Bribing an officer? You\'re coming with me.');
          return null;
        } },
      ]);
    }
    if (t.honor > 0.45) return this.node(pick(['Not a chance. Walk away.', 'Don\'t insult me. Go.']), [this.back(n), this.bye()]);
    const opts = [];
    if (this.credits() >= price) {
      opts.push({ label: `Pay ${price} CR.`, fn: () => {
        this.pay(price, `Bribe for ${n.name}`);
        this.blind.set(n, this.life.time + 200);
        this.addRel(n, 6);
        this.evidence.set(n.id, 'paid');
        return this.node(pick(['Three minutes. I see nothing, I hear nothing.', 'Pleasure doing business. Now get out of my sight.']), [this.bye()]);
      } });
    } else opts.push({ label: `I don't have ${price} credits.`, fn: () => this.node('Then we have nothing to talk about.', [this.bye()]) });
    opts.push({ label: 'Never mind.', fn: () => this.root(n, false, true) });
    return this.node(`${pick(['Depends.', 'Maybe.', 'Everything has a price down here.'])} ${price} credits.`, opts);
  }

  /** Security asks a Class-D for information. Snitches talk; others don't. */
  snitchTalk(n) {
    const t = n.person.traits;
    if (n.person.hook !== 'snitch' && !(t.nerve < 0.35 && this.rel(n) > 20)) return this.node(pick(['Nothing, officer.', 'I don\'t know anything.', 'I keep my head down.']), [this.back(n), this.bye()]);
    const runner = this.life.people.find((o) => o !== n && o.alive && o.kind === 'classd' && o.person.hook === 'escapee');
    const smuggler = this.life.people.find((o) => o.alive && o.kind === 'guard' && o.person.hook === 'smuggler');
    if (runner && !this.plotNpcs.has(runner)) {
      return this.node(`${runner.name} is planning to run. Got a map hidden in the cell. You didn't hear it from me.`, [
        { label: 'I\'ll search the cell.', fn: () => {
          this.startSearch(n, runner);
          return this.node('Remember who told you.', [this.bye()]);
        } },
        this.bye(),
      ]);
    }
    if (smuggler) {
      this.evidence.set(smuggler.id, 'rumour');
      return this.node(`${smuggler.name} brings us cigarettes. Takes our commissary credits. Everybody knows.`, [this.back(n), this.bye()]);
    }
    return this.node('Nothing new. Quiet in here.', [this.back(n), this.bye()]);
  }

  startSearch(snitch, runner) {
    const g = this.game;
    const c = g.spawns.classd[runner.def.cell % g.spawns.classd.length];
    const p = g.nav.randomPointNear(c.x * VOXEL, c.z * VOXEL, 1.2) || [c.x * VOXEL, c.z * VOXEL];
    const map = g.addPickup({ id: 'escape-map', kind: 'document', x: p[0], y: 0.62, z: p[1], name: 'Hand-drawn Map' });
    this.addPlot(new Task({
      title: `Search ${runner.name}'s cell`,
      giver: snitch.name,
      reward: 80,
      steps: [new PickupStep({ text: `Search ${c.cell}`, item: map })],
      onComplete: (gm) => {
        gm.director.changeStanding(5, 'Escape plan foiled');
        this.addRel(snitch, 10);
        this.addRel(runner, -40);
        runner.person.hook = null;
        runner.say(pick(['Who told you?!', 'That\'s not mine!']), 3);
      },
      onEnd: (gm) => gm.removeInteractable(map),
    }), [runner]);
  }

  /** Options that continue a plot with this person. */
  plotOptions() {
    return [];
  }

  // ---- Background plot events (smuggling hand-offs) ------------------------------------------------------------
  tickHandoffs() {
    const life = this.life;
    const g = this.game;
    for (const h of this.handoffs) {
      if (h.done || life.time < h.at) continue;
      const guard = h.guard;
      if (!guard.alive || guard.person.fired || g.events.busy) {
        h.at = life.time + 60;
        continue;
      }
      const d = life.people.filter((o) => o.kind === 'classd' && o.alive && life.canDrive(o))[0];
      if (!d || !life.canDrive(guard)) {
        h.at = life.time + 20;
        continue;
      }
      h.done = true;
      this.runHandoff(guard, d);
    }
  }

  async runHandoff(guard, d) {
    const life = this.life;
    const g = this.game;
    const wash = g.point('spill-washroom');
    life.take(guard, 'handoff');
    life.take(d, 'handoff');
    try {
      const a = guard.goTo(wash.x + 0.6, wash.z, { speed: 1.5 });
      const b = d.goTo(wash.x - 0.6, wash.z, { speed: 1.3 });
      await Promise.race([Promise.all([a, b]), life.wait(80)]);
      guard.faceToward(d.pos.x, d.pos.z);
      d.faceToward(guard.pos.x, guard.pos.z);
      guard.say(pick(['Same as always.', 'Make it quick.']), 3);
      guard.setItem('box');
      // Anyone watching?
      let seen = false;
      for (let i = 0; i < 16; i++) {
        await life.wait(0.5);
        const p = g.player;
        if (!p.dead && this.role === 'security' && flat(p.pos, guard.pos) < 13 && g.world.visible(p.pos.x / VOXEL, (p.pos.y + 1.5) / VOXEL, p.pos.z / VOXEL, guard.pos.x / VOXEL, 3, guard.pos.z / VOXEL)) seen = true;
        if (i === 6) {
          guard.setItem(null);
          d.setItem('box');
          d.say(pick(['Pleasure doing business.', 'You\'re a saint, officer.']), 3);
        }
      }
      d.setItem(null);
      if (seen) {
        this.evidence.set(guard.id, 'witnessed');
        g.ui.toast(`YOU SAW ${guard.name.toUpperCase()} HAND SOMETHING TO ${d.name}`, false);
      }
    } catch (e) {
      // aborted
    } finally {
      if (life.gen) {
        life.release(guard);
        life.release(d);
      }
    }
  }
}

