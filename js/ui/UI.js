// DOM user interface: loading screen, menus (keyboard / mouse / gamepad
// navigation), role select, settings, briefing terminal and the in-game HUD.

import { SETTING_DEFS } from '../settings.js';
import { ROLES, ROLE_ORDER, CLEARANCE, GAME_TITLE, GAME_SUBTITLE, VERSION, SITE_NAME } from '../config.js';

const $ = (id) => document.getElementById(id);
const STAMINA_SEGMENTS = 20;

export class UI {
  constructor(settings) {
    this.settings = settings;
    this.handlers = {};
    this.stack = [];
    this.focusIndex = 0;
    this.layer = 'loading';
    this.toastTimer = 0;
    this.zoneTimer = 0;
    this.hintTimer = 0;
    this.briefingTimers = [];
    this.briefingReady = false;

    this.el = {
      loading: $('loading'),
      loadingBar: $('loading-bar'),
      loadingText: $('loading-text'),
      loadingError: $('loading-error'),
      menu: $('menu'),
      briefing: $('briefing'),
      briefingLines: $('briefing-lines'),
      briefingGo: $('briefing-go'),
      hud: $('hud'),
      crosshair: $('crosshair'),
      prompt: $('prompt'),
      promptKey: $('prompt-key'),
      promptText: $('prompt-text'),
      promptSub: $('prompt-sub'),
      toast: $('toast'),
      zone: $('zone'),
      badge: $('badge'),
      badgeRole: $('badge-role'),
      badgeId: $('badge-id'),
      badgeClear: $('badge-clear'),
      stamina: $('stamina'),
      fps: $('fps'),
      hint: $('hint'),
      capture: $('capture'),
      crt: $('crt'),
      fade: $('fade'),
      padStatus: $('pad-status'),
      pauseInfo: $('pause-info'),
    };

    $('game-title').textContent = GAME_TITLE;
    $('game-subtitle').textContent = GAME_SUBTITLE;
    $('version').textContent = `v${VERSION} · foundation build`;
    const touchOnly = window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    if (touchOnly) $('touch-note').textContent = 'Touch controls are not supported yet: use a keyboard & mouse or a gamepad.';

    for (let i = 0; i < STAMINA_SEGMENTS; i++) this.el.stamina.appendChild(document.createElement('i'));
    this.staminaSegs = [...this.el.stamina.children];

    this.buildRoles();
    this.buildSettings();
    this.settings.onChange(() => this.refreshSettings());

    // Mouse: hover focuses, click activates.
    this.el.menu.addEventListener('mousemove', (e) => {
      const item = e.target.closest('.item');
      if (item && !item.classList.contains('focused')) this.focusElement(item);
    });
    this.el.menu.addEventListener('click', (e) => {
      const item = e.target.closest('.item');
      if (!item) return;
      this.focusElement(item);
      this.activate(item, 1);
    });
    this.el.menu.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const item = e.target.closest('.option');
      if (item) this.activate(item, -1);
    });
    this.el.briefing.addEventListener('click', () => this.briefingConfirm());

    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  on(evt, fn) {
    this.handlers[evt] = fn;
  }

  emit(evt, ...args) {
    if (this.handlers[evt]) this.handlers[evt](...args);
  }

  // ---------------------------------------------------------------------------
  // Layers & screens
  // ---------------------------------------------------------------------------
  showLayer(name) {
    this.layer = name;
    this.el.loading.classList.toggle('hidden', name !== 'loading');
    this.el.menu.classList.toggle('hidden', name !== 'menu');
    this.el.briefing.classList.toggle('hidden', name !== 'briefing');
  }

  setLoading(p, text) {
    this.el.loadingBar.style.width = `${Math.round(p * 100)}%`;
    if (text) this.el.loadingText.textContent = `${text}…`;
  }

  showError(message) {
    this.showLayer('loading');
    this.el.loadingText.textContent = 'TERMINAL FAILURE';
    this.el.loadingError.textContent = message;
  }

  /** Open a menu screen. `reset` clears the navigation stack first. */
  openScreen(name, reset = false) {
    if (reset) this.stack = [];
    this.stack.push(name);
    this.renderScreen();
  }

  renderScreen() {
    const name = this.stack[this.stack.length - 1];
    for (const s of this.el.menu.querySelectorAll('.screen')) {
      s.classList.toggle('active', s.dataset.screen === name);
    }
    this.el.menu.classList.toggle('paused', this.stack[0] === 'pause');
    if (name === 'title') this.updatePadStatus();
    const items = this.items();
    // Default focus: first role card the player has not seen, else first item.
    this.focusIndex = 0;
    if (name === 'roles') this.focusIndex = Math.max(0, items.findIndex((i) => i.dataset.role === this.lastRole));
    this.applyFocus();
  }

  get currentScreen() {
    return this.stack[this.stack.length - 1];
  }

  activeScreenEl() {
    return this.el.menu.querySelector(`.screen[data-screen="${this.currentScreen}"]`);
  }

  items() {
    const s = this.activeScreenEl();
    return s ? [...s.querySelectorAll('.item')] : [];
  }

  applyFocus() {
    const items = this.items();
    items.forEach((it, i) => it.classList.toggle('focused', i === this.focusIndex));
    const f = items[this.focusIndex];
    if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
  }

  focusElement(el) {
    const idx = this.items().indexOf(el);
    if (idx >= 0) {
      this.focusIndex = idx;
      this.applyFocus();
    }
  }

  back() {
    if (this.layer === 'briefing') {
      this.emit('briefing-back');
      return;
    }
    if (this.stack.length > 1) {
      this.stack.pop();
      this.renderScreen();
    } else if (this.currentScreen === 'pause') {
      this.emit('resume');
    }
  }

  /** Directional navigation from keyboard or gamepad. */
  nav(dir) {
    if (this.layer !== 'menu') return;
    const items = this.items();
    if (!items.length) return;
    const cur = items[this.focusIndex];
    if ((dir === 'left' || dir === 'right') && cur && cur.classList.contains('option')) {
      this.activate(cur, dir === 'left' ? -1 : 1);
      return;
    }
    const delta = dir === 'up' || dir === 'left' ? -1 : 1;
    this.focusIndex = (this.focusIndex + delta + items.length) % items.length;
    this.applyFocus();
  }

  activate(item = this.items()[this.focusIndex], dir = 1) {
    if (!item) return;
    if (item.dataset.setting) {
      this.settings.step(item.dataset.setting, dir);
      return;
    }
    if (item.dataset.role) {
      this.lastRole = item.dataset.role;
      this.emit('role', item.dataset.role);
      return;
    }
    switch (item.dataset.action) {
      case 'start':
        this.openScreen('roles');
        break;
      case 'settings':
      case 'controls':
      case 'about':
        this.openScreen(item.dataset.action);
        break;
      case 'back':
        this.back();
        break;
      case 'reset-settings':
        this.settings.reset();
        break;
      case 'resume':
        this.emit('resume');
        break;
      case 'quit':
        this.emit('quit');
        break;
      default:
        break;
    }
  }

  onKey(e) {
    if (this.layer === 'briefing') {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') this.briefingConfirm();
      else if (e.code === 'Escape' || e.code === 'Backspace') this.back();
      return;
    }
    if (this.layer !== 'menu') return;
    if (e.repeat && (e.code === 'Enter' || e.code === 'Escape')) return;
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.nav('up');
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.nav('down');
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.nav('left');
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.nav('right');
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        e.preventDefault();
        this.activate();
        break;
      case 'Escape':
      case 'Backspace':
        if (this.handlers['can-back'] && !this.handlers['can-back']()) break;
        this.back();
        break;
      default:
        break;
    }
  }

  updatePadStatus(connected) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : [];
    const on = connected ?? pads.length > 0;
    this.el.padStatus.textContent = on ? '● GAMEPAD CONNECTED' : '';
  }

  // ---------------------------------------------------------------------------
  // Roles & settings
  // ---------------------------------------------------------------------------
  buildRoles() {
    const wrap = $('roles');
    for (const id of ROLE_ORDER) {
      const r = ROLES[id];
      const c = CLEARANCE[r.clearance];
      const card = document.createElement('div');
      card.className = 'item role';
      card.dataset.role = id;
      card.style.setProperty('--role-accent', r.accent);
      card.innerHTML = `
        <div class="role-name"></div>
        <div class="role-meta"></div>
        <div class="role-desc"></div>
        <div class="role-clear"></div>`;
      card.querySelector('.role-name').textContent = r.name;
      card.querySelector('.role-meta').textContent = `Access: ${r.access}`;
      card.querySelector('.role-desc').textContent = r.description;
      const clear = card.querySelector('.role-clear');
      clear.textContent = `${c.name} · ${c.label}`;
      clear.style.color = c.color;
      wrap.appendChild(card);
    }
    this.lastRole = ROLE_ORDER[0];
  }

  buildSettings() {
    const list = $('settings-list');
    for (const def of SETTING_DEFS) {
      const row = document.createElement('div');
      row.className = 'item option';
      row.dataset.setting = def.key;
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = def.label;
      const value = document.createElement('span');
      value.className = 'value';
      row.append(label, value);
      list.appendChild(row);
    }
    this.refreshSettings();
  }

  refreshSettings() {
    for (const row of document.querySelectorAll('[data-setting]')) {
      row.querySelector('.value').textContent = this.settings.display(row.dataset.setting);
    }
    this.el.crt.classList.toggle('off', !this.settings.get('scanlines'));
    this.el.fps.classList.toggle('hidden', !this.settings.get('showFps'));
  }

  // ---------------------------------------------------------------------------
  // Briefing
  // ---------------------------------------------------------------------------
  showBriefing(role, designation) {
    this.showLayer('briefing');
    for (const t of this.briefingTimers) clearTimeout(t);
    this.briefingTimers = [];
    this.briefingReady = false;
    this.el.briefingGo.classList.add('hidden');
    this.el.briefingLines.innerHTML = '';
    const c = CLEARANCE[role.clearance];
    const lines = [
      ['', '> AUTHENTICATING ......... OK'],
      ['PERSONNEL   ', role.name],
      ['DESIGNATION ', designation],
      ['CLEARANCE   ', `${c.name} — ${c.label}`],
      ['ASSIGNMENT  ', role.assignment],
      ['SITE        ', `${SITE_NAME} · Day shift, 06:00`],
      ['STATUS      ', 'All containment nominal. Report anomalies to Security.'],
    ];
    lines.forEach(([k, v], i) => {
      this.briefingTimers.push(
        setTimeout(() => {
          const div = document.createElement('div');
          div.className = 'bl';
          if (k) {
            const ks = document.createElement('span');
            ks.className = 'k';
            ks.textContent = `> ${k}`;
            div.append(ks, document.createTextNode(v));
          } else {
            div.textContent = v;
          }
          this.el.briefingLines.appendChild(div);
          if (i === lines.length - 1) this.finishBriefing();
        }, 220 + i * 260),
      );
    });
    this.briefingLineCount = lines.length;
    this.briefingAll = lines;
  }

  finishBriefing() {
    for (const t of this.briefingTimers) clearTimeout(t);
    this.briefingTimers = [];
    if (this.el.briefingLines.children.length < this.briefingLineCount) {
      this.el.briefingLines.innerHTML = '';
      for (const [k, v] of this.briefingAll) {
        const div = document.createElement('div');
        div.className = 'bl';
        if (k) {
          const ks = document.createElement('span');
          ks.className = 'k';
          ks.textContent = `> ${k}`;
          div.append(ks, document.createTextNode(v));
        } else div.textContent = v;
        this.el.briefingLines.appendChild(div);
      }
    }
    this.briefingReady = true;
    this.el.briefingGo.classList.remove('hidden');
  }

  briefingConfirm() {
    if (this.layer !== 'briefing') return;
    if (!this.briefingReady) {
      this.finishBriefing();
      return;
    }
    this.emit('begin');
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------
  showHud(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  setBadge(role, designation) {
    const c = CLEARANCE[role.clearance];
    this.el.badge.style.setProperty('--role-accent', role.accent);
    this.el.badgeRole.textContent = role.name;
    this.el.badgeId.textContent = designation;
    this.el.badgeClear.textContent = `Clearance: ${c.name}`;
    this.el.pauseInfo.textContent = `${role.name} · ${designation}`;
  }

  setPrompt(info, usingPad) {
    if (!info) {
      this.el.prompt.classList.add('hidden');
      this.el.crosshair.className = 'crosshair';
      return;
    }
    this.el.prompt.classList.remove('hidden');
    this.el.prompt.classList.toggle('denied', info.denied);
    this.el.promptKey.textContent = usingPad ? 'X' : 'E';
    this.el.promptText.textContent = info.text;
    this.el.promptSub.textContent = info.sub || '';
    this.el.crosshair.className = `crosshair active${info.denied ? ' denied' : ''}`;
  }

  toast(message, danger = false) {
    this.el.toast.textContent = message;
    this.el.toast.classList.toggle('danger', danger);
    this.el.toast.classList.add('show');
    this.toastTimer = 2.4;
  }

  showZone(name) {
    this.el.zone.innerHTML = '';
    const small = document.createElement('small');
    small.textContent = 'Entering';
    this.el.zone.append(small, document.createTextNode(name));
    this.el.zone.classList.add('show');
    this.zoneTimer = 3.2;
  }

  showHint(text, seconds = 10) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add('show');
    this.hintTimer = seconds;
  }

  setStamina(v, exhausted) {
    const lit = Math.ceil(v * STAMINA_SEGMENTS - 0.001);
    for (let i = 0; i < STAMINA_SEGMENTS; i++) this.staminaSegs[i].classList.toggle('off', i >= lit);
    this.el.stamina.classList.toggle('exhausted', exhausted);
  }

  setFps(n) {
    this.el.fps.textContent = `${n} FPS`;
  }

  setCapture(on) {
    this.el.capture.classList.toggle('hidden', !on);
  }

  setFade(on) {
    this.el.fade.classList.toggle('on', on);
  }

  clearHudMessages() {
    this.toastTimer = 0;
    this.zoneTimer = 0;
    this.el.toast.classList.remove('show');
    this.el.zone.classList.remove('show');
    this.setPrompt(null);
  }

  tick(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
    if (this.zoneTimer > 0) {
      this.zoneTimer -= dt;
      if (this.zoneTimer <= 0) this.el.zone.classList.remove('show');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.classList.remove('show');
    }
  }
}
