import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FilesTab } from "../client/files";
import type { Strings } from "../client/strings";
import { fireLongPress } from "./stubs/react-native";
import { rpc, testSettings, type RpcHandler } from "./stubs/plugin-client";
import { toastLog } from "./stubs/plugin-ui";

/**
 * 文件树上下文菜单（定案变体 B）的外部行为：分类型菜单项、两种触发、
 * 直通项（复制路径/保存禁用态）、对话框闭环（rename/delete + 当前打开
 * 文件的草稿保护与预览跟随）、Esc 关闭、失败 toast。
 * spec: .scratch/file-tree-context-menu/spec.md（测试接缝 1）。
 */

type Entry = { name: string; dir: boolean; size?: number };

const THEME = {
  colors: {
    accent: "#0af",
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

const DIR_ENTRIES: Record<string, Entry[]> = {
  "": [
    { name: "src", dir: true },
    { name: "README.md", dir: false, size: 12 },
  ],
};

const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
let fileEditable = false;
const dirCalls: string[] = [];

function installRpc(overrides?: { fsOp?: (input: Record<string, unknown>) => unknown }) {
  calls.length = 0;
  dirCalls.length = 0;
  rpc.handler = (name) => {
    if (name === "git.dir-list") {
      return (async (input: { repo: string; path: string }) => {
        dirCalls.push(input.path);
        const root = input.repo === "" ? "" : input.repo;
        const entries = input.path === "" ? (DIR_ENTRIES[root] ?? []) : [];
        return { path: input.path, entries, truncated: false };
      }) as unknown as RpcHandler;
    }
    if (name === "git.file-content") {
      return (async (input: { path: string }) => ({
        ok: true,
        path: input.path,
        variant: "text",
        content: `# ${input.path}`,
        size: 10,
        mtimeMs: 0,
        sha256: "sha",
        editable: fileEditable,
        tooLarge: false,
      })) as unknown as RpcHandler;
    }
    if (name === "git.fs-op") {
      return (async (input: { op: Record<string, unknown> }) => {
        calls.push({ name, input: input.op });
        if (overrides?.fsOp) return overrides.fsOp(input.op);
        return { ok: true, affectedDir: "" };
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

function mount(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <FilesTab
        cwd="/repo"
        repo=""
        theme={THEME}
        strings={STRINGS}
        mode="wide"
        tab={{ setModified: () => {} } as never}
      />
    </QueryClientProvider>,
  );
}

async function settle(ms = 25) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function row(name: string): Element {
  // 树行限定在树面板内（预览头部会显示同名路径，全局查询会歧义）
  const pane = screen.getByTestId("files-tree-pane");
  const text = within(pane).getByText(name);
  const row = text.closest("button");
  if (!row) throw new Error(`row button for ${name} not found`);
  return row;
}

function openMenuFor(name: string, how: "longpress" | "contextmenu") {
  const target = row(name);
  if (how === "longpress") {
    act(() => fireLongPress(target));
  } else {
    fireEvent.contextMenu(target);
  }
}

beforeEach(() => {
  testSettings.values = { allowFileEdit: true, allowSystemOpen: true };
  toastLog.length = 0;
  (globalThis as { __copied?: string }).__copied = undefined;
});

afterEach(() => {
  cleanup();
  rpc.handler = null;
});

describe("上下文菜单：触发与项集", () => {
  it("长按文件夹弹出菜单：文件夹项集（新建文件/新建文件夹/上传文件/删除）", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "longpress");
    expect(screen.getByText("contextNewFile")).toBeTruthy();
    expect(screen.getByText("contextNewFolder")).toBeTruthy();
    expect(screen.getByText("contextUpload")).toBeTruthy();
    expect(screen.getByText("delete")).toBeTruthy();
    expect(screen.queryByText("contextOpenWith")).toBeNull();
    expect(screen.queryByText("save")).toBeNull();
  });

  it("右键文件弹出菜单：文件项集（保存/用默认应用打开）", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("README.md")).toBeTruthy();
    await settle();
    openMenuFor("README.md", "contextmenu");
    expect(screen.getByText("save")).toBeTruthy();
    expect(screen.getByText("contextOpenWith")).toBeTruthy();
    expect(screen.queryByText("contextNewFile")).toBeNull();
    // 未打开的文件：保存项禁用
    const saveButton = screen.getByText("save").closest("button");
    expect(saveButton?.hasAttribute("disabled")).toBe(true);
  });

  it("Esc 关闭菜单", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "contextmenu");
    expect(screen.getByText("contextNewFile")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("contextNewFile")).toBeNull();
  });

  it("复制路径走剪贴板并关菜单", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "contextmenu");
    fireEvent.click(screen.getByText("contextCopyPath").closest("button")!);
    await settle();
    expect((globalThis as { __copied?: string }).__copied).toBe("src");
    expect(screen.queryByText("contextCopyPath")).toBeNull();
  });
});

