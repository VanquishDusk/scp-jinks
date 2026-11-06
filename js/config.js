// Global constants shared by every module.

export const GAME_TITLE = 'SCP: JINKS';
export const GAME_SUBTITLE = 'Foundation Facility Simulation';
export const SITE_NAME = 'SITE-██';
export const VERSION = '0.2.0';

/** Size of one voxel in meters. All world-space values are in meters. */
export const VOXEL = 0.5;

/** Foundation clearance levels, indexed by level. */
export const CLEARANCE = [
  { level: 0, name: 'Level 0', label: 'For Official Use Only', color: '#7fae7f' },
  { level: 1, name: 'Level 1', label: 'Confidential', color: '#b9c46a' },
  { level: 2, name: 'Level 2', label: 'Restricted', color: '#e2b84a' },
  { level: 3, name: 'Level 3', label: 'Secret', color: '#e0823a' },
  { level: 4, name: 'Level 4', label: 'Top Secret', color: '#d8443a' },
  { level: 5, name: 'Level 5', label: 'Thaumiel', color: '#b03ad8' },
];

function rand4() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

/**
 * The two playable classes. `spawn` names a spawn point defined by the facility
 * layout; each class has its own shift director (see game/directors/).
 */
export const ROLES = {
  classd: {
    id: 'classd',
    name: 'Class-D Personnel',
    short: 'CLASS-D',
    clearance: 0,
    accent: '#e8772e',
    spawn: 'classd',
    assignment: 'D-Block, Cell Row',
    makeDesignation: () => `D-${rand4()}`,
    description:
      'Expendable test subjects. Report for testing, follow the scientists\' instructions, ' +
      'survive the experiments — and watch for a chance to escape when things go wrong.',
    access: 'D-Block only',
  },
  security: {
    id: 'security',
    name: 'Security Guard',
    short: 'SECURITY',
    clearance: 3,
    accent: '#d9c24a',
    spawn: 'security',
    assignment: 'Security Office, Checkpoint Alpha',
    makeDesignation: () => `SEC-${rand4()}`,
    description:
      'Patrol the facility, inspect checkpoints and protect key personnel. When ' +
      'containment fails, you respond, evacuate staff and restore security systems.',
    access: 'Most of the facility',
  },
};

export const ROLE_ORDER = ['classd', 'security'];
