// DOM user interface: loading screen, menus (keyboard / mouse / gamepad
// navigation), role select, settings, briefing terminal and the in-game HUD.

import { SETTING_DEFS } from '../settings.js';
import { ROLES, ROLE_ORDER, CLEARANCE, GAME_TITLE, GAME_SUBTITLE, VERSION, SITE_NAME } from '../config.js';
import { CLASS_COLOR } from '../game/scp/catalog.js';

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
      hitmark: $('hitmark'),
      weaponName: $('weapon-name'),
      weaponAmmo: $('weapon-ammo'),
      weaponReload: $('weapon-reload'),
      weaponReloadFill: $('weapon-reload-fill'),
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
      credits: $('credits-value'),
      creditsDelta: $('credits-delta'),
      itemHeld: $('item-held'),
      tracker: $('tracker'),
      trKind: $('tr-kind'),
      trSwitch: $('tr-switch'),
      trList: $('tr-list'),
      standing: $('standing'),
      standingLabel: $('standing-label'),
      standingFill: $('standing-fill'),
      standingValue: $('standing-value'),
      clock: $('clock'),
      wanted: $('wanted'),
      hunted: $('hunted'),
      blinkMeter: $('blink-meter'),
      blink: $('blink'),
      blinkOverlay: $('blink-overlay'),
      shopTitle: $('shop-title'),
      shopSub: $('shop-sub'),
      shopList: $('shop-list'),
      shopFoot: $('shop-foot'),
      notify: $('notify'),
      banner: $('banner'),
      bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'),
      radio: $('radio'),
      radioTag: $('radio-tag'),
      radioSpeaker: $('radio-speaker'),
      radioText: $('radio-text'),
      marker: $('marker'),
      markerDist: $('marker-dist'),
      hold: $('hold'),
      holdFill: $('hold-fill'),
      damage: $('damage'),
      health: $('health'),
      profileCredits: $('profile-credits'),
      resultTitle: $('result-title'),
      resultSub: $('result-sub'),
      resultStats: $('result-stats'),
    };
    this.notes = [];
    this.radioTimer = 0;
    this.damageLevel = 0;
    this.creditsDeltaTimer = 0;
    this.trackerKey = '';
    for (let i = 0; i < STAMINA_SEGMENTS; i++) this.el.health.appendChild(document.createElement('i'));
    this.healthSegs = [...this.el.health.children];
    for (let i = 0; i < STAMINA_SEGMENTS; i++) this.el.blink.appendChild(document.createElement('i'));
    this.blinkSegs = [...this.el.blink.children];

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
    this.el.menu.classList.toggle('paused', this.stack[0] === 'pause' || this.stack[0] === 'shop');
    this.el.menu.classList.toggle('result', this.stack[0] === 'result');
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
    } else if (this.currentScreen === 'shop') {
      this.emit('close-shop');
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
    if (item.dataset.buy) {
      this.emit('buy', item.dataset.buy);
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
      case 'new-shift':
        this.emit('new-shift');
        break;
      case 'close-shop':
        this.emit('close-shop');
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
    this.radioTimer = 0;
    this.damageLevel = 0;
    this.el.toast.classList.remove('show');
    this.el.zone.classList.remove('show');
    this.el.radio.classList.remove('show');
    for (const n of this.notes) n.el.remove();
    this.notes = [];
    this.el.notify.innerHTML = '';
    this.banner(null);
    this.setMarker(null);
    this.setHold(0);
    this.trackerKey = '';
    this.clockKey = '';
    this.el.trList.innerHTML = '';
    this.setWanted(null);
    this.setBlink(false, 1, false);
    this.setHunted(null);
    this.setPrompt(null);
  }

  // ---------------------------------------------------------------------------
  // Objectives, credits, notifications, radio
  // ---------------------------------------------------------------------------
  setProfile(profile) {
    this.el.profileCredits.textContent = `Credits: ${profile.credits.toLocaleString()} CR · Shifts: ${profile.shifts}`;
  }

  setCredits(total, delta) {
    this.el.credits.textContent = total.toLocaleString();
    if (delta) {
      this.el.creditsDelta.textContent = `${delta > 0 ? '+' : ''}${delta}`;
      this.el.creditsDelta.classList.toggle('neg', delta < 0);
      this.el.creditsDelta.classList.add('show');
      this.creditsDeltaTimer = 2.2;
    }
  }

  /** Weapon readout: { name, ammo, reloading (0..1), hit }. */
  setWeapon(w) {
    const key = `${w.name}|${w.ammo}`;
    if (key !== this.weaponKey) {
      this.weaponKey = key;
      this.el.weaponName.textContent = w.name;
      this.el.weaponAmmo.textContent = w.ammo;
      this.el.weaponAmmo.classList.toggle('empty', /^0 /.test(w.ammo));
    }
    this.el.weaponReload.classList.toggle('hidden', !w.reloading);
    if (w.reloading) this.el.weaponReloadFill.style.width = `${Math.round(w.reloading * 100)}%`;
    this.el.hitmark.classList.toggle('on', !!w.hit);
  }

  setItem(text) {
    this.el.itemHeld.classList.toggle('hidden', !text);
    this.el.itemHeld.textContent = text || '';
  }

  /** Render the pager: every open task, focused one expanded. */
  setPager(tasks) {
    const key = JSON.stringify(tasks);
    if (key === this.trackerKey) return;
    this.trackerKey = key;
    const list = this.el.trList;
    list.innerHTML = '';
    this.el.trSwitch.style.visibility = tasks.length > 1 ? 'visible' : 'hidden';
    this.el.trKind.textContent = tasks.length ? `PAGER · ${tasks.length} OPEN` : 'PAGER';
    if (!tasks.length) {
      const d = document.createElement('div');
      d.className = 'tr-empty';
      d.textContent = 'No open tasks. Stay alert.';
      list.appendChild(d);
      return;
    }
    const kinds = { task: 'TASK', order: 'ORDER', emergency: 'EMERGENCY', opportunity: 'OPPORTUNITY' };
    for (const t of tasks) {
      const row = document.createElement('div');
      row.className = `task ${t.kind}${t.focused ? ' focused' : ''}`;
      const top = document.createElement('div');
      top.className = 't-top';
      const title = document.createElement('span');
      title.textContent = t.title;
      top.appendChild(title);
      if (t.timeLeft !== null) {
        const tm = document.createElement('span');
        tm.className = `t-time${t.timeLeft <= 20 ? ' urgent' : ''}`;
        tm.textContent = `${Math.floor(t.timeLeft / 60)}:${String(t.timeLeft % 60).padStart(2, '0')}`;
        top.appendChild(tm);
      }
      const kind = document.createElement('div');
      kind.className = 't-kind';
      kind.textContent = `${kinds[t.kind]}${t.giver ? ` · ${t.giver}` : ''}`;
      row.append(kind, top);
      if (t.focused) {
        const add = (cls, text) => {
          if (!text) return;
          const d = document.createElement('div');
          d.className = cls;
          d.textContent = text;
          row.appendChild(d);
        };
        add('t-cur', `▸ ${t.current}`);
        add('t-prog', t.progress);
        add('t-detail', t.detail);
      }
      list.appendChild(row);
    }
  }

  /** Render the SCP catalog. mode: 'security' | 'classd'. */
  openShop(mode, items, credits, keepFocus = false, notice = '') {
    const black = mode === 'classd';
    this.el.shopTitle.textContent = black ? 'Black Market' : 'SCP Procurement';
    this.el.shopSub.textContent = notice
      ? `${notice} · ${credits.toLocaleString()} CR left`
      : black
        ? `Forged transfer orders. ${credits.toLocaleString()} CR available. Markup applies.`
        : `Site acquisitions. ${credits.toLocaleString()} CR available.`;
    this.el.shopFoot.textContent = black
      ? 'More SCPs means more breaches — and every breach opens the doors. Close this before a guard walks in.'
      : 'Contained SCPs pay research grants every minute. Dangerous ones decay faster: schedule containment checks.';
    const list = this.el.shopList;
    list.innerHTML = '';
    const statusText = { owned: 'In containment', buy: 'Purchase', poor: 'Not enough credits' };
    for (const it of items) {
      const div = document.createElement('div');
      div.className = `item shop-item ${it.status}`;
      if (it.status === 'buy') div.dataset.buy = it.id;
      const risk = it.risk ? '■'.repeat(it.risk) + '□'.repeat(Math.max(0, 10 - it.risk)) : 'NEVER BREACHES';
      div.innerHTML = `
        <div class="s-name"></div><div class="s-nick"></div><div class="s-class"></div>
        <div class="s-stats">
          <span>Price</span><span class="s-price"></span>
          <span>Research grants</span><span class="s-income"></span>
          <span>Breach risk</span><span class="risk"></span>
          ${it.integrity !== null ? '<span>Integrity</span><span class="s-integ"></span>' : ''}
        </div>
        ${it.imageNote ? '<div class="s-photo"></div>' : ''}
        <div class="s-desc"></div><div class="s-perk"></div><div class="s-house"></div><div class="s-status"></div>`;
      if (it.imageNote) div.querySelector('.s-photo').textContent = it.imageNote;
      div.querySelector('.s-name').textContent = it.name;
      div.querySelector('.s-nick').textContent = `"${it.nick}"`;
      const cls = div.querySelector('.s-class');
      cls.textContent = `OBJECT CLASS: ${it.cls.toUpperCase()}`;
      cls.style.color = CLASS_COLOR[it.cls];
      div.querySelector('.s-price').textContent = `${it.price.toLocaleString()} CR`;
      div.querySelector('.s-income').textContent = `${it.income} CR / min`;
      div.querySelector('.risk').textContent = risk;
      if (it.integrity !== null) div.querySelector('.s-integ').textContent = `${it.integrity}%`;
      div.querySelector('.s-desc').textContent = it.desc;
      div.querySelector('.s-perk').textContent = it.perk;
      div.querySelector('.s-house').textContent = `Housing: ${it.housing || it.sector}`;
      div.querySelector('.s-status').textContent = statusText[it.status];
      list.appendChild(div);
    }
    const prev = this.focusIndex;
    this.showLayer('menu');
    this.stack = ['shop'];
    this.renderScreen();
    if (keepFocus) {
      this.focusIndex = Math.min(prev, this.items().length - 1);
      this.applyFocus();
    }
  }

  setBlink(visible, value, closed) {
    this.el.blinkMeter.classList.toggle('hidden', !visible);
    this.el.blinkOverlay.classList.toggle('closed', !!closed);
    if (!visible) return;
    const lit = Math.ceil(value * STAMINA_SEGMENTS - 0.001);
    for (let i = 0; i < STAMINA_SEGMENTS; i++) this.blinkSegs[i].classList.toggle('off', i >= lit);
    this.el.blink.classList.toggle('low', value < 0.3);
  }

  neckSnap() {
    const d = this.el.damage;
    d.classList.remove('snap');
    void d.offsetWidth;
    d.classList.add('snap');
    this.damageLevel = 1;
  }

  setStanding(label, value, delta) {
    this.el.standingLabel.textContent = label;
    this.el.standingFill.style.width = `${Math.max(0, Math.min(100, value))}%`;
    this.el.standingValue.textContent = Math.round(value);
    const el = this.el.standing;
    el.classList.toggle('low', value < 25);
    el.classList.toggle('mid', value >= 25 && value < 50);
    if (delta < 0) {
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
    }
  }

  setClock(t, length) {
    // 06:00 → 14:00 compressed into the shift length.
    const mins = 6 * 60 + Math.floor((t / length) * 8 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    const left = Math.max(0, Math.ceil(length - t));
    const txt = `${hh}:${mm}|${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (txt === this.clockKey) return;
    this.clockKey = txt;
    this.el.clock.innerHTML = `SITE TIME ${hh}:${mm}<span class="left">SHIFT ENDS IN ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>`;
  }

  setHunted(text) {
    if (text === this.huntedText) return;
    this.huntedText = text;
    this.el.hunted.classList.toggle('hidden', !text);
    this.el.hunted.textContent = text || '';
  }

  setWanted(state) {
    const el = this.el.wanted;
    el.classList.toggle('hidden', !state);
    if (!state) return;
    const text = { PURSUED: '! PURSUED — LOSE THEM !', 'UNDER FIRE': '! UNDER FIRE — GET OUT OF SIGHT !', HOSTILE: 'HOSTILE — SHOOT ON SIGHT' };
    el.textContent = text[state] || 'OUT OF BOUNDS';
    el.classList.toggle('pursued', state !== 'OUT OF BOUNDS');
  }

  /** Slide-in notification card. type sets the color scheme. */
  notify({ type = 'objective', title, text, sub, credits }) {
    const div = document.createElement('div');
    div.className = `note ${type}`;
    const add = (cls, t) => {
      if (!t) return;
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = t;
      div.appendChild(d);
    };
    add('n-title', title);
    add('n-text', text);
    add('n-sub', sub);
    if (credits) add('n-cr', `${credits > 0 ? '+' : ''}${credits} CR`);
    this.el.notify.appendChild(div);
    this.notes.push({ el: div, t: type === 'bonus' ? 3 : 4.5 });
    while (this.notes.length > 3) {
      const n = this.notes.shift();
      n.el.remove();
    }
  }

  radio(speaker, text, channel = 'voice', duration = 4) {
    const tags = { pa: 'INTERCOM', radio: 'RADIO', voice: '', thought: '' };
    const r = this.el.radio;
    r.className = `radio show ${channel}`;
    this.el.radioTag.textContent = tags[channel] || '';
    this.el.radioSpeaker.textContent = channel === 'thought' ? '' : speaker;
    this.el.radioText.textContent = channel === 'thought' ? `“${text}”` : text;
    this.radioTimer = duration;
  }

  /** Event banner: big and centered at first, then tucked under the badge. */
  banner(title, sub, style = 'red') {
    if (!title) {
      this.el.banner.classList.add('hidden');
      this.bannerTimer = 0;
      return;
    }
    this.el.banner.className = `banner ${style}`;
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.bannerTimer = 6;
  }

  /** m = { x, y, dist, edge, emergency } in CSS pixels, or null. */
  setMarker(m) {
    const el = this.el.marker;
    if (!m) {
      el.classList.add('hidden');
      return;
    }
    el.className = `marker${m.edge ? ' edge' : ''}${m.emergency ? ' emergency' : ''}`;
    el.style.left = `${m.x}px`;
    el.style.top = `${m.y}px`;
    this.el.markerDist.textContent = `${Math.round(m.dist)}m`;
  }

  setHold(p) {
    this.el.hold.classList.toggle('hidden', !(p > 0));
    this.el.holdFill.style.width = `${Math.min(100, p * 100)}%`;
  }

  setHealth(hp, max) {
    const lit = Math.ceil((hp / max) * STAMINA_SEGMENTS - 0.001);
    for (let i = 0; i < STAMINA_SEGMENTS; i++) this.healthSegs[i].classList.toggle('off', i >= lit);
    this.el.health.classList.toggle('low', hp / max < 0.35);
  }

  damageFlash(amount) {
    this.el.damage.classList.remove('pulse');
    this.damageLevel = Math.min(1, this.damageLevel + Math.max(0.15, amount / 30));
  }

  pulse() {
    this.el.damage.classList.add('pulse');
    this.damageLevel = 0.8;
  }

  showResult(s) {
    const titles = {
      escaped: ['Escaped', 'You reached the surface. The Foundation will be looking for you.'],
      complete: ['Shift Complete', 'You made it to the end of the shift. Report again tomorrow at 06:00.'],
      survived: ['Survived the Day', 'Lights out. You lived to see another shift in D-Block.'],
      terminated: ['Terminated', s.role.id === 'classd' ? 'Subject deceased. A replacement has been requested.' : 'Officer killed in the line of duty.'],
      detained: ['Detained', 'Security caught you out of bounds. You will not be seen in D-Block again.'],
      lightsout: ['Missed Lights Out', 'You were not in your cell at lights out. Security has dealt with it.'],
      dismissed: ['Dismissed', 'Your performance record fell to zero. Clear out your locker.'],
    };
    const [title, sub] = titles[s.result];
    this.el.resultTitle.textContent = title;
    this.el.resultTitle.style.color = ['escaped', 'complete', 'survived'].includes(s.result) ? '' : '#ff6a50';
    this.el.resultSub.textContent = sub;
    const mins = Math.floor(s.time / 60);
    const secs = String(Math.floor(s.time % 60)).padStart(2, '0');
    const row = (k, v, cls = '') => `<div><span class="k">${k}</span><span class="${cls}">${v}</span></div>`;
    let html = '';
    html += row('Personnel', `${s.role.name} · ${s.designation}`);
    html += row('Time on shift', `${mins}:${secs}`);
    if (s.standingLabel) html += row(`Final ${s.standingLabel.toLowerCase()}`, Math.round(s.standing), s.standing > 25 ? 'ok' : 'bad');
    const causes = { scp096: 'Torn apart by SCP-096', scp173: 'Neck snapped by SCP-173', anomaly: 'Killed by an anomalous entity', field: 'Anomalous field exposure', shock: 'Anomalous discharge', pulse: 'Resonance pulse', riot: 'Beaten by rioters', shot: 'Shot by Foundation security', beaten: 'Beaten to death',
      scp049: '"Cured" by SCP-049', zombie: 'Torn apart by SCP-049-2', scp012: 'Bled out finishing SCP-012', scp151: 'Drowned on dry land (SCP-151)',
      pocket: 'Lost in the pocket dimension', scp939: 'Mauled by SCP-939', scp682: 'Devoured by SCP-682', scp330: 'Bled out (SCP-330)',
      scp207: 'Heart failure (SCP-207)', scp294: 'Something you drank (SCP-294)' };
    if (s.cause) html += row('Cause of death', causes[s.cause] || 'Unknown', 'bad');
    html += row('Tasks completed', s.history.filter((h) => h.status === 'complete').length, 'ok');
    if (s.failed) html += row('Tasks failed or missed', s.failed, 'bad');
    html += row('Credits earned', `${s.credits >= 0 ? '+' : ''}${s.credits.toLocaleString()} CR`, 'cr');
    if (s.spent) html += row('Spent on SCP acquisitions', `-${s.spent.toLocaleString()} CR`, 'bad');
    html += row('Total credits', `${s.total.toLocaleString()} CR`, 'cr');
    if (s.history.length) {
      html += '<ul>' + s.history.slice(-10).map((h) => `<li>${h.status === 'complete' ? '✓' : '✗'} ${escapeHtml(h.title)}</li>`).join('') + '</ul>';
    }
    this.el.resultStats.innerHTML = html;
    this.showLayer('menu');
    this.openScreen('result', true);
  }

  tick(dt) {
    for (const n of this.notes) {
      n.t -= dt;
      if (n.t <= 0 && !n.out) {
        n.out = true;
        n.el.classList.add('out');
        setTimeout(() => n.el.remove(), 700);
      }
    }
    this.notes = this.notes.filter((n) => !n.out);
    if (this.radioTimer > 0) {
      this.radioTimer -= dt;
      if (this.radioTimer <= 0) this.el.radio.classList.remove('show');
    }
    if (this.creditsDeltaTimer > 0) {
      this.creditsDeltaTimer -= dt;
      if (this.creditsDeltaTimer <= 0) this.el.creditsDelta.classList.remove('show');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.add('compact');
    }
    this.damageLevel = Math.max(0, this.damageLevel - dt * 1.2);
    this.el.damage.style.opacity = this.damageLevel.toFixed(2);
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

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
