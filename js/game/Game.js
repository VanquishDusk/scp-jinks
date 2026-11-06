// A game session: builds the facility, owns the scene/camera, runs the player,
// doors, interaction and zone tracking, and drives the main-menu flythrough.

import * as THREE from 'three';
import { VOXEL, ROLES } from '../config.js';
import { FacilityBuilder } from '../world/FacilityBuilder.js';
import { buildFacility, WORLD_SIZE } from '../world/facilityLayout.js';
import { createAtlas, createGrainTexture } from '../world/textures.js';
import { buildProps } from '../world/props.js';
import { buildSign } from '../world/signs.js';
import { Door } from '../world/Door.js';
import { Player } from '../player/Player.js';

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
  constructor(renderer, settings, ui) {
    this.renderer = renderer;
    this.settings = settings;
    this.ui = ui;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, 4, settings.get('drawDistance'));
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.05, 90);
    renderer.trackCamera(this.camera);
    this.doors = [];
    this.propColliders = [];
    this.time = 0;
    this.role = null;
    this.designation = '';
    this.interactTarget = null;
    this.zone = null;
    this.shotIndex = 0;
    this.shotTime = 0;
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

    progress(0.6, 'Building voxel geometry');
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

    progress(0.8, 'Placing furniture');
    await nextFrame();
    const props = buildProps(this.world, f.props, createGrainTexture());
    this.scene.add(props.mesh);
    this.propColliders = props.colliders;

    progress(0.9, 'Installing doors and signage');
    await nextFrame();
    for (const d of f.doors) {
      const door = new Door(d);
      this.scene.add(door.build(this.world));
      this.doors.push(door);
    }
    for (const s of f.signs) this.scene.add(buildSign(s, this.world));

    this.player = new Player({ collect: (...a) => this.collect(...a) }, this.camera);
    this.spawns = f.spawns;
    this.shots = f.shots;
    progress(1, 'Facility online');
    await nextFrame();
  }

  applySettings() {
    this.camera.fov = this.settings.get('fov');
    this.camera.updateProjectionMatrix();
    this.scene.fog.far = this.settings.get('drawDistance');
    this.scene.fog.near = Math.min(6, this.scene.fog.far * 0.2);
  }

  /** Collision boxes overlapping a region: voxels, props and door panels. */
  collect(minX, minY, minZ, maxX, maxY, maxZ, out) {
    this.world.collectSolidBoxes(minX, minY, minZ, maxX, maxY, maxZ, out);
    for (const c of this.propColliders) if (overlaps(c, minX, minY, minZ, maxX, maxY, maxZ)) out.push(c);
    for (const d of this.doors) {
      if (!d.blocking) continue;
      for (const c of d.colliders) if (overlaps(c, minX, minY, minZ, maxX, maxY, maxZ)) out.push(c);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------
  newGame(roleId) {
    this.role = ROLES[roleId];
    this.designation = this.role.makeDesignation();
    for (const d of this.doors) d.reset();
    const list = this.spawns[this.role.spawn];
    const sp = list[Math.floor(Math.random() * list.length)];
    this.player.spawn(sp.x * VOXEL, VOXEL + 0.001, sp.z * VOXEL, sp.yaw);
    this.zone = null;
    this.interactTarget = null;
    this.time = 0;
  }

  update(dt, input) {
    this.time += dt;
    this.player.update(dt, input, this.settings);
    const box = this.player.aabb(this._box);
    for (const d of this.doors) d.update(dt, box, this.time);
    this.updateInteraction(input);
    this.updateZone();
  }

  updateInteraction(input) {
    const cam = this.camera;
    const dir = this._dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const o = cam.position;
    const wallT = this.world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, INTERACT_RANGE);
    let best = null;
    let bestT = Math.min(INTERACT_RANGE, wallT);
    for (const door of this.doors) {
      if (door.origin.distanceToSquared(o) > 49) continue;
      for (const b of door.interactBoxes()) {
        const t = rayBox(o, dir, b);
        if (t !== null && t < bestT) {
          bestT = t;
          best = door;
        }
      }
    }
    this.interactTarget = best;
    if (best && input.interact()) {
      const res = best.use(this.role.clearance, this.player.aabb(this._box));
      if (res.message) this.ui.toast(res.message, !res.ok);
    }
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
