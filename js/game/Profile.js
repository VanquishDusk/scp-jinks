// Persistent player profile: lifetime Credits and shift statistics, stored in
// this browser's localStorage when available.

const KEY = 'scp-jinks.profile.v1';

export class Profile {
  constructor() {
    this.credits = 0;
    this.shifts = 0;
    this.escapes = 0;
    this.terminations = 0;
    this.load();
  }

  addCredits(n) {
    this.credits = Math.max(0, this.credits + n);
    this.save();
  }

  record(result) {
    this.shifts++;
    if (result === 'escaped') this.escapes++;
    if (result === 'terminated') this.terminations++;
    this.save();
  }

  load() {
    try {
      const d = JSON.parse(window.localStorage.getItem(KEY) || '{}');
      for (const k of ['credits', 'shifts', 'escapes', 'terminations']) if (typeof d[k] === 'number') this[k] = d[k];
    } catch {
      /* storage unavailable */
    }
  }

  save() {
    try {
      window.localStorage.setItem(
        KEY,
        JSON.stringify({ credits: this.credits, shifts: this.shifts, escapes: this.escapes, terminations: this.terminations }),
      );
    } catch {
      /* storage unavailable */
    }
  }
}
