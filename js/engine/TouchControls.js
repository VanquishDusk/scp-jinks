// On-screen controls for phones and tablets.
//
// Only enabled on touch-first devices (no mouse). The left half of the screen
// is a floating joystick (push it all the way to sprint), the right half is
// drag-to-look, and buttons sit on the right edge. Everything feeds into Input
// as virtual buttons, so gameplay code does not know the difference.

const BUTTONS = [
  // id, label, css position class, hold-capable
  ['attack', 'FIRE', 'b-attack'],
  ['interact', 'USE', 'b-interact'],
  ['jump', 'JUMP', 'b-jump'],
  ['crouch', 'DUCK', 'b-crouch'],
  ['reload', 'RLD', 'b-reload'],
  ['blink', 'BLINK', 'b-blink'],
  ['weapon', 'WPN', 'b-weapon'],
  ['task', 'TASK', 'b-task'],
  ['pause', 'II', 'b-pause'],
];

const STICK_R = 56; // px: full deflection radius

/** Is this a phone or tablet (touch, no precise pointer)? */
export function isTouchDevice() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const fine = matchMedia('(any-pointer: fine)').matches;
  return coarse && !fine && navigator.maxTouchPoints > 0;
}

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.enabled = isTouchDevice();
    this.visible = false;
    this.held = new Set();
    this.pressed = new Set();
    this.move = { x: 0, y: 0 };
    this.lookDX = 0;
    this.lookDY = 0;
    this.stick = null; // { id, ox, oy }
    this.lookTouch = null; // { id, x, y }
    this.buttonTouches = new Map(); // touch id → button id
    input.touch = this;
    if (this.enabled) this.build();
  }

  build() {
    document.body.classList.add('touch');
    const root = document.createElement('div');
    root.id = 'touch';
    root.className = 'touch hidden';
    root.innerHTML = `
      <div class="t-look" data-zone="look"></div>
      <div class="t-move" data-zone="move"><div class="t-stick hidden"><div class="t-knob"></div></div></div>
      ${BUTTONS.map(([id, label, cls]) => `<div class="t-btn ${cls}" data-btn="${id}">${label}</div>`).join('')}`;
    document.body.appendChild(root);
    this.root = root;
    this.stickEl = root.querySelector('.t-stick');
    this.knobEl = root.querySelector('.t-knob');
    this.btnEls = Object.fromEntries([...root.querySelectorAll('.t-btn')].map((el) => [el.dataset.btn, el]));
    const opts = { passive: false };
    root.addEventListener('touchstart', (e) => this.onStart(e), opts);
    root.addEventListener('touchmove', (e) => this.onMove(e), opts);
    root.addEventListener('touchend', (e) => this.onEnd(e), opts);
    root.addEventListener('touchcancel', (e) => this.onEnd(e), opts);
  }

  /** Show the controls only while actually playing. */
  setVisible(on) {
    if (!this.enabled) return;
    on = !!on;
    if (on === this.visible) return;
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
    if (!on) this.releaseAll();
  }

  /** Highlight the USE button when there is something to use. */
  setUsable(on) {
    if (this.enabled) this.btnEls.interact.classList.toggle('ready', !!on);
  }

  releaseAll() {
    this.held.clear();
    this.buttonTouches.clear();
    this.stick = null;
    this.lookTouch = null;
    this.move.x = 0;
    this.move.y = 0;
    this.sprinting = false;
    this.stickEl.classList.add('hidden');
    for (const el of Object.values(this.btnEls)) el.classList.remove('down');
  }

  onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const target = document.elementFromPoint(t.clientX, t.clientY);
      const btn = target && target.closest('.t-btn');
      if (btn) {
        const id = btn.dataset.btn;
        this.buttonTouches.set(t.identifier, id);
        this.held.add(id);
        this.pressed.add(id);
        btn.classList.add('down');
        // Crouch is a toggle: nobody can hold a third thumb on the screen.
        if (id === 'crouch') {
          this.crouchOn = !this.crouchOn;
          btn.classList.toggle('on', this.crouchOn);
        }
        continue;
      }
      const zone = target && target.closest('[data-zone]');
      if (zone && zone.dataset.zone === 'move' && !this.stick) {
        this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY };
        this.stickEl.style.transform = `translate(${t.clientX}px, ${t.clientY}px)`;
        this.knobEl.style.transform = 'translate(0px, 0px)';
        this.stickEl.classList.remove('hidden');
      } else if (!this.lookTouch) {
        this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) {
        let dx = t.clientX - this.stick.ox;
        let dy = t.clientY - this.stick.oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_R) {
          dx = (dx / d) * STICK_R;
          dy = (dy / d) * STICK_R;
        }
        this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
        const dead = 0.12;
        const mx = dx / STICK_R;
        const my = -dy / STICK_R;
        const m = Math.hypot(mx, my);
        this.move.x = m < dead ? 0 : mx;
        this.move.y = m < dead ? 0 : my;
        this.sprinting = d > STICK_R * 0.96 && my > 0.6;
      } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
        this.lookDX += t.clientX - this.lookTouch.x;
        this.lookDY += t.clientY - this.lookTouch.y;
        this.lookTouch.x = t.clientX;
        this.lookTouch.y = t.clientY;
      }
    }
  }

  onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const id = this.buttonTouches.get(t.identifier);
      if (id) {
        this.buttonTouches.delete(t.identifier);
        if (![...this.buttonTouches.values()].includes(id)) {
          this.held.delete(id);
          this.btnEls[id].classList.remove('down');
        }
      }
      if (this.stick && t.identifier === this.stick.id) {
        this.stick = null;
        this.move.x = 0;
        this.move.y = 0;
        this.sprinting = false;
        this.stickEl.classList.add('hidden');
      }
      if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
    }
  }

  // ---- Read by Input ----------------------------------------------------------
  down(id) {
    return this.visible && this.held.has(id);
  }

  tapped(id) {
    return this.visible && this.pressed.has(id);
  }

  /** Drop one-shot presses and look deltas (end of frame / extra sim steps). */
  clearEdges() {
    this.pressed.clear();
    this.lookDX = 0;
    this.lookDY = 0;
  }
}
