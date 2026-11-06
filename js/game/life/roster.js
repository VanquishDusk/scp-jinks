// The people of Site-██.
//
// Every position on site (a "slot") is filled by a person who persists across
// shifts in the profile: name, hidden traits, a personal situation (hook),
// how they feel about the player, and who they get along with. People who die
// or get fired are gone for good; the next shift someone new fills the slot.
//
// Slot ids double as NPC ids, so the shift directors can keep referring to
// "sci-okafor" or "guard-booth" whoever currently holds the job.

import { makeTraits, makeName, pick, chance, clamp01 } from './traits.js';

// Zone groups.
const PUBLIC = ['CAFETERIA', 'STAFF BREAK ROOM', 'ADMINISTRATION LOBBY', 'CENTRAL JUNCTION', 'CENTRAL CORRIDOR — WEST', 'CENTRAL CORRIDOR — EAST', 'SOUTH CORRIDOR', 'NORTH CORRIDOR'];
const RESEARCH = ['RESEARCH OFFICES', 'LABORATORY A', 'RESEARCH WING', 'TEST CHAMBER OBSERVATION', 'RECORDS OFFICE'];
const LCZ = ['LIGHT CONTAINMENT SECTOR', 'LCZ RESEARCH LAB', 'LCZ LOUNGE', 'LCZ SECURITY POST'];
const HCZ = ['HEAVY CONTAINMENT WING', 'HCZ SECURITY POST', 'EUCLID RECORDS', 'DECONTAMINATION', 'MTF STAGING AREA', 'HEAVY CONTAINMENT ZONE — ENTRANCE'];
const DBLOCK = ['D-CLASS CONTAINMENT BLOCK', 'D-BLOCK COMMONS', 'D-BLOCK WASHROOM'];

/**
 * job: what they do all day (see Life.js WORK). work: zones their work spots
 * are in. free: where they spend breaks. bias: trait tendencies of the role.
 */
