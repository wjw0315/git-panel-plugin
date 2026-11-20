import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client/editor", () => ({
  Editor: (props: {
    value: string;
    readOnly: boolean;
    onChange?: (value: string) => void;
    onSave?: () => void;
    onCancel?: () => void;
  }) =>
    props.readOnly ? (
      <div data-testid="editor-readonly">{props.value}</div>
    ) : (
      <textarea
        data-testid="editor-input"
        value={props.value}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
    ),
}));

import { FilesTab } from "../client/files";
import type { Strings } from "../client/strings";
import { rpc, testSettings, type RpcHandler } from "./stubs/plugin-client";

const THEME = {
  colors: {
    accent: "#0af",
    accentForeground: "#000",
    border: "#333",
    foreground: "#fff",
    foregroundMuted: "#999",
    statusDanger: "#a00",
    statusSuccess: "#0a0",
    statusWarning: "#a80",
    surface0: "#000",
    surface1: "#111",
    surface2: "#222",
  },
} as never;

const STRINGS = new Proxy({}, { get: (_target, key) => String(key) }) as Strings;

/** The fake disk mirrors the real server: every successful write bumps the sha. */
const DISK: Record<string, { content: string; sha: string; mtimeMs: number; editable: boolean }> = {};
let shaSeq = 0;

function seed(path: string, content: string, editable = true) {
  shaSeq += 1;
  DISK[path] = { content, sha: `sha-${shaSeq}`, mtimeMs: shaSeq, editable };
}

