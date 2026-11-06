// Containment sectors (v0.7): every SCP the site can acquire has its own
// purpose-built containment room. Rooms for SCPs the site does not own yet are
// sealed construction sites; buying the SCP commissions the room (fixtures go
// in, the door unseals) and the SCP is delivered into it.
//
//   Heavy Containment Wing (Euclid)  north of the HCZ checkpoint, x 123–236
//   Keter Sector                     east of the HCZ wing, behind a Level 4 door
//   Light Containment Sector (Safe)  east of the Research Wing, x 157–312
//   Pocket dimension                 an unconnected pocket of the voxel grid
//
// Units are voxels (0.5 m), like facilityLayout.js.

import { B } from './blocks.js';
import { T } from './textures.js';

const ROT = { n: 0, w: 1, s: 2, e: 3 };

/** A furniture placement (same shape as FacilityBuilder.prop entries). */
function P(type, x, z, face = 'n', opts = {}, y) {
  return { type, x, z, y, rot: ROT[face], opts };
}

/** Scaffolding, tarps and cement: the look of a room that is not built yet. */
function constructionSite(x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  const list = [
    P('tarp', cx - w * 0.18, cz + d * 0.12),
    P('cementBags', cx + w * 0.22, cz - d * 0.2),
    P('workLight', x0 + 1.5, z0 + 1.5),
  ];
  if (w >= 10 && d >= 8) list.push(P('scaffold', cx, z0 + 2.2));
  if (w >= 14) list.push(P('crates', x1 - 3, z1 - 2.5), P('drum', x0 + 2, z1 - 2));
  if (w >= 20) list.push(P('pallet', cx + 4, cz + 3), P('workLight', x1 - 2, z0 + 2));
  return list;
}

