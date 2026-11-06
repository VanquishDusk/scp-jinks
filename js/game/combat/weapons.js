// Weapon definitions and their voxel models (used both for the first-person
// view and for weapons lying on the floor).

export const WEAPONS = {
  fists: { id: 'fists', name: 'Fists', kind: 'melee', damage: 9, range: 1.5, cooldown: 0.42, stun: 0.5, slot: 1 },
  pipe: { id: 'pipe', name: 'Lead Pipe', kind: 'melee', damage: 24, range: 1.75, cooldown: 0.62, stun: 1.0, slot: 1 },
  baton: { id: 'baton', name: 'Baton', kind: 'melee', damage: 20, range: 1.75, cooldown: 0.5, stun: 1.6, subdue: true, slot: 1 },
  pistol: { id: 'pistol', name: 'Sidearm', kind: 'ranged', damage: 24, mag: 12, reserve: 36, rate: 0.2, spread: 0.012, auto: false, reload: 1.4, range: 60, slot: 2 },
  rifle: { id: 'rifle', name: 'Rifle', kind: 'ranged', damage: 19, mag: 30, reserve: 60, rate: 0.095, spread: 0.022, auto: true, reload: 2.0, range: 80, slot: 3 },
};

const METAL = 0x2c2e33;
const METAL2 = 0x45484f;
const GRIP = 0x2a2522;
const RUST = 0x7a5a42;

/** Boxes in 1/16 m units; barrel points to -Z, origin at the grip. */
export function weaponBoxes(id) {
  switch (id) {
    case 'pistol':
      return [
        [-0.7, -3.4, -0.4, 0.7, 0, 1.2, GRIP], // grip
        [-0.75, 0, -4.4, 0.75, 1.3, 1.4, METAL], // slide
        [-0.45, 0.2, -4.9, 0.45, 0.9, -4.4, METAL2], // muzzle
        [-0.2, 1.3, -4.2, 0.2, 1.6, -3.8, METAL2], // front sight
        [-0.6, -0.9, -1.6, 0.6, -0.2, -0.3, METAL], // trigger guard
      ];
    case 'rifle':
      return [
        [-0.9, -0.5, -9, 0.9, 1.6, 3, METAL], // receiver + handguard
        [-0.5, 0.2, -13, 0.5, 1, -9, METAL2], // barrel
        [-0.8, -3.6, -2.5, 0.8, -0.5, -0.8, METAL2], // magazine
        [-0.7, -3, 1, 0.7, -0.5, 2.4, GRIP], // pistol grip
        [-0.8, -1.2, 3, 0.8, 1.2, 8, GRIP], // stock
        [-0.4, 1.6, -2, 0.4, 2.5, 0.5, METAL2], // sight
      ];
    case 'baton':
      return [
        [-0.55, -2.5, -0.55, 0.55, 1.2, 0.55, GRIP], // handle
        [-0.45, 1.2, -0.45, 0.45, 12, 0.45, 0x16171a], // shaft
        [-1.2, 0.6, -0.4, 1.2, 1.1, 0.4, GRIP], // side handle
      ];
    case 'pipe':
      return [
        [-0.6, -2, -0.6, 0.6, 12.5, 0.6, RUST],
        [-0.8, 11.5, -0.8, 0.8, 13, 0.8, 0x5a4232],
        [-0.8, -2.5, -0.8, 0.8, -1, 0.8, 0x5a4232],
      ];
    default:
      return [];
  }
}

/** Hands/sleeves for the first-person view. */
export function handBoxes(sleeve, skin) {
  return {
    right: [
      [-1.4, -1.4, -1.6, 1.4, 1.4, 1.6, skin], // fist
      [-1.6, -1.6, 1.6, 1.6, 1.6, 5.5, sleeve], // forearm sleeve
    ],
    left: [
      [-1.4, -1.4, -1.6, 1.4, 1.4, 1.6, skin],
      [-1.6, -1.6, 1.6, 1.6, 1.6, 5.5, sleeve],
    ],
  };
}