describe("上下文菜单：对话框闭环", () => {
  it("删除文件夹：确认后发 fs-op delete（递归语义由服务端）", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "contextmenu");
    fireEvent.click(screen.getByText("delete").closest("button")!);
    // 确认框出现（含文件夹详情文案），确定后发 RPC
    const modal = within(screen.getByTestId("modal-content"));
    expect(modal.getByText("deleteFolderDetail")).toBeTruthy();
    fireEvent.click(modal.getByText("delete").closest("button")!);
    await settle();
    const op = calls.find((c) => c.name === "git.fs-op");
    expect(op?.input).toMatchObject({ kind: "delete", path: "src" });
  });

  it("新建文件：输入名称后发 createFile 到该文件夹", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "contextmenu");
    fireEvent.click(screen.getByText("contextNewFile").closest("button")!);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "new.ts" } });
    });
    fireEvent.click(within(screen.getByTestId("modal-content")).getByText("confirm").closest("button")!);
    await settle();
    const op = calls.find((c) => c.name === "git.fs-op");
    expect(op?.input).toMatchObject({ kind: "createFile", parentPath: "src", name: "new.ts" });
  });

  it("非法名称（含 / / .git）不发 RPC", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "contextmenu");
    fireEvent.click(screen.getByText("contextNewFile").closest("button")!);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "a/b" } });
    });
    fireEvent.click(within(screen.getByTestId("modal-content")).getByText("confirm").closest("button")!);
    await settle();
    expect(calls.find((c) => c.name === "git.fs-op")).toBeUndefined();
  });

  it("重命名：发 rename RPC，当前打开文件的预览跟随新路径", async () => {
    fileEditable = true;
    installRpc();
    mount(newClient());
    expect(await within(screen.getByTestId("files-tree-pane")).findByText("README.md")).toBeTruthy();
    await settle();
    // 打开文件（进入预览）
    fireEvent.click(row("README.md"));
    await settle();
    openMenuFor("README.md", "contextmenu");
    fireEvent.click(screen.getByText("contextRename").closest("button")!);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("README.md"); // 预填当前名称
    await act(async () => {
      fireEvent.change(input, { target: { value: "INTRO.md" } });
    });
    fireEvent.click(within(screen.getByTestId("modal-content")).getByText("confirm").closest("button")!);
    await settle();
    const op = calls.find((c) => c.name === "git.fs-op");
    expect(op?.input).toMatchObject({ kind: "rename", path: "README.md", newName: "INTRO.md" });
    // 预览头部跟随新路径
    expect(within(screen.getByTestId("files-preview-pane")).getByText("INTRO.md")).toBeTruthy();
    fileEditable = false;
  });

  it("fs-op 失败时 toast 展示原因", async () => {
    installRpc({
      fsOp: () => ({ ok: false, error: { code: "already-exists", message: "already exists" } }),
    });
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "contextmenu");
    fireEvent.click(screen.getByText("delete").closest("button")!);
    fireEvent.click(within(screen.getByTestId("modal-content")).getByText("delete").closest("button")!);
    await settle();
    expect(toastLog.some((t) => t.kind === "error" && t.message === "already exists")).toBe(true);
  });
});
