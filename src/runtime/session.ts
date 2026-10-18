import { fixtureGame } from "../sim/carrier.js";
import { createGame } from "../sim/state.js";
import type { GameState } from "../sim/types.js";
import { createEnvelope, decodeSave, MAX_SAVE_BYTES } from "../save/codec.js";
import type { SaveEnvelope, SaveMetadata } from "../save/codec.js";
import type { CommitFailure, SaveRepository } from "../save/repository.js";

export interface SessionConfirmation {
  title: string;
  detail: string;
  accept: string;
}
export interface SessionEvents {
  changed(): void;
  pause(): void;
  entered(): void;
  notify(message: string, error?: boolean): void;
}
export interface ImportFilePort {
  readonly size: number;
  text(): Promise<string>;
}
interface Operation {
  abort: AbortController;
}
interface Choice {
  prompt: SessionConfirmation;
  accept(): void;
}
const sessionFallback = (code: CommitFailure): boolean =>
  code === "write-refused" ||
  code === "storage-unavailable" ||
  code === "lock-unavailable" ||
  code === "lock-failed";

/** Owns the expedition and its one pending read/write/choice. No DOM or renderer.
 * SiltwakeApp supplies presentation and advances state only through fixed updates. */
export class ExpeditionSession {
  state: GameState | null = null;
  private meta: SaveMetadata | null = null;
  private automatic = false;
  private lastAutosaveTick = 0;
  private operation: Operation | null = null;
  private choice: Choice | null = null;
  private disposed = false;

  constructor(
    readonly repository: SaveRepository,
    private readonly events: SessionEvents,
  ) {
    repository.load();
  }

  get busy(): boolean {
    return this.operation !== null;
  }
  get confirmation(): SessionConfirmation | null {
    return this.choice?.prompt ?? null;
  }
  get autoSaveAllowed(): boolean {
    return this.automatic;
  }
  get persistenceMessage(): string {
    if (this.state && !this.automatic)
      return "Local autosave is off. Export save before closing this page; you can explicitly retry Save locally.";
    if (!this.repository.canWrite)
      return "Local saving is unavailable. You can read/export local progress or choose a session without local saving.";
    return "";
  }

  private get idle(): boolean {
    return !this.disposed && !this.busy && !this.choice;
  }
  private begin(): Operation | null {
    if (!this.idle) return null;
    const operation = { abort: new AbortController() };
    this.operation = operation;
    this.events.changed();
    return operation;
  }
  private current(operation: Operation): boolean {
    return (
      !this.disposed &&
      this.operation === operation &&
      !operation.abort.signal.aborted
    );
  }
  private finish(operation: Operation): void {
    if (!this.current(operation)) return;
    this.operation = null;
    this.events.changed();
  }
  private ask(prompt: SessionConfirmation, accept: () => void): void {
    if (!this.idle) return;
    this.choice = { prompt, accept };
    this.events.pause();
    this.events.changed();
  }

  confirm(): void {
    if (this.disposed || this.busy || !this.choice) return;
    const choice = this.choice;
    this.choice = null;
    this.events.changed();
    choice.accept();
  }
  cancel(): void {
    if (this.disposed) return;
    const operation = this.operation;
    this.operation = null;
    this.choice = null;
    operation?.abort.abort();
    this.events.changed();
    this.events.notify(
      "Operation cancelled. Your active expedition is unchanged. A local save that already completed remains on disk.",
    );
  }

  private enter(save: SaveEnvelope, autoSave: boolean): void {
    if (this.disposed) return;
    // The repository and active simulation must never share mutable state.
    this.state = structuredClone(save.state);
    this.meta = { ...save.meta };
    this.lastAutosaveTick = this.state.tick;
    this.automatic = autoSave;
    this.events.changed();
    this.events.entered();
  }

  newGame(scenario: "expedition" | "carrier-fixture" = "expedition"): void {
    if (!this.idle) return;
    const start = (): void => {
      const now = new Date().toISOString();
      const save = createEnvelope(
        scenario === "carrier-fixture" ? fixtureGame() : createGame(),
        { sessionId: crypto.randomUUID(), createdAt: now, savedAt: now },
      );
      void this.replace(save, "new");
    };
    if (
      this.state ||
      (this.repository.status.kind !== "empty" &&
        this.repository.status.kind !== "unavailable")
    ) {
      this.ask(
        {
          title: "Start a new expedition?",
          detail:
            "This replaces your active expedition and Continue slot if local saving succeeds. The previous valid local save becomes the backup; unreadable records are preserved. Export any active expedition you want to keep before proceeding.",
          accept: "Start new & save",
        },
        start,
      );
    } else start();
  }

