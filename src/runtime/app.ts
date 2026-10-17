import { createGame } from '../sim/state.js';
import { stepGame } from '../sim/step.js';
import { createWorldQueries } from '../sim/world.js';
import { FixedStepClock } from '../sim/clock.js';
import type { GameState } from '../sim/types.js';
import { createEnvelope, decodeSave, encodeSave, MAX_SAVE_BYTES } from '../save/codec.js';
import type { SaveEnvelope, SaveMetadata } from '../save/codec.js';
import { SaveRepository } from '../save/repository.js';
import type { StoragePort } from '../save/repository.js';
import { createRenderer } from '../render/renderer.js';
import type { GameRenderer, Quality } from '../render/renderer.js';
import { PlayerInput } from './input.js';
import { GameView } from '../ui/view.js';

interface Settings { quality: Quality; sensitivity: number; invertY: boolean }
const DEFAULT_SETTINGS: Settings = { quality: 'rich', sensitivity: 1, invertY: false };
const SETTINGS_KEY = 'siltwake.settings.v1';
const errorText = (error: unknown): string => error instanceof Error ? error.message : 'An unknown error occurred.';

function storagePort(): StoragePort | null { try { return window.localStorage; } catch { return null; } }
function readSettings(): Settings {
  try {
    const text = localStorage.getItem(SETTINGS_KEY); if (!text) return { ...DEFAULT_SETTINGS };
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_SETTINGS };
    const value = data as Partial<Settings>;
    return { quality: value.quality === 'light' ? 'light' : 'rich', sensitivity: typeof value.sensitivity === 'number' && Number.isFinite(value.sensitivity) ? Math.max(0.4, Math.min(2.5, value.sensitivity)) : 1, invertY: value.invertY === true };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

/** The single lifecycle owner. Simulation never touches the DOM, storage or Babylon. */
export class SiltwakeApp {
  private readonly abort = new AbortController();
  private readonly clock = new FixedStepClock();
  private readonly world = createWorldQueries();
  private readonly repository = new SaveRepository(storagePort());
  private readonly view: GameView;
  private renderer: GameRenderer | null = null;
  private graphicsAvailable = true;
  private input: PlayerInput | null = null;
  private state: GameState | null = null;
  private meta: SaveMetadata | null = null;
  private paused = true;
  private disposed = false;
  private dirty = true;
  private frameId = 0;
  private hudTime = 0;
  private lastBoundaryNotice = -Infinity;
  private lastAutosaveTick = 0;
  private autoSaveAllowed = false;
  private pending: (() => void) | null = null;
  private settings = readSettings();

  constructor(root: HTMLElement) {
    this.repository.load();
    this.view = new GameView(root, {
      newGame: () => this.newGame(), continueGame: () => this.continueGame(), resume: () => this.resume(), pause: () => this.pause(),
      save: () => this.manualSave(), exportGame: () => this.exportGame(), exportBackup: () => this.exportBackup(), exportRaw: () => this.exportRaw(),
      importFile: file => { void this.importFile(file); }, confirm: () => { const action = this.pending; this.pending = null; this.view.cancelConfirmation(); action?.(); },
      cancelConfirm: () => { this.pending = null; this.view.cancelConfirmation(); }, lockMouse: () => this.lockMouse(),
      settings: (quality, sensitivity, invertY) => this.applySettings({ quality, sensitivity, invertY }),
    });
    this.view.slot(this.repository.status, false);
    this.view.settings(this.settings.quality, this.settings.sensitivity, this.settings.invertY);
    try {
      this.renderer = createRenderer(this.view.canvas);
      this.input = new PlayerInput(this.view.canvas, () => this.active);
      this.applySettings(this.settings, false);
    } catch (error) { this.view.graphicsError(errorText(error)); }
    const options = { signal: this.abort.signal };
    window.addEventListener('resize', () => { this.renderer?.resize(); this.dirty = true; }, options);
    window.addEventListener('blur', () => this.pause('Paused because the window lost focus.'), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause('Paused while this tab is in the background.'); }, options);
    window.addEventListener('keydown', event => {
      if (event.code === 'Escape') {
        event.preventDefault();
        if (this.pending) { this.pending = null; this.view.cancelConfirmation(); }
        else if (this.active) this.pause(); else if (this.state) this.resume();
      }
      if (event.code === 'F5' && this.state) { event.preventDefault(); this.manualSave(); }
    }, options);
    let hadMouseLock = false;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.view.canvas;
      if (hadMouseLock && !locked) this.pause('Mouse released.');
      hadMouseLock = locked;
    }, options);
    this.view.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.graphicsAvailable = false; this.pause('Graphics paused while the WebGL context is unavailable.'); }, options);
    this.view.canvas.addEventListener('webglcontextrestored', () => { this.graphicsAvailable = true; this.dirty = true; this.view.notify('Graphics restored. Resume when ready.'); }, options);
    window.addEventListener('pagehide', event => { if (event.persisted) this.pause('Paused after page navigation.'); else this.dispose(); }, options);
    this.frameId = requestAnimationFrame(now => this.frame(now));
  }

  private get active(): boolean { return !this.paused && this.graphicsAvailable && this.state !== null && this.renderer !== null && !this.disposed; }

  private frame(now: number): void {
    if (this.disposed) return;
    this.clock.advance(now, this.active, () => {
      if (!this.state) return;
      const result = stepGame(this.state, this.input?.sample() ?? [], this.world);
      this.state = result.state;
      for (const event of result.events) if (event.type === 'foundation-boundary' && now - this.lastBoundaryNotice > 6000) {
        this.view.notify('You have reached the edge of this foundation area. More of the ocean is still being built.'); this.lastBoundaryNotice = now;
      }
      if (this.autoSaveAllowed && this.state.tick - this.lastAutosaveTick >= 1800) this.save(false);
    });
    if (this.state && now - this.hudTime > 90) { this.view.update(this.state, this.input?.cruise ?? false); this.hudTime = now; }
    if (this.renderer && this.graphicsAvailable && !document.hidden && (this.active || this.dirty || this.view.canvas.dataset.ready !== 'true')) {
      try { this.renderer.present(this.state); this.dirty = false; }
      catch (error) { this.pause(); this.view.graphicsError(errorText(error)); this.renderer.dispose(); this.renderer = null; }
    }
    this.frameId = requestAnimationFrame(time => this.frame(time));
  }

  private start(save: SaveEnvelope, autoSave: boolean): void {
    this.state = save.state; this.meta = { ...save.meta };
    this.lastAutosaveTick = this.state.tick; this.autoSaveAllowed = autoSave;
    this.view.slot(this.repository.status, true); this.view.update(this.state, false); this.resume();
  }

  private newGame(): void {
    if (!this.renderer) return;
    const start = (): void => {
      const now = new Date().toISOString();
      const save = createEnvelope(createGame(), { sessionId: crypto.randomUUID(), createdAt: now, savedAt: now });
      const protectedSlot = this.repository.status.kind === 'protected' || this.repository.status.kind === 'recovered';
      if (this.repository.status.kind === 'unavailable') { this.start(save, false); this.view.notify('Exploring without local storage. Export a save before closing this page.'); return; }
      const result = this.repository.commit(save, protectedSlot);
      if (!result.ok) { this.view.notify(result.error, true); return; }
      this.start(save, true); this.view.notify('Expedition saved. The island shore and reef ribs are yours to explore.');
    };
    if (this.state || this.repository.status.kind !== 'empty' && this.repository.status.kind !== 'unavailable') {
      this.pause(); this.pending = start;
      this.view.confirmation('Start a new expedition?', 'This replaces the current session and Continue slot. The previous valid local save becomes the backup. Any unreadable local record is preserved inside the journal. Export any session you want to keep before replacing it.', 'Start new & save');
    } else start();
  }

  private continueGame(): void {
    const slot = this.repository.status;
    if (!slot.save || !this.renderer) return;
    this.start(slot.save, slot.kind === 'ready');
    if (slot.kind === 'recovered') this.view.notify('Opened the previous valid save. Automatic saving is paused. Use Save to explicitly repair the protected slot.', true);
  }

  private resume(): void {
    if (!this.state || !this.renderer || this.pending || !this.graphicsAvailable) return;
    if (document.hidden) return;
    this.input?.clear(); this.clock.reset(); this.paused = false; this.dirty = true;
    this.view.showGame();
  }

  private pause(reason = ''): void {
    this.paused = true; this.clock.reset(); this.input?.clear();
    if (document.pointerLockElement === this.view.canvas) document.exitPointerLock();
    this.view.showMenu(this.state !== null, reason); this.view.slot(this.repository.status, this.state !== null); this.dirty = true;
  }

  private envelope(): SaveEnvelope | null {
    if (!this.state || !this.meta) return null;
    const savedAt = new Date(Math.max(Date.now(), Date.parse(this.meta.createdAt))).toISOString();
    return createEnvelope(this.state, { ...this.meta, savedAt });
  }

  private save(manual: boolean, replaceProtected = false): boolean {
    const envelope = this.envelope(); if (!envelope) return false;
    const result = this.repository.commit(envelope, replaceProtected);
    if (!result.ok) {
      this.autoSaveAllowed = false;
      this.view.notify(result.error, true); return false;
    }
    this.lastAutosaveTick = envelope.state.tick; this.autoSaveAllowed = true;
    this.view.slot(result.value, true);
    if (manual) this.view.notify('Saved locally. The previous valid save is retained as a backup.');
    return true;
  }

  private manualSave(): void {
    if (!this.state) return;
    if (this.repository.status.kind === 'protected' || this.repository.status.kind === 'recovered') {
      this.pause(); this.pending = () => { this.save(true, true); };
      this.view.confirmation('Repair the protected local slot?', 'This saves your current session and preserves the unreadable local record inside the journal. The previous valid generation remains available. Export the local record first if you want a separate copy.', 'Repair & save');
    } else this.save(true);
  }

  private exportGame(): void {
    const save = this.envelope() ?? this.repository.status.save; if (!save) return;
    const encoded = encodeSave(save);
    if (!encoded.ok) { this.view.notify(encoded.error, true); return; }
    this.download(encoded.value, `siltwake-${save.meta.savedAt.slice(0, 10)}.json`);
    this.view.notify('Save file exported. Import it into a compatible Siltwake build to continue.');
  }

  private exportBackup(): void { const text = this.repository.backupText; if (text) this.download(text, 'siltwake-previous-save.json'); }
  private exportRaw(): void { const text = this.repository.raw; if (text) { this.download(text, 'siltwake-local-record.json'); this.view.notify('Local journal exported for safekeeping. This record contains both generations; use Export save for a normal importable file.'); } }

  private async importFile(file: File): Promise<void> {
    this.pause();
    if (file.size > MAX_SAVE_BYTES) { this.view.notify('The file exceeds the 1 MiB save limit. Current progress is unchanged.', true); return; }
    let text: string;
    try { text = await file.text(); } catch { this.view.notify('This file could not be read. Current progress is unchanged.', true); return; }
    if (this.disposed) return;
    const decoded = decodeSave(text);
    if (!decoded.ok) { this.view.notify(decoded.error, true); return; }
    const save = decoded.value;
    this.pending = () => {
      if (this.repository.status.kind === 'unavailable') { this.start(save, false); this.view.notify('Imported into this session. Local storage is unavailable; export before closing.'); return; }
      const result = this.repository.commit(save, true);
      if (!result.ok) { this.view.notify(result.error, true); return; }
      this.start(save, true); this.view.notify('Imported and saved locally.');
    };
    this.view.confirmation('Import this expedition?', `Saved ${new Date(save.meta.savedAt).toLocaleString()} · ${Math.floor(save.state.tick / 3600)} minutes explored. This replaces the current session and Continue slot after validation. The previous valid local save is retained.`, 'Import & continue');
  }

  private download(text: string, name: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private lockMouse(): void {
    if (!this.state || !this.renderer) return;
    this.resume();
    try {
      const request = this.view.canvas.requestPointerLock();
      if (request && typeof request.catch === 'function') void request.catch(() => { this.pause('Mouse lock was unavailable. Click and drag or use the arrow keys.'); });
    } catch { this.pause('Mouse lock was unavailable. Click and drag or use the arrow keys.'); }
  }

  private applySettings(settings: Settings, persist = true): void {
    this.settings = settings; this.renderer?.setQuality(settings.quality);
    if (this.input) this.input.settings = { sensitivity: settings.sensitivity, invertY: settings.invertY };
    this.dirty = true;
    if (persist) try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Settings are optional; saving gameplay reports its own errors. */ }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.paused = true; cancelAnimationFrame(this.frameId); this.abort.abort();
    this.input?.dispose();
    if (document.pointerLockElement === this.view.canvas) document.exitPointerLock();
    this.renderer?.dispose(); this.view.dispose();
  }
}
