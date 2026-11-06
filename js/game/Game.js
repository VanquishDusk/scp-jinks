// A game session: builds the facility, owns the scene/camera, and runs the
// player, NPCs, doors, interactables, hazards, facility events and the
// class-specific shift director that hands out tasks and events.

import * as THREE from 'three';
import { VOXEL, ROLES } from '../config.js';
import { FacilityBuilder } from '../world/FacilityBuilder.js';
import { buildFacility, WORLD_SIZE } from '../world/facilityLayout.js';
import { createAtlas, createGrainTexture } from '../world/textures.js';
import { buildProps } from '../world/props.js';
import { buildSign } from '../world/signs.js';
import { Door } from '../world/Door.js';
import { Player } from '../player/Player.js';
import { NavGrid } from './NavGrid.js';
import { NPC } from './NPC.js';
import { Terminal, Pickup, FirstAid, SpecimenStand, Trigger } from './Interactables.js';
import { HazardFloor } from './Hazards.js';
import { FacilityEvents } from './Events.js';
import { TaskManager } from './objectives.js';
import { ClassDDirector } from './directors/ClassDDirector.js';
import { SecurityDirector } from './directors/SecurityDirector.js';
import { ScpManager } from './scp/ScpManager.js';

const FOG_COLOR = 0x07080a;
const INTERACT_RANGE = 2.4;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function overlaps(b, minX, minY, minZ, maxX, maxY, maxZ) {
  return b[0] < maxX && b[3] > minX && b[1] < maxY && b[4] > minY && b[2] < maxZ && b[5] > minZ;
}

