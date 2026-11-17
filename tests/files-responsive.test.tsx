import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import type { PanelMode } from "../client/layout";
import type { Strings } from "../client/strings";
import { rpc, type RpcHandler } from "./stubs/plugin-client";

/**
 * 回归：窄面板里文件页是单列二选一（树 ↔ 预览）。切到预览时目录树必须
 * 保留挂载并整列隐藏（display:"none"）而不是卸载——卸载会让 ScrollView
 * 重挂载，返回树时滚动位置归零。
 */

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

function installRpc() {
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

function mount(mode: PanelMode) {
  return render(
    <QueryClientProvider client={newClient()}>
      <FilesTab
        cwd="/repo"
        repo=""
        theme={THEME}
        strings={STRINGS}
        mode={mode}
        tab={{ setModified: () => {} } as never}
      />
    </QueryClientProvider>,
  );
}

function treePane(): HTMLElement {
  return screen.getByTestId("files-tree-pane");
}

function isHidden(el: HTMLElement): boolean {
  return el.style.display === "none";
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
});

afterEach(() => {
  cleanup();
  rpc.handler = null;
  for (const key of Object.keys(DISK)) delete DISK[key];
});

describe("FilesTab 窄屏单列（树 ↔ 预览二选一）", () => {
  it("窄档初始只有树：树可见，无预览列", async () => {
    installRpc();
    mount("narrow");
    await screen.findByText("notes.txt");

    expect(isHidden(treePane())).toBe(false);
    expect(screen.queryByTestId("files-preview-pane")).toBeNull();
    expect(screen.queryByLabelText("back")).toBeNull();
  });

  it.each(["narrow", "medium"] as const)(
    "%s 档点文件：预览占满，树隐藏但保留挂载（返回时滚动位置不丢的机制）",
    async (mode) => {
      installRpc();
      mount(mode);
      await openFile();

      expect(screen.getByTestId("files-preview-pane")).toBeTruthy();
      expect(screen.getByLabelText("back")).toBeTruthy();
      expect(isHidden(treePane())).toBe(true);
      // 树未卸载：未打开的 other.txt 行仍在 DOM 里，只是整列 display:none。
      expect(screen.getByText("other.txt")).toBeTruthy();
    },
  );

  it.each(["narrow", "medium"] as const)("%s 档点返回键：回到树，预览消失", async (mode) => {
    installRpc();
    mount(mode);
    await openFile();
    fireEvent.click(screen.getByLabelText("back"));

    await waitFor(() => expect(isHidden(treePane())).toBe(false));
    expect(screen.queryByTestId("files-preview-pane")).toBeNull();
    // 回到树后可以再打开另一个文件（树交互已恢复）。
    fireEvent.click(screen.getByText("other.txt"));
    await waitFor(() => expect(screen.getByTestId("files-preview-pane")).toBeTruthy());
  });

  it("窄档编辑脏草稿后返回：先自动保存落盘再回树，草稿不丢", async () => {
    installRpc();
    mount("narrow");
    await openFile();
    await startEditing();
    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "# my draft" } });

    fireEvent.click(screen.getByLabelText("back"));

    // flushBeforeLeaving 会先 autosave flush：返回树时草稿已在磁盘上。
    await waitFor(() => expect(isHidden(treePane())).toBe(false));
    expect(DISK["notes.txt"].content).toBe("# my draft");
    expect(screen.queryByTestId("files-preview-pane")).toBeNull();
  });

  it("宽档保持两列并存：树可见，预览同时在", async () => {
    installRpc();
    mount("wide");
    await openFile();

    expect(screen.getByTestId("files-preview-pane")).toBeTruthy();
    expect(screen.getByLabelText("back")).toBeTruthy();
    expect(isHidden(treePane())).toBe(false);
    expect(screen.getByText("other.txt")).toBeTruthy();
  });
});
