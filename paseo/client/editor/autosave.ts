export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "conflict";

export interface AutosaveSaveError {
  code: string;
  message: string;
}

export type SaveOutcome =
  | { ok: true; sha256: string }
  | { ok: false; error: AutosaveSaveError };

export interface AutosaveOptions {
  save: (content: string, baseSha: string) => Promise<SaveOutcome>;
  delayMs?: number;
  onStatus?: (status: SaveStatus) => void;
}

export interface AutosaveController {
  /** Record a new draft; the actual write happens after the debounce window. */
  schedule(content: string): void;
  /** Write the pending draft right away (⌘S, tab switch, unmount). */
  flush(): Promise<void>;
  /** Drop the pending draft and the timer. */
  cancel(): void;
  /** Refresh the sha baseline after an external reload. */
  setBaseSha(sha: string): void;
  getBaseSha(): string;
  getStatus(): SaveStatus;
  getError(): AutosaveSaveError | null;
}

export const AUTOSAVE_DELAY_MS = 1500;

/**
 * Proma-style autosave: one debounced write at a time, never overlapping.
 * Edits made while a write is in flight are coalesced into a single follow-up
 * write. A `file-changed` rejection stops the controller until the caller
 * reloads the file or discards the draft, so a stale buffer can never
 * overwrite somebody else's content.
 */
export function createAutosave({
  save,
  delayMs = AUTOSAVE_DELAY_MS,
  onStatus,
}: AutosaveOptions): AutosaveController {
  let status: SaveStatus = "idle";
  let baseSha = "";
  let pending: string | null = null;
  let error: AutosaveSaveError | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;

  const setStatus = (next: SaveStatus) => {
    if (status === next) return;
    status = next;
    onStatus?.(next);
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleTimer = () => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void perform();
    }, delayMs);
  };

  function perform(): Promise<void> {
    if (running) return running;
    if (status === "conflict") return Promise.resolve();
    if (pending === null) return Promise.resolve();

    const content = pending;
    pending = null;
    setStatus("saving");

    running = (async () => {
      let result: SaveOutcome;
      try {
        result = await save(content, baseSha);
      } catch (thrown) {
        result = {
          ok: false,
          error: {
            code: "save-failed",
            message: thrown instanceof Error ? thrown.message : String(thrown),
          },
        };
      }

      if (result.ok) {
        baseSha = result.sha256;
        error = null;
        setStatus(pending === null ? "saved" : "dirty");
      } else {
        error = result.error;
        if (result.error.code === "file-changed") {
          pending = null;
          setStatus("conflict");
        } else {
          setStatus("dirty");
        }
      }
    })();

    return running.finally(() => {
      running = null;
      if (pending !== null && status !== "conflict") scheduleTimer();
    });
  }

  return {
    schedule(content) {
      if (status === "conflict") return;
      pending = content;
      if (running) return;
      setStatus("dirty");
      scheduleTimer();
    },
    async flush() {
      clearTimer();
      // Keep draining until the latest draft is really on disk: a save that was
      // already in flight when flush() started must not hide the newer draft.
      let guard = 0;
      while (status !== "conflict" && (pending !== null || running !== null) && guard < 20) {
        guard += 1;
        await perform();
        if (running) await running;
      }
    },
    cancel() {
      clearTimer();
      pending = null;
      error = null;
      setStatus("idle");
    },
    setBaseSha(sha) {
      baseSha = sha;
    },
    getBaseSha() {
      return baseSha;
    },
    getStatus() {
      return status;
    },
    getError() {
      return error;
    },
  };
}