  continueGame(): void {
    if (!this.idle || this.state) return;
    const slot = this.repository.status;
    if (!slot.save) return;
    this.enter(slot.save, slot.kind === "ready" && this.repository.canWrite);
    if (slot.save.state.migration)
      this.events.notify(slot.save.state.migration);
    if (slot.kind === "recovered")
      this.events.notify(
        "Opened the previous valid save. Automatic saving is paused. Use Save to explicitly repair the protected slot.",
        true,
      );
    else if (!this.automatic)
      this.events.notify(
        "Local saving is unavailable. Export this expedition before closing this page.",
        true,
      );
  }

  envelope(): SaveEnvelope | null {
    if (!this.state || !this.meta) return null;
    const savedAt = new Date(
      Math.max(Date.now(), Date.parse(this.meta.createdAt)),
    ).toISOString();
    return createEnvelope(structuredClone(this.state), {
      ...this.meta,
      savedAt,
    });
  }

  private async replace(
    save: SaveEnvelope,
    source: "new" | "imported",
  ): Promise<void> {
    const operation = this.begin();
    if (!operation) return;
    this.events.pause();
    const result = await this.repository.commit(
      save,
      true,
      operation.abort.signal,
    );
    if (!this.current(operation)) return;
    this.finish(operation);
    if (result.ok) {
      this.enter(save, true);
      this.events.notify(
        source === "new"
          ? "Expedition saved. The island shore and reef ribs are yours to explore."
          : "Imported and saved locally.",
      );
    } else if (sessionFallback(result.code)) {
      this.ask(
        {
          title: "Use this expedition without local saving?",
          detail: `${result.error} Your local records and active expedition are unchanged. You can use the ${source} expedition only in this page, replacing your active expedition after this choice. Automatic saving will be disabled. Export save will keep a portable copy. Go back first if you need to export your active expedition.`,
          accept: "Use without local saving",
        },
        () => {
          this.enter(save, false);
          this.events.notify(
            "Session only: automatic saving is disabled. Export save from the menu before closing this page.",
            true,
          );
        },
      );
    } else if (result.code !== "cancelled")
      this.events.notify(
        `${result.error} Your active expedition is unchanged.`,
        true,
      );
  }

  async importFile(file: ImportFilePort): Promise<void> {
    const operation = this.begin();
    if (!operation) return;
    this.events.pause();
    if (file.size > MAX_SAVE_BYTES) {
      this.finish(operation);
      this.events.notify(
        "The file exceeds the 1 MiB save limit. Current progress is unchanged.",
        true,
      );
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      if (this.current(operation)) {
        this.finish(operation);
        this.events.notify(
          "This file could not be read. Current progress is unchanged.",
          true,
        );
      }
      return;
    }
    if (!this.current(operation)) return;
    const decoded = decodeSave(text);
    this.finish(operation);
    if (!decoded.ok) {
      this.events.notify(decoded.error, true);
      return;
    }
    const save = decoded.value;
    this.ask(
      {
        title: "Import this expedition?",
        detail: `Saved ${new Date(save.meta.savedAt).toLocaleString()} · ${Math.floor(save.state.tick / 3600)} minute${Math.floor(save.state.tick / 3600) === 1 ? "" : "s"} explored. This replaces your active expedition and Continue slot if local saving succeeds. The previous valid local save is retained and unreadable records are preserved. Export any active expedition you want to keep first.`,
        accept: "Import & save",
      },
      () => {
        void this.replace(save, "imported");
      },
    );
  }

  manualSave(): void {
    if (!this.idle || !this.state) return;
    if (
      this.repository.status.kind === "protected" ||
      this.repository.status.kind === "recovered"
    ) {
      this.ask(
        {
          title: "Repair the protected local slot?",
          detail:
            "This saves your active expedition and preserves the unreadable local record inside the journal. The previous valid generation remains available. Export the local record first if you want a separate copy.",
          accept: "Repair & save",
        },
        () => {
          void this.save(true, true);
        },
      );
    } else void this.save(true);
  }

  autosave(): void {
    if (
      this.idle &&
      this.automatic &&
      this.state &&
      this.state.tick - this.lastAutosaveTick >= 1800
    )
      void this.save(false);
  }

  private async save(manual: boolean, replaceProtected = false): Promise<void> {
    const save = this.envelope();
    if (!save) return;
    const operation = this.begin();
    if (!operation) return;
    this.lastAutosaveTick = save.state.tick;
    const result = await this.repository.commit(
      save,
      replaceProtected,
      operation.abort.signal,
    );
    if (!this.current(operation)) return;
    this.automatic = result.ok;
    this.finish(operation);
    if (result.ok) {
      if (manual)
        this.events.notify(
          "Saved locally. The previous valid save is retained as a backup.",
        );
    } else if (result.code !== "cancelled")
      this.events.notify(
        `${result.error} Automatic saving is disabled. Export save from the menu to keep this expedition.`,
        true,
      );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.operation?.abort.abort();
    this.operation = null;
    this.choice = null;
    this.automatic = false;
  }
}