export function buildContainment(f) {
  /**
   * Register an SCP chamber.
   * def: id, name, room [x0, z0, x1, z1, h, style], door {x, z, axis, type, clearance, slideDir},
   *      terminal [x, z, face] (corridor wall), sign [x, y, z, face], center [x, z], yaw,
   *      outside [x, z], fixtures [], lights [[x, z, preset, opts]], plus SCP-specific fields.
   */
  const chamber = (def) => {
    const [x0, z0, x1, z1, h, style] = def.room;
    const zone = `SCP-${def.id} CONTAINMENT`;
    f.room(`SCP-${def.id} Chamber`, x0, z0, x1, z1, h, style, zone);
    const doorId = `door-scp-${def.id}`;
    f.door({ ...def.door, id: doorId, type: def.door.type || 'heavy', name: `SCP-${def.id}` });
    for (const [lx, lz, preset, opts] of def.lights || [[Math.floor((x0 + x1) / 2) - 1, Math.floor((z0 + z1) / 2), 'white', { size: [2, 2] }]]) {
      f.light(lx, lz, preset, opts || {});
    }
    const [sx, sy, sz, sface] = def.sign;
    f.sign({ x: sx, y: sy, z: sz, face: sface, lines: [`SCP-${def.id}`, def.cls.toUpperCase()], style: def.cls === 'Keter' ? 'red' : def.cls === 'Euclid' ? 'yellow' : 'green' });
    const [tx, tz, tface] = def.terminal;
    f.terminal(`chamber-${def.id}`, tx, 3.6, tz, tface, `SCP-${def.id}`);
    f.chambers.push({
      ...def,
      name: `SCP-${def.id} Chamber`,
      zone,
      door: doorId,
      terminal: `chamber-${def.id}`,
      bounds: [x0, z0, x1, z1],
      fixtures: def.fixtures || [],
      construction: def.construction || constructionSite(x0, z0, x1, z1),
    });
  };

  // ===========================================================================
  // HEAVY CONTAINMENT WING (Euclid)
  // ===========================================================================
  const HZ = 'HEAVY CONTAINMENT WING';
  f.room('HCZ Wing Corridor', 123, 13, 237, 19, 8, 'hcz', HZ);
  f.door({ x: 122, z: 14, axis: 'z', type: 'heavy', clearance: 3, name: 'HCZ Wing' });
  f.sign({ x: 122, y: 7.2, z: 16, face: 'w', lines: ['HEAVY CONTAINMENT WING', 'LEVEL 3'], style: 'red', hazard: true });
  f.lightRow(127, 15, 233, 15, 8, 'cold', { pattern: ['cold', 'cold', 'off', 'cold', 'red', 'cold', 'cold'] });
  f.prop('pipe', 123, 13.4, { y: 8.5, opts: { len: 113 * 8 } });
  f.prop('cctvCam', 123.3, 13.3, { y: 8.4, face: 'e' });
  f.prop('cctvCam', 236.7, 18.7, { y: 8.4, face: 'w' });
  f.floorDecal(123, 13, 125, 19, T.HAZARD);

  // SCP-173: bare concrete cell with an observation window.
  chamber({
    id: '173', cls: 'Euclid',
    room: [125, 2, 137, 12, 8, 'chamber'],
    door: { x: 129, z: 12, axis: 'x', clearance: 3 },
    terminal: [126.6, 13, 's'], sign: [131, 6.8, 13, 's'],
    lights: [[130, 6, 'white', { size: [2, 2] }]],
    center: [131, 5], yaw: 180, outside: [131, 16],
    watch: [131, 10, 0],
    tray: [131.5, 10.6],
    spots: [[127, 5], [135, 5], [127.5, 9.5], [134.5, 9.5], [131, 3]],
  });
  f.fill(134, 3, 12, 136, 6, 13, B.GLASS);

  // SCP-049: a furnished humanoid containment cell.
  chamber({
    id: '049', cls: 'Euclid',
    room: [140, 2, 155, 12, 8, 'padded'],
    door: { x: 144, z: 12, axis: 'x', clearance: 3 },
    terminal: [141.6, 13, 's'], sign: [146, 6.8, 13, 's'],
    lights: [[146, 5, 'warm', { size: [2, 2] }]],
    center: [147, 6.5], yaw: 180, outside: [146, 16],
    fixtures: [P('cot', 152.5, 4.5, 'n'), P('bookcase', 143, 2.6, 's'), P('desk', 148, 3, 's'), P('chair', 148.5, 4.3, 'n'), P('plant', 141, 3)],
  });
  f.fill(150, 3, 12, 153, 6, 13, B.GLASS);

  // SCP-012: small locked room, the composition in a case in the middle.
  chamber({
    id: '012', cls: 'Euclid',
    room: [158, 4, 167, 12, 7, 'chamber'],
    door: { x: 160, z: 12, axis: 'x', clearance: 3 },
    terminal: [165.4, 13, 's'], sign: [162, 6.6, 13, 's'],
    lights: [[161, 7, 'dim', { size: [2, 1] }]],
    center: [162.5, 7], yaw: 180, outside: [162, 16],
  });

  // SCP-079: an old computer in a cold server closet.
  chamber({
    id: '079', cls: 'Euclid',
    room: [170, 3, 182, 12, 7, 'server'],
    door: { x: 172, z: 12, axis: 'x', clearance: 3 },
    terminal: [178.6, 13, 's'], sign: [174, 6.6, 13, 's'],
    lights: [[175, 6, 'cold', { size: [1, 2], intensity: 0.9 }]],
    center: [176, 4.5], yaw: 180, outside: [174, 16],
    fixtures: [P('serverRack', 171, 5, 'e'), P('serverRack', 171, 7, 'e'), P('serverRack', 181, 5, 'w'), P('serverRack', 181, 7, 'w')],
  });

  // SCP-151: a storage closet; the painting hangs covered on the far wall.
  chamber({
    id: '151', cls: 'Euclid',
    room: [186, 6, 194, 12, 6, 'office'],
    door: { x: 187, z: 12, axis: 'x', type: 'office', slideDir: 1, clearance: 3 },
    terminal: [192.6, 13, 's'], sign: [188.5, 6.4, 13, 's'],
    lights: [[189, 8, 'dim', { size: [1, 1] }]],
    center: [190, 6.15], yaw: 180, outside: [189, 16],
    fixtures: [P('cabinet', 192.8, 10, 'w'), P('crate', 187.5, 7.5)],
  });

  // SCP-096: a sealed steel cube. No windows, no cameras.
  chamber({
    id: '096', cls: 'Euclid',
    room: [125, 20, 139, 33, 9, 'steel'],
    door: { x: 130, z: 19, axis: 'x', clearance: 3 },
    terminal: [126.6, 19, 'n'], sign: [132, 7.2, 19, 'n'],
    lights: [[131, 26, 'cold', { size: [2, 2], intensity: 1.0 }]],
    center: [132, 26], yaw: 0, outside: [132, 16],
    corner: [126.3, 31.7, 135], // facing into the far corner
    tray: [131.5, 21.2],
    watch: [132, 21.5, 180],
    spots: [[127, 26], [137, 26], [128, 22], [136, 22], [132, 31.5]],
  });

  // Support rooms along the wing.
  f.room('HCZ Security Post', 143, 20, 160, 30, 7, 'security', 'HCZ SECURITY POST');
  f.door({ x: 149, z: 19, axis: 'x', type: 'standard', clearance: 3, name: 'HCZ Security Post' });
  f.sign({ x: 151, y: 6.6, z: 19, face: 'n', lines: ['SECURITY POST'], style: 'dark' });
  f.light(146, 24, 'white', { size: [2, 2] });
  f.light(155, 24, 'white', { size: [2, 2] });
  f.prop('monitorWall', 160, 25, { y: 3.6, face: 'w' });
  f.prop('consoleDesk', 158.2, 25, { face: 'w' });
  f.prop('chair', 156.6, 25, { face: 'e' });
  f.prop('locker', 147, 29.45, { face: 'n', opts: { count: 4 } });
  f.prop('roundTable', 148, 24, {});
  f.prop('stool', 146.6, 24, {});
  f.prop('stool', 149.4, 24, {});

  f.room('MTF Staging', 164, 20, 190, 32, 8, 'hcz', 'MTF STAGING AREA');
  f.door({ x: 175, z: 19, axis: 'x', type: 'heavy', clearance: 3, name: 'MTF Staging' });
  f.sign({ x: 177, y: 7.2, z: 19, face: 'n', lines: ['MTF STAGING'], style: 'red' });
  f.lightRow(168, 25, 186, 25, 9, 'cold', { size: [2, 2] });
  f.prop('locker', 172, 31.45, { face: 'n', opts: { count: 6 } });
  f.prop('crates', 186, 29, {});
  f.prop('crate', 167, 22, {});
  f.prop('bench', 172, 26, { face: 'e' });
  f.prop('bench', 178, 26, { face: 'e' });
  f.prop('whiteboard', 164, 26, { face: 'e' });

  f.room('HCZ Generator Room', 194, 20, 236, 34, 9, 'storage', 'HCZ GENERATOR ROOM');
  f.door({ x: 210, z: 19, axis: 'x', type: 'heavy', clearance: 3, name: 'Generator Room' });
  f.sign({ x: 212, y: 7.2, z: 19, face: 'n', lines: ['GENERATORS', 'AUTHORIZED ONLY'], style: 'yellow', hazard: true });
  f.lightRow(198, 27, 232, 27, 9, 'warm', { pattern: ['warm', 'off', 'warm'] });
  for (const gx of [199, 207, 223, 231]) {
    f.fill(gx - 2, 1, 23, gx + 2, 5, 31, B.METAL);
  }
  f.prop('pipe', 194, 20.5, { y: 8.4, opts: { len: 42 * 8, color: 0x8a3a30, r: 1 } });
  f.prop('drum', 214, 32, {});
  f.prop('drum', 215.2, 32.4, {});
  f.prop('drum', 216.4, 32, {});

  f.room('Decontamination', 198, 3, 214, 12, 7, 'washroom', 'DECONTAMINATION');
  f.door({ x: 204, z: 12, axis: 'x', type: 'standard', clearance: 3, name: 'Decontamination' });
  f.sign({ x: 206, y: 6.6, z: 13, face: 's', lines: ['DECON'], style: 'blue' });
  f.light(204, 6, 'cold', { size: [2, 2] });
  for (const sx of [200, 204, 208, 212]) f.prop('showerHead', sx, 3, { face: 's' });
  f.floorDecal(199, 4, 214, 8, T.FLOOR_GRATE);

  f.room('Euclid Records', 218, 3, 236, 12, 7, 'office', 'EUCLID RECORDS');
  f.door({ x: 225, z: 12, axis: 'x', type: 'office', slideDir: 1, clearance: 3, name: 'Euclid Records' });
  f.sign({ x: 227, y: 6.6, z: 13, face: 's', lines: ['RECORDS'], style: 'white' });
  f.light(222, 7, 'white');
  f.light(231, 7, 'white');
  for (const cx of [219, 220.2, 221.4, 222.6]) f.prop('cabinet', cx, 3.7, { face: 's' });
  f.prop('desk', 230, 7, { face: 'n' });
  f.prop('chair', 229.5, 5.8, { face: 's' });

  // ===========================================================================
  // KETER SECTOR
  // ===========================================================================
  const KZ = 'KETER SECTOR';
  f.door({ x: 237, z: 14, axis: 'z', type: 'heavy', clearance: 4, name: 'Keter Sector' });
  f.sign({ x: 237, y: 7.2, z: 16, face: 'w', lines: ['KETER SECTOR', 'LEVEL 4 ONLY'], style: 'red', hazard: true });
  f.room('Keter Corridor', 238, 13, 312, 19, 9, 'keter', KZ);
  f.lightRow(241, 15, 309, 15, 8, 'red', { pattern: ['cold', 'red', 'cold', 'cold'] });
  f.floorDecal(238, 13, 240, 19, T.HAZARD);
  f.prop('pipe', 238, 13.4, { y: 9.5, opts: { len: 74 * 8 } });
  f.prop('cctvCam', 238.3, 13.3, { y: 9.4, face: 'e' });
  f.room('Keter Spine', 306, 19, 312, 94, 8, 'keter', KZ);
  f.lightRow(308, 24, 308, 90, 8, 'cold', { pattern: ['cold', 'red', 'cold'] });
  f.fill(306, 1, 86, 312, 11, 87);
  f.door({ x: 307, z: 86, axis: 'x', type: 'heavy', clearance: 4, name: 'Keter Sector South' });
  f.sign({ x: 309, y: 7.0, z: 87, face: 's', lines: ['KETER SECTOR', 'LEVEL 4 ONLY'], style: 'red', hazard: true });

  f.room('Keter Observation', 241, 3, 266, 12, 7, 'security', 'KETER OBSERVATION');
  f.door({ x: 251, z: 12, axis: 'x', type: 'standard', clearance: 4, name: 'Keter Observation' });
  f.sign({ x: 253, y: 6.6, z: 13, face: 's', lines: ['OBSERVATION'], style: 'dark' });
  f.light(246, 7, 'cold', { size: [2, 2] });
  f.light(260, 7, 'cold', { size: [2, 2] });
  f.prop('monitorWall', 253.5, 3, { y: 3.6, face: 's' });
  f.prop('consoleDesk', 249, 4.8, { face: 's' });
  f.prop('consoleDesk', 258, 4.8, { face: 's' });
  f.prop('chair', 249, 6.5, { face: 'n' });
  f.prop('chair', 258, 6.5, { face: 'n' });

  f.room('Keter Security Post', 270, 3, 292, 12, 7, 'security', 'KETER SECURITY POST');
  f.door({ x: 279, z: 12, axis: 'x', type: 'standard', clearance: 4, name: 'Keter Security' });
  f.sign({ x: 281, y: 6.6, z: 13, face: 's', lines: ['SECURITY'], style: 'dark' });
  f.light(275, 7, 'white', { size: [2, 2] });
  f.light(286, 7, 'white', { size: [2, 2] });
  f.prop('locker', 281, 3.55, { face: 's', opts: { count: 6 } });
  f.prop('roundTable', 286, 8, {});
  f.prop('stool', 284.6, 8, {});
  f.prop('stool', 287.4, 8, {});

  // SCP-682: a huge chamber around a tank of acid.
  chamber({
    id: '682', cls: 'Keter',
    room: [240, 20, 270, 47, 11, 'keterCell'],
    door: { x: 252, z: 19, axis: 'x', clearance: 4 },
    terminal: [249.4, 19, 'n'], sign: [254, 8.2, 19, 'n'],
    lights: [[244, 24, 'cold', { size: [2, 2] }], [264, 24, 'cold', { size: [2, 2] }], [244, 42, 'red', { size: [2, 2] }], [264, 42, 'red', { size: [2, 2] }], [254, 34, 'cold', { size: [2, 2], intensity: 1.2 }]],
    center: [255, 35], yaw: 0, outside: [254, 16],
    tank: [247, 29, 263, 42],
    construction: [P('scaffold', 254, 23), P('tarp', 245, 24), P('cementBags', 265, 24), P('workLight', 242, 21), P('crates', 266, 45), P('drum', 242, 45)],
    fixtures: [P('consoleDesk', 245, 22.2, 's'), P('drum', 267, 22), P('drum', 268, 23.2)],
  });
  // The tank: glass walls, acid inside (solid: you walk around it).
  f.fill(246, 1, 28, 264, 3, 43, B.GLASS);
  f.fill(247, 1, 29, 263, 2, 42, B.ACID);
  f.fill(247, 2, 29, 263, 3, 42, B.AIR);
  f.glow(255, 2.5, 35.5, [0.4, 0.9, 0.3], 0.9, 10);

  // SCP-106: a sealed cell suspended on pillars in the middle of the room.
  chamber({
    id: '106', cls: 'Keter',
    room: [273, 20, 305, 47, 12, 'keterCell'],
    door: { x: 287, z: 19, axis: 'x', clearance: 4 },
    terminal: [284.4, 19, 'n'], sign: [289, 8.2, 19, 'n'],
    lights: [[277, 24, 'red', { size: [2, 2] }], [300, 24, 'cold', { size: [2, 2] }], [277, 43, 'cold', { size: [2, 2] }], [300, 43, 'red', { size: [2, 2] }]],
    center: [289, 34], yaw: 0, outside: [289, 16],
    cellFloorY: 4,
    construction: [P('scaffold', 278, 23), P('tarp', 299, 24), P('cementBags', 289, 25), P('workLight', 275, 21), P('crates', 301, 44), P('pallet', 277, 44)],
  });
  f.fill(282, 3, 29, 296, 10, 40, B.STEEL);
  f.fill(283, 4, 30, 295, 9, 39, B.AIR);
  f.fill(286, 5, 29, 292, 8, 30, B.GLASS); // window on the north face
  for (const [px, pz] of [[282, 29], [295, 29], [282, 39], [295, 39]]) f.fill(px, 1, pz, px + 1, 3, pz + 1, B.METAL);
  f.glow(289, 6, 34.5, [0.5, 0.15, 0.08], 0.7, 6);
  f.terminal('recall-106', 293.4, 3.6, 19, 'n', 'RECALL PROTOCOL');

  // SCP-939: a dark pen off the spine.
  chamber({
    id: '939', cls: 'Keter',
    room: [270, 52, 305, 82, 9, 'keterCell'],
    door: { x: 305, z: 64, axis: 'z', clearance: 4 },
    terminal: [306, 61.4, 'e'], sign: [306, 7.0, 66, 'e'],
    lights: [[276, 58, 'dim', { size: [1, 1], intensity: 0.7 }], [296, 58, 'red', { size: [1, 1], intensity: 0.8 }], [286, 74, 'dim', { size: [1, 1], intensity: 0.7 }]],
    center: [286, 66], yaw: 90, outside: [309, 66],
    den: [[278, 60], [292, 74]],
  });
  for (const [rx, rz, rw, rd] of [[274, 70, 4, 3], [296, 56, 3, 4], [283, 60, 3, 2]]) f.fill(rx, 1, rz, rx + rw, 3, rz + rd, B.CONCRETE);

  // ===========================================================================
  // LIGHT CONTAINMENT SECTOR (Safe)
  // ===========================================================================
  const LZ = 'LIGHT CONTAINMENT SECTOR';
  f.room('LCZ Corridor', 157, 94, 312, 100, 7, 'lcz', LZ);
  f.arch(156, 1, 95, 157, 6, 99);
  f.sign({ x: 156, y: 6.7, z: 92.2, face: 'w', lines: ['LIGHT CONTAINMENT →'], style: 'orange' });
  f.lightRow(161, 96, 305, 96, 8, 'white', { pattern: ['white', 'white', 'white', 'off'] });
  f.prop('pipe', 157, 94.4, { y: 7.55, opts: { len: 155 * 8 } });
  f.fill(178, 1, 94, 179, 9, 100);
  f.door({ x: 178, z: 95, axis: 'z', type: 'standard', clearance: 2, name: 'LCZ Checkpoint' });
  f.sign({ x: 178, y: 7.0, z: 97, face: 'w', lines: ['LIGHT CONTAINMENT SECTOR', 'LEVEL 2'], style: 'orange', hazard: true });
  f.prop('cctvCam', 179.3, 94.3, { y: 7.6, face: 'e' });
  f.prop('cctvCam', 304.7, 99.7, { y: 7.6, face: 'w' });
  f.floorDecal(179, 94, 181, 100, T.HAZARD);

  // SCP-914: a big hall around the machine.
  chamber({
    id: '914', cls: 'Safe',
    room: [180, 70, 206, 93, 9, 'safe'],
    door: { x: 191, z: 93, axis: 'x', type: 'standard', clearance: 2 },
    terminal: [188.6, 94, 's'], sign: [193, 7.6, 94, 's'],
    lights: [[184, 80, 'cold', { size: [2, 2] }], [200, 80, 'cold', { size: [2, 2] }], [192, 87, 'white', { size: [2, 2] }]],
    center: [193, 75], yaw: 180, outside: [193, 97],
    intake: [186, 76], output: [200, 76], panel: [193, 79],
    fixtures: [P('labTable', 184, 89, 'n'), P('shelf', 204, 88, 'w'), P('cart', 199, 89, 'w')],
  });

  // SCP-999: a soft playroom.
  chamber({
    id: '999', cls: 'Safe',
    room: [210, 78, 226, 93, 7, 'nursery'],
    door: { x: 216, z: 93, axis: 'x', type: 'standard', clearance: 2 },
    terminal: [213.6, 94, 's'], sign: [218, 6.6, 94, 's'],
    lights: [[217, 84, 'warm', { size: [2, 2] }]],
    center: [218, 84], yaw: 180, outside: [218, 97],
    fixtures: [P('toyBlocks', 213, 81), P('beanbag', 223, 80, 's', { color: 0xc86a30 }), P('beanbag', 213, 89, 'e', { color: 0x4a7ac0 }), P('toyBlocks', 222, 89)],
  });

  // SCP-131: an enclosure for the eye pods.
  chamber({
    id: '131', cls: 'Safe',
    room: [230, 80, 244, 93, 7, 'nursery'],
    door: { x: 234, z: 93, axis: 'x', type: 'office', slideDir: 1, clearance: 2 },
    terminal: [232.4, 94, 's'], sign: [236, 6.6, 94, 's'],
    lights: [[236, 85, 'warm', { size: [2, 2] }]],
    center: [237, 86], yaw: 180, outside: [236, 97],
    fixtures: [P('toyBlocks', 233, 83), P('beanbag', 241, 83, 's', { color: 0x9a6ab0 })],
  });

  // SCP-529: a living room for a cat that is only half there.
  chamber({
    id: '529', cls: 'Safe',
    room: [248, 82, 262, 93, 7, 'office'],
    door: { x: 251, z: 93, axis: 'x', type: 'office', slideDir: 1, clearance: 2 },
    terminal: [249.6, 94, 's'], sign: [253, 6.6, 94, 's'],
    lights: [[254, 86, 'warm', { size: [2, 2] }]],
    center: [255, 87], yaw: 180, outside: [253, 97],
    fixtures: [P('catBed', 259, 84), P('scratchPost', 250, 84), P('couch', 255, 83, 's', { color: 0x6a4a3a })],
  });

  // SCP-500: a small vault.
  chamber({
    id: '500', cls: 'Safe',
    room: [180, 101, 190, 111, 7, 'safe'],
    door: { x: 183, z: 100, axis: 'x', clearance: 3 },
    terminal: [181.4, 100, 'n'], sign: [185, 6.6, 100, 'n'],
    lights: [[184, 106, 'cold', { size: [2, 2] }]],
    center: [185, 106.5], yaw: 0, outside: [185, 97],
  });

  // SCP-330: a bowl of sweets on a pedestal, and a warning sign.
  chamber({
    id: '330', cls: 'Safe',
    room: [194, 101, 204, 111, 7, 'safe'],
    door: { x: 196, z: 100, axis: 'x', type: 'office', slideDir: 1, clearance: 2 },
    terminal: [202.4, 100, 'n'], sign: [197.5, 6.6, 100, 'n'],
    lights: [[198, 106, 'warm', { size: [2, 2] }]],
    center: [199, 107], yaw: 0, outside: [198, 97],
  });
  f.sign({ x: 199, y: 4.6, z: 111, face: 'n', lines: ['TAKE NO MORE', 'THAN TWO'], style: 'white' });

  // SCP-207: a locker room holding crates of cola.
  chamber({
    id: '207', cls: 'Safe',
    room: [208, 101, 220, 111, 7, 'storage'],
    door: { x: 210, z: 100, axis: 'x', type: 'office', slideDir: 1, clearance: 2 },
    terminal: [218.4, 100, 'n'], sign: [211.5, 6.6, 100, 'n'],
    lights: [[213, 106, 'white', { size: [2, 1] }]],
    center: [214, 108], yaw: 0, outside: [212, 97],
    fixtures: [P('shelf', 210.5, 109.5, 'n'), P('locker', 218, 110.45, 'n', { count: 2 })],
  });

  // SCP-005: a vault with a display case.
  chamber({
    id: '005', cls: 'Safe',
    room: [224, 101, 234, 111, 7, 'safe'],
    door: { x: 227, z: 100, axis: 'x', clearance: 3 },
    terminal: [225.4, 100, 'n'], sign: [229, 6.6, 100, 'n'],
    lights: [[228, 106, 'cold', { size: [2, 2] }]],
    center: [229, 106.5], yaw: 0, outside: [229, 97],
  });

  // SCP-294: the drink machine, in a converted break nook.
  chamber({
    id: '294', cls: 'Euclid',
    room: [238, 101, 250, 111, 7, 'breakroom'],
    door: { x: 240, z: 100, axis: 'x', type: 'office', slideDir: 1, clearance: 2 },
    terminal: [248.4, 100, 'n'], sign: [241.5, 6.6, 100, 'n'],
    lights: [[243, 105, 'warm', { size: [2, 2] }]],
    center: [244, 110.3], yaw: 0, outside: [242, 97],
    fixtures: [P('roundTable', 241, 105), P('stool', 239.6, 105), P('stool', 242.4, 105), P('bin', 249, 110)],
  });

  // Support rooms.
  f.room('LCZ Lounge', 254, 101, 272, 114, 7, 'breakroom', 'LCZ LOUNGE');
  f.door({ x: 261, z: 100, axis: 'x', type: 'standard', clearance: 2, name: 'LCZ Lounge' });
  f.sign({ x: 263, y: 6.6, z: 100, face: 'n', lines: ['LOUNGE'], style: 'green' });
  f.light(258, 106, 'warm');
  f.light(267, 106, 'warm');
  f.prop('couch', 263, 112.6, { face: 'n' });
  f.prop('roundTable', 258, 106, {});
  f.prop('vending', 271.3, 103, { face: 'w' });
  f.prop('vending', 271.3, 105, { face: 'w' });
  f.prop('waterCooler', 255, 102, {});
  f.prop('plant', 255, 113, {});

  f.room('LCZ Security Post', 276, 101, 296, 112, 7, 'security', 'LCZ SECURITY POST');
  f.door({ x: 284, z: 100, axis: 'x', type: 'standard', clearance: 2, name: 'LCZ Security' });
  f.sign({ x: 286, y: 6.6, z: 100, face: 'n', lines: ['SECURITY'], style: 'dark' });
  f.light(280, 106, 'white', { size: [2, 2] });
  f.light(291, 106, 'white', { size: [2, 2] });
  f.prop('consoleDesk', 294.2, 106, { face: 'w' });
  f.prop('chair', 292.6, 106, { face: 'e' });
  f.prop('locker', 281, 111.45, { face: 'n', opts: { count: 4 } });

  f.room('LCZ Research Lab', 266, 83, 302, 93, 7, 'lab', 'LCZ RESEARCH LAB');
  f.door({ x: 282, z: 93, axis: 'x', type: 'standard', clearance: 2, name: 'LCZ Research Lab' });
  f.sign({ x: 284, y: 6.6, z: 94, face: 's', lines: ['RESEARCH LAB'], style: 'blue' });
  f.light(272, 87, 'cold', { size: [2, 2] });
  f.light(290, 87, 'cold', { size: [2, 2] });
  f.prop('labTable', 272, 88, { face: 'n' });
  f.prop('labTable', 292, 88, { face: 'n' });
  f.prop('stool', 271, 86.5, {});
  f.prop('stool', 293, 86.5, {});
  f.prop('specimenCase', 282, 86, {});
  f.prop('shelf', 300, 88, { face: 'w' });

  // ===========================================================================
  // POCKET DIMENSION (SCP-106) — not connected to anything
  // ===========================================================================
  const PZ = 'POCKET DIMENSION';
  f.room('Pocket Dimension', 216, 146, 241, 171, 10, 'pocket', PZ);
  f.room('Pocket Passage N', 226, 128, 231, 146, 6, 'pocket', PZ);
  f.room('Pocket Passage S', 226, 171, 231, 189, 6, 'pocket', PZ);
  f.room('Pocket Passage W', 198, 156, 216, 161, 6, 'pocket', PZ);
  f.room('Pocket Passage E', 241, 156, 259, 161, 6, 'pocket', PZ);
  for (const [px, pz] of [[220, 150], [235, 150], [220, 165], [235, 165], [227, 152]]) f.fill(px, 1, pz, px + 2, 11, pz + 2, B.RUST);
  f.glow(228.5, 3, 158.5, [0.55, 0.2, 0.12], 1.1, 16);
  f.glow(228.5, 3, 131, [0.3, 0.45, 0.25], 0.8, 10);
  f.glow(228.5, 3, 186, [0.3, 0.45, 0.25], 0.8, 10);
  f.glow(201, 3, 158.5, [0.3, 0.45, 0.25], 0.8, 10);
  f.glow(256, 3, 158.5, [0.3, 0.45, 0.25], 0.8, 10);
  f.pocket = {
    center: [228.5, 158.5],
    exits: [[228.5, 129.5], [228.5, 187.5], [199.5, 158.5], [257.5, 158.5]],
  };

  // ===========================================================================
  // Points, terminals, first aid
  // ===========================================================================
  const PT = (id, x, z, extra) => f.point(id, x, z, extra);
  PT('patrol-hczwing', 190, 16, { label: 'Heavy Containment Wing' });
  PT('patrol-keter', 275, 16, { label: 'Keter Sector' });
  PT('patrol-spine', 309, 60, { label: 'Keter Spine' });
  PT('patrol-lcz', 230, 97, { label: 'Light Containment Sector' });
  PT('patrol-lcz-east', 290, 97, { label: 'LCZ East' });
  PT('guard-keter', 233, 16, { yaw: 90 });
  PT('guard-lcz', 181, 97, { yaw: 90 });
  PT('guard-keter-post', 281, 8, { yaw: 180 });
  PT('w-lcz-1', 200, 97);
  PT('w-lcz-2', 262, 97);
  PT('w-lcz-lab', 284, 88);
  PT('w-lcz-lounge', 263, 107);
  PT('w-hcz-post', 150, 25);

  f.terminal('net-a', 141, 3.6, 72, 'e', 'NETWORK');
  f.terminal('net-b', 143, 3.6, 22.4, 'e', 'NETWORK');
  f.terminal('net-c', 276, 3.6, 104, 'e', 'NETWORK');
  f.firstAid(143, 3.6, 27, 'e');
  f.firstAid(270, 3.6, 8, 'e');
  f.firstAid(254, 3.6, 109, 'e');
  f.firstAid(296, 3.6, 109, 'w');
  f.firstAid(306, 3.6, 40, 'e');

  f.shot([182, 4, 97], [200, 4, 97], [240, 3.5, 97]);
  f.shot([241, 4.5, 16], [256, 4.5, 16], [300, 4, 16]);
  f.shot([248, 6, 24], [262, 6, 25], [255, 2, 36]);
}
