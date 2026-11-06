// The SCP procurement catalog. The more dangerous an SCP, the more it costs,
// the more research grant money it earns Security every minute it stays
// contained — and the faster its containment integrity decays, raising the
// odds of a breach.
//
//   price       Credits (Class-D black-market buyers pay a markup)
//   income      Credits per minute paid to Security while contained
//   decay       containment integrity lost per minute
//   risk        weight added to the chance of a containment breach event

export const CATALOG = {
  '500': {
    id: '500',
    name: 'SCP-500',
    nick: 'Panacea',
    cls: 'Safe',
    price: 600,
    income: 6,
    decay: 0,
    risk: 0,
    desc: 'A container of red pills that cure any disease or injury. Low yield, zero risk.',
    perk: 'Containment terminal dispenses one pill per shift: a full heal.',
  },
  '999': {
    id: '999',
    name: 'SCP-999',
    nick: 'The Tickle Monster',
    cls: 'Safe',
    price: 1400,
    income: 14,
    decay: 3,
    risk: 1,
    desc: 'A friendly orange gelatinous mass. If it gets out, it wanders the halls and heals anyone it hugs.',
    perk: 'A breach is harmless — but the grid still fails open.',
  },
  '173': {
    id: '173',
    name: 'SCP-173',
    nick: 'The Sculpture',
    cls: 'Euclid',
    price: 3500,
    income: 48,
    decay: 7,
    risk: 5,
    desc: 'A concrete statue. It cannot move while it is being looked at. The moment nobody is watching it — you blink, you look away — it closes the distance and snaps your neck. It cannot pass through walls or doors.',
    perk: 'Huge research grants. Requires constant containment checks. Breaches are lethal.',
  },
};

export const CATALOG_ORDER = ['500', '999', '173'];

export const BLACK_MARKET_MARKUP = 1.25;

export const CLASS_COLOR = { Safe: '#7fbf7f', Euclid: '#e2b84a', Keter: '#ff5a40' };
