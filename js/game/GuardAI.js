// Guard AI: what security officers (and Mobile Task Force) do in a fight.
//
//   * shoot breach anomalies and hostile players from range, backing away when
//     something gets too close; hold fire when a friendly is in the way
//   * SCP-173: a watch group keeps it in view while walking, takes turns to
//     blink (calling it out) and never blinks together; once two people have
//     it covered, one officer walks up and cages it
//   * SCP-096: eyes on the floor within range of it (a disciplined officer
//     rarely glances up — and that glance can be fatal); when it sits down, an
//     officer approaches from behind and bags it
//   * SCP-999: walk up and carry it back
//   * riots: baton the rioters (two hits sends them back to their cells)
//   * breaches: once the anomalies are down, an officer re-engages the locks
//   * dangerous events call in a three-man MTF squad: rifles, armour, discipline
//
// The player is never overridden: when an officer does the job first, the
// shift directors treat it as a team effort rather than a failure.

import { VOXEL } from '../config.js';
import { WEAPONS } from './combat/weapons.js';
import { pick } from './directors/Director.js';

const FACE_N = { s: [0, 0, 1], n: [0, 0, -1], e: [1, 0, 0], w: [-1, 0, 0] };
const MTF_NAMES = ['Rook', 'Ash', 'Wolf', 'Viper', 'Hawk', 'Bishop', 'Saint', 'Echo', 'Moth', 'Slate'];
const THINK = 0.25;
const STRAIN_MAX = 13; // seconds an officer can keep their eyes open
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class GuardAI {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.thinkT = 0;
    this.cage = null; // { by, t }
    this.bag = null;
    this.jobs = new Map(); // SCP id → { by, t, ... } team recontainment jobs
    this.lockJob = null;
    this.squad = [];
    this.squadEvent = null;
    this.playerSees173 = false;
    this.callouts = new Map();
    this.warnedArmed = false;
  }

  get g() {
    return this.game;
  }

  officers() {
    const out = [];
    for (const n of this.g.npcs.values()) if (n.kind === 'guard' && n.alive) out.push(n);
    return out;
  }

  state(n) {
    if (!n.ai) {
      n.ai = {
        job: null,
        target: null,
        fireT: 0.6 + Math.random() * 0.5,
        mag: WEAPONS[n.weapon || 'pistol'].mag,
        reloadT: 0,
        burst: 0,
        canShoot: false,
        moveT: 0,
        seenPlayerAt: -99,
        sees173: false,
        discipline: n.mtf ? 0.997 : n.person ? 0.9 + n.person.traits.drive * 0.05 + n.person.traits.nerve * 0.045 : 0.93 + Math.random() * 0.06,
        glanceT: 0,
        swingT: 0,
      };
    }
    return n.ai;
  }

  /** Radio callout with a per-key cooldown so officers do not spam. */
  callout(n, key, lines, cd = 12) {
    const now = this.g.time;
    const k = `${n.id}:${key}`;
    if ((this.callouts.get(k) || -99) > now) return;
    this.callouts.set(k, now + cd);
    this.g.say(n.name, Array.isArray(lines) ? pick(lines) : lines);
  }

  // ---- Perception -------------------------------------------------------------
  los(n, x, y, z) {
    const g = this.g;
    if (g.doorBlocksLine(n.pos.x, n.pos.z, x, z)) return false;
    return g.world.visible(n.pos.x / VOXEL, 3.3, n.pos.z / VOXEL, x / VOXEL, y / VOXEL, z / VOXEL);
  }

  /** Can a bullet actually get there (glass stops bullets, but not sight)? */
  clearShot(n, target) {
    const g = this.g;
    const ty = target === g.player ? target.pos.y + target.height * 0.7 : target.aimY != null ? target.pos.y + target.aimY : target.kind ? target.pos.y + 1.2 : target.pos.y;
    const ox = n.pos.x;
    const oy = n.pos.y + 1.35;
    const oz = n.pos.z;
    const dx = target.pos.x - ox;
    const dy = ty - oy;
    const dz = target.pos.z - oz;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    if (g.doorBlocksLine(ox, oz, target.pos.x, target.pos.z)) return false;
    const hit = g.world.raycast(ox, oy, oz, dx / d, dy / d, dz / d, d);
    if (hit < d - 0.3) return false;
    // Never shoot through a colleague (or a bystander).
    for (const o of g.npcs.values()) {
      if (!o.alive || o === n || o === target || o.hostile) continue;
      const t = ((o.pos.x - ox) * dx + (o.pos.z - oz) * dz) / (dx * dx + dz * dz);
      if (t <= 0 || t >= 1) continue;
      const px = ox + dx * t - o.pos.x;
      const pz = oz + dz * t - o.pos.z;
      if (Math.hypot(px, pz) < 0.45) return false;
    }
    return true;
  }

  seesPlayer(n, range) {
    const g = this.g;
    const p = g.player;
    if (p.dead) return false;
    const d = flat(n.pos, p.pos);
    if (d > range) return false;
    if (d > 2.5) {
      const fx = -Math.sin(n.yaw);
      const fz = -Math.cos(n.yaw);
      if ((fx * (p.pos.x - n.pos.x) + fz * (p.pos.z - n.pos.z)) / d < 0.2) return false;
    }
    return this.los(n, p.pos.x, p.pos.y + 1.4, p.pos.z);
  }

  // ---- Jobs --------------------------------------------------------------------
  assign(n, job, target = null) {
    const ai = this.state(n);
    if (ai.job === job && ai.target === target) return ai;
    const fresh = !ai.job;
    ai.job = job;
    ai.target = target;
    ai.moveT = 0;
    if (fresh) {
      ai.wasBusy = n.busy;
      n.busy = true;
      n.stop();
    }
    n.pursuing = n.pursuing && job !== 'engage';
    return ai;
  }

  release(n) {
    const ai = this.state(n);
    if (!ai.job) return;
    ai.job = null;
    ai.target = null;
    n.lookAt = null;
    n.aiming = false;
    n.holdBlink = false;
    n.announceBlinks = false;
    n.staring = false;
    n.stop();
    const g = this.g;
    if (n.mtf) return; // the squad's own logic moves them
    const ev = g.events.current;
    if (ev && g.director && ai.wasBusy) {
      const site = g.director.eventSite(ev);
      const p = g.pointNear(site.x, site.z, 4);
      n.goTo(p[0], p[1], { speed: 2.6 });
    } else {
      n.busy = false;
      if (g.director) g.director.returnToPost(n);
    }
  }

  /** Walk somewhere (re-planning at most every `every` seconds). */
  moveTo(n, x, z, speed, every = 1) {
    const ai = this.state(n);
    ai.moveT -= THINK;
    if (ai.moveT > 0) return;
    ai.moveT = every;
    n.goTo(x, z, { speed });
  }

  halt(n) {
    if (n.path || n.mode !== 'idle') {
      n.path = null;
      n.mode = 'idle';
      n._finish(false);
    }
  }

  // ---- Main update ----------------------------------------------------------------
  update(dt) {
    const g = this.g;
    if (!g.director || !g.director.started) return;
    const officers = this.officers();
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = THINK;
      this.think(officers);
    }
    this.blinkDiscipline(officers);
    for (const n of officers) this.fight(n, dt);
  }

  think(officers) {
    const g = this.g;
    const dir = g.director;
    const scps = g.scps;
    const hostile = !!dir.playerHostile;
    const classd = g.role && g.role.id === 'classd';

    // Who has a reason to fight what.
    const taken = new Set();
    const scpThreats = scps.threats();
    const hostiles = [...g.npcs.values()].filter((x) => x.alive && x.hostile);
    for (const n of officers) {
      const ai = this.state(n);
      if (n.stunT > 0) continue;
      ai.glanceT = Math.max(0, ai.glanceT - THINK);

      // 1. A hostile player in sight (or one who just attacked this officer).
      const range = g.events.powerOut ? 7 : 26;
      const sees = this.seesPlayer(n, range);
      if (sees) ai.seenPlayerAt = g.time;
      // An armed Class-D is shot on sight.
      if (classd && sees && !hostile && !g.player.handsGone && g.combat.def.kind === 'ranged' && flat(n.pos, g.player.pos) < 20) {
        dir.makeHostile(n, 'armed');
      }
      // A Class-D who lays hands on an officer gets shot (Security friendly fire is handled by the director).
      const struck = classd && n.lastAttacker === g.player && g.time - (n.attackedAt || -99) < 8;
      if ((hostile || struck) && !g.player.dead && (sees || g.time - ai.seenPlayerAt < 5 || struck)) {
        this.assign(n, 'engage', g.player);
        continue;
      }
      // 2. Anomalies, loose SCPs that bullets affect, SCP-049-2.
      let threat = null;
      let td = 18;
      const consider = (t, y) => {
        const d = flat(n.pos, t.pos);
        if (d < td && this.los(n, t.pos.x, y, t.pos.z)) {
          td = d;
          threat = t;
        }
      };
      for (const a of g.events.anomalies) if (a.alive) consider(a, a.pos.y);
      for (const t of scpThreats) consider(t, t.pos.y + (t.aimY || 1));
      for (const z of hostiles) consider(z, z.pos.y + 1.2);
      if (threat) {
        this.assign(n, 'engage', threat);
        continue;
      }
      if (ai.job === 'engage') this.release(n);
    }

    const free = (n) => {
      const ai = this.state(n);
      return n.alive && n.stunT <= 0 && ai.job !== 'engage' && n.id !== 'chief' && !(n.pursuing && !hostile);
    };

    // 3. SCP-173.
    const s173 = scps.entities.get('173');
    this.handle173(s173 && !s173.contained ? s173 : null, officers, free, taken);

    // 4. Eyes on the floor near anything you must not look at; SCP-096.
    this.handleGaze(officers);
    const s096 = scps.entities.get('096');
    this.handle096(s096 || null, officers, free, taken);

    // 5. Every other loose SCP, by how it is recontained.
    for (const e of scps.entities.values()) {
      if (e.contained || !e.recon) {
        this.jobs.delete(e.id);
        continue;
      }
      const mode = e.recon.mode;
      if (mode === 'carry') this.teamJob(e, officers, free, taken, { job: 'fetch', reach: 1.2, hold: 2.5, speed: 2.2, say: `Got ${e.name}. Taking it home.` });
      else if (mode === 'escort') this.teamJob(e, officers, free, taken, { job: 'escort', reach: 1.6, hold: 3, speed: 2.4, ready: () => e.stunT > 0.4, wait: 5, holding: () => (e.stunT = Math.max(e.stunT, 1)), say: 'SCP-049 is compliant. Walking it back.' });
      else if (mode === 'subdue') this.teamJob(e, officers, free, taken, { job: 'restrain', reach: 2.4, hold: 5, speed: 3, ready: () => e.state === 'down', wait: 10, say: 'Restraints on! Get it back in the acid!' });
      else if (mode === 'cover') this.teamJob(e, officers, free, taken, { job: 'cover', reach: 1.3, hold: 3.5, speed: 1.6, eyesDown: true, say: 'Case closed. Nobody look at it.' });
      else if (mode === 'terminals') this.handleTerminals(e, officers, free, taken);
    }

    // 6. Riots.
    this.handleRiot(officers, free, taken);

    // 7. Breach locks once the anomalies are down.
    this.handleLocks(officers, free, taken);

    // 8. Release anyone whose job has gone away.
    for (const n of officers) {
      const ai = this.state(n);
      if (ai.job && ai.job !== 'engage' && !taken.has(n)) this.release(n);
    }

    this.handleSquad();

    // A Security player working alongside the team earns an assist.
    if (g.role.id === 'security' && dir.noteAssist && !g.player.dead) {
      const pp = g.player.pos;
      const helping = officers.some((n) => {
        const ai = n.ai;
        if (!ai || !ai.job || flat(n.pos, pp) > 15) return false;
        const t = ai.target;
        return !t || !t.pos || flat(t.pos, pp) < 22;
      });
      if (helping || this.playerSees173) dir.noteAssist();
    }
  }

  // ---- Combat -----------------------------------------------------------------------
  fight(n, dt) {
    const g = this.g;
    const ai = this.state(n);
    if (ai.job !== 'engage' || !ai.target) {
      if (ai.job !== 'subdue') n.aiming = false;
      return;
    }
    const t = ai.target;
    if ((t === g.player && g.player.dead) || (t !== g.player && !t.alive)) {
      this.release(n);
      return;
    }
    const d = flat(n.pos, t.pos);
    n.lookAt = t;
    n.aiming = true;
    const def = WEAPONS[n.weapon || 'pistol'];
    // Movement decisions on the think tick.
    if (this.thinkT === THINK) {
      ai.canShoot = this.clearShot(n, t);
      const maxRange = n.weapon === 'rifle' ? 30 : 22;
      const keep = t.keepAway ?? (t.dissipate ? 4.5 : 0);
      if (keep && d < keep) {
        // Too close to an anomaly: back off while shooting.
        const ax = (n.pos.x - t.pos.x) / (d || 1);
        const az = (n.pos.z - t.pos.z) / (d || 1);
        const bx = n.pos.x + ax * 3;
        const bz = n.pos.z + az * 3;
        if (g.nav.walkableAtWorld(bx, bz) && g.nav.lineWalkable(n.pos.x, n.pos.z, bx, bz)) this.moveTo(n, bx, bz, 3, 0.8);
      } else if (!ai.canShoot || d > maxRange) {
        const p = t === g.player ? g.player.pos : t.pos;
        this.moveTo(n, p.x, p.z, 3.2, 1);
      } else this.halt(n);
    }
    // Shooting.
    if (ai.reloadT > 0) {
      ai.reloadT -= dt;
      if (ai.reloadT <= 0) ai.mag = def.mag;
      return;
    }
    ai.fireT -= dt;
    if (ai.fireT > 0 || !ai.canShoot) return;
    const want = Math.atan2(-(t.pos.x - n.pos.x), -(t.pos.z - n.pos.z));
    let dy = want - n.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    if (Math.abs(dy) > 0.3) return;
    g.combat.npcFire(n, t, n.weapon || 'pistol');
    ai.mag--;
    if (n.weapon === 'rifle') {
      ai.burst++;
      ai.fireT = ai.burst % 3 === 0 ? 0.55 + Math.random() * 0.3 : 0.11;
    } else ai.fireT = 0.45 + Math.random() * 0.35;
    if (ai.mag <= 0) {
      ai.reloadT = def.reload + 0.4;
      this.callout(n, 'reload', ['Reloading!', 'Changing mags!', 'Cover me, reloading!'], 8);
    }
    if (t === g.player) this.callout(n, 'fire', g.role.id === 'classd' ? ['Armed Class-D! Open fire!', 'Drop it! Drop it now!', 'Hostile D-class, engaging!'] : ['Rogue officer! Take them down!', 'Traitor! Weapons free!'], 15);
    else if (t.dissipate) this.callout(n, 'anomaly', ['Contact! Anomaly!', 'Engaging the anomaly!', 'Keep shooting, it is breaking up!'], 14);
    else if (t.scp) this.callout(n, `scp-${t.scp.id}`, [`Contact, ${t.scp.name}! Open fire!`, `Engaging ${t.scp.name}!`, 'Keep it back! Keep shooting!'], 16);
    else if (t.zombie) this.callout(n, 'zombie', ['049-2 instance! Put it down!', 'That is not a person any more — fire!'], 16);
  }

  // ---- SCP-173 -----------------------------------------------------------------------
  handle173(e, officers, free, taken) {
    const g = this.g;
    this.s173 = e;
    if (!e) {
      this.cage = null;
      this.playerSees173 = false;
      return;
    }
    const head = e.lookPoints()[0];
    this.playerSees173 = g.scps.playerSees(e.lookPoints());
    // Recruit: everyone already on it, anyone who has eyes on it, plus the
    // MTF and the closest officers.
    const team = [];
    const candidates = officers.filter(free).sort((a, b) => flat(a.pos, e.pos) - flat(b.pos, e.pos));
    for (const n of candidates) {
      const ai = this.state(n);
      const d = flat(n.pos, e.pos);
      const near = d < 15 && this.los(n, head.x, head.y, head.z);
      if (ai.job === 'watch173' || ai.job === 'cage173' || near || n.mtf || (team.length < 4 && d < 70)) team.push(n);
    }
    for (const n of team) {
      const ai = this.state(n);
      const d = flat(n.pos, e.pos);
      ai.sees173 = d < 15 && this.los(n, head.x, head.y, head.z);
      if (ai.job !== 'watch173' && ai.job !== 'cage173') {
        this.assign(n, 'watch173', e);
        this.callout(n, '173', ['Eyes on 173! Nobody blink!', 'I have visual on the statue!', 'Moving to 173. Keep it in sight!'], 30);
      }
      taken.add(n);
      n.lookAt = e;
      n.announceBlinks = true;
      n.staring = true;
    }
    // Pick the cager: the closest watcher once someone else has it covered.
    const watching = team.filter((n) => this.state(n).sees173);
    const covered = watching.length >= 2 || (watching.length >= 1 && this.playerSees173);
    if (this.cage && (!this.cage.by.alive || !team.includes(this.cage.by))) this.cage = null;
    if (!this.cage && covered) {
      const by = watching.slice().sort((a, b) => flat(a.pos, e.pos) - flat(b.pos, e.pos))[0];
      this.cage = { by, t: 0 };
      this.state(by).job = 'cage173';
      this.callout(by, 'cage', ['I am going in with the cage. Keep your eyes on it!', 'Moving in. Do not blink!'], 30);
    }
    for (const n of team) {
      const ai = this.state(n);
      const d = flat(n.pos, e.pos);
      if (this.cage && this.cage.by === n) {
        if (d > 1.15) this.moveTo(n, e.pos.x, e.pos.z, 1.6, 0.6);
        else {
          this.halt(n);
          // Someone has to be looking at it the whole time the cage goes on.
          if (g.scps.isObserved(e)) this.cage.t += THINK;
          if (this.cage.t >= 4) {
            this.callout(n, 'caged', 'SCP-173 is caged! Get it back to its chamber.', 5);
            this.cage = null;
            this.recontain(e);
            return;
          }
        }
        continue;
      }
      ai.job = 'watch173';
      if (!ai.sees173 || d > 9) {
        // Close in while keeping it in view: stop 4-5 m out on a clear line.
        const dx = n.pos.x - e.pos.x;
        const dz = n.pos.z - e.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        const sx = e.pos.x + (dx / dl) * 4.5;
        const sz = e.pos.z + (dz / dl) * 4.5;
        if (g.nav.walkableAtWorld(sx, sz) && g.nav.lineClear(sx, sz, e.pos.x, e.pos.z)) this.moveTo(n, sx, sz, 2.4, 1);
        else this.moveTo(n, e.pos.x, e.pos.z, 2.4, 1);
      } else if (d < 3) {
        this.halt(n);
      } else this.halt(n);
    }
  }

  /** Take turns blinking: never two at once, never with nobody else watching. */
  blinkDiscipline(officers) {
    const e = this.s173;
    if (!e) {
      for (const n of officers) n.holdBlink = false;
      return;
    }
    const watchers = officers.filter((n) => n.ai && (n.ai.job === 'watch173' || n.ai.job === 'cage173') && n.ai.sees173);
    const busy = (n) => n.blinking || (!n.holdBlink && n.blinkT < 0.95);
    let token = watchers.find(busy) || null;
    for (const n of watchers) {
      if (n === token) continue;
      const wants = !n.blinking && n.blinkT <= 0.96;
      if (!wants) {
        n.holdBlink = false;
        continue;
      }
      const others = this.playerSees173 || watchers.some((o) => o !== n && !busy(o) && !o.blinking);
      if (!token && (others || n.strain > STRAIN_MAX)) {
        token = n;
        n.holdBlink = false;
      } else {
        n.holdBlink = true;
        if (n.strain > 6 && !others) this.callout(n, 'strain', ['I need someone on 173! I can not hold it much longer!', 'Somebody watch it — my eyes are burning!'], 20);
      }
    }
    for (const n of officers) if (!watchers.includes(n)) n.holdBlink = false;
  }

  // ---- SCP-096 ------------------------------------------------------------------------
  handle096(e, officers, free, taken) {
    const g = this.g;
    if (!e) {
      this.bag = null;
      return;
    }
    if (e.state === 'charge') {
      // You can hear it coming: officers in its path throw themselves aside.
      const fx = -Math.sin(e.yaw);
      const fz = -Math.cos(e.yaw);
      for (const n of officers) {
        if (e.targets.includes(n)) continue;
        const dx = n.pos.x - e.pos.x;
        const dz = n.pos.z - e.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 7 || d < 0.01) continue;
        const ahead = dx * fx + dz * fz;
        if (ahead < -0.5) continue;
        const lateral = dx * -fz + dz * fx;
        const side = lateral >= 0 ? 1 : -1;
        for (const off of [1.6, 1.0, -1.6]) {
          const sx = n.pos.x + -fz * side * off;
          const sz = n.pos.z + fx * side * off;
          if (g.nav.walkableAtWorld(sx, sz) && g.nav.lineWalkable(n.pos.x, n.pos.z, sx, sz)) {
            n.goTo(sx, sz, { speed: 4 });
            break;
          }
        }
        this.callout(n, 'dodge', ['Get down! Get out of its way!', 'It is coming through! Move!'], 15);
      }
    }
    if (e.contained || e.state !== 'docile') {
      if (this.bag && e.raging) this.callout(this.bag.by, 'abort', 'Abort! Abort! It is up!', 10);
      this.bag = null;
      return;
    }
    // Loose but sitting: bag it from behind.
    if (this.bag && (!this.bag.by.alive || !free(this.bag.by))) this.bag = null;
    if (!this.bag) {
      const list = officers.filter(free).sort((a, b) => (b.mtf - a.mtf) || flat(a.pos, e.pos) - flat(b.pos, e.pos));
      if (!list.length) return;
      this.bag = { by: list[0], t: 0 };
      this.callout(list[0], 'bag', ['It is sitting down. Moving in with the bag — eyes on the floor!', 'Going for the bag. Nobody look up.'], 30);
    }
    const n = this.bag.by;
    this.assign(n, 'bag096', e);
    taken.add(n);
    n.eyesDown = true;
    this.state(n).glanceT = 0;
    const fx = -Math.sin(e.yaw);
    const fz = -Math.cos(e.yaw);
    let bx = e.pos.x - fx * 0.95;
    let bz = e.pos.z - fz * 0.95;
    if (!g.nav.walkableAtWorld(bx, bz)) {
      bx = e.pos.x - fx * 0.6;
      bz = e.pos.z - fz * 0.6;
    }
    if (Math.hypot(n.pos.x - bx, n.pos.z - bz) > 0.45) this.moveTo(n, bx, bz, 1.4, 0.8);
    else {
      this.halt(n);
      n.faceToward(e.pos.x, e.pos.z);
      this.bag.t += THINK;
      if (this.bag.t >= 4.5) {
        this.callout(n, 'bagged', 'Bag is on! SCP-096 is secure.', 5);
        this.bag = null;
        this.recontain(e);
      }
    }
  }

  /** Eyes-down protocol near SCP-096 and an exposed SCP-012 (rare, risky glances). */
  handleGaze(officers) {
    const hazards = this.g.scps.gazeHazards();
    for (const n of officers) {
      const ai = this.state(n);
      const h = hazards.find((z) => flat(n.pos, z.e.pos) < z.r);
      if (!h) {
        n.eyesDown = false;
        continue;
      }
      if (n.eyesDown && ai.glanceT <= 0 && !h.e.raging && ai.job !== 'cover' && Math.random() < (1 - ai.discipline) * THINK * 0.5) ai.glanceT = 0.6;
      n.eyesDown = ai.glanceT <= 0;
    }
  }

  /**
   * One officer walks up to a loose SCP and, once `ready`, holds an action for
   * `hold` seconds to recontain it (fetch, escort, restrain, cover).
   */
  teamJob(e, officers, free, taken, o) {
    let job = this.jobs.get(e.id);
    if (job && (!job.by.alive || !free(job.by))) job = null;
    if (!job) {
      const list = officers.filter(free).sort((a, b) => (b.mtf - a.mtf) || flat(a.pos, e.pos) - flat(b.pos, e.pos));
      if (!list.length) return;
      job = { by: list[0], t: 0 };
      this.jobs.set(e.id, job);
    }
    const n = job.by;
    this.assign(n, o.job, e);
    taken.add(n);
    if (o.eyesDown) {
      n.eyesDown = true;
      this.state(n).glanceT = 0;
    }
    const ready = !o.ready || o.ready();
    const d = flat(n.pos, e.pos);
    // Not ready yet (it is still fighting): hang back and let the shooters work.
    if (!ready) {
      job.t = 0;
      if (d < (o.wait || 0)) {
        this.halt(n);
        n.lookAt = e;
      } else this.moveTo(n, e.pos.x, e.pos.z, o.speed, 1);
      return;
    }
    if (d > o.reach) {
      this.moveTo(n, e.pos.x, e.pos.z, o.speed + 0.8, 0.6);
      return;
    }
    this.halt(n);
    n.faceToward(e.pos.x, e.pos.z);
    if (o.holding) o.holding();
    job.t += THINK;
    if (job.t >= o.hold) {
      this.callout(n, `done-${e.id}`, o.say, 5);
      this.jobs.delete(e.id);
      this.recontain(e);
    }
  }

  /** Recontainment that happens at terminals (SCP-079 isolation, SCP-106 recall). */
  handleTerminals(e, officers, free, taken) {
    const g = this.g;
    const spec = e.recon;
    const ev = g.events.current;
    if (spec.requiresPower && g.events.powerOut) return;
    // A Security player gets first go at it.
    if (g.tasks.has('recontain') && ev && ev.t < 90) return;
    let job = this.jobs.get(e.id);
    if (!job) {
      job = { by: null, t: 0 };
      this.jobs.set(e.id, job);
    }
    const left = spec.terminals.map((id) => g.terminals.get(id)).filter((t) => t && t.jobDone !== e.id);
    if (!left.length) {
      this.jobs.delete(e.id);
      this.recontain(e);
      return;
    }
    if (job.by && (!job.by.alive || !free(job.by))) job.by = null;
    if (!job.by) {
      const t0 = left[0];
      const list = officers.filter(free).sort((a, b) => flat(a.pos, t0.origin) - flat(b.pos, t0.origin));
      if (!list.length) return;
      job.by = list[0];
      this.callout(job.by, `term-${e.id}`, e.id === '106' ? 'Heading for the recall terminal. Keep it busy!' : 'I will cut the network segments. Cover me.', 30);
    }
    const n = job.by;
    this.assign(n, 'terminals', null);
    taken.add(n);
    const t = left.reduce((a, b) => (flat(a.origin, n.pos) < flat(b.origin, n.pos) ? a : b));
    const fn = FACE_N[t.face] || [0, 0, 1];
    const sx = t.origin.x + fn[0] * 0.8;
    const sz = t.origin.z + fn[2] * 0.8;
    if (Math.hypot(n.pos.x - sx, n.pos.z - sz) > 0.6) this.moveTo(n, sx, sz, 2.8, 1);
    else {
      this.halt(n);
      n.faceToward(t.origin.x, t.origin.z);
      job.t += THINK;
      if (job.t >= spec.hold + 1) {
        job.t = 0;
        t.jobDone = e.id;
        t.action = null;
        t.setStatus('done', e.id === '106' ? 'RECALL ENGAGED' : 'SEGMENT ISOLATED');
      }
    }
  }

  recontain(e) {
    const g = this.g;
    const ev = g.events.current;
    if (ev && ev.type === 'scp' && ev.scp === e.id && g.events.scpLoose) g.events.recontainScp(false, true);
    else g.scps.recontain(e.id);
  }

  // ---- Riots ----------------------------------------------------------------------------
  handleRiot(officers, free, taken) {
    const g = this.g;
    const rioters = g.events.rioters.filter((r) => r.alive && r.rioting);
    const ev = g.events.current;
    if (!rioters.length) {
      if (ev && ev.type === 'riot' && g.events.rioters.length && !g.tasks.has('riot')) g.events.quellRiot(false, true);
      return;
    }
    // The response team needs time to gear up (riot shields, batons).
    if (ev && ev.type === 'riot' && ev.t < 35) return;
    for (const n of officers) {
      if (!free(n)) continue;
      const ai = this.state(n);
      let target = ai.job === 'subdue' && ai.target && ai.target.rioting && ai.target.alive ? ai.target : null;
      if (!target) {
        let bd = n.busy || ai.job ? 40 : 12;
        for (const r of rioters) {
          const d = flat(n.pos, r.pos);
          if (d < bd) {
            bd = d;
            target = r;
          }
        }
      }
      if (!target) continue;
      this.assign(n, 'subdue', target);
      taken.add(n);
      const d = flat(n.pos, target.pos);
      // Rioters fight back.
      if (d < 1.1 && Math.random() < 0.5) n.damage(2.5);
      if (d > 1.2) {
        this.moveTo(n, target.pos.x, target.pos.z, 3.4, 0.5);
        n.lookAt = null;
      } else {
        this.halt(n);
        n.lookAt = target;
        ai.swingT -= THINK;
        if (ai.swingT <= 0) {
          ai.swingT = 1.3;
          g.combat.npcMelee(n, target, 'baton');
          this.callout(n, 'riot', ['Back in your cell!', 'On the ground!', 'Stop resisting!'], 10);
        }
      }
    }
  }

  // ---- Breach locks -------------------------------------------------------------------
  handleLocks(officers, free, taken) {
    const g = this.g;
    const ev = g.events.current;
    if (!ev || ev.type !== 'breach' || g.events.contained) {
      this.lockJob = null;
      return;
    }
    if (g.events.anomalies.some((a) => a.alive)) return;
    // Give the player time to do it themselves first.
    if (g.tasks.has('contain') && ev.t < 100) return;
    if (!this.lockJob) {
      const locks = ev.originDef.locks.map((id) => g.terminals.get(id)).filter((t) => t && !t.engaged);
      this.lockJob = { locks, t: 0, by: null };
    }
    const job = this.lockJob;
    if (job.by && (!job.by.alive || !free(job.by))) job.by = null;
    if (!job.by) {
      const site = g.point(ev.originDef.point);
      const list = officers.filter(free).sort((a, b) => flat(a.pos, site) - flat(b.pos, site));
      if (!list.length) return;
      job.by = list[0];
      this.callout(job.by, 'locks', 'Area is clear. Re-engaging the containment locks.', 30);
    }
    const n = job.by;
    this.assign(n, 'locks', null);
    taken.add(n);
    job.locks = job.locks.filter((t) => !t.engaged);
    const t = job.locks[0];
    if (!t) {
      this.lockJob = null;
      g.events.secureContainment(false, true);
      return;
    }
    const fn = FACE_N[t.face] || [0, 0, 1];
    const sx = t.origin.x + fn[0] * 0.8;
    const sz = t.origin.z + fn[2] * 0.8;
    if (Math.hypot(n.pos.x - sx, n.pos.z - sz) > 0.6) this.moveTo(n, sx, sz, 2.6, 1);
    else {
      this.halt(n);
      n.faceToward(t.origin.x, t.origin.z);
      job.t += THINK;
      if (job.t >= 5) {
        job.t = 0;
        t.engaged = true;
        t.action = null;
        t.setStatus('done', 'LOCK ENGAGED');
      }
    }
  }

  // ---- Mobile Task Force ------------------------------------------------------------
  handleSquad() {
    const g = this.g;
    const ev = g.events.current;
    const dangerous = ev && ((ev.type === 'breach' && !g.events.contained) || (ev.type === 'scp' && g.events.scpLoose && ['173', '096', '049', '012', '939', '106', '682'].includes(ev.scp)));
    if (dangerous && this.squadEvent !== ev && ev.t > 40) {
      this.squadEvent = ev;
      this.spawnSquad();
    }
    const site = ev && g.director ? g.director.eventSite(ev) : null;
    for (const n of this.squad) {
      if (!n.alive) continue;
      const ai = this.state(n);
      if (ai.job) continue;
      if (site) {
        if (flat(n.pos, site) > 6) {
          ai.moveT -= THINK;
          if (ai.moveT <= 0 && !n.path) {
            ai.moveT = 3;
            const p = g.pointNear(site.x, site.z, 4);
            n.goTo(p[0], p[1], { speed: 3 });
          }
        }
      } else if (!n.leaving) {
        n.leaving = true;
        const e = g.point('evac');
        const car = g.point('evac-car');
        n.goTo(e.x, e.z, { speed: 2.4 }).then((ok) => {
          if (ok) n.board(car.x, car.z);
        });
      }
    }
    this.squad = this.squad.filter((n) => !n.hidden);
  }

  spawnSquad() {
    const g = this.g;
    const names = MTF_NAMES.slice().sort(() => Math.random() - 0.5);
    const at = g.builder.points.evac;
    for (let i = 0; i < 3; i++) {
      const n = g.spawnNpc({
        id: `mtf-${Math.floor(g.time)}-${i}`,
        name: `E-11 ${names[i]}`,
        title: 'MTF Epsilon-11',
        kind: 'guard',
        mtf: true,
        x: at.x - 1.5 + i * 1.5,
        z: at.z,
        yaw: 0,
        chatter: ['Stay behind us.', 'Nine-Tailed Fox. We have it from here.', 'Keep your head down, civilian.'],
      });
      n.busy = true;
      this.squad.push(n);
    }
    g.say('SITE INTERCOM', 'Mobile Task Force Epsilon-11 has arrived on site. All personnel, give way to MTF operatives.', 'pa', 7);
  }
}
