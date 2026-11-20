import { afterEach, describe, expect, it, vi } from "vitest";
import { createAutosave, type SaveOutcome } from "../client/editor/autosave";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createAutosave", () => {
  it("saves once after the debounce window", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (): Promise<SaveOutcome> => ({ ok: true, sha256: "sha-1" }));
    const autosave = createAutosave({ save, delayMs: 1500 });
    autosave.setBaseSha("sha-0");

    autosave.schedule("one");
    expect(save).not.toHaveBeenCalled();
    expect(autosave.getStatus()).toBe("dirty");

    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("one", "sha-0");
    expect(autosave.getStatus()).toBe("saved");
    expect(autosave.getBaseSha()).toBe("sha-1");
  });

  it("coalesces rapid edits into the last draft", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (): Promise<SaveOutcome> => ({ ok: true, sha256: "sha-1" }));
    const autosave = createAutosave({ save, delayMs: 1500 });
    autosave.schedule("a");
    await vi.advanceTimersByTimeAsync(800);
    autosave.schedule("ab");
    await vi.advanceTimersByTimeAsync(800);
    autosave.schedule("abc");
    await vi.advanceTimersByTimeAsync(1500);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("abc", "");
  });

  it("queues exactly one more save when the draft changes during a save", async () => {
    vi.useFakeTimers();
    const first = deferred<SaveOutcome>();
    const save = vi
      .fn<() => Promise<SaveOutcome>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ ok: true, sha256: "sha-2" });
    const autosave = createAutosave({ save, delayMs: 1500 });

    autosave.schedule("one");
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(1);

    autosave.schedule("two");
    autosave.schedule("three");
    first.resolve({ ok: true, sha256: "sha-1" });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1500);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("three", "sha-1");
  });

  it("stops scheduling after a disk conflict", async () => {
    vi.useFakeTimers();
    const save = vi.fn(
      async (): Promise<SaveOutcome> => ({
        ok: false,
        error: { code: "file-changed", message: "changed" },
      }),
    );
    const autosave = createAutosave({ save, delayMs: 1500 });

    autosave.schedule("one");
    await vi.advanceTimersByTimeAsync(1500);
    expect(autosave.getStatus()).toBe("conflict");

    autosave.schedule("two");
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.getStatus()).toBe("conflict");
  });

  it("flush waits for a draft queued behind an in-flight save", async () => {
    vi.useFakeTimers();
    const first = deferred<SaveOutcome>();
    const save = vi
      .fn<() => Promise<SaveOutcome>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ok: true, sha256: "sha-2" });
    const autosave = createAutosave({ save, delayMs: 1500 });

    autosave.schedule("A");
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(1);

    autosave.schedule("B");
    const flushed = autosave.flush();
    first.resolve({ ok: true, sha256: "sha-1" });
    await flushed;

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("B", "sha-1");
    expect(autosave.getStatus()).toBe("saved");
  });

  it("flush saves immediately and clears the pending timer", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (): Promise<SaveOutcome> => ({ ok: true, sha256: "sha-9" }));
    const autosave = createAutosave({ save, delayMs: 1500 });
    autosave.schedule("now");

    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.getStatus()).toBe("saved");

    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending draft without saving", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (): Promise<SaveOutcome> => ({ ok: true, sha256: "sha" }));
    const autosave = createAutosave({ save, delayMs: 1500 });
    autosave.schedule("draft");
    autosave.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
    expect(autosave.getStatus()).toBe("idle");
  });

  it("keeps the draft dirty when a non-conflict save fails", async () => {
    vi.useFakeTimers();
    const save = vi.fn(
      async (): Promise<SaveOutcome> => ({
        ok: false,
        error: { code: "write-failed", message: "disk full" },
      }),
    );
    const autosave = createAutosave({ save, delayMs: 1500 });
    autosave.schedule("draft");
    await vi.advanceTimersByTimeAsync(1500);
    expect(autosave.getStatus()).toBe("dirty");
    expect(autosave.getError()).toEqual({ code: "write-failed", message: "disk full" });
  });
});
