// The SCP procurement catalog. The more dangerous an SCP, the more it costs,
// the more research grant money it earns Security every minute it stays
// contained — and the faster its containment integrity decays, raising the
// odds of a breach. Every SCP has its own containment room (see
// world/containmentLayout.js); buying one commissions that room.
//
//   price       Credits (Class-D black-market buyers pay a markup)
//   income      Credits per minute paid to Security while contained
//   decay       containment integrity lost per minute (0 = never needs checks)
//   risk        weight added to the chance of a containment breach event (0 = never breaches)
//   sector      where its room is
//
// SCP descriptions are adapted from the SCP Wiki (scp-wiki.wikidot.com),
// licensed CC BY-SA 3.0. See README.md for credits.

const S = (o) => o;

export const CATALOG = {
  // ---- Safe ---------------------------------------------------------------
  '529': S({
    id: '529', name: 'SCP-529', nick: 'Josie the Half-Cat', cls: 'Safe', sector: 'Light Containment',
    price: 450, income: 6, decay: 0, risk: 0,
    desc: 'A friendly grey tabby cat. Her back half is simply not there, and nobody can see where it should be. She does not seem to mind.',
    perk: 'Pet her: a little health and full stamina. Never breaches.',
  }),
  '500': S({
    id: '500', name: 'SCP-500', nick: 'Panacea', cls: 'Safe', sector: 'Light Containment',
    price: 600, income: 10, decay: 0, risk: 0,
    desc: 'A container of red pills that cure any disease or injury. Low yield, zero risk.',
    perk: 'Security: the chamber terminal dispenses one full-heal pill per shift.',
  }),
  '330': S({
    id: '330', name: 'SCP-330', nick: 'Take Only Two', cls: 'Safe', sector: 'Light Containment',
    price: 800, income: 12, decay: 0, risk: 0,
    desc: 'A bowl of assorted sweets under a sign: "TAKE NO MORE THAN 2, PLEASE". Two pieces are perfectly harmless. A third costs the taker their hands.',
    perk: 'Two sweets per shift heal you. The third... read the sign.',
  }),
  '207': S({
    id: '207', name: 'SCP-207', nick: 'Cola Bottles', cls: 'Safe', sector: 'Light Containment',
    price: 900, income: 14, decay: 0, risk: 0,
    desc: 'Glass bottles of cola that make the drinker faster and tireless for a while. Drinking more while the first is still working strains the heart.',
    perk: 'Drink: much faster, unlimited stamina for 75 s. Doubling up hurts.',
  }),
  '131': S({
    id: '131', name: 'SCP-131', nick: 'The Eye Pods', cls: 'Safe', sector: 'Light Containment',
    price: 1000, income: 15, decay: 0, risk: 0,
    desc: 'Two small teardrop-shaped creatures with a single, never-blinking eye each. Curious and friendly; they follow people they like and watch everything.',
    perk: 'They can follow you. Their eyes never close: they keep SCP-173 frozen.',
  }),
  '999': S({
    id: '999', name: 'SCP-999', nick: 'The Tickle Monster', cls: 'Safe', sector: 'Light Containment',
    price: 1400, income: 24, decay: 3, risk: 1,
    desc: 'A friendly orange gelatinous mass. If it gets out, it wanders the halls and heals anyone it hugs.',
    perk: 'A breach is harmless — but the grid still fails open.',
  }),
  '005': S({
    id: '005', name: 'SCP-005', nick: 'Skeleton Key', cls: 'Safe', sector: 'Light Containment',
    price: 2000, income: 28, decay: 0, risk: 0,
    desc: 'An ornate key that opens any lock, mechanical or electronic. Kept in a display case under guard.',
    perk: 'Borrow it once per shift: two minutes of opening anything.',
  }),
  '914': S({
    id: '914', name: 'SCP-914', nick: 'The Clockworks', cls: 'Safe', sector: 'Light Containment',
    price: 2600, income: 36, decay: 0, risk: 0,
    desc: 'A huge clockwork machine with an intake booth, an output booth and a dial: ROUGH, COARSE, 1:1, FINE, VERY FINE. What goes in comes out "refined" — not always for the better.',
    perk: 'Refine keycards and weapons. Fine settings upgrade them. Usually.',
  }),
  // ---- Euclid ---------------------------------------------------------------
  '294': S({
    id: '294', name: 'SCP-294', nick: 'The Coffee Machine', cls: 'Euclid', sector: 'Light Containment',
    price: 1800, income: 30, decay: 0, risk: 0,
    desc: 'A drink vending machine with a keyboard. It will dispense a cup of anything you type that is a liquid — tasty, useful, or lethal.',
    perk: 'A random drink every 30 s. Most are good for you.',
  }),
  '151': S({
    id: '151', name: 'SCP-151', nick: 'The Painting', cls: 'Euclid', sector: 'Heavy Containment',
    price: 2200, income: 38, decay: 2, risk: 0,
    desc: 'An oil painting of a wave, seen from below the surface. Looking at it begins drowning the viewer from the inside. It is kept covered with a cloth.',
    perk: 'Never breaches — but when integrity drops, the cloth slips.',
  }),
  '079': S({
    id: '079', name: 'SCP-079', nick: 'Old AI', cls: 'Euclid', sector: 'Heavy Containment',
    price: 3000, income: 55, decay: 4, risk: 3,
    desc: 'A sentient 1978 microcomputer, hostile and contemptuous. Kept off every network. If it gets onto one, it takes the site\'s doors and lights for itself.',
    perk: 'Breach: doors lock and open on their own. Isolate it at three network terminals.',
  }),
  '012': S({
    id: '012', name: 'SCP-012', nick: 'A Bad Composition', cls: 'Euclid', sector: 'Heavy Containment',
    price: 3200, income: 60, decay: 4, risk: 3,
    desc: 'An unfinished piece of sheet music. Anyone who looks at it is compelled to finish it — in their own blood. Close your eyes to break the pull.',
    perk: 'Breach: never look at it. Close the case with your eyes shut (hold Q).',
  }),
  '173': S({
    id: '173', name: 'SCP-173', nick: 'The Sculpture', cls: 'Euclid', sector: 'Heavy Containment',
    price: 3500, income: 75, decay: 7, risk: 5,
    desc: 'A concrete statue. It cannot move while it is being looked at. The moment nobody is watching it — you blink, you look away — it closes the distance and snaps your neck. It cannot pass through walls or doors.',
    perk: 'Huge research grants. Requires constant containment checks. Breaches are lethal.',
  }),
  '049': S({
    id: '049', name: 'SCP-049', nick: 'The Plague Doctor', cls: 'Euclid', sector: 'Heavy Containment',
    price: 4800, income: 95, decay: 5, risk: 5,
    desc: 'A humanoid in the garb of a medieval plague doctor. Polite and articulate — and convinced that it must cure "the Pestilence". Its touch kills; its cure raises the dead.',
    perk: 'Breach: its victims rise again. Shoot it to stagger it, then escort it home.',
  }),
  '096': S({
    id: '096', name: 'SCP-096', nick: 'The Shy Guy', cls: 'Euclid', sector: 'Heavy Containment',
    price: 6500, income: 130, decay: 5, risk: 6,
    desc: 'A pale, emaciated humanoid that sits curled up, face hidden. Anyone who sees its face — in person, on a camera feed or in a photograph — is hunted down and killed. Nothing stops it. Afterwards it sits down again, wherever it is.',
    perk: 'Recontainment means bagging its head from behind.',
    imageNote: 'PHOTOGRAPH: [REDACTED — VIEWING PROHIBITED]',
  }),
  // ---- Keter -------------------------------------------------------------------
  '939': S({
    id: '939', name: 'SCP-939', nick: 'With Many Voices', cls: 'Keter', sector: 'Keter Sector',
    price: 8000, income: 160, decay: 6, risk: 7,
    desc: 'Two eyeless, red-skinned predators. Blind, they hunt by sound — and they lure prey by imitating the voices of people they have killed.',
    perk: 'Breach: move quietly (crouch, walk). Gunfire draws them. Sedate both.',
  }),
  '106': S({
    id: '106', name: 'SCP-106', nick: 'The Old Man', cls: 'Keter', sector: 'Keter Sector',
    price: 10000, income: 200, decay: 7, risk: 8,
    desc: 'An elderly, rotting humanoid that walks through solid matter, leaving corrosion behind. Its prey is dragged into a "pocket dimension" of its own.',
    perk: 'Breach: walls do not stop it. Bullets slow it. Run the Recall Protocol.',
  }),
  '682': S({
    id: '682', name: 'SCP-682', nick: 'Hard-to-Destroy Reptile', cls: 'Keter', sector: 'Keter Sector',
    price: 14000, income: 260, decay: 8, risk: 9,
    desc: 'A huge, reptile-like creature of extreme hostility that adapts to and survives anything. Kept submerged in a tank of acid. It hates all life.',
    perk: 'Breach: tears through doors. Cannot be killed — only knocked down for 45 s.',
  }),
};

export const CATALOG_ORDER = ['529', '500', '330', '207', '131', '999', '005', '914', '294', '151', '079', '012', '173', '049', '096', '939', '106', '682'];

export const BLACK_MARKET_MARKUP = 1.15;

export const CLASS_COLOR = { Safe: '#7fbf7f', Euclid: '#e2b84a', Keter: '#ff5a40' };
