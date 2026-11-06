// The facility map. Units are voxels (0.5 m). X grows east, Z grows south,
// floors sit at y = 1. Rooms are separated by 1-voxel walls; doors are cut
// into those walls and slide into the wall beside/above the opening.
//
// Prop `face` = direction the prop's front faces. For desk-like props the
// front is the side the user sits on.

import { T } from './textures.js';
import { B } from './blocks.js';
import { buildContainment } from './containmentLayout.js';

export const WORLD_SIZE = { w: 316, h: 16, d: 196 };

export function buildFacility(f) {
  // ===========================================================================
  // D-CLASS CONTAINMENT BLOCK
  // ===========================================================================
  const DZONE = 'D-CLASS CONTAINMENT BLOCK';
  f.room('D-Block Corridor', 20, 60, 56, 70, 9, 'dblock', DZONE);
  f.lightRow(23, 64, 55, 64, 8, 'dim', { pattern: ['dim', 'dim', 'off', 'dim', 'dim'], size: [2, 2] });

  const cellXs = [21, 30, 39, 48];
  const classdSpawns = [];
  cellXs.forEach((cx, i) => {
    // North row (D-01..D-04): doors in wall z = 59
    const n = i + 1;
    f.room(`Cell D-0${n}`, cx, 48, cx + 8, 59, 7, 'cell', DZONE);
    f.door({ x: cx + 1, z: 59, axis: 'x', type: 'cell', slideDir: 1, name: `Cell D-0${n}` });
    f.light(cx + 3, 52, 'dim');
    f.prop('bunk', cx + 7.05, 50.4, { face: 'n' });
    f.prop('toilet', cx + 1.2, 49.05, { face: 's' });
    f.prop('sink', cx + 2.7, 48.78, { face: 's' });
    f.sign({ x: cx + 2.5, y: 6.7, z: 60, face: 's', lines: [`D-0${n}`], style: 'orange' });
    classdSpawns.push({ x: cx + 3.5, z: 52.5, yaw: 180, cell: `Cell D-0${n}`, inside: [cx + 2.5, 57.3], outside: [cx + 2.5, 61.8] });

    // South row (D-05..D-08): doors in wall z = 70
    const s = i + 5;
    f.room(`Cell D-0${s}`, cx, 71, cx + 8, 82, 7, 'cell', DZONE);
    f.door({ x: cx + 1, z: 70, axis: 'x', type: 'cell', slideDir: 1, name: `Cell D-0${s}` });
    f.light(cx + 3, 77, i === 2 ? 'off' : 'dim');
    f.prop('bunk', cx + 7.05, 79.6, { face: 's' });
    f.prop('toilet', cx + 1.2, 80.95, { face: 'n' });
    f.prop('sink', cx + 2.7, 81.22, { face: 'n' });
    f.sign({ x: cx + 2.5, y: 6.7, z: 70, face: 'n', lines: [`D-0${s}`], style: 'orange' });
    classdSpawns.push({ x: cx + 3.5, z: 77.5, yaw: 0, cell: `Cell D-0${s}`, inside: [cx + 2.5, 72.7], outside: [cx + 2.5, 68.2] });
  });
  f.spawns.classd = classdSpawns.map((s) => ({ ...s, yaw: (s.yaw * Math.PI) / 180 }));

  f.floorDecal(52, 61, 56, 69, T.HAZARD);
  f.sign({ x: 56, y: 7.6, z: 65, face: 'w', lines: ['SECURITY CHECKPOINT', 'LEVEL 3 ONLY'], style: 'yellow' });
  f.sign({ x: 20.05, y: 8, z: 65, face: 'e', lines: ['D-CLASS CONTAINMENT BLOCK'], style: 'orange', scale: 1 });
  f.prop('cctvCam', 54, 60.2, { y: 8.6, face: 's' });
  f.prop('cctvCam', 22, 69.8, { y: 8.6, face: 'n' });
  f.prop('pipe', 20, 60.4, { y: 8.9, opts: { len: 36 * 8, color: 0x6a6e76 } });
  f.prop('pipe', 20, 60.9, { y: 8.9, opts: { len: 36 * 8, color: 0x8a3a30, r: 1 } });

  // Commons (west end) joined by an open arch.
  f.room('D-Block Commons', 3, 52, 19, 78, 8, 'dblock', 'D-BLOCK COMMONS');
  f.arch(19, 1, 61, 20, 7, 69);
  for (const lx of [6, 13]) for (const lz of [56, 65, 74]) f.light(lx, lz, 'dim');
  for (const tx of [7, 14.5]) {
    for (const tz of [59.5, 70.5]) {
      f.prop('cafTable', tx, tz);
      f.prop('bench', tx - 1.7, tz);
      f.prop('bench', tx + 1.7, tz);
    }
  }
  f.prop('waterCooler', 4, 53, {});
  f.prop('bin', 5.2, 53, {});
  f.prop('noticeBoard', 11, 52, { y: 1, face: 's' });
  f.prop('cctvCam', 4, 52.2, { y: 7.6, face: 's' });
  f.sign({ x: 11, y: 7, z: 52, face: 's', lines: ['LIGHTS OUT AT 2200'], style: 'white' });

  // Washroom
  f.room('D-Block Washroom', 3, 79, 19, 92, 7, 'washroom', 'D-BLOCK WASHROOM');
  f.door({ x: 9, z: 78, axis: 'x', type: 'office', slideDir: 1, name: 'Washroom' });
  f.sign({ x: 10.5, y: 6.7, z: 78, face: 'n', lines: ['WASHROOM'], style: 'white' });
  f.light(6, 84, 'dim');
  f.light(13, 84, 'dim');
  for (const sx of [5, 8, 11, 14]) {
    f.prop('stall', sx, 90, { face: 'n' });
    f.prop('toilet', sx, 90.95, { face: 'n' });
  }
  for (const sx of [4.6, 6.8, 13.6, 15.8]) f.prop('sink', sx, 79.78, { face: 's' });
  for (const sz of [82, 85, 88]) f.prop('showerHead', 19, sz, { face: 'w' });
  f.floorDecal(17, 81, 19, 90, T.FLOOR_GRATE);

  // ===========================================================================
  // SECURITY CHECKPOINT ALPHA + SECURITY OFFICE
  // ===========================================================================
  f.room('Security Checkpoint Alpha', 57, 56, 73, 74, 8, 'security', 'SECURITY CHECKPOINT ALPHA');
  f.door({ x: 56, z: 63, axis: 'z', type: 'heavy', clearance: 3, name: 'D-Block Gate' });
  f.door({ x: 73, z: 63, axis: 'z', type: 'standard', clearance: 2, name: 'Checkpoint Door' });
  // Guard booth with windows overlooking the walkway.
  f.fill(60, 1, 67, 70, 9, 74);
  f.room('Guard Booth', 61, 68, 69, 73, 6, 'security', 'SECURITY CHECKPOINT ALPHA');
  f.fill(61, 3, 67, 69, 6, 68, B.GLASS);
  f.arch(60, 1, 69, 61, 6, 72);
  f.light(64, 70, 'white', { size: [2, 1] });
  f.prop('consoleDesk', 65, 68.9, { face: 's' });
  f.prop('chair', 64, 70.6, { face: 'n' });
  f.prop('chair', 66.5, 70.6, { face: 'n' });
  f.light(59, 60, 'white');
  f.light(69, 60, 'white');
  f.light(64, 64, 'white');
  f.light(58, 70, 'white', { size: [1, 2] });
  f.prop('metalDetector', 65, 65, { face: 'e' });
  f.floorDecal(57, 63, 59, 67, T.HAZARD);
  f.floorDecal(71, 63, 73, 67, T.HAZARD);
  f.prop('barrier', 61.5, 62.2, {});
  f.prop('barrier', 68.5, 62.2, {});
  f.prop('cctvCam', 72.6, 56.3, { y: 7.6, face: 's' });
  f.prop('fireExt', 57.25, 59, { y: 3.2, face: 'e' });
  f.sign({ x: 65, y: 8.2, z: 56, face: 's', lines: ['SECURITY CHECKPOINT ALPHA'], style: 'yellow', hazard: true });
  f.sign({ x: 73, y: 7.0, z: 65, face: 'w', lines: ['CENTRAL CORRIDOR →'], style: 'dark' });
  f.sign({ x: 57, y: 7.0, z: 65, face: 'e', lines: ['← D-BLOCK'], style: 'orange' });

  f.room('Security Office', 57, 44, 73, 55, 7, 'security', 'SECURITY OFFICE');
  f.door({ x: 63, z: 55, axis: 'x', type: 'standard', clearance: 3, name: 'Security Office' });
  f.sign({ x: 65, y: 6.7, z: 56, face: 's', lines: ['SECURITY OFFICE'], style: 'dark' });
  f.lightRow(60, 47, 68, 47, 8, 'white');
  f.lightRow(60, 52, 68, 52, 8, 'white');
  f.prop('locker', 61, 44.55, { face: 's', opts: { count: 6 } });
  f.prop('locker', 67.5, 44.55, { face: 's', opts: { count: 4 } });
  f.prop('monitorWall', 73, 49.5, { y: 3.6, face: 'w' });
  f.prop('consoleDesk', 71.2, 49.5, { face: 'w' });
  f.prop('chair', 69.6, 48.5, { face: 'e' });
  f.prop('chair', 69.6, 50.6, { face: 'e' });
  f.prop('roundTable', 62, 50.5, {});
  f.prop('stool', 60.6, 50.5, {});
  f.prop('stool', 63.4, 50.5, {});
  f.prop('stool', 62, 51.9, {});
  f.prop('whiteboard', 57, 50, { face: 'e' });
  f.prop('cabinet', 58, 53.9, { face: 'n' });
  f.prop('waterCooler', 71.5, 54, {});
  f.sign({ x: 65, y: 6.6, z: 44, face: 's', lines: ['SHIFT ROTA POSTED DAILY', 'REPORT ALL INCIDENTS'], style: 'white' });
  f.spawns.security = [{ x: 61, z: 47.5, yaw: -Math.PI / 2 }];

  // ===========================================================================
  // CENTRAL CORRIDORS + JUNCTION
  // ===========================================================================
  f.room('West Corridor', 74, 62, 100, 68, 7, 'corridor', 'CENTRAL CORRIDOR — WEST');
  f.lightRow(77, 64, 97, 64, 8, 'white', { pattern: ['white', 'white', 'off'] });
  f.prop('pipe', 74, 62.35, { y: 7.55, opts: { len: 26 * 8 } });
  f.prop('pipe', 74, 62.8, { y: 7.6, opts: { len: 26 * 8, color: 0xa08a30, r: 1 } });
  f.prop('cctvCam', 98, 62.2, { y: 7.6, face: 's' });
  f.prop('fireExt', 80, 67.75, { y: 3.2, face: 'n' });

  f.room('Central Junction', 100, 54, 118, 76, 10, 'hub', 'CENTRAL JUNCTION');
  for (const [px, pz] of [[102, 56], [114, 56], [102, 72], [114, 72]]) f.fill(px, 1, pz, px + 2, 11, pz + 2);
  f.light(104, 59, 'cold', { size: [2, 2] });
  f.light(112, 59, 'cold', { size: [2, 2] });
  f.light(104, 69, 'cold', { size: [2, 2] });
  f.light(112, 69, 'cold', { size: [2, 2] });
  f.light(108, 64, 'cold', { size: [2, 2] });
  f.floorDecal(106, 62, 112, 68, T.FLOOR_METAL);
  f.floorDecal(107, 63, 111, 67, T.FLOOR_DARK);
  f.prop('plant', 101, 55, {});
  f.prop('plant', 117, 55, {});
  f.prop('plant', 101, 75, {});
  f.prop('plant', 117, 75, {});
  f.prop('vending', 104.2, 54.65, { face: 's' });
  f.prop('bin', 105.6, 54.5, {});
  f.prop('cctvCam', 103, 58.19, { y: 8.6, face: 's' });
  f.prop('cctvCam', 115, 71.81, { y: 8.6, face: 'n' });
  // Direction signs above each corridor mouth.
  f.sign({ x: 109, y: 9, z: 54, face: 's', lines: ['↑ HEAVY CONTAINMENT ZONE'], style: 'red' });
  f.sign({ x: 109, y: 9, z: 76, face: 'n', lines: ['↓ ADMINISTRATION / LOBBY'], style: 'blue' });
  f.sign({ x: 100, y: 9, z: 65, face: 'e', lines: ['← D-BLOCK / CAFETERIA'], style: 'orange' });
  f.sign({ x: 118, y: 9, z: 65, face: 'w', lines: ['RESEARCH WING / MEDICAL →'], style: 'blue' });
  f.sign({ x: 103, y: 5, z: 58, face: 's', lines: ['CENTRAL', 'JUNCTION'], style: 'dark' });
  f.sign({ x: 115, y: 5, z: 72, face: 'n', lines: ['SITE-██'], style: 'dark' });

  f.room('North Corridor', 106, 26, 112, 54, 7, 'corridor', 'NORTH CORRIDOR');
  f.light(108, 50, 'white');
  f.light(108, 42, 'off');
  f.light(108, 34, 'white');
  f.light(108, 28, 'red', { size: [2, 1] });
  f.prop('pipe', 106.35, 26, { y: 7.55, face: 'e', opts: { len: 28 * 8 } });
  f.floorDecal(106, 26, 112, 28, T.HAZARD);
  f.sign({ x: 109, y: 7.1, z: 26, face: 's', lines: ['HCZ CHECKPOINT', 'LEVEL 3+'], style: 'red', hazard: true });

  f.room('East Corridor', 118, 62, 134, 68, 7, 'corridor', 'CENTRAL CORRIDOR — EAST');
  f.lightRow(121, 64, 129, 64, 8, 'white');
  f.prop('pipe', 118, 62.35, { y: 7.55, opts: { len: 16 * 8 } });
  f.door({ x: 134, z: 63, axis: 'z', type: 'standard', clearance: 2, name: 'Research Wing' });
  f.sign({ x: 134, y: 7.0, z: 65, face: 'w', lines: ['RESEARCH WING', 'LEVEL 2'], style: 'blue' });
  f.prop('fireExt', 133.75, 62.4, { y: 3.2, face: 'w' });

  f.room('South Corridor', 106, 76, 112, 99, 7, 'corridor', 'SOUTH CORRIDOR');
  f.lightRow(108, 80, 108, 96, 8, 'white');
  f.prop('pipe', 111.65, 76, { y: 7.55, face: 'e', opts: { len: 23 * 8 } });
  f.prop('cctvCam', 106.2, 97, { y: 7.6, face: 'e' });

  // ===========================================================================
  // CAFETERIA + KITCHEN + STORAGE
  // ===========================================================================
  f.room('Cafeteria', 76, 34, 99, 61, 8, 'cafeteria', 'CAFETERIA');
  f.door({ x: 85, z: 61, axis: 'x', type: 'standard', name: 'Cafeteria' });
  f.sign({ x: 87, y: 6.7, z: 62, face: 's', lines: ['CAFETERIA'], style: 'green' });
  for (const lx of [79, 87, 95]) for (const lz of [38, 46, 54]) f.light(lx, lz, 'warm');
  for (const tx of [80, 86, 92]) {
    for (const tz of [41, 51]) {
      f.prop('cafTable', tx, tz);
      f.prop('bench', tx - 1.7, tz);
      f.prop('bench', tx + 1.7, tz);
    }
  }
  f.prop('counter', 97.2, 40, { face: 'w', opts: { width: 72 } });
  f.prop('vending', 79, 34.65, { face: 's' });
  f.prop('vending', 81, 34.65, { face: 's' });
  f.prop('waterCooler', 83, 34.4, {});
  f.prop('bin', 77, 59.5, {});
  f.prop('bin', 97.5, 59.5, {});
  f.prop('plant', 77, 47, {});
  f.sign({ x: 99, y: 6.6, z: 40, face: 'w', lines: ['TODAY: ██████ SURPRISE'], style: 'white' });
  f.sign({ x: 88, y: 6.4, z: 34, face: 's', lines: ['PLEASE RETURN YOUR TRAYS'], style: 'white' });

  f.room('Kitchen', 100, 38, 105, 52, 7, 'kitchen', 'KITCHEN');
  f.door({ x: 99, z: 43, axis: 'z', type: 'office', slideDir: 1, clearance: 1, name: 'Kitchen' });
  f.light(101, 41, 'white');
  f.light(101, 48, 'white');
  f.prop('shelf', 104.2, 41, { face: 'w' });
  f.prop('cart', 102.5, 49.5, { face: 'w' });
  f.prop('drum', 104, 50.8, {});

  f.room('Storage', 76, 69, 99, 92, 7, 'storage', 'STORAGE');
  f.door({ x: 86, z: 68, axis: 'x', type: 'office', slideDir: 1, clearance: 1, name: 'Storage' });
  f.sign({ x: 87.5, y: 6.7, z: 68, face: 'n', lines: ['STORAGE'], style: 'yellow' });
  f.lightRow(79, 74, 95, 74, 8, 'white', { pattern: ['white', 'off', 'white'] });
  f.lightRow(79, 84, 95, 84, 8, 'white', { pattern: ['off', 'white', 'white'] });
  for (const sx of [79, 83, 92, 96]) for (const sz of [72.5, 77, 81.5]) f.prop('shelf', sx, sz, { face: 's' });
  f.prop('crates', 80, 88, {});
  f.prop('crates', 84, 89, {});
  f.prop('pallet', 92, 88.5, {});
  f.prop('pallet', 96, 88.5, {});
  f.prop('drum', 77.2, 90.8, {});
  f.prop('drum', 78.2, 90.8, {});
  f.prop('crate', 88, 86, {});

  // Maintenance shaft: sealed escape route to the surface, opened only by
  // emergency protocols (and still needs a Level 2 card).
  f.room('Maintenance Shaft', 78, 93, 92, 99, 7, 'storage', 'MAINTENANCE SHAFT');
  f.door({
    x: 80, z: 92, axis: 'x', type: 'heavy', clearance: 2, name: 'Maintenance Access', requiresCard: true,
    locked: 'MAINTENANCE ACCESS SEALED — EMERGENCY USE ONLY',
  });
  f.sign({ x: 82, y: 7.1, z: 92, face: 'n', lines: ['MAINTENANCE ACCESS', 'EMERGENCY EGRESS'], style: 'yellow', hazard: true });
  f.light(84, 95, 'dim');
  f.light(89, 96, 'off');
  f.prop('pipe', 78, 93.4, { y: 7.5, opts: { len: 14 * 8 } });
  f.prop('pipe', 78, 98.6, { y: 7.3, opts: { len: 14 * 8, color: 0x8a3a30, r: 1 } });
  f.prop('drum', 90.5, 97.8, {});
  f.prop('crate', 89, 94.2, {});
  f.prop('ladder', 78, 96, { face: 'e' });
  f.fill(78, 8, 95, 80, 9, 98, B.AIR);
  f.sign({ x: 78, y: 6.2, z: 94.2, face: 'e', lines: ['SURFACE ↑'], style: 'yellow' });

  // ===========================================================================
  // HEAVY CONTAINMENT ZONE ENTRANCE
  // ===========================================================================
  f.room('HCZ Checkpoint', 96, 8, 122, 25, 11, 'hcz', 'HEAVY CONTAINMENT ZONE — ENTRANCE');
  f.door({ x: 107, z: 25, axis: 'x', type: 'heavy', clearance: 3, name: 'HCZ Checkpoint' });
  f.door({ x: 105, z: 7, axis: 'x', type: 'gate', clearance: 4, name: 'Containment Gate' });
  f.room('HCZ Vestibule', 104, 1, 114, 7, 9, 'hcz', 'HEAVY CONTAINMENT ZONE');

  // The Heavy Containment Wing, Keter Sector and Light Containment Sector
  // (one purpose-built room per SCP) live in containmentLayout.js.
  buildContainment(f);

  f.light(108, 3, 'red');
  f.floorDecal(104, 8, 114, 10, T.HAZARD);
  f.floorDecal(106, 23, 112, 25, T.HAZARD);
  f.light(100, 11, 'red', { size: [1, 1] });
  f.light(117, 11, 'red', { size: [1, 1] });
  f.light(103, 18, 'white', { size: [2, 2] });
  f.light(113, 18, 'white', { size: [2, 2] });
  f.light(108, 14, 'off', { size: [2, 2] });
  f.prop('barrier', 101.5, 11.5, {});
  f.prop('barrier', 116.5, 11.5, {});
  f.prop('desk', 99.5, 21, { face: 'w', opts: { screen: 0xd05040 } });
  f.prop('chair', 98.2, 21, { face: 'e' });
  f.prop('crates', 119, 21.5, {});
  f.prop('drum', 120.5, 19, {});
  f.prop('cctvCam', 96.3, 9, { y: 10.4, face: 'e' });
  f.prop('cctvCam', 121.7, 9, { y: 10.4, face: 'w' });
  f.sign({ x: 109, y: 10, z: 8, face: 's', lines: ['HEAVY CONTAINMENT ZONE'], style: 'red', scale: 2 });
  f.sign({ x: 101, y: 6.5, z: 8, face: 's', lines: ['LEVEL 4 CLEARANCE', 'REQUIRED BEYOND', 'THIS POINT'], style: 'yellow', hazard: true });
  f.sign({ x: 117, y: 6.5, z: 8, face: 's', lines: ['LETHAL FORCE', 'AUTHORIZED'], style: 'yellow', hazard: true });

  // ===========================================================================
  // RESEARCH WING
  // ===========================================================================
  const RZONE = 'RESEARCH WING';
  f.room('Research Corridor', 135, 62, 150, 68, 7, 'research', RZONE);
  f.lightRow(138, 64, 146, 64, 8, 'cold');
  f.room('Research Wing Hall', 150, 32, 156, 100, 7, 'research', RZONE);
  f.lightRow(152, 35, 152, 99, 8, 'cold', { pattern: ['cold', 'cold', 'cold', 'off', 'cold', 'cold', 'cold', 'cold', 'cold'] });
  f.prop('pipe', 155.65, 32, { y: 7.55, face: 'e', opts: { len: 68 * 8 } });
  f.prop('cctvCam', 150.2, 33, { y: 7.6, face: 'e' });
  f.prop('cctvCam', 155.8, 98, { y: 7.6, face: 'w' });
  f.prop('waterCooler', 150.6, 70, {});
  f.prop('plant', 150.6, 72, {});

  f.room('Records Office', 120, 44, 134, 61, 7, 'office', 'RECORDS OFFICE');
  f.door({ x: 124, z: 61, axis: 'x', type: 'office', slideDir: 1, clearance: 2, name: 'Records Office' });
  f.sign({ x: 125.5, y: 6.7, z: 62, face: 's', lines: ['RECORDS'], style: 'white' });
  for (const lx of [123, 130]) for (const lz of [48, 56]) f.light(lx, lz, 'white');
  for (const dz of [48, 53]) for (const dx of [124, 130]) {
    f.prop('desk', dx, dz, { face: 'n' });
    f.prop('chair', dx - 0.5, dz - 1.2, { face: 's' });
  }
  for (const cx of [121, 122.2, 123.4, 124.6]) f.prop('cabinet', cx, 44.7, { face: 's' });
  f.prop('shelf', 132, 45, { face: 's' });
  f.prop('plant', 133, 60, {});

  f.room('Research Office', 135, 44, 149, 61, 7, 'office', 'RESEARCH OFFICES');
  f.door({ x: 140, z: 61, axis: 'x', type: 'office', slideDir: 1, clearance: 2, name: 'Research Office' });
  f.sign({ x: 141.5, y: 6.7, z: 62, face: 's', lines: ['RESEARCH OFFICE'], style: 'blue' });
  for (const lx of [138, 145]) for (const lz of [48, 56]) f.light(lx, lz, 'cold');
  for (const dz of [48, 53]) for (const dx of [139, 145]) {
    f.prop('desk', dx, dz, { face: 'n', opts: { screen: 0x7aa8e8 } });
    f.prop('chair', dx - 0.5, dz - 1.2, { face: 's' });
  }
  f.prop('whiteboard', 142, 44, { face: 's' });
  f.prop('cabinet', 148, 45, { face: 'w' });
  f.prop('cabinet', 148, 46.4, { face: 'w' });

  f.room('Laboratory A', 157, 34, 176, 52, 8, 'lab', 'LABORATORY A');
  f.door({ x: 156, z: 41, axis: 'z', type: 'standard', clearance: 2, name: 'Laboratory A' });
  f.sign({ x: 156, y: 6.7, z: 43, face: 'w', lines: ['LAB A'], style: 'blue' });
  for (const lx of [161, 170]) for (const lz of [38, 46]) f.light(lx, lz, 'cold', { size: [2, 2] });
  f.prop('labTable', 163, 38.5, { face: 'n' });
  f.prop('labTable', 163, 46, { face: 'n' });
  f.prop('stool', 162, 37, {});
  f.prop('stool', 164.5, 44.5, {});
  f.prop('shelf', 174.5, 36, { face: 'w' });
  f.prop('shelf', 174.5, 49, { face: 'w' });
  f.prop('whiteboard', 166, 34, { face: 's' });
  f.prop('cctvCam', 175.7, 34.4, { y: 8.6, face: 'w' });

  f.room('Observation Room', 157, 54, 176, 69, 7, 'research', 'TEST CHAMBER OBSERVATION');
  f.door({ x: 156, z: 59, axis: 'z', type: 'standard', clearance: 2, name: 'Observation Room' });
  f.sign({ x: 156, y: 6.7, z: 61, face: 'w', lines: ['OBSERVATION'], style: 'blue' });
  f.fill(160, 3, 69, 174, 6, 70, B.GLASS);
  f.light(161, 58, 'cold');
  f.light(170, 58, 'cold');
  f.light(165, 64, 'off');
  f.prop('consoleDesk', 164, 67.4, { face: 'n' });
  f.prop('consoleDesk', 170.5, 67.4, { face: 'n' });
  f.prop('chair', 163, 65.6, { face: 's' });
  f.prop('chair', 165.5, 65.6, { face: 's' });
  f.prop('chair', 170.5, 65.6, { face: 's' });
  f.prop('cabinet', 175.3, 55, { face: 'w' });

  f.room('Test Chamber 01', 157, 70, 176, 92, 10, 'test', 'TEST CHAMBER 01');
  f.door({ x: 156, z: 79, axis: 'z', type: 'heavy', clearance: 3, name: 'Test Chamber 01' });
  f.sign({ x: 156, y: 7.4, z: 81, face: 'w', lines: ['TEST CHAMBER 01'], style: 'yellow', hazard: true });
  f.floorDecal(163, 77, 171, 85, T.HAZARD);
  f.floorDecal(164, 78, 170, 84, T.FLOOR_GRATE);
  f.light(160, 74, 'cold', { size: [2, 2], intensity: 1.8 });
  f.light(171, 74, 'cold', { size: [2, 2], intensity: 1.8 });
  f.light(160, 87, 'cold', { size: [2, 2], intensity: 1.8 });
  f.light(171, 87, 'cold', { size: [2, 2], intensity: 1.8 });
  f.prop('cctvCam', 157.3, 71, { y: 10.4, face: 'e' });
  f.prop('cctvCam', 175.7, 91, { y: 10.4, face: 'w' });

  f.room('Server Room', 141, 69, 149, 86, 7, 'server', 'SERVER ROOM');
  f.door({ x: 143, z: 68, axis: 'x', type: 'heavy', clearance: 3, name: 'Server Room' });
  f.sign({ x: 145, y: 6.9, z: 68, face: 'n', lines: ['SERVER ROOM', 'LEVEL 3'], style: 'blue' });
  f.light(145, 72, 'cold', { size: [1, 2], intensity: 1.0 });
  f.light(145, 79, 'cold', { size: [1, 2], intensity: 1.0 });
  f.light(145, 84, 'off', { size: [1, 1] });
  for (let z = 71.2; z < 85; z += 1.6) {
    f.prop('serverRack', 143.05, z, { face: 'e' });
    f.prop('serverRack', 147.95, z, { face: 'w' });
  }
  f.glow(145, 2, 76, [0.2, 0.6, 0.35], 0.5, 8);
  f.glow(145, 2, 82, [0.2, 0.35, 0.7], 0.5, 8);

  f.room('Archive', 138, 88, 149, 100, 7, 'storage', 'ARCHIVE');
  f.door({ x: 149, z: 92, axis: 'z', type: 'office', slideDir: 1, clearance: 3, name: 'Archive' });
  f.sign({ x: 150, y: 6.7, z: 93.5, face: 'e', lines: ['ARCHIVE'], style: 'yellow' });
  f.light(142, 91, 'dim');
  f.light(142, 97, 'off');
  for (const sz of [90, 93, 96]) {
    f.prop('shelf', 140, sz, { face: 's' });
    f.prop('shelf', 144, sz, { face: 's' });
  }
  f.prop('cabinet', 147.8, 98.6, { face: 'w' });

  // ===========================================================================
  // MEDICAL BAY
  // ===========================================================================
  f.room('Medical Bay', 124, 69, 140, 86, 8, 'medical', 'MEDICAL BAY');
  f.door({ x: 129, z: 68, axis: 'x', type: 'standard', clearance: 1, name: 'Medical Bay' });
  f.sign({ x: 131, y: 6.7, z: 68, face: 'n', lines: ['MEDICAL BAY'], style: 'green' });
  for (const lx of [127, 135]) for (const lz of [73, 81]) f.light(lx, lz, 'white', { size: [2, 2] });
  for (const bz of [72, 77, 82]) {
    f.prop('medBed', 126.1, bz, { face: 'w' });
    f.prop('ivStand', 124.6, bz + 1.6, {});
    f.prop('medBed', 137.9, bz, { face: 'e' });
  }
  f.prop('desk', 132, 84.4, { face: 'n' });
  f.prop('chair', 131.5, 83.2, { face: 's' });
  f.prop('cart', 132, 76, {});
  f.prop('cabinet', 136.5, 85.3, { face: 'n' });
  f.prop('cabinet', 137.7, 85.3, { face: 'n' });
  f.prop('waterCooler', 128, 85.4, {});

  // ===========================================================================
  // ADMINISTRATION LOBBY
  // ===========================================================================
  f.room('Administration Lobby', 94, 100, 124, 124, 12, 'lobby', 'ADMINISTRATION LOBBY');
  f.door({ x: 107, z: 99, axis: 'x', type: 'standard', name: 'Central Access' });
  f.sign({ x: 109, y: 6.7, z: 100, face: 's', lines: ['CENTRAL ACCESS'], style: 'dark' });
  f.sign({ x: 116.5, y: 5.6, z: 100, face: 's', logo: true, lit: true });
  // Raised reception platform (one voxel step).
  f.fill(102, 1, 115, 118, 2, 122);
  f.prop('counter', 110, 116.3, { y: 2, face: 'n', opts: { width: 72 } });
  f.prop('chair', 108, 118.8, { y: 2, face: 'n' });
  f.prop('chair', 112, 118.8, { y: 2, face: 'n' });
  f.prop('plant', 103, 116, { y: 2 });
  f.prop('plant', 117, 116, { y: 2 });
  f.prop('cabinet', 104, 121.3, { y: 2, face: 'n' });
  f.prop('cabinet', 105.2, 121.3, { y: 2, face: 'n' });
  f.sign({ x: 110, y: 8.2, z: 124, face: 'n', lines: [`WELCOME TO SITE-██`], style: 'white', scale: 2 });
  f.door({ x: 96, z: 124, axis: 'x', type: 'elevator', name: 'Elevator A', locked: 'ELEVATOR OFFLINE — SURFACE ACCESS RESTRICTED' });
  f.door({ x: 118, z: 124, axis: 'x', type: 'elevator', name: 'Elevator B', locked: 'ELEVATOR OFFLINE — SURFACE ACCESS RESTRICTED' });
  f.sign({ x: 98, y: 6.8, z: 124, face: 'n', lines: ['ELEVATOR A'], style: 'dark' });
  f.room('Elevator A', 96, 125, 100, 128, 5, 'doorway', 'ELEVATOR A');
  f.light(97, 126, 'white');
  f.sign({ x: 120, y: 6.8, z: 124, face: 'n', lines: ['ELEVATOR B'], style: 'dark' });
  for (const lx of [98, 108, 118]) for (const lz of [104, 112, 120]) f.light(lx, lz, 'neutral', { size: [2, 2], radius: 18, intensity: 1.6 });
  f.prop('couch', 97, 108, { face: 'e' });
  f.prop('couch', 121, 108, { face: 'w' });
  f.prop('roundTable', 99.3, 108, {});
  f.prop('plant', 95, 101, {});
  f.prop('plant', 123, 101, {});
  f.prop('plant', 95, 114, {});
  f.prop('plant', 123, 114, {});
  f.prop('waterCooler', 95, 116.5, {});
  f.prop('bin', 104.8, 101, {});
  f.prop('cctvCam', 94.3, 101, { y: 11.4, face: 'e' });
  f.prop('cctvCam', 123.7, 122, { y: 11.4, face: 'w' });

  f.room('Administration', 80, 102, 93, 116, 7, 'office', 'ADMINISTRATION OFFICES');
  f.door({ x: 93, z: 106, axis: 'z', type: 'standard', clearance: 2, name: 'Administration' });
  f.sign({ x: 94, y: 6.7, z: 108, face: 'e', lines: ['ADMINISTRATION'], style: 'blue' });
  for (const lx of [83, 89]) for (const lz of [105, 112]) f.light(lx, lz, 'white');
  for (const dz of [106, 111]) for (const dx of [83, 88.5]) {
    f.prop('desk', dx, dz, { face: 'n' });
    f.prop('chair', dx - 0.5, dz - 1.2, { face: 's' });
  }
  for (const cx of [81, 82.2, 83.4]) f.prop('cabinet', cx, 115.3, { face: 'n' });
  f.prop('plant', 92, 115, {});
  f.prop('whiteboard', 80, 109, { face: 'e' });

  f.room('Staff Break Room', 125, 102, 138, 116, 7, 'breakroom', 'STAFF BREAK ROOM');
  f.door({ x: 124, z: 106, axis: 'z', type: 'office', slideDir: 1, clearance: 1, name: 'Break Room' });
  f.sign({ x: 124, y: 6.7, z: 107.5, face: 'w', lines: ['BREAK ROOM'], style: 'green' });
  f.light(128, 106, 'warm');
  f.light(134, 106, 'warm');
  f.light(131, 112, 'warm');
  f.prop('couch', 131, 114.6, { face: 'n', opts: { color: 0x6a4a3a } });
  f.prop('roundTable', 129, 107, {});
  f.prop('roundTable', 134, 107, {});
  for (const [sx, sz] of [[127.6, 107], [130.4, 107], [132.6, 107], [135.4, 107]]) f.prop('stool', sx, sz, {});
  f.prop('vending', 137.3, 103, { face: 'w' });
  f.prop('vending', 137.3, 105, { face: 'w' });
  f.prop('waterCooler', 126, 103, {});
  f.prop('noticeBoard', 131, 102, { face: 's' });

  // ===========================================================================
  // GAMEPLAY POINTS, TERMINALS & FIRST AID (objectives and NPC posts)
  // ===========================================================================
  const P = (id, x, z, extra) => f.point(id, x, z, extra);
  // Security patrol checkpoints.
  P('patrol-dblock', 38, 65, { label: 'D-Block Corridor' });
  P('patrol-commons', 11, 65, { label: 'D-Block Commons' });
  P('patrol-cafeteria', 87, 47, { label: 'Cafeteria' });
  P('patrol-storage', 87.5, 79.5, { label: 'Storage' });
  P('patrol-hub', 109, 65, { label: 'Central Junction' });
  P('patrol-north', 109, 34, { label: 'North Corridor' });
  P('patrol-research', 153, 70, { label: 'Research Wing Hall' });
  P('patrol-medical', 132, 79, { label: 'Medical Bay' });
  P('patrol-lobby', 109, 108, { label: 'Administration Lobby' });
  P('patrol-breakroom', 131, 110, { label: 'Staff Break Room' });

  // Class-D testing.
  P('guard-escort', 67, 61, { yaw: 0 });
  P('tc-hall', 153.5, 81, { label: 'Test Chamber 01' });
  P('tc-center', 167, 81);
  P('tc-receptacle', 159.6, 88.6);
  P('lab-hall', 153.5, 43, { label: 'Laboratory A' });
  P('lab-mark', 166.5, 42.5);
  P('seq-1', 169, 39);
  P('seq-2', 171.5, 43);
  P('seq-3', 169, 47);
  P('sci-observation', 167.25, 65.5, { yaw: 180 });
  P('sci-lab', 173, 41, { yaw: 90 });

  // Escape route.
  P('maint-door', 81.5, 90.3, { label: 'Maintenance Access' });
  P('maint-shaft', 85, 96, { label: 'Maintenance Shaft' });
  P('exit-ladder', 79, 96);
  for (const [i, x, z, area] of [
    [1, 153, 86, 'Research Wing'], [2, 143, 64.5, 'Research Wing'], [3, 116.5, 63, 'Central Junction'],
    [4, 135.5, 79.5, 'Medical Bay'], [5, 95, 57, 'Cafeteria'], [6, 90, 64.2, 'Central Corridor'],
  ]) P(`key-${i}`, x, z, { area });

  // Security staff posts.
  P('chief', 67.5, 49.5, { yaw: 90 });
  P('guard-booth', 62, 70.8, { yaw: 0 });
  P('guard-hcz', 100.5, 17, { yaw: -90 });
  P('guard-lobby', 105, 102.5, { yaw: 150 });

  // Researchers, doctors and Class-D ambient posts / wander targets.
  P('doc-medical', 129.5, 80, { yaw: -90 });
  P('w-res-1', 153, 50); P('w-res-2', 153, 88); P('w-res-3', 142, 64.5);
  P('w-resoff', 142, 56.5); P('w-laba', 167, 50); P('w-cafe', 88, 45.5);
  P('w-records', 127, 57); P('w-hub', 109, 70); P('w-medical', 131, 77.8);
  for (const [i, x, z] of [[1, 5, 54], [2, 16, 54.5], [3, 11, 65], [4, 5, 65.5], [5, 17, 65.5], [6, 6, 76], [7, 15, 76]]) {
    P(`w-commons-${i}`, x, z);
  }

  // VIP escort origins and destinations.
  P('vip-laba', 166, 50, { label: 'Laboratory A', yaw: 0 });
  P('vip-resoff', 147.5, 57, { label: 'Research Office', yaw: 90 });
  P('vip-records', 122.5, 58, { label: 'Records Office', yaw: -90 });
  P('dest-admin', 91, 104, { label: 'Administration Offices' });
  P('dest-cafeteria', 87, 57, { label: 'Cafeteria' });
  P('dest-lobby', 101, 106, { label: 'Administration Lobby' });
  P('dest-medical', 130, 78, { label: 'Medical Bay' });
  P('dest-hcz', 104, 20, { label: 'HCZ Checkpoint' });

  // Evacuation.
  P('evac', 98, 121.5, { label: 'Evacuation Elevator' });
  P('evac-car', 98, 126.3);
  P('shelter-1', 166, 49.5, { label: 'Laboratory A' });
  P('shelter-2', 147.5, 57, { label: 'Research Office' });
  P('shelter-3', 127.5, 84.2, { label: 'Medical Bay' });
  P('shelter-4', 122.5, 58, { label: 'Records Office' });
  P('shelter-5', 174, 62, { label: 'Observation Room' });

  // Documents.
  P('doc-records', 130.8, 53.2, { label: 'Records Office', h: 0.78 });
  P('doc-admin', 89.3, 111.2, { label: 'Administration Offices', h: 0.78 });

  // Breach origins (voxel centers).
  P('breach-hcz', 109, 15, { label: 'HCZ Checkpoint' });
  P('breach-research', 166, 81, { label: 'Test Chamber 01' });

  // Class-D work details and stray keycards.
  P('spill-commons', 11, 66); P('spill-washroom', 11, 84.5); P('spill-westcorr', 82, 65);
  P('spill-cafeteria', 90, 56.5); P('spill-hub', 106, 60);
  P('crate-storage', 87.5, 85);
  P('drop-kitchen', 102.5, 45, { label: 'Kitchen' });
  P('drop-cafeteria', 95, 49, { label: 'Cafeteria' });
  P('loose-breakroom', 129, 107); P('loose-records', 124.8, 48.2); P('loose-admin', 83.8, 106.2);
  P('loose-medical', 132.8, 84.4); P('loose-cafeteria', 86, 41);
  P('server-door', 145.5, 66);

  // Wall terminals: id, x, y, z (on the wall surface), facing, label.
  f.terminal('duty', 71.3, 3.6, 44, 's', 'DUTY ROSTER');
  f.terminal('log-alpha', 58.5, 3.6, 56, 's', 'CHECKPOINT LOG');
  f.terminal('log-hcz', 96, 3.6, 16, 'e', 'CHECKPOINT LOG');
  f.terminal('log-research', 131.5, 3.6, 62, 's', 'CHECKPOINT LOG');
  f.terminal('log-lobby', 101, 3.6, 100, 's', 'CHECKPOINT LOG');
  f.terminal('server-reboot', 145.5, 3.6, 86, 'n', 'GRID CONTROL');
  f.terminal('lock-hcz-a', 96, 3.6, 11, 'e', 'CONTAINMENT LOCK');
  f.terminal('lock-hcz-b', 122, 3.6, 12, 'w', 'CONTAINMENT LOCK');
  f.terminal('lock-hcz-c', 99, 3.6, 8, 's', 'CONTAINMENT LOCK');
  f.terminal('lock-res-a', 176, 3.6, 62, 'w', 'CONTAINMENT LOCK');
  f.terminal('lock-res-b', 157, 3.6, 88, 'e', 'CONTAINMENT LOCK');
  f.terminal('lock-res-c', 156, 3.6, 74, 'w', 'CONTAINMENT LOCK');
  f.terminal('tc-control', 156, 3.6, 84.5, 'w', 'TEST CONTROL');
  f.terminal('power-main', 93, 3.6, 69, 's', 'MAIN BREAKER');
  f.terminal('procurement', 59.5, 3.6, 55, 'n', 'PROCUREMENT');
  f.terminal('black-market', 3, 3.6, 81.5, 'e', 'JURY-RIGGED');

  f.firstAid(124, 3.6, 79.5, 'e');
  f.firstAid(3, 3.6, 65, 'e');
  f.firstAid(57, 3.6, 70, 'e');
  f.firstAid(150, 3.6, 80, 'e');
  f.firstAid(96, 3.6, 23.5, 'e');
  f.firstAid(57, 3.6, 46, 'e');

  // ===========================================================================
  // Main-menu camera shots (from, to, look) — voxel coordinates.
  // ===========================================================================
  f.shot([99, 4, 113], [103, 4, 109], [116, 5.5, 100]);
  f.shot([23, 4, 65], [33, 4, 65], [56, 3, 65]);
  f.shot([109, 3.6, 23], [109, 3.6, 17], [109, 5.5, 7]);
  f.shot([101.5, 5.5, 64], [106, 5.0, 66], [126, 3, 65]);
  f.shot([153, 4, 99], [153, 4, 90], [153, 3.5, 40]);
  f.shot([62, 4.2, 72], [67, 4.2, 72.5], [65, 4, 60]);
  f.shot([126, 3.8, 16], [140, 3.8, 16], [175, 3.5, 16]);
  f.shot([161, 4, 97], [172, 4, 97], [200, 3.5, 97]);

}