function installRpc(write?: RpcHandler) {
  rpc.handler = (name) => {
    if (name === "git.dir-list") {
      return (async () => ({
        path: "",
        entries: Object.keys(DISK).map((path) => ({
          name: path,
          dir: false,
          size: DISK[path].content.length,
        })),
        truncated: false,
      })) as unknown as RpcHandler;
    }
    if (name === "git.file-content") {
      return (async (input: { path: string }) => {
        const file = DISK[input.path] ?? { content: "", sha: "sha-0", mtimeMs: 0, editable: false };
        return {
          ok: true,
          path: input.path,
          variant: "text",
          content: file.content,
          size: file.content.length,
          mtimeMs: file.mtimeMs,
          sha256: file.sha,
          editable: file.editable,
          tooLarge: false,
        };
      }) as unknown as RpcHandler;
    }
    if (name === "git.file-write") {
      if (write) return write;
      return (async (input: { path: string; content: string }) => {
        shaSeq += 1;
        DISK[input.path] = {
          ...(DISK[input.path] ?? { editable: true }),
          content: input.content,
          sha: `sha-${shaSeq}`,
          mtimeMs: shaSeq,
        };
        return { ok: true, sha256: DISK[input.path].sha };
      }) as unknown as RpcHandler;
    }
    throw new Error(`Unexpected RPC in this test: ${name}`);
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function mount(setModified: (value: boolean) => void = () => {}) {
  return render(
    <QueryClientProvider client={newClient()}>
      <FilesTab
        cwd="/repo"
        repo=""
        theme={THEME}
        strings={STRINGS}
        mode="wide"
        tab={{ setModified } as never}
      />
    </QueryClientProvider>,
  );
}

async function openFile(name = "notes.txt") {
  fireEvent.click(await screen.findByText(name));
  await waitFor(() => expect(screen.getByTestId("editor-readonly")).toBeTruthy());
}

async function startEditing() {
  fireEvent.click(screen.getByLabelText("editFile"));
  return waitFor(() => expect(screen.getByTestId("editor-input")).toBeTruthy());
}

beforeEach(() => {
  seed("notes.txt", "# notes");
  seed("other.txt", "other");
  seed("docs.md", "# markdown");
});

afterEach(() => {
  cleanup();
  rpc.handler = null;
  testSettings.values = {};
  for (const key of Object.keys(DISK)) delete DISK[key];
  vi.useRealTimers();
});

describe("FilesTab 编辑器接入", () => {
  it("opens a file in the read-only editor", async () => {
    installRpc();
    mount();
    await openFile();
    expect(screen.getByTestId("editor-readonly").textContent).toBe("# notes");
  });

  it("autosaves 1.5s after the last edit and keeps the draft while the cache refreshes", async () => {
    installRpc();
    mount();
    await openFile();
    await startEditing();

    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "# notes edited" } });
    await waitFor(() => expect(screen.getByTestId("editor-input")).toHaveProperty("value", "# notes edited"));

    await waitFor(
      () => {
        expect(DISK["notes.txt"].content).toBe("# notes edited");
      },
      { timeout: 3000 },
    );
    // The cached file was patched with the new sha; the editor must not reset.
    expect(screen.getByTestId("editor-input")).toHaveProperty("value", "# notes edited");
    expect(screen.getByLabelText("save")).toBeTruthy();
  });

  it("shows the conflict banner and keeps the draft after a refresh", async () => {
    const write = (async (input: { path: string }) => {
      // Simulate somebody else writing the file while we edit.
      shaSeq += 1;
      DISK[input.path] = {
        content: "external change",
        sha: `sha-${shaSeq}`,
        mtimeMs: shaSeq,
        editable: true,
      };
      return { ok: false, error: { code: "file-changed", message: "changed" } };
    }) as unknown as RpcHandler;
    installRpc(write);
    mount();
    await openFile();
    await startEditing();

    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "my draft" } });
    fireEvent.click(screen.getByLabelText("save"));

    await waitFor(() => expect(screen.getByText("fileChanged")).toBeTruthy());
    expect(screen.getByText("reload")).toBeTruthy();
    expect(screen.getByText("keepDraft")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("editor-input")).toHaveProperty("value", "my draft"));
    expect(DISK["notes.txt"].content).toBe("external change");
  });

  it("requires a second press before discarding a dirty draft", async () => {
    installRpc();
    mount();
    await openFile();
    await startEditing();

    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "draft" } });
    fireEvent.click(screen.getByLabelText("cancel"));
    expect(screen.getByText("discardDraft")).toBeTruthy();
    expect(screen.getByTestId("editor-input")).toBeTruthy();

    fireEvent.click(screen.getByText("discardDraft"));
    await waitFor(() => expect(screen.getByTestId("editor-readonly")).toBeTruthy());
    expect(screen.getByTestId("editor-readonly").textContent).toBe("# notes");
    expect(DISK["notes.txt"].content).toBe("# notes");
  });

  it("clears the modified marker once the autosave lands", async () => {
    const setModified = vi.fn();
    installRpc();
    mount(setModified);
    await openFile();
    await startEditing();

    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "dirty" } });
    await waitFor(() => expect(setModified).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(setModified).toHaveBeenLastCalledWith(false), { timeout: 3000 });
  });

  it("flushes the draft immediately when another file is opened", async () => {
    installRpc();
    mount();
    await openFile();
    await startEditing();

    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "pending draft" } });
    fireEvent.click(await screen.findByText("other.txt"));

    await waitFor(() => expect(DISK["notes.txt"].content).toBe("pending draft"));
  });

  it("does not autosave when the setting is off, but ⌘S still writes", async () => {
    testSettings.values = { autoSaveFile: false };
    installRpc();
    mount();
    await openFile();
    await startEditing();

    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "manual only" } });
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(DISK["notes.txt"].content).toBe("# notes");
    expect(screen.getByText("unsaved")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("save"));
    await waitFor(() => expect(DISK["notes.txt"].content).toBe("manual only"));
  });

  it("hides the edit entry for non-editable files", async () => {
    seed("notes.txt", "# notes", false);
    installRpc();
    mount();
    await openFile();
    expect(screen.queryByLabelText("editFile")).toBeNull();
  });

  it("switches markdown between rendered preview and source", async () => {
    installRpc();
    mount();
    fireEvent.click(await screen.findByText("docs.md"));
    await waitFor(() => expect(screen.getByTestId("markdown").textContent).toContain("# markdown"));

    fireEvent.click(screen.getByLabelText("diff"));
    await waitFor(() => expect(screen.getByTestId("editor-readonly")).toBeTruthy());
    expect(screen.getByTestId("editor-readonly").textContent).toBe("# markdown");
  });

  it("falls back to plain text for oversized files", async () => {
    seed("notes.txt", "x".repeat(400_001));
    installRpc();
    mount();
    fireEvent.click(await screen.findByText("notes.txt"));
    await screen.findByText("fileTooLarge");
    expect(screen.queryByTestId("editor-readonly")).toBeNull();
  });
});
