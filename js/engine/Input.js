// Unified input: keyboard, mouse (pointer lock), and standard-mapping gamepads.
//
// Gameplay code reads high-level actions (moveX, lookX, jump, interact...) so it
// does not care which device produced them.

const PAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

const DEADZONE = 0.18;

function deadzone(v) {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE));
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.keysPressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseClicked = false;
    this.mouseHeld = false;
    this.locked = false;
    this.lockFailed = false;
    this.lockLostAt = 0;
    this.onLockChange = null;

    this.pad = null;
    this.padButtons = [];
    this.padPrev = [];
    this.padAxes = [0, 0, 0, 0];
    this.padActiveAt = 0;
    this.menuRepeat = { dir: null, next: 0 };

    window.addEventListener('keydown', (e) => {
      // Keep the browser from scrolling or activating focused elements.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.keys.has(e.code)) this.keysPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseHeld = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.mouseHeld) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseClicked = true;
        this.mouseHeld = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseHeld = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.lockFailed = false;
      if (was && !this.locked) this.lockLostAt = performance.now();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
    });

    window.addEventListener('gamepadconnected', () => {
      this.padActiveAt = performance.now();
    });
  }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          this.lockFailed = true;
        });
      }
    } catch {
      this.lockFailed = true;
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Call once per frame before reading actions. */
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    this.pad = pad;
    this.padPrev = this.padButtons;
    if (pad) {
      this.padButtons = pad.buttons.map((b) => b.pressed || b.value > 0.5);
      this.padAxes = [
        deadzone(pad.axes[0] || 0),
        deadzone(pad.axes[1] || 0),
        deadzone(pad.axes[2] || 0),
        deadzone(pad.axes[3] || 0),
      ];
      if (this.padButtons.some(Boolean) || this.padAxes.some((a) => a !== 0)) {
        this.padActiveAt = performance.now();
      }
    } else {
      this.padButtons = [];
      this.padAxes = [0, 0, 0, 0];
    }
  }

  /** Call at the end of every frame. */
  endFrame() {
    this.keysPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseClicked = false;
  }

  key(code) {
    return this.keys.has(code);
  }

  keyPressed(code) {
    return this.keysPressed.has(code);
  }

  padDown(i) {
    return !!this.padButtons[i];
  }

  padPressed(i) {
    return !!this.padButtons[i] && !this.padPrev[i];
  }

  get usingPad() {
    return this.pad !== null && performance.now() - this.padActiveAt < 15000;
  }

  // ---- Gameplay actions ------------------------------------------------

  /** Movement vector: x = strafe right, y = forward. */
  move() {
    let x = 0;
    let y = 0;
    if (this.key('KeyW')) y += 1;
    if (this.key('KeyS')) y -= 1;
    if (this.key('KeyD')) x += 1;
    if (this.key('KeyA')) x -= 1;
    x += this.padAxes[0];
    y -= this.padAxes[1];
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Look delta in "mouse pixels"; arrow keys and right stick are rate based. */
  look(dt, mouseSens, padSens) {
    let x = this.mouseDX * mouseSens;
    let y = this.mouseDY * mouseSens;
    const keyRate = 900 * dt;
    if (this.key('ArrowLeft')) x -= keyRate;
    if (this.key('ArrowRight')) x += keyRate;
    if (this.key('ArrowUp')) y -= keyRate * 0.7;
    if (this.key('ArrowDown')) y += keyRate * 0.7;
    const rs = 1100 * dt * padSens;
    // Slight response curve for finer aiming on sticks.
    const cx = this.padAxes[2];
    const cy = this.padAxes[3];
    x += Math.sign(cx) * cx * cx * rs;
    y += Math.sign(cy) * cy * cy * rs * 0.75;
    return { x, y };
  }

  jump() {
    return this.keyPressed('Space') || this.padPressed(PAD.A);
  }

  sprint() {
    return this.key('ShiftLeft') || this.key('ShiftRight') || this.padDown(PAD.L3) || this.padDown(PAD.LB);
  }

  crouchHeld() {
    return this.key('KeyC') || this.padDown(PAD.B);
  }

  crouchPressed() {
    return this.keyPressed('KeyC') || this.padPressed(PAD.B);
  }

  interact() {
    return (
      this.keyPressed('KeyE') ||
      this.keyPressed('KeyF') ||
      (this.locked && this.mouseClicked) ||
      this.padPressed(PAD.X) ||
      this.padPressed(PAD.RB)
    );
  }

  pause() {
    return this.keyPressed('Escape') || this.keyPressed('KeyP') || this.padPressed(PAD.START);
  }

  // ---- Menu actions (gamepad only; keyboard is handled by the UI) -------

  /** Returns 'up' | 'down' | 'left' | 'right' | null with auto-repeat. */
  padMenuDir() {
    if (!this.pad) return null;
    let dir = null;
    if (this.padDown(PAD.UP) || this.padAxes[1] < -0.5) dir = 'up';
    else if (this.padDown(PAD.DOWN) || this.padAxes[1] > 0.5) dir = 'down';
    else if (this.padDown(PAD.LEFT) || this.padAxes[0] < -0.5) dir = 'left';
    else if (this.padDown(PAD.RIGHT) || this.padAxes[0] > 0.5) dir = 'right';
    const now = performance.now();
    if (dir === null) {
      this.menuRepeat.dir = null;
      return null;
    }
    if (dir !== this.menuRepeat.dir) {
      this.menuRepeat.dir = dir;
      this.menuRepeat.next = now + 380;
      return dir;
    }
    if (now >= this.menuRepeat.next) {
      this.menuRepeat.next = now + 110;
      return dir;
    }
    return null;
  }

  padConfirm() {
    return this.padPressed(PAD.A);
  }

  padBack() {
    return this.padPressed(PAD.B);
  }

  padStart() {
    return this.padPressed(PAD.START);
  }
}
