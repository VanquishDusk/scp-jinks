// Hidden personalities.
//
// Every person on site has six traits in [0, 1]. They are never shown to the
// player; they only come out through what people do and say:
//
//   drive    lazy (0) ↔ workaholic (1)     breaks, naps, posts left unattended
//   social   loner (0) ↔ chatterbox (1)    conversations, gossip, approaching you
//   nerve    coward (0) ↔ brave (1)        panic, breach response, risk taking
//   heart    cold/cruel (0) ↔ kind (1)     tone, shoving D-class, sharing food
//   honor    corrupt (0) ↔ honest (1)      bribes, smuggling, snitching, reports
//   curious  incurious (0) ↔ curious (1)   lingering at windows, experiments
//
// The dominant trait (the one furthest from 0.5) sets the "voice" lines are
// picked from, so two people asked the same thing answer differently.

export const TRAITS = ['drive', 'social', 'nerve', 'heart', 'honor', 'curious'];

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const chance = (p) => Math.random() < p;
export const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** A trait value biased toward the extremes, so people are distinct. */
function roll(bias = 0) {
  const r = Math.random();
  return clamp01(0.5 + (r - 0.5) * 1.5 + bias + (Math.random() - 0.5) * 0.1);
}

/** Random traits with optional per-trait bias (e.g. guards are a bit braver). */
export function makeTraits(bias = {}) {
  const t = {};
  for (const k of TRAITS) t[k] = roll(bias[k] || 0);
  return t;
}

/**
 * The voice a line is picked from. Returns e.g. 'warm', 'cold', 'lazy',
 * 'driven', 'anxious', 'bold', 'chatty', 'loner', 'shady', 'curious'.
 */
export function voiceOf(t, exclude = []) {
  const poles = [
    ['drive', 'lazy', 'driven'],
    ['social', 'loner', 'chatty'],
    ['nerve', 'anxious', 'bold'],
    ['heart', 'cold', 'warm'],
    ['honor', 'shady', 'straight'],
    ['curious', 'dull', 'curious'],
  ];
  let best = 'plain';
  let bd = 0.12;
  for (const [k, lo, hi] of poles) {
    const v = (t[k] ?? 0.5) - 0.5;
    const name = v < 0 ? lo : hi;
    if (exclude.includes(name)) continue;
    // A little noise so the same person does not always sound the same.
    const d = Math.abs(v) + Math.random() * 0.12;
    if (d > bd) {
      bd = d;
      best = name;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------
const FIRST = [
  'Adrian', 'Beatrix', 'Carlos', 'Dana', 'Elias', 'Fatima', 'Gregor', 'Hana', 'Ivan', 'Jules', 'Kofi', 'Lena',
  'Mateo', 'Nadia', 'Oskar', 'Priya', 'Quinn', 'Rosa', 'Samir', 'Tove', 'Umar', 'Vera', 'Wen', 'Ximena', 'Yusuf',
  'Zoe', 'Aurelio', 'Bettina', 'Cyrus', 'Delphine', 'Emeka', 'Freya', 'Gideon', 'Ines', 'Jonas', 'Keiko', 'Luca',
  'Marta', 'Niko', 'Odette', 'Pavel', 'Rania', 'Stellan', 'Tamsin', 'Viktor', 'Wilhelmina', 'Yara',
];
const LAST = [
  'Abara', 'Bergstrom', 'Castellanos', 'Dvorak', 'Eastwood', 'Fontaine', 'Grieve', 'Halloway', 'Ibarra', 'Jansen',
  'Kaminski', 'Laurent', 'Moreau', 'Nakamura', 'Oyelaran', 'Prentice', 'Quill', 'Ravensworth', 'Sato', 'Thorne',
  'Ulrich', 'Vasquez', 'Whitlock', 'Xu', 'Yilmaz', 'Zielinski', 'Achterberg', 'Brannigan', 'Coutinho', 'Delacroix',
  'Esposito', 'Fairweather', 'Gallo', 'Hartigan', 'Ishikawa', 'Kowal', 'Lindqvist', 'Mbatha', 'Nwosu', 'Okonkwo',
  'Petrov', 'Rasmussen', 'Silva', 'Tanaka', 'Varga', 'Weiss', 'Harrow', 'Okafor', 'Vance', 'Reyes', 'Holt', 'Briggs',
];

/**
 * A name nobody on site already has. `taken` holds full names plus "F:first"
 * and "L:last" entries, so two people never share a surname (or first name).
 */
export function makeName(kind, taken) {
  for (let i = 0; i < 300; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    if (taken.has(`F:${first}`) || (kind !== 'classd' && taken.has(`L:${last}`))) continue;
    let name;
    if (kind === 'scientist' || kind === 'medic') name = `Dr. ${last}`;
    else if (kind === 'guard') name = `Officer ${last}`;
    else if (kind === 'classd') name = `D-${1000 + Math.floor(Math.random() * 9000)}`;
    else if (kind === 'director') name = `Director ${last}`;
    else name = `${first} ${last}`;
    if (!taken.has(name)) {
      taken.add(name);
      taken.add(`F:${first}`);
      if (kind !== 'classd') taken.add(`L:${last}`);
      return { name, first, last };
    }
  }
  const first = pick(FIRST);
  return { name: `${first} ${Math.floor(Math.random() * 900 + 100)}`, first, last: first };
}
