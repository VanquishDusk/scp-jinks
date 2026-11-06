// Entry point: boots the renderer, builds the facility and runs the state
// machine  loading → menu → briefing → playing ⇄ paused.

import { Settings } from './settings.js';
import { UI } from './ui/UI.js';

window.__scpBooted = true;

const settings = new Settings();
const ui = new UI(settings);

const HINT_KBM = 'WASD move · Mouse look · Shift sprint · C crouch · Space jump · E use doors · Esc pause';
const HINT_PAD = 'L-stick move · R-stick look · LB sprint · B crouch · A jump · X use doors · Start pause';

async function boot() {
  ui.showLayer('loading');
  ui.setLoading(0.02, 'Initializing renderer');

  let RetroRenderer;
  let Input;
  let Game;
  try {
    ({ RetroRenderer } = await import('./engine/RetroRenderer.js'));
    ({ Input } = await import('./engine/Input.js'));
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
  const game = new Game(renderer, settings, ui);

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

  const goMenu = () => {
    state = 'menu';
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
    ui.showHint(input.usingPad ? HINT_PAD : HINT_KBM, 12);
    input.keysPressed.clear();
    if (!input.usingPad) input.requestLock();
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
    if (!input.usingPad) input.requestLock();
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
    if (state === 'playing' && !input.locked) input.requestLock();
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
      game.player.spawn(x * 0.5, 0.5 + 0.001, z * 0.5, (yawDeg * Math.PI) / 180);
      game.player.pitch = (pitchDeg * Math.PI) / 180;
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
      if (input.pause()) {
        pause();
      } else {
        game.update(dt, input);
        const target = game.interactTarget;
        ui.setPrompt(target ? target.promptText(game.role.clearance) : null, input.usingPad);
        ui.setStamina(game.player.stamina, game.player.exhausted);
        ui.setCapture(!input.locked && !input.usingPad);
      }
    } else if (state === 'paused') {
      const dir = input.padMenuDir();
      if (dir) ui.nav(dir);
      if (input.padConfirm()) ui.activate();
      if (input.padBack()) ui.back();
      if (input.padStart()) resume();
    }

    ui.tick(dt);
    renderer.render(game.scene, game.camera);

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