export const SLOTS = [
  // ---- Research -------------------------------------------------------------
  { slot: 'sci-okafor', kind: 'scientist', title: 'Research Supervisor', at: 'vip-resoff', job: 'research', work: ['RESEARCH OFFICES', 'LABORATORY A', 'TEST CHAMBER OBSERVATION'], free: PUBLIC, bias: { drive: 0.15 } },
  { slot: 'sci-lindqvist', kind: 'scientist', title: 'Senior Researcher', at: 'vip-laba', job: 'research', work: ['LABORATORY A', 'RESEARCH OFFICES', 'TEST CHAMBER OBSERVATION'], free: PUBLIC, bias: { curious: 0.15 } },
  { slot: 'sci-harrow', kind: 'scientist', title: 'Researcher', at: 'w-res-1', job: 'research', work: RESEARCH, free: PUBLIC, bias: { curious: 0.1 } },
  { slot: 'sci-vance', kind: 'scientist', title: 'Records Archivist', at: 'vip-records', job: 'records', work: ['RECORDS OFFICE', 'ARCHIVE', 'ADMINISTRATION OFFICES'], free: PUBLIC, bias: { social: -0.1 } },
  { slot: 'sci-cafe', kind: 'scientist', title: 'Junior Researcher', at: 'w-cafe', job: 'research', work: [...RESEARCH, 'RECORDS OFFICE'], free: PUBLIC, bias: { social: 0.1 } },
  { slot: 'sci-intern', kind: 'scientist', title: 'Research Intern', at: 'w-res-3', job: 'errands', work: [...RESEARCH, 'RECORDS OFFICE', 'ADMINISTRATION OFFICES', 'ARCHIVE'], free: PUBLIC, bias: { social: 0.15, nerve: -0.1 } },
  { slot: 'sci-lcz', kind: 'scientist', title: 'Containment Researcher', at: 'w-lcz-lab', job: 'research', work: LCZ, free: ['LCZ LOUNGE', ...PUBLIC], bias: { curious: 0.1 } },
  { slot: 'sci-hcz', kind: 'scientist', title: 'Containment Specialist', at: 'w-hcz-post', job: 'research', work: HCZ, free: ['HCZ SECURITY POST', ...PUBLIC], bias: { nerve: 0.1 } },
  { slot: 'sci-keter', kind: 'scientist', title: 'Keter Analyst', at: 'w-keter-obs', job: 'research', clearance: 4, work: ['KETER OBSERVATION', 'KETER SECURITY POST'], free: ['KETER SECURITY POST', 'KETER OBSERVATION'], bias: { nerve: 0.15, social: -0.1 } },
  { slot: 'sci-psych', kind: 'scientist', title: 'Staff Psychologist', at: 'w-psych', job: 'psych', work: ['D-BLOCK COMMONS', 'D-CLASS CONTAINMENT BLOCK', 'SECURITY OFFICE'], free: PUBLIC, bias: { heart: 0.15, social: 0.1 } },
  // ---- Medical -----------------------------------------------------------------
  { slot: 'doc-reyes', kind: 'medic', title: 'Medical Officer', at: 'doc-medical', job: 'medical', work: ['MEDICAL BAY'], free: PUBLIC, bias: { heart: 0.1 } },
  { slot: 'med-nurse', kind: 'medic', title: 'Nurse', at: 'w-medical', job: 'medical', work: ['MEDICAL BAY'], free: PUBLIC, bias: { heart: 0.15 } },
  // ---- Administration ----------------------------------------------------------
  { slot: 'adm-director', kind: 'director', title: 'Site Director', at: 'w-director', job: 'office', work: ['ADMINISTRATION OFFICES'], free: ['ADMINISTRATION LOBBY', 'CAFETERIA'], bias: { drive: 0.2, heart: -0.1 } },
  { slot: 'adm-clerk', kind: 'office', title: 'Administrative Clerk', at: 'dest-admin', job: 'office', work: ['ADMINISTRATION OFFICES', 'RECORDS OFFICE'], free: PUBLIC },
  { slot: 'adm-reception', kind: 'office', title: 'Receptionist', at: 'w-lobby-desk', job: 'office', work: ['ADMINISTRATION LOBBY', 'ADMINISTRATION OFFICES'], free: PUBLIC, bias: { social: 0.15 } },
  // ---- Support -------------------------------------------------------------------
  { slot: 'jan-1', kind: 'janitor', title: 'Custodian', at: 'w-hub', job: 'janitor', work: [...PUBLIC, 'SECURITY CHECKPOINT ALPHA', 'STORAGE'], free: ['STAFF BREAK ROOM', 'STORAGE', 'CAFETERIA'] },
  { slot: 'jan-2', kind: 'janitor', title: 'Custodian', at: 'w-res-2', job: 'janitor', work: ['RESEARCH WING', 'LIGHT CONTAINMENT SECTOR', 'LCZ LOUNGE', 'MEDICAL BAY', 'CENTRAL CORRIDOR — EAST'], free: ['LCZ LOUNGE', 'STAFF BREAK ROOM'] },
  { slot: 'tech-1', kind: 'tech', title: 'Systems Technician', at: 'server-door', job: 'tech', work: ['SERVER ROOM', 'STORAGE', 'RESEARCH WING', 'CENTRAL JUNCTION'], free: PUBLIC },
  { slot: 'tech-2', kind: 'tech', title: 'Containment Engineer', at: 'w-generator', job: 'tech', work: ['HCZ GENERATOR ROOM', 'HEAVY CONTAINMENT WING', 'MTF STAGING AREA', 'HCZ SECURITY POST'], free: ['HCZ SECURITY POST', 'MTF STAGING AREA', ...PUBLIC] },
  { slot: 'cook-1', kind: 'cook', title: 'Cook', at: 'drop-kitchen', job: 'cook', work: ['KITCHEN', 'CAFETERIA'], free: ['CAFETERIA', 'KITCHEN'], bias: { heart: 0.05 } },
  // ---- Security --------------------------------------------------------------------
  { slot: 'chief', kind: 'guard', title: 'Head of Security', at: 'chief', job: 'chief', fixedName: 'Chief Mercer', work: ['SECURITY OFFICE', 'SECURITY CHECKPOINT ALPHA', ...PUBLIC], free: ['SECURITY OFFICE', 'CAFETERIA'], traits: { drive: 0.85, social: 0.45, nerve: 0.8, heart: 0.45, honor: 0.9, curious: 0.35 } },
  { slot: 'guard-booth', kind: 'guard', title: 'Security Officer', at: 'guard-booth', job: 'post', free: ['SECURITY OFFICE', 'CAFETERIA', 'STAFF BREAK ROOM'], bias: { nerve: 0.1 } },
  { slot: 'guard-dblock', kind: 'guard', title: 'Security Officer', at: 'patrol-dblock', job: 'post', free: ['SECURITY OFFICE', 'SECURITY CHECKPOINT ALPHA'], bias: { nerve: 0.1 } },
  { slot: 'guard-hcz', kind: 'guard', title: 'Security Officer', at: 'guard-hcz', job: 'post', free: ['HCZ SECURITY POST', 'CAFETERIA'], bias: { nerve: 0.15 } },
  { slot: 'guard-lobby', kind: 'guard', title: 'Security Officer', at: 'guard-lobby', job: 'post', free: ['STAFF BREAK ROOM', 'CAFETERIA', 'ADMINISTRATION LOBBY'], bias: { nerve: 0.05 } },
  { slot: 'guard-research', kind: 'guard', title: 'Security Officer', at: 'w-guard-research', job: 'post', free: ['STAFF BREAK ROOM', 'CAFETERIA'], bias: { nerve: 0.05 } },
  { slot: 'guard-patrol-1', kind: 'guard', title: 'Security Officer', at: 'patrol-hub', job: 'patrol', route: ['patrol-dblock', 'patrol-hub', 'w-hub', 'patrol-cafeteria', 'patrol-storage', 'patrol-hczwing'], free: ['SECURITY OFFICE', 'CAFETERIA', 'STAFF BREAK ROOM'], bias: { nerve: 0.1 } },
  { slot: 'guard-patrol-2', kind: 'guard', title: 'Security Officer', at: 'patrol-research', job: 'patrol', route: ['patrol-hub', 'patrol-research', 'patrol-medical', 'patrol-north', 'patrol-lobby', 'patrol-lcz', 'patrol-lcz-east'], free: ['STAFF BREAK ROOM', 'CAFETERIA', 'LCZ LOUNGE'], bias: { nerve: 0.1 } },
  { slot: 'guard-keter', kind: 'guard', title: 'Security Officer', at: 'guard-keter', job: 'post', clearance: 4, free: ['HCZ SECURITY POST'], bias: { nerve: 0.2 } },
  { slot: 'guard-keter-post', kind: 'guard', title: 'Security Officer', at: 'guard-keter-post', job: 'post', clearance: 4, free: ['KETER SECURITY POST', 'KETER OBSERVATION'], bias: { nerve: 0.2 } },
  { slot: 'guard-lcz', kind: 'guard', title: 'Security Officer', at: 'guard-lcz', job: 'post', free: ['LCZ LOUNGE', 'LCZ SECURITY POST'], bias: { nerve: 0.05 } },
  // ---- Class-D (one per cell) ------------------------------------------------------
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ slot: `classd-${i}`, kind: 'classd', title: 'Class-D Personnel', cell: i - 1, job: 'classd', work: DBLOCK, free: DBLOCK })),
];