/** Ray vs AABB (slab test). Returns distance or null. */
function rayBox(o, d, b) {
  let tmin = 0;
  let tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    const origin = a === 0 ? o.x : a === 1 ? o.y : o.z;
    const dir = a === 0 ? d.x : a === 1 ? d.y : d.z;
    const lo = b[a];
    const hi = b[a + 3];
    if (Math.abs(dir) < 1e-9) {
      if (origin < lo || origin > hi) return null;
    } else {
      let t1 = (lo - origin) / dir;
      let t2 = (hi - origin) / dir;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export class Game {
  constructor(renderer, settings, ui, profile) {
    this.renderer = renderer;
    this.settings = settings;
    this.ui = ui;
    this.profile = profile;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, 4, settings.get('drawDistance'));
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.05, 90);
    renderer.trackCamera(this.camera);
    this.doors = [];
    this.doorsById = new Map();
    this.terminals = new Map();
    this.firstAids = [];
    this.npcs = new Map();
    this.pickups = [];
    this.triggers = [];
    this.stands = [];
    this.sessionObjects = [];
    this.sessionColliders = [];
    this.markers = [];
    this.propColliders = [];
    this.time = 0;
    this.role = null;
    this.designation = '';
    this.interactTarget = null;
    this.hold = { target: null, t: 0 };
    this.zone = null;
    this.shotIndex = 0;
    this.shotTime = 0;
    this.ended = null;
    this.onShiftEnd = null;
    this._dir = new THREE.Vector3();
    this._box = [0, 0, 0, 0, 0, 0];
  }

  async load(progress) {
    progress(0.05, 'Allocating voxel grid');
    await nextFrame();
    const f = new FacilityBuilder(WORLD_SIZE.w, WORLD_SIZE.h, WORLD_SIZE.d);
    buildFacility(f);
    this.builder = f;
    this.world = f.world;

    progress(0.15, 'Painting surfaces');
    await nextFrame();
    f.paint();

    progress(0.3, 'Baking facility lighting');
    await nextFrame();
    f.computeLighting();

    progress(0.55, 'Building voxel geometry');
    await nextFrame();
    const atlas = createAtlas();
    const mat = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true });
    const glassMat = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    this.scene.add(this.world.buildMeshes(mat, glassMat));

    progress(0.72, 'Placing furniture');
    await nextFrame();
    const props = buildProps(this.world, f.props, createGrainTexture());
    this.scene.add(props.mesh);
    this.propColliders = props.colliders;

    progress(0.82, 'Installing doors, terminals and signage');
    await nextFrame();
    for (const d of f.doors) {
      const door = new Door(d);
      this.scene.add(door.build(this.world));
      this.doors.push(door);
      this.doorsById.set(door.id, door);
    }
    for (const s of f.signs) this.scene.add(buildSign(s, this.world));
    for (const t of f.terminals) {
      const term = new Terminal(t, this.world);
      this.terminals.set(t.id, term);
      this.scene.add(term.object);
    }
    for (const a of f.firstAids) {
      const fa = new FirstAid(a, this.world);
      this.firstAids.push(fa);
      this.scene.add(fa.object);
    }
    const lp = this.point('exit-ladder');
    this.ladder = new Trigger({ id: 'ladder', x: lp.x, y: 1.6, z: lp.z, half: [0.25, 1.1, 0.5] });

    this.testFloor = new HazardFloor({ x0: 159, z0: 73, cols: 4, rows: 4, size: 4 });
    this.scene.add(this.testFloor.group);

    progress(0.92, 'Mapping walkways');
    await nextFrame();
    this.nav = new NavGrid(this.world, this.propColliders);
    this.scps = new ScpManager(this);

    this.player = new Player({ collect: (...a) => this.collect(...a) }, this.camera);
    this.player.onDamage = (amount) => this.ui.damageFlash(amount);
    this.spawns = f.spawns;
    this.shots = f.shots;
    this.events = new FacilityEvents(this);
    this.tasks = new TaskManager(this);
    progress(1, 'Facility online');
    await nextFrame();
  }

  /** Does a closed (or closing) door block the straight line a→b? (xz plane) */
  doorBlocksLine(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    for (const d of this.doors) {
      if (d.progress > 0.6) continue;
      const o = d.openingBox;
      let t0 = 0;
      let t1 = 1;
      let hit = true;
      for (const [p, dd, lo, hi] of [[ax, dx, o[0], o[3]], [az, dz, o[2], o[5]]]) {
        if (Math.abs(dd) < 1e-9) {
          if (p < lo || p > hi) {
            hit = false;
            break;
          }
        } else {
          let ta = (lo - p) / dd;
          let tb = (hi - p) / dd;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) {
            hit = false;
            break;
          }
        }
      }
      if (hit) return true;
    }
    return false;
  }

  /** Gameplay point (meters) defined in the facility layout. */
  point(id) {
    const p = this.builder.points[id];
    if (!p) throw new Error(`Unknown point ${id}`);
    return { ...p, x: p.x * VOXEL, z: p.z * VOXEL };
  }

  get clearance() {
    return Math.max(this.role ? this.role.clearance : 0, this.player.keycard || 0);
  }

  applySettings() {
    this.camera.fov = this.settings.get('fov');
    this.camera.updateProjectionMatrix();
    this.scene.fog.far = this.settings.get('drawDistance');
    this.scene.fog.near = Math.min(6, this.scene.fog.far * 0.2);
  }

  /** Collision boxes overlapping a region: voxels, props, doors and people. */
  collect(minX, minY, minZ, maxX, maxY, maxZ, out) {
    this.world.collectSolidBoxes(minX, minY, minZ, maxX, maxY, maxZ, out);
    for (const c of this.propColliders) if (overlaps(c, minX, minY, minZ, maxX, maxY, maxZ)) out.push(c);
    for (const c of this.sessionColliders) if (overlaps(c, minX, minY, minZ, maxX, maxY, maxZ)) out.push(c);
    for (const d of this.doors) {
      if (!d.blocking) continue;
      for (const c of d.colliders) if (overlaps(c, minX, minY, minZ, maxX, maxY, maxZ)) out.push(c);
    }
    for (const n of this.npcs.values()) {
      if (!n.alive || !n.collidable) continue;
      const b = n.aabb();
      if (overlaps(b, minX, minY, minZ, maxX, maxY, maxZ)) out.push(b);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Session objects
  // ---------------------------------------------------------------------------
  spawnNpc(def) {
    let d = def;
    if (def.at) {
      const p = this.builder.points[def.at];
      d = { ...def, x: p.x, z: p.z, yaw: def.yaw ?? p.yaw ?? 0 };
    }
    const npc = new NPC(this, d);
    this.npcs.set(npc.id, npc);
    this.scene.add(npc.object);
    return npc;
  }

  addPickup(opts) {
    const p = new Pickup(opts, this.world);
    this.pickups.push(p);
    this.scene.add(p.object);
    return p;
  }

  addTrigger(t) {
    this.triggers.push(t);
    this.scene.add(t.object);
    if (t.collider) this.sessionColliders.push(t.collider);
    return t;
  }

  addStand(opts) {
    const s = new SpecimenStand(opts, this.world);
    this.stands.push(s);
    this.scene.add(s.object);
    this.sessionColliders.push(s.collider);
    return s;
  }

  addCollider(box) {
    this.sessionColliders.push(box);
  }

  removeCollider(box) {
    this.sessionColliders = this.sessionColliders.filter((c) => c !== box);
  }

  addSessionObject(obj) {
    this.sessionObjects.push(obj);
    this.scene.add(obj);
  }

  removeSessionObject(obj) {
    this.sessionObjects = this.sessionObjects.filter((o) => o !== obj);
    this.scene.remove(obj);
  }

  removeStand(s) {
    this.stands = this.stands.filter((x) => x !== s);
    this.sessionColliders = this.sessionColliders.filter((c) => c !== s.collider);
    this.scene.remove(s.object);
  }

  removeInteractable(obj) {
    this.triggers = this.triggers.filter((t) => t !== obj);
    this.pickups = this.pickups.filter((t) => t !== obj);
    this.scene.remove(obj.object);
    if (obj.collider) this.sessionColliders = this.sessionColliders.filter((c) => c !== obj.collider);
  }

  /** Pulsing square drawn on the floor to mark where to stand. */
  addFloorMarker(x, z, r) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.7, depthWrite: false });
    const s = r * 2;
    const t = 0.08;
    for (const [w, d, ox, oz] of [[s, t, 0, -r], [s, t, 0, r], [t, s, -r, 0], [t, s, r, 0]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x + ox, VOXEL + 0.02, z + oz);
      g.add(m);
    }
    g.userData.mat = mat;
    this.markers.push(g);
    this.scene.add(g);
    return g;
  }

  removeFloorMarker(m) {
    this.scene.remove(m);
    this.markers = this.markers.filter((x) => x !== m);
  }

  clearSession() {
    if (this.director) this.director.stop();
    this.director = null;
    for (const n of this.npcs.values()) this.scene.remove(n.object);
    this.npcs.clear();
    for (const list of [this.pickups, this.triggers, this.stands]) for (const o of list) this.scene.remove(o.object);
    this.pickups = [];
    this.triggers = [];
    this.stands = [];
    for (const o of this.sessionObjects) this.scene.remove(o);
    this.sessionObjects = [];
    this.sessionColliders = [];
    for (const m of this.markers) this.scene.remove(m);
    this.markers = [];
    this.ladder.action = null;
    for (const t of this.terminals.values()) {
      t.action = null;
      t.setStatus('idle', 'STANDBY');
    }
    for (const fa of this.firstAids) fa.cooldown = 0;
    this.testFloor.stop();
    if (this.tasks) this.tasks.reset();
    if (this.events) this.events.reset();
    if (this.scps) this.scps.reset(true);
  }

  // ---------------------------------------------------------------------------
  // Shift lifecycle
  // ---------------------------------------------------------------------------
  newGame(roleId) {
    this.clearSession();
    this.role = ROLES[roleId];
    this.designation = this.role.makeDesignation();
    for (const d of this.doors) d.reset();
    const list = this.spawns[this.role.spawn];
    const sp = list[Math.floor(Math.random() * list.length)];
    this.spawn = sp;
    this.player.spawn(sp.x * VOXEL, VOXEL + 0.001, sp.z * VOXEL, sp.yaw);
    this.zone = null;
    this.interactTarget = null;
    this.hold = { target: null, t: 0 };
    this.time = 0;
    this.ended = null;
    this.ui.setItem(null);
    this.ui.setCredits(this.profile.credits);
    this.director = roleId === 'classd' ? new ClassDDirector(this) : new SecurityDirector(this);
    this.director.setup();
  }

  /** Called once the player actually takes control. */
  startShift() {
    if (this.director && !this.director.started) this.director.start();
  }

  endShift(result) {
    if (this.ended) return;
    this.ended = result;
    if (this.director) this.director.stop();
    this.profile.record(result);
    const om = this.tasks;
    const summary = {
      result,
      role: this.role,
      designation: this.designation,
      credits: om.credits,
      spent: om.spent,
      standing: this.director ? this.director.standing : 0,
      standingLabel: this.director ? this.director.standingLabel : '',
      total: this.profile.credits,
      completed: om.completed,
      failed: om.failedCount,
      history: om.history.slice(),
      time: this.time,
      cause: this.player.dead ? this.player.lastSource : null,
    };
    if (this.onShiftEnd) this.onShiftEnd(summary);
  }

  /** Open the SCP procurement catalog ('security') or black market ('classd'). */
  openShop(mode) {
    if (this.onOpenShop) this.onOpenShop(mode);
    return { ok: true };
  }

  /** Show a subtitle line; returns how long it stays on screen (s). */
  say(speaker, text, channel = 'voice', duration) {
    const d = duration ?? Math.min(9, Math.max(3, 1.8 + text.length * 0.05));
    this.ui.radio(speaker, text, channel, d);
    return d;
  }

  onNpcDeath(npc) {
    if (this.ended) return;
    if (npc.kind === 'scientist' || npc.kind === 'guard') {
      this.ui.toast(`${npc.name.toUpperCase()} IS DOWN`, true);
      if (this.role.id === 'security' && npc.kind === 'scientist' && this.director) this.director.changeStanding(-8, 'Personnel casualty on your watch');
    }
  }

  // ---------------------------------------------------------------------------
  // Frame update
  // ---------------------------------------------------------------------------
  update(dt, input) {
    this.time += dt;
    const p = this.player;
    if (!p.dead) p.update(dt, input, this.settings);
    else p.updateCamera(dt, false);
    p.blinkActive = this.scps.blinkRelevant;
    p.updateBlink(dt, !p.dead && input.blinkHeld());

    if (this.director) this.director.update(dt);
    for (const n of this.npcs.values()) n.update(dt);
    if (!this.ended) this.scps.update(dt);

    const bodies = [p.aabb(this._box)];
    for (const n of this.npcs.values()) {
      if (n.alive && Math.abs(n.pos.x - p.pos.x) < 20 && Math.abs(n.pos.z - p.pos.z) < 20) bodies.push(n.aabb());
    }
    for (const d of this.doors) {
      const far = Math.abs(d.origin.x - p.pos.x) > 30 || Math.abs(d.origin.z - p.pos.z) > 30;
      if (far && d.state !== 'opening' && d.state !== 'closing') continue;
      d.update(dt, bodies, this.time);
    }
    for (const t of this.terminals.values()) t.update(dt, this.time);
    for (const fa of this.firstAids) fa.update(dt);
    for (const o of this.pickups) o.update(dt);
    for (const s of this.stands) s.update(dt);
    for (const m of this.markers) m.userData.mat.opacity = 0.45 + Math.sin(this.time * 4) * 0.25;

    this.testFloor.update(dt, this.time);
    if (!p.dead && this.testFloor.active && this.testFloor.hurts(p.pos.x, p.pos.z)) p.damage(38 * dt, 'field');
    this.events.update(dt);

    if (!p.dead && !this.ended) {
      this.tasks.update(dt);
      this.updateInteraction(input, dt);
      this.updateZone();
    }
    if (p.dead && !this.ended) this.endShift('terminated');
  }

  *interactables() {
    yield* this.triggers;
    yield* this.pickups;
    yield* this.stands;
    if (this.ladder.action) yield this.ladder;
    for (const e of this.scps.entities.values()) if (e.action) yield e;
    yield* this.terminals.values();
    yield* this.firstAids;
    for (const n of this.npcs.values()) if (n.alive) yield n;
    yield* this.doors;
  }

  updateInteraction(input, dt) {
    const cam = this.camera;
    const dir = this._dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const o = cam.position;
    const wallT = this.world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, INTERACT_RANGE);
    let best = null;
    let bestT = Math.min(INTERACT_RANGE, wallT);
    for (const it of this.interactables()) {
      const org = it.origin;
      if (Math.abs(org.x - o.x) > 6 || Math.abs(org.z - o.z) > 6) continue;
      for (const b of it.boxes()) {
        const t = rayBox(o, dir, b);
        if (t !== null && t < bestT) {
          bestT = t;
          best = it;
        }
      }
    }
    const prompt = best ? best.prompt(this) : null;
    if (!prompt) best = null;
    this.interactTarget = best;
    this.interactPrompt = prompt;

    const holdTime = best ? best.hold || 0 : 0;
    if (holdTime > 0 && !prompt.denied) {
      if (this.hold.target !== best) this.hold = { target: best, t: 0 };
      if (input.interactHeld()) {
        this.hold.t += dt;
        if (this.hold.t >= holdTime) {
          this.hold = { target: best, t: -1e9 };
          this.useTarget(best);
        }
      } else {
        this.hold.t = 0;
      }
      this.holdProgress = Math.max(0, this.hold.t / holdTime);
    } else {
      this.hold = { target: null, t: 0 };
      this.holdProgress = 0;
      if (best && input.interact()) this.useTarget(best);
    }
  }

  useTarget(t) {
    const res = t.use(this);
    if (res && res.message) this.ui.toast(res.message, res.ok === false);
  }

  updateZone() {
    const p = this.player.pos;
    const id = this.world.roomAtWorld(p.x, p.y + 0.2, p.z);
    if (id <= 1) return;
    const room = this.builder.rooms[id];
    if (room && room.zone && room.zone !== this.zone) {
      this.zone = room.zone;
      this.ui.showZone(room.zone);
    }
  }

  // ---------------------------------------------------------------------------
  // Main-menu flythrough
  // ---------------------------------------------------------------------------
  startMenuCamera() {
    this.clearSession();
    this.shotIndex = Math.floor(Math.random() * this.shots.length);
    this.shotTime = 0;
    for (const d of this.doors) d.reset();
  }

  updateMenu(dt) {
    const DUR = 9;
    this.shotTime += dt;
    if (this.shotTime >= DUR) {
      this.shotTime = 0;
      this.shotIndex = (this.shotIndex + 1) % this.shots.length;
    }
    const s = this.shots[this.shotIndex];
    const t = this.shotTime / DUR;
    const e = t * t * (3 - 2 * t);
    const lerp = (a, b) => (a + (b - a) * e) * VOXEL;
    this.camera.position.set(lerp(s.from[0], s.to[0]), lerp(s.from[1], s.to[1]), lerp(s.from[2], s.to[2]));
    this.camera.rotation.set(0, 0, 0);
    this.camera.lookAt(s.look[0] * VOXEL, s.look[1] * VOXEL, s.look[2] * VOXEL);
    const edge = 0.1;
    const fade = t < edge ? t / edge : t > 1 - edge ? (1 - t) / edge : 1;
    this.renderer.setFade(Math.max(0, Math.min(1, fade)));
  }
}
