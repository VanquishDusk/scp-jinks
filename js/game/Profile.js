// Persistent site profile: Credits, shift statistics and the containment
// roster (which SCPs the site owns and in which chamber), stored in this
// browser's localStorage. Both playable classes share the same site.

const KEY = 'scp-jinks.profile.v1';

export class Profile {
  constructor() {
    this.credits = 0;
    this.shifts = 0;
    this.escapes = 0;
    this.terminations = 0;
    this.scps = []; // [{ id, slot, integrity }]
    this.load();
  }

  addCredits(n) {
    this.credits = Math.max(0, Math.round(this.credits + n));
    this.save();
  }

  owns(id) {
    return this.scps.some((s) => s.id === id);
  }

  addScp(id, slot) {
    this.scps.push({ id, slot, integrity: 100 });
    this.save();
  }

  record(result) {
    this.shifts++;
    if (result === 'escaped') this.escapes++;
    if (result === 'terminated' || result === 'detained') this.terminations++;
    this.save();
  }

  load() {
    try {
      const d = JSON.parse(window.localStorage.getItem(KEY) || '{}');
      for (const k of ['credits', 'shifts', 'escapes', 'terminations']) if (typeof d[k] === 'number') this[k] = d[k];
      if (Array.isArray(d.scps)) this.scps = d.scps.filter((s) => s && typeof s.id === 'string' && typeof s.slot === 'number');
    } catch {
      /* storage unavailable */
    }
  }

  save() {
    try {
      window.localStorage.setItem(
        KEY,
        JSON.stringify({
          credits: this.credits,
          shifts: this.shifts,
          escapes: this.escapes,
          terminations: this.terminations,
          scps: this.scps,
        }),
      );
    } catch {
      /* storage unavailable */
    }
  }
}