export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.slot, s]));

/** Personal situations people can bring to the player (all hidden until talked about). */
export function chooseHook(p, def) {
  const t = p.traits;
  const k = def.kind;
  const opts = [];
  if (k === 'guard' && def.slot !== 'chief') {
    if (t.honor < 0.3) opts.push('smuggler', 'smuggler', 'bribable');
    else if (t.honor < 0.45) opts.push('bribable');
    if (t.drive < 0.35) opts.push('tired', 'tired');
  }
  if (k === 'classd') {
    if (t.nerve > 0.62) opts.push('escapee', 'escapee');
    if (t.nerve < 0.4 && (t.heart < 0.45 || t.honor > 0.65)) opts.push('snitch', 'snitch');
    opts.push('lostitem');
  }
  if (k === 'scientist' || k === 'medic') {
    if (t.curious > 0.66) opts.push('curious', 'curious');
    if (t.drive < 0.4) opts.push('lostitem', 'lostitem');
    if (t.honor > 0.75 && t.curious > 0.45) opts.push('whistle');
  }
  if (k === 'janitor') opts.push(t.honor < 0.45 ? 'fence' : 'lostitem');
  if (k === 'cook' && t.heart > 0.5) opts.push('feeder', 'feeder');
  if (k === 'office' || k === 'tech') opts.push('lostitem');
  if (t.social > 0.6 && t.heart > 0.6) opts.push('sweetheart');
  if (!opts.length || chance(0.55)) return null;
  return pick(opts);
}

