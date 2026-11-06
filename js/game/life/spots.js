// Activity spots: places where people do things, derived from the furniture
// the layout already places (chairs, benches, beds, couches, vending machines,
// lab tables, whiteboards, shelves...) plus terminals, guard posts and a few
// hand-placed spots (observation windows, the smoking corner...).
//
// spot = {
//   id, type, x, z (meters), yaw (facing while there), pose, item,
//   ax, az (walkable approach point), lieY (mattress height for lying),
//   zone, room, cap (always 1), user (NPC or null)
// }
//
// Types: desk, seat, eat, couch, bunk, bed, vending, cooler, lab, board,
//        files, server, monitor, counter, terminal, window, smoke, cook,
//        commons, sink, cell, post, mopzone

import { VOXEL } from '../../config.js';

const FRONT = [[0, -1], [-1, 0], [0, 1], [1, 0]]; // rot → front direction (x, z), see props.js
const yawFacing = (dx, dz) => Math.atan2(-dx, -dz);

export function buildSpots(game) {
  const f = game.builder;
  const nav = game.nav;
  const world = game.world;
  const spots = [];
  let seq = 0;

  const zoneAt = (x, z) => {
    const room = f.rooms[world.roomAtWorld(x, VOXEL + 0.4, z)];
    return room ? room.zone || room.name : null;
  };
  /** Nearest walkable point to (x, z) meters, within r meters; null if none. */
  const approach = (x, z, r = 1.3) => {
    if (nav.walkableAtWorld(x, z)) return [x, z];
    const cx = Math.floor(x / VOXEL);
    const cz = Math.floor(z / VOXEL);
    const max = Math.ceil(r / VOXEL);
    let best = null;
    let bd = Infinity;
    for (let dz = -max; dz <= max; dz++) {
      for (let dx = -max; dx <= max; dx++) {
        if (!nav.isWalkable(cx + dx, cz + dz)) continue;
        const px = (cx + dx + 0.5) * VOXEL;
        const pz = (cz + dz + 0.5) * VOXEL;
        const d = Math.hypot(px - x, pz - z);
        if (d < bd && d <= r) {
          bd = d;
          best = [px, pz];
        }
      }
    }
    return best;
  };
  const add = (type, xv, zv, yaw, extra = {}) => {
    const x = xv * VOXEL;
    const z = zv * VOXEL;
    const a = approach(x, z, extra.reach ?? 1.3);
    if (!a) return null;
    const zone = zoneAt(x, z) || zoneAt(a[0], a[1]);
    if (!zone) return null;
    const s = { id: `${type}-${seq++}`, type, x, z, yaw, ax: a[0], az: a[1], zone, user: null, pose: null, item: null, lieY: 0.55, ...extra };
    spots.push(s);
    return s;
  };

  // --- From furniture -------------------------------------------------------
  const props = f.props.filter((p) => p.y === undefined || p.y === 1);
  const near = (p, types, r) => props.filter((q) => types.includes(q.type) && Math.hypot(q.x - p.x, q.z - p.z) <= r);
  for (const p of props) {
    const [fx, fz] = FRONT[p.rot || 0];
    const front = (d) => [p.x + fx * d, p.z + fz * d];
    switch (p.type) {
      case 'chair': {
        const desk = near(p, ['desk', 'consoleDesk'], 2.6)[0];
        add(desk ? 'desk' : 'seat', p.x, p.z, yawFacing(fx, fz), { pose: desk ? 'type' : 'sit' });
        break;
      }
      case 'stool': {
        const table = near(p, ['roundTable', 'labTable', 'cafTable'], 2.4)[0];
        const yaw = table ? yawFacing(table.x - p.x, table.z - p.z) : 0;
        add(table && table.type === 'labTable' ? 'lab' : 'eat', p.x, p.z, yaw, { pose: table && table.type === 'labTable' ? 'type' : 'eat' });
        break;
      }
      case 'bench': {
        const table = near(p, ['cafTable'], 2.6)[0];
        if (!table) {
          add('seat', p.x, p.z, yawFacing(1, 0), { pose: 'sit' });
          break;
        }
        const yaw = yawFacing(Math.sign(table.x - p.x), 0);
        const type = zoneAt(p.x * VOXEL, p.z * VOXEL) === 'CAFETERIA' ? 'eat' : 'commons';
        for (const dz of [-1.4, 1.4]) add(type, p.x, p.z + dz, yaw, { pose: type === 'eat' ? 'eat' : 'cards' });
        break;
      }
      case 'couch': {
        // Two seats, and a place to lie down along the cushions.
        const ax = -fz;
        const az = fx;
        for (const d of [-1.1, 1.1]) add('couch', p.x + ax * d - fx * 0.15, p.z + az * d - fz * 0.15, yawFacing(fx, fz), { pose: 'sit' });
        add('nap', p.x - ax * 1.7, p.z - az * 1.7, Math.atan2(ax, az), { pose: 'nap', lieY: 0.42, lie: true, reach: 1.6 });
        break;
      }
      case 'bunk':
      case 'medBed': {
        // Lie with the head at the pillow (local -Z), feet at the far end.
        const footX = p.x - fx * 1.7;
        const footZ = p.z - fz * 1.7;
        const type = p.type === 'bunk' ? 'bunk' : 'bed';
        add(type, footX, footZ, Math.atan2(fx, fz), { pose: 'lie', lieY: p.type === 'bunk' ? 0.56 : 0.62, lie: true, reach: 1.7 });
        break;
      }
      case 'vending':
        add('vending', ...front(1.7), yawFacing(-fx, -fz), { pose: 'tap' });
        break;
      case 'waterCooler':
        add('cooler', p.x + 1.4, p.z, yawFacing(-1, 0), { pose: 'drink', item: 'cup' });
        break;
      case 'labTable':
        for (const d of [-1.2, 1.2]) add('lab', p.x + -fz * d + fx * 1.6, p.z + fx * d + fz * 1.6, yawFacing(-fx, -fz), { pose: 'inspect' });
        break;
      case 'whiteboard':
        add('board', ...front(1.6), yawFacing(-fx, -fz), { pose: 'write' });
        break;
      case 'cabinet':
      case 'shelf':
        add('files', ...front(1.6), yawFacing(-fx, -fz), { pose: 'inspect', item: 'papers' });
        break;
      case 'serverRack':
        add('server', ...front(1.6), yawFacing(-fx, -fz), { pose: 'kneel', item: 'toolbox' });
        break;
      case 'monitorWall':
        add('monitor', ...front(2.4), yawFacing(-fx, -fz), { pose: 'lean' });
        break;
      case 'counter':
        // Staff side is +Z of the counter's local frame.
        add('counter', p.x - fx * 1.6, p.z - fz * 1.6, yawFacing(fx, fz), { pose: 'tap' });
        break;
      case 'sink':
        add('sink', ...front(1.3), yawFacing(-fx, -fz), { pose: 'inspect' });
        break;
      case 'cart':
      case 'drum':
        if (zoneAt(p.x * VOXEL, p.z * VOXEL) === 'KITCHEN') add('cook', p.x - 1.2, p.z, yawFacing(1, 0), { pose: 'inspect' });
        break;
      case 'specimenCase':
        add('lab', p.x, p.z + 1.6, yawFacing(0, -1), { pose: 'inspect' });
        break;
      default:
        break;
    }
  }

  // --- Terminals: technicians and staff tap at them ----------------------------
  const TFRONT = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
  for (const t of f.terminals) {
    if (t.id === 'black-market') continue;
    const [fx, fz] = TFRONT[t.face];
    add('terminal', t.x + fx * 1.4, t.z + fz * 1.4, yawFacing(-fx, -fz), { pose: 'tap', terminal: t.id });
  }

  // --- Hand-placed spots ------------------------------------------------------------
  const P = (id) => f.points[id];
  // Guard posts (the post's own yaw if it has one).
  for (const id of ['guard-booth', 'guard-hcz', 'guard-lobby', 'guard-keter', 'guard-keter-post', 'guard-lcz', 'patrol-dblock', 'w-guard-research', 'chief']) {
    const q = P(id);
    if (q) add('post', q.x, q.z, ((q.yaw || 0) * Math.PI) / 180, { post: id, reach: 2 });
  }
  // Observation windows and galleries.
  for (const [x, z, yaw, label] of [
    [135, 14, 0, 'SCP-173 window'], [151.5, 14, 0, 'SCP-049 window'],
    [164, 68, 180, 'test chamber'], [170, 68, 180, 'test chamber'], [161, 68, 180, 'test chamber'],
    [253.5, 6.5, 0, 'Keter monitors'],
  ]) add('window', x, z, (yaw * Math.PI) / 180, { pose: 'lean', label });
  // Corners where people sneak a cigarette.
  for (const [x, z] of [[89, 96], [96.5, 90.5], [120.5, 22.5]]) add('smoke', x, z, Math.random() * 6.28, { pose: 'smoke', item: 'cigarette' });
  // Generators in the HCZ generator room: engineers kneel at the service panels.
  for (const gx of [199, 207, 223, 231]) add('server', gx, 21.8, yawFacing(0, 1), { pose: 'kneel', item: 'toolbox' });
  // The kitchen line.
  for (const [x, z] of [[101.5, 40.5], [101.5, 44], [103.5, 47]]) add('cook', x, z, yawFacing(1, 0), { pose: 'inspect' });
  // D-Block: pacing and push-ups in each cell, the commons, the sinks.
  for (const c of f.spawns.classd || []) add('cell', c.x - 0.5, c.z, c.yaw, { pose: 'pushup', cell: c.cell, reach: 1.6 });

  game.spotsByType = {};
  for (const s of spots) (game.spotsByType[s.type] || (game.spotsByType[s.type] = [])).push(s);
  return spots;
}
