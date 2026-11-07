// Entry point: boots the renderer, builds the facility and runs the state
// machine  loading → menu → briefing → playing ⇄ paused → result.

import * as THREE from 'three';
import { Settings } from './settings.js';
import { UI } from './ui/UI.js';
import { Profile } from './game/Profile.js';

window.__scpBooted = true;

const settings = new Settings();
const ui = new UI(settings);
const profile = new Profile();

const HINT_KBM = 'WASD move · Shift sprint · C crouch · E interact · Click attack · R reload · 1-4 weapons · Q blink · Esc pause';
const HINT_TOUCH = 'Left side: move (push to the edge to sprint) · Right side: look · USE to interact or talk · II to pause';
const HINT_PAD = 'L-stick move · LB sprint · B crouch · X interact · RT attack · RB reload · D-pad weapons · LT blink · Start pause';

async function boot() {
  ui.showLayer('loading');
  ui.setLoading(0.02, 'Initializing renderer');

  let RetroRenderer;
  let Input;
  let TouchControls;
  let Game;
  try {
    ({ RetroRenderer } = await import('./engine/RetroRenderer.js'));
    ({ Input } = await import('./engine/Input.js'));
    ({ TouchControls } = await import('./engine/TouchControls.js'));
    ({ Game } = await import('./game/Game.js'));
  } catch (err) {
    console.error(err);
    ui.showError(`Failed to load game modules.\n${err.message}\n\nIf you opened index.html directly from disk, serve the folder over HTTP instead (see README).`);
    return;
  }

  const canvas = document.getElementById('game');
  let renderer;
  try {
    renderer = new RetroRenderer(canvas);
  } catch (err) {
    console.error(err);
    ui.showError('WebGL is not available in this browser.\nTry a recent version of Chrome, Firefox, Edge or Safari with hardware acceleration enabled.');
    return;
  }
  const input = new Input(canvas);
  // Phones and tablets get on-screen controls (nothing changes on desktop).
  const touch = new TouchControls(input);
  const wantLock = () => !input.usingPad && !input.usingTouch;
  const game = new Game(renderer, settings, ui, profile);

  try {
    await game.load((p, text) => ui.setLoading(p, text));
  } catch (err) {
    console.error(err);
    ui.showError(`Facility generation failed.\n${err.message}`);
    return;
  }

  // ---- Settings ------------------------------------------------------------
  const applySettings = () => {
    renderer.setLines(settings.get('resolution'));
    renderer.setDither(settings.get('dither'));
    game.applySettings();
  };
  settings.onChange(applySettings);
  applySettings();

  // ---- State machine -------------------------------------------------------
  let state = 'menu';
  let pausedAt = 0;
  let hadLock = false;
  let lastRole = 'classd';
  let endTimer = 0;
  let pendingSummary = null;
  let trackerTimer = 0;
  let simSteps = 1; // debug-only fast-forward
  let shopMode = null;
  // The key that closes a menu (Esc) must not also count as a pause press.
  let suppressPauseUntil = 0;
  // While a terminal menu is open the world keeps running, but the player stands still.
  const idleInput = {
    move: () => ({ x: 0, y: 0 }),
    look: () => ({ x: 0, y: 0 }),
    jump: () => false,
    sprint: () => false,
    crouchHeld: () => false,
    crouchPressed: () => false,
    interact: () => false,
    interactHeld: () => false,
    pause: () => false,
    cycleTask: () => false,
    blinkHeld: () => false,
    attackPressed: () => false,
    attackHeld: () => false,
    reloadPressed: () => false,
    weaponSlot: () => 0,
    weaponCycle: () => 0,
  };
  const projected = new THREE.Vector3();
  const camSpace = new THREE.Vector3();
  const bubbleAt = new THREE.Vector3();
  const bubbleList = [];

  const goMenu = () => {
    state = 'menu';
    ui.setProfile(profile);
    input.exitLock();
    ui.showHud(false);
    ui.clearHudMessages();
    ui.setCapture(false);
    ui.showLayer('menu');
    ui.openScreen('title', true);
    renderer.setDesaturate(0);
    game.startMenuCamera();
  };

  const startBriefing = (roleId) => {
    state = 'briefing';
    lastRole = roleId;
    ui.clearHudMessages();
    game.newGame(roleId);
    renderer.setFade(1);
    renderer.setDesaturate(0.6);
    ui.setBadge(game.role, game.designation);
    ui.showBriefing(game.role, game.designation);
  };

  const begin = () => {
    state = 'playing';
    hadLock = false;
    ui.showLayer('none');
    ui.showHud(true);
    ui.clearHudMessages();
    renderer.setDesaturate(0);
    ui.setFade(true);
    requestAnimationFrame(() => ui.setFade(false));
    ui.showHint(input.usingTouch ? HINT_TOUCH : input.usingPad ? HINT_PAD : HINT_KBM, 12);
    // Full screen and landscape on phones (needs this tap to be allowed).
    if (input.usingTouch && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    }
    input.keysPressed.clear();
    if (wantLock()) input.requestLock();
    game.startShift();
  };

  const pause = () => {
    if (state !== 'playing') return;
    state = 'paused';
    pausedAt = performance.now();
    input.exitLock();
    ui.setCapture(false);
    ui.setPrompt(null);
    ui.showHud(false);
    ui.showLayer('menu');
    ui.openScreen('pause', true);
    renderer.setDesaturate(0.35);
  };

  const resume = () => {
    if (state !== 'paused') return;
    state = 'playing';
    ui.showLayer('none');
    ui.showHud(true);
    renderer.setDesaturate(0);
    input.keysPressed.clear();
    suppressPauseUntil = performance.now() + 250;
    if (wantLock()) input.requestLock();
  };

  ui.on('role', startBriefing);
  ui.on('begin', begin);
  ui.on('briefing-back', () => {
    state = 'menu';
    renderer.setDesaturate(0);
    ui.showLayer('menu');
    ui.openScreen('title', true);
    ui.openScreen('roles');
    game.startMenuCamera();
  });
  ui.on('resume', resume);
  ui.on('quit', goMenu);
  ui.on('new-shift', () => startBriefing(lastRole));

  // ---- SCP procurement / black market ----------------------------------------
  const closeShop = () => {
    if (state !== 'shop') return;
    state = 'playing';
    shopMode = null;
    ui.showLayer('none');
    ui.showHud(true);
    input.keysPressed.clear();
    suppressPauseUntil = performance.now() + 250;
    if (wantLock()) input.requestLock();
  };
  game.onOpenShop = (mode) => {
    if (state !== 'playing') return;
    state = 'shop';
    shopMode = mode;
    input.exitLock();
    ui.setPrompt(null);
    ui.setHold(0);
    ui.showHud(false);
    ui.openShop(mode, game.scps.listing(mode), profile.credits);
  };
  ui.on('buy', (id) => {
    if (state !== 'shop') return;
    const r = game.scps.buy(id, shopMode);
    ui.openShop(shopMode, game.scps.listing(shopMode), profile.credits, true, r.message);
  });
  ui.on('close-shop', closeShop);

  // ---- Talking to people -------------------------------------------------------
  // The world keeps running while you talk; you just stand still.
  const closeTalk = () => {
    if (state !== 'talk') return;
    state = 'playing';
    ui.showLayer('none');
    ui.showHud(true);
    input.keysPressed.clear();
    suppressPauseUntil = performance.now() + 250;
    if (wantLock()) input.requestLock();
  };
  game.onTalk = (view) => {
    if (state === 'playing') {
      state = 'talk';
      input.exitLock();
      ui.setPrompt(null);
      ui.setHold(0);
      ui.setMarker(null);
      ui.setCapture(false);
      ui.showHud(false);
    }
    if (state === 'talk') ui.openTalk(view);
  };
  game.onTalkEnd = closeTalk;
  ui.on('talk', (i) => {
    if (state === 'talk') game.life.talk.choose(i);
  });
  ui.on('close-talk', () => {
    if (state === 'talk') game.life.talk.close();
  });

  /** Speech bubbles over the heads of people near the camera. */
  const updateBubbles = () => {
    bubbleList.length = 0;
    const life = game.life;
    if (life && life.people.length) {
      const cam = game.camera;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const c = cam.position;
      const add = (pos, text, scp) => {
        const d = Math.hypot(pos.x - c.x, pos.z - c.z);
        if (d > 15) return;
        camSpace.copy(pos).applyMatrix4(cam.matrixWorldInverse);
        if (camSpace.z > -0.3) return;
        if (!game.world.visible(c.x / 0.5, c.y / 0.5, c.z / 0.5, pos.x / 0.5, pos.y / 0.5, pos.z / 0.5)) return;
        projected.copy(pos).project(cam);
        const x = (projected.x * 0.5 + 0.5) * w;
        const y = (-projected.y * 0.5 + 0.5) * h;
        if (x < -100 || x > w + 100 || y < -40 || y > h + 60) return;
        bubbleList.push({ x, y, text, scp, d, scale: Math.max(0.62, Math.min(1.1, 1.25 - d / 16)), alpha: Math.max(0.25, Math.min(1, 1.5 - d / 12)) });
      };
      for (const { n } of life.bubbles(8)) {
        if (n.talking && state === 'talk') continue;
        add(n.headTop(bubbleAt), n.bubble.text, false);
      }
      for (const b of life.experiments.extra) add(b.pos, b.text, true);
      bubbleList.sort((a, b) => a.d - b.d);
      if (bubbleList.length > 7) bubbleList.length = 7;
    }
    ui.setBubbles(bubbleList);
  };

  // Shift over (escaped, completed or terminated): let the moment land, then
  // show the summary screen.
  game.onShiftEnd = (summary) => {
    if (state === 'shop') {
      ui.showLayer('none');
      ui.showHud(true);
    }
    pendingSummary = summary;
    endTimer = summary.result === 'terminated' ? 3.2 : 2.5;
    state = 'ending';
    ui.setPrompt(null);
    ui.setMarker(null);
    ui.setHold(0);
  };

  /** Project the objective target onto the screen, clamped to the edges. */
  const updateMarker = () => {
    const t = settings.get('objectiveMarker') ? game.tasks.markerTarget() : null;
    if (!t) {
      ui.setMarker(null);
      return;
    }
    const cam = game.camera;
    camSpace.set(t.x, t.y, t.z).applyMatrix4(cam.matrixWorldInverse);
    projected.set(t.x, t.y, t.z).project(cam);
    const w = window.innerWidth;
    const h = window.innerHeight;
    let x = (projected.x * 0.5 + 0.5) * w;
    let y = (-projected.y * 0.5 + 0.5) * h;
    const behind = camSpace.z > 0;
    const margin = 40;
    let edge = behind || x < margin || x > w - margin || y < margin || y > h - margin;
    if (behind) {
      x = w - x;
      y = h - margin;
    }
    if (edge) {
      x = Math.max(margin, Math.min(w - margin, x));
      y = Math.max(margin + 90, Math.min(h - margin, y));
    }
    const p = game.player.pos;
    const emergency = t.kind === 'emergency';
    ui.setMarker({ x, y, dist: Math.hypot(t.x - p.x, t.z - p.z), edge, emergency });
  };
  // Ignore the Esc that just released the mouse so it doesn't instantly resume.
  ui.on('can-back', () => !(state === 'paused' && performance.now() - pausedAt < 700));

  input.onLockChange = (locked) => {
    if (locked) {
      hadLock = true;
      ui.setCapture(false);
    } else if (state === 'playing' && hadLock) {
      pause();
    }
  };

  canvas.addEventListener('click', () => {
    if (state === 'playing' && wantLock() && !input.locked) input.requestLock();
  });

  window.addEventListener('gamepadconnected', () => ui.updatePadStatus(true));
  window.addEventListener('gamepaddisconnected', () => ui.updatePadStatus());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  goMenu();

  // Debug hooks for testing, only enabled with ?debug in the URL.
  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__debug = () => ({
      state,
      pos: game.player.pos.toArray().map((v) => +v.toFixed(2)),
      zone: game.zone,
      target: game.interactTarget ? game.interactTarget.name : null,
      stamina: +game.player.stamina.toFixed(2),
      locked: input.locked,
    });
    // Teleport in voxel coordinates: __tp(x, z, yawDeg, pitchDeg)
    window.__tp = (x, z, yawDeg = 0, pitchDeg = 0) => {
      const p = game.player;
      p.pos.set(x * 0.5, 0.5 + 0.001, z * 0.5);
      p.vel.set(0, 0, 0);
      p.yaw = (yawDeg * Math.PI) / 180;
      p.pitch = (pitchDeg * Math.PI) / 180;
    };
    window.__game = game;
    window.__input = input;
    window.__breach = (origin) => game.director && game.director.breach(origin);
    window.__objective = () => game.tasks.view();
    window.__event = (type, origin) => game.events.start(type, { origin, scp: origin });
    window.__clock = (sec) => {
      game.director.clock = sec;
    };
    window.__credits = (n) => {
      profile.addCredits(n);
      ui.setCredits(profile.credits, n);
    };
    // Instantly own and install an SCP (testing).
    window.__giveScp = (id) => {
      if (profile.owns(id)) return false;
      profile.addScp(id);
      const e = game.scps.spawn(id);
      if (!e) return false;
      game.scps.integrity.set(id, 100);
      game.scps.commission(e.chamber, e);
      return true;
    };
    window.__resetScps = () => {
      profile.scps = [];
      profile.save();
    };
    window.__speed = (n) => {
      simSteps = Math.max(1, Math.min(16, n | 0));
    };
  }

  // ---- Main loop -----------------------------------------------------------
  let last = performance.now();
  let fpsFrames = 0;
  let fpsTime = 0;

  const frame = (now) => {
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.05, Math.max(0, rawDt));
    input.poll();

    if (state === 'menu') {
      game.updateMenu(dt);
      const dir = input.padMenuDir();
      if (dir) ui.nav(dir);
      if (input.padConfirm()) ui.activate();
      if (input.padBack()) ui.back();
    } else if (state === 'briefing') {
      game.player.updateCamera(dt, false);
      if (input.padConfirm()) ui.briefingConfirm();
      if (input.padBack()) ui.back();
    } else if (state === 'playing') {
      renderer.setFade(1);
      if (input.pause() && performance.now() > suppressPauseUntil) {
        pause();
      } else {
        if (input.cycleTask()) game.tasks.cycleFocus();
        for (let i = 0; i < simSteps; i++) {
          if (i > 0) input.clearEdges();
          game.update(dt, input);
        }
        ui.setPrompt(game.interactTarget ? game.interactPrompt : null, input.usingTouch ? 'touch' : input.usingPad);
        touch.setUsable(!!game.interactTarget);
        ui.setHold(game.holdProgress || 0);
        ui.setStamina(game.player.stamina, game.player.exhausted);
        ui.setHealth(game.player.hp, game.player.maxHp);
        ui.setBlink(game.player.blinkActive, game.player.blink, game.player.eyesClosed);
        ui.setCapture(wantLock() && !input.locked);
        ui.setWeapon(game.combat.hud());
        trackerTimer -= dt;
        if (trackerTimer <= 0) {
          trackerTimer = 0.15;
          ui.setPager(game.tasks.view());
        }
        updateMarker();
      }
    } else if (state === 'talk') {
      game.update(dt, idleInput);
      ui.setCapture(false);
      const dir = input.padMenuDir();
      if (dir) ui.nav(dir);
      if (input.padConfirm()) ui.activate();
      if (input.padBack()) game.life.talk.close();
    } else if (state === 'shop') {
      game.update(dt, idleInput);
      const dir = input.padMenuDir();
      if (dir) ui.nav(dir);
      if (input.padConfirm()) ui.activate();
      if (input.padBack()) closeShop();
    } else if (state === 'ending') {
      ui.setBlink(false, 1, false);
      game.update(dt, input);
      ui.setHealth(game.player.hp, game.player.maxHp);
      endTimer -= dt;
      renderer.setDesaturate(Math.min(0.7, renderer.uniforms.uDesat.value + dt * 0.3));
      if (endTimer <= 0) {
        state = 'result';
        input.exitLock();
        ui.showHud(false);
        ui.clearHudMessages();
        ui.showResult(pendingSummary);
      }
    } else if (state === 'result') {
      const dir = input.padMenuDir();
      if (dir) ui.nav(dir);
      if (input.padConfirm()) ui.activate();
    } else if (state === 'paused') {
      const dir = input.padMenuDir();
      if (dir) ui.nav(dir);
      if (input.padConfirm()) ui.activate();
      if (input.padBack()) ui.back();
      if (input.padStart()) resume();
    }

    if (state === 'playing' || state === 'talk' || state === 'shop' || state === 'ending') updateBubbles();
    else if (bubbleList.length || state === 'menu') {
      bubbleList.length = 0;
      ui.setBubbles(bubbleList);
    }
    touch.setVisible(state === 'playing');
    ui.tick(dt);
    const showHands = state === 'playing' || state === 'paused' || state === 'shop' || state === 'ending';
    renderer.render(game.scene, game.camera, showHands ? game.combat.view.scene : null);

    fpsFrames++;
    fpsTime += rawDt;
    if (fpsTime >= 0.5) {
      ui.setFps(Math.round(fpsFrames / fpsTime));
      fpsFrames = 0;
      fpsTime = 0;
    }
    input.endFrame();
  };
  requestAnimationFrame(frame);
}

boot();
