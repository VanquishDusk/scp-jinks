// Persistent user settings (stored per-browser in localStorage when available).

const STORAGE_KEY = 'scp-jinks.settings.v1';

export const SETTING_DEFS = [
  {
    key: 'resolution',
    label: 'Render Resolution',
    options: [
      { value: 240, label: '240p (Crunchy)' },
      { value: 270, label: '270p' },
      { value: 360, label: '360p (Default)' },
      { value: 480, label: '480p (PS2)' },
      { value: 720, label: '720p (Clean)' },
    ],
  },
  { key: 'fov', label: 'Field of View', min: 60, max: 100, step: 5, format: (v) => `${v}°` },
  { key: 'mouseSens', label: 'Mouse Sensitivity', min: 0.2, max: 3, step: 0.1, format: (v) => v.toFixed(1) },
  { key: 'padSens', label: 'Gamepad Look Speed', min: 0.2, max: 3, step: 0.1, format: (v) => v.toFixed(1) },
  { key: 'invertY', label: 'Invert Look Y', bool: true },
  { key: 'headBob', label: 'Head Bob', bool: true },
  { key: 'crouchToggle', label: 'Crouch Mode', bool: true, labels: ['Hold', 'Toggle'] },
  { key: 'dither', label: 'Retro Dithering', bool: true },
  { key: 'scanlines', label: 'CRT Scanlines', bool: true },
  {
    key: 'drawDistance',
    label: 'Fog Distance',
    options: [
      { value: 22, label: 'Near (Moody)' },
      { value: 34, label: 'Medium' },
      { value: 50, label: 'Far' },
    ],
  },
  { key: 'showFps', label: 'Show FPS', bool: true },
];

const DEFAULTS = {
  resolution: 360,
  fov: 75,
  mouseSens: 1.0,
  padSens: 1.0,
  invertY: false,
  headBob: true,
  crouchToggle: false,
  dither: true,
  scanlines: true,
  drawDistance: 34,
  showFps: false,
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.listeners = new Set();
    this.load();
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    this.values[key] = value;
    this.save();
    for (const fn of this.listeners) fn(key, value);
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  /** Step a setting forwards/backwards (used by menus for keyboard/gamepad). */
  step(key, dir) {
    const def = SETTING_DEFS.find((d) => d.key === key);
    if (!def) return;
    const cur = this.values[key];
    if (def.bool) {
      this.set(key, !cur);
    } else if (def.options) {
      const idx = def.options.findIndex((o) => o.value === cur);
      const n = def.options.length;
      const next = ((idx < 0 ? 0 : idx) + dir + n) % n;
      this.set(key, def.options[next].value);
    } else {
      let v = cur + dir * def.step;
      if (v > def.max + 1e-6) v = def.min;
      if (v < def.min - 1e-6) v = def.max;
      v = Math.round(v / def.step) * def.step;
      this.set(key, Number(v.toFixed(3)));
    }
  }

  display(key) {
    const def = SETTING_DEFS.find((d) => d.key === key);
    const v = this.values[key];
    if (def.bool) return (def.labels || ['Off', 'On'])[v ? 1 : 0];
    if (def.options) return (def.options.find((o) => o.value === v) || def.options[0]).label;
    return def.format ? def.format(v) : String(v);
  }

  reset() {
    for (const k of Object.keys(DEFAULTS)) this.set(k, DEFAULTS[k]);
  }

  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const k of Object.keys(DEFAULTS)) {
        if (typeof data[k] === typeof DEFAULTS[k]) this.values[k] = data[k];
      }
    } catch {
      /* storage unavailable: keep defaults */
    }
  }

  save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      /* storage unavailable: settings last for this session only */
    }
  }
}