function newPerson(def, taken, shift) {
  const traits = def.traits ? { ...def.traits } : makeTraits(def.bias || {});
  const { name, first } = def.fixedName ? { name: def.fixedName, first: 'Ray' } : makeName(def.kind, taken);
  if (def.fixedName) taken.add(`L:${def.fixedName.split(' ').pop()}`);
  const p = { slot: def.slot, kind: def.kind, name, first, traits, hook: null, rel: { classd: 0, security: 0 }, flags: {}, hired: shift, met: false };
  p.hook = chooseHook(p, def);
  return p;
}

/**
 * Make sure every slot is filled. Returns { people, newHires, gone } where
 * gone lists people who left since the last shift (dead or fired).
 */
export function ensureRoster(profile) {
  const staff = profile.staff || (profile.staff = {});
  // Names (and first/last names) in use by people still on site.
  const taken = new Set(['L:Mercer']);
  for (const p of Object.values(staff)) {
    if (p.dead || p.fired) continue;
    taken.add(p.name);
    if (p.first) taken.add(`F:${p.first}`);
    if (p.kind !== 'classd') taken.add(`L:${p.name.split(' ').pop()}`);
  }
  const newHires = [];
  const gone = [];
  for (const def of SLOTS) {
    let p = staff[def.slot];
    if (p && (p.dead || p.fired)) {
      gone.push(p);
      p = null;
    }
    if (!p) {
      p = newPerson(def, taken, profile.shifts);
      staff[def.slot] = p;
      if (profile.shifts > 0) newHires.push(p);
    }
    p.newHire = p.hired === profile.shifts && profile.shifts > 0;
    // Situations resolve; new ones come up.
    if (!p.hook && chance(0.3)) p.hook = chooseHook(p, def);
  }
  return { people: SLOTS.map((d) => staff[d.slot]), newHires, gone };
}

// ---------------------------------------------------------------------------
// Relationships between people (persisted): -1 rivals … +1 friends.
// ---------------------------------------------------------------------------
export function tieKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function getTie(profile, a, b) {
  const ties = profile.ties || (profile.ties = {});
  const k = tieKey(a.slot, b.slot);
  if (ties[k] === undefined) {
    // First impressions: similar warmth and sociability get along.
    const ta = a.traits;
    const tb = b.traits;
    let v = 0.35 - Math.abs(ta.heart - tb.heart) * 0.7 - Math.abs(ta.social - tb.social) * 0.3 + (Math.random() - 0.5) * 0.5;
    if (ta.heart < 0.3 && tb.heart < 0.3) v -= 0.3; // two cold people clash
    ties[k] = Math.max(-1, Math.min(1, v));
  }
  return ties[k];
}

export function bumpTie(profile, a, b, d) {
  const v = getTie(profile, a, b);
  profile.ties[tieKey(a.slot, b.slot)] = Math.max(-1, Math.min(1, v + d));
}

/** Remember the dead (and the fired) so people can talk about them. */
export function remember(profile, p, why, cause) {
  const list = profile.memorial || (profile.memorial = []);
  list.unshift({ name: p.name, first: p.first, kind: p.kind, slot: p.slot, why, cause: cause || null, shift: profile.shifts });
  if (list.length > 14) list.length = 14;
}

export { clamp01 };
