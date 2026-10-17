import { PLACES } from '../content/registry.js';
import { eyeHeight } from '../sim/state.js';
import type { GameState } from '../sim/types.js';
import type { SaveSlot } from '../save/repository.js';
import type { Quality } from '../render/renderer.js';

export interface UiActions {
  newGame(): void; continueGame(): void; resume(): void; pause(): void;
  save(): void; exportGame(): void; exportBackup(): void; exportRaw(): void;
  importFile(file: File): void; confirm(): void; cancelConfirm(): void; lockMouse(): void;
  settings(quality: Quality, sensitivity: number, invertY: boolean): void;
}

export class GameView {
  readonly canvas: HTMLCanvasElement;
  private readonly abort = new AbortController();
  private readonly menu: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly toast: HTMLElement;
  private toastTimer = 0;
  private wasPlaying = false;

  constructor(private readonly root: HTMLElement, actions: UiActions) {
    root.innerHTML = `
      <canvas id="ocean" tabindex="0" aria-label="Siltwake 3D reef. WASD to move, arrow keys or mouse drag to look. Escape opens the menu."></canvas>
      <div class="vignette" aria-hidden="true"></div>
      <main id="hud" hidden aria-label="Exploration display">
        <div class="hud-top"><div class="region"><span class="eyebrow">SILTWAKE / FOUNDATION 01</span><strong id="region-name">Hearth Reef</strong></div>
        <div class="heading"><span id="compass">N</span><small id="bearing">000°</small></div>
        <div class="hud-actions"><button data-action="save" title="Save locally (F5)">Save <kbd>F5</kbd></button><button data-action="pause">Menu <kbd>Esc</kbd></button></div></div>
        <div class="crosshair" aria-hidden="true"></div>
        <div class="hud-bottom"><div class="telemetry"><span class="depth"><b id="depth">0.0</b><small>m / DEPTH</small></span><span class="mode"><strong id="movement">On foot</strong><small id="refuge-distance">Home pod · 0 m</small></span></div>
        <div class="explore-note"><span id="cruise" hidden>FORWARD CRUISE · R TO STOP</span><p id="context-hint">Walk down the amber-edged ramp to the water.</p><small>WASD move · drag / arrows look · Space rise · C dive</small></div></div>
      </main>
      <div id="menu" class="menu-screen" role="dialog" aria-modal="true" aria-labelledby="menu-title">
        <div class="menu-frame">
          <div class="wordmark"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 28C11 9 18 6 20 6s9 3 15 22M7 28c8-6 18-6 26 0M12 35c5-3 11-3 16 0"/></svg><span>FIELD BUILD / 0.1</span></div>
          <h1 id="menu-title">SILTWAKE</h1><p id="menu-subtitle" class="subtitle">A refuge. A reef. A first horizon.</p>
          <p id="pause-reason" class="pause-reason" hidden></p>
          <section id="main-menu">
            <div class="menu-buttons"><button id="resume" class="primary" data-action="resume" hidden>Return to the water <span>↗</span></button>
            <button id="continue" class="primary" data-action="continue" disabled>Continue <span>↗</span></button>
            <button id="new-game" data-action="new">New expedition <span>+</span></button></div>
            <div class="menu-tools"><button id="manual-save" data-action="save" hidden>Save locally</button><button id="export-game" data-action="export" hidden>Export save</button><button data-action="import">Import save</button></div>
            <p id="save-status" class="save-status"></p>
            <details class="details"><summary>Controls & settings</summary>
              <dl class="controls"><div><dt>W A S D</dt><dd>Move / swim</dd></div><div><dt>Drag mouse / ↑ ↓ ← →</dt><dd>Look around</dd></div><div><dt>Space / C</dt><dd>Rise or jump / dive</dd></div><div><dt>Shift</dt><dd>Move faster</dd></div><div><dt>R</dt><dd>Toggle forward cruise</dd></div><div><dt>Esc / F5</dt><dd>Pause / save locally</dd></div></dl>
              <div class="settings"><label>Rendering <select id="quality"><option value="rich">Rich · full viewport</option><option value="light">Light · lower resolution</option></select></label>
              <label>Mouse sensitivity <input id="sensitivity" type="range" min="0.4" max="2.5" step="0.1" value="1" /></label><label class="check"><input id="invert" type="checkbox" /> Invert mouse look</label></div>
              <button id="lock-mouse" data-action="lock" hidden>Resume with locked mouse</button><small class="control-note">Mouse lock is optional. Escape releases it and pauses. Click and drag also works.</small>
            </details>
            <details class="details"><summary>Save safety</summary><p>Autosaves run every 30 seconds of active exploration. Menu and background time do not advance the world. Local saves keep a previous valid generation.</p><p>Use export to keep a portable file. Browser storage belongs to this site and can be cleared by the browser.</p><div class="menu-tools"><button id="export-backup" data-action="backup" hidden>Export previous save</button><button id="export-raw" data-action="raw" hidden>Export local record</button></div></details>
          </section>
          <section id="confirmation" class="confirmation" hidden><h2 id="confirm-title"></h2><p id="confirm-detail"></p><div class="menu-buttons"><button id="confirm-accept" class="primary" data-action="confirm">Confirm</button><button data-action="cancel">Go back</button></div></section>
          <p class="build-note"><span class="status-dot"></span> EARLY PLAYABLE FOUNDATION<span>Explore the pod deck, reef ribs and Splitspine shore. The campaign, gathering, survival and fleet are still under construction.</span></p>
        </div>
        <div class="scene-caption" aria-hidden="true"><span>01 / HEARTH REEF</span><p>Follow the light.<br/>Learn the shore.</p><i></i><small>A QUIET PLACE TO BEGIN</small></div>
      </div>
      <section id="graphics-error" class="graphics-error" role="alert" hidden><h2>The ocean could not open</h2><p id="graphics-error-text"></p><p>Your existing local save has not been changed. Save exports remain available in the menu.</p></section>
      <div id="notification" role="status" aria-live="polite" hidden></div>
      <input id="import-file" type="file" accept=".json,application/json" hidden />`;
    this.canvas = this.get<HTMLCanvasElement>('ocean'); this.menu = this.get('menu'); this.hud = this.get('hud'); this.toast = this.get('notification');
    const options = { signal: this.abort.signal };
    const map: Record<string, () => void> = {
      new: actions.newGame, continue: actions.continueGame, resume: actions.resume, pause: actions.pause, save: actions.save,
      export: actions.exportGame, backup: actions.exportBackup, raw: actions.exportRaw, confirm: actions.confirm, cancel: actions.cancelConfirm,
      lock: actions.lockMouse, import: () => { const input = this.get<HTMLInputElement>('import-file'); input.value = ''; input.click(); },
    };
    root.addEventListener('click', event => {
      const target = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
      if (target && !target.disabled) map[target.dataset.action ?? '']?.();
    }, options);
    this.get('import-file').addEventListener('change', () => { const file = this.get<HTMLInputElement>('import-file').files?.[0]; if (file) actions.importFile(file); }, options);
    for (const id of ['quality', 'sensitivity', 'invert']) this.get(id).addEventListener('change', () => actions.settings(this.get<HTMLSelectElement>('quality').value as Quality, this.get<HTMLInputElement>('sensitivity').valueAsNumber, this.get<HTMLInputElement>('invert').checked), options);
    this.menu.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const visible = [...this.menu.querySelectorAll<HTMLElement>('button:not([disabled]),select,input,summary')].filter(element => element.getClientRects().length > 0);
      const first = visible[0], last = visible.at(-1);
      if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
    }, options);
  }

  private get<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Missing UI element ${id}`);
    return element;
  }

  settings(quality: Quality, sensitivity: number, invertY: boolean): void {
    this.get<HTMLSelectElement>('quality').value = quality; this.get<HTMLInputElement>('sensitivity').value = String(sensitivity); this.get<HTMLInputElement>('invert').checked = invertY;
  }

  slot(slot: SaveSlot, hasSession: boolean): void {
    const button = this.get<HTMLButtonElement>('continue');
    button.hidden = hasSession; button.disabled = slot.save === null;
    button.textContent = slot.kind === 'recovered' ? 'Open previous valid save ↗' : 'Continue ↗';
    this.get('save-status').textContent = slot.message;
    this.get('export-backup').hidden = slot.backup === null;
    this.get('export-raw').hidden = slot.kind === 'empty' || slot.kind === 'unavailable';
    this.get('export-game').hidden = !hasSession && slot.save === null;
  }

  showMenu(hasSession: boolean, reason = ''): void {
    this.menu.hidden = false; this.hud.hidden = true; this.root.dataset.screen = 'menu';
    this.get('resume').hidden = !hasSession; this.get('manual-save').hidden = !hasSession;
    this.get('lock-mouse').hidden = !hasSession || typeof this.canvas.requestPointerLock !== 'function';
    this.get('pause-reason').hidden = reason.length === 0; this.get('pause-reason').textContent = reason;
    this.get('menu-subtitle').textContent = hasSession ? 'A moment ashore.' : 'A refuge. A reef. A first horizon.';
    if (this.wasPlaying) this.get(hasSession ? 'resume' : 'new-game').focus({ preventScroll: true });
    this.wasPlaying = false;
  }

  showGame(): void {
    this.menu.hidden = true; this.hud.hidden = false; this.root.dataset.screen = 'playing';
    this.wasPlaying = true; this.canvas.focus({ preventScroll: true });
  }

  confirmation(title: string, detail: string, accept: string): void {
    this.get('main-menu').hidden = true; this.get('confirmation').hidden = false;
    this.get('confirm-title').textContent = title; this.get('confirm-detail').textContent = detail;
    this.get('confirm-accept').textContent = accept; this.get('confirm-accept').focus({ preventScroll: true });
  }

  cancelConfirmation(): void { this.get('main-menu').hidden = false; this.get('confirmation').hidden = true; this.get('new-game').focus({ preventScroll: true }); }

  update(state: GameState, cruise: boolean): void {
    const p = state.player.pose.position, mode = state.player.mode;
    const degrees = (state.player.pose.yaw * 180 / Math.PI + 360) % 360;
    this.get('compass').textContent = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8] ?? 'N';
    this.get('bearing').textContent = `${Math.round(degrees).toString().padStart(3, '0')}°`;
    this.get('depth').textContent = Math.max(0, -(p.y + eyeHeight(state))).toFixed(1);
    this.get('movement').textContent = mode === 'swimming' ? 'Swimming' : 'On foot';
    const home = PLACES.home_pod.position;
    this.get('refuge-distance').textContent = `Home pod · ${Math.round(Math.hypot(p.x - home.x, p.z - home.z))} m`;
    this.get('region-name').textContent = p.z < -30 ? 'Splitspine shore' : 'Hearth Reef';
    this.get('cruise').hidden = !cruise;
    this.get('context-hint').textContent = mode === 'swimming' ? 'The pod’s amber-edged ramp leads back to the deck.' : p.z < -25 ? 'The shore is walkable. The split ridge is your landmark.' : 'Walk down the amber-edged ramp to the water.';
    this.hud.dataset.tick = String(state.tick); this.hud.dataset.position = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    this.hud.dataset.mode = mode; this.hud.dataset.yaw = String(state.player.pose.yaw);
  }

  notify(message: string, error = false): void {
    window.clearTimeout(this.toastTimer); this.toast.textContent = message; this.toast.hidden = false; this.toast.classList.toggle('error', error);
    this.toastTimer = window.setTimeout(() => { this.toast.hidden = true; }, error ? 12000 : 5500);
  }

  graphicsError(message: string): void {
    this.get('graphics-error').hidden = false; this.get('graphics-error-text').textContent = message;
    for (const id of ['new-game', 'continue', 'resume', 'lock-mouse']) this.get<HTMLButtonElement>(id).disabled = true;
  }

  dispose(): void { window.clearTimeout(this.toastTimer); this.abort.abort(); this.root.replaceChildren(); }
}
