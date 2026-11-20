import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FilesTab } from "../client/files";
import type { Strings } from "../client/strings";
import { fireLongPress, mockWindowOrigin } from "./stubs/react-native";
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

function installRpc(overrides?: {
  fsOp?: (input: Record<string, unknown>) => unknown;
  dirRoot?: string | null;
}) {
  calls.length = 0;
  dirCalls.length = 0;
  rpc.handler = (name) => {
    if (name === "git.dir-list") {
      return (async (input: { repo: string; path: string }) => {
        dirCalls.push(input.path);
        const root = input.repo === "" ? "" : input.repo;
        const entries = input.path === "" ? (DIR_ENTRIES[root] ?? []) : [];
        return { path: input.path, root: overrides?.dirRoot !== undefined ? overrides.dirRoot : "/repo", entries, truncated: false };
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
    if (name === "git.panel-error") {
      return (async () => ({ ok: true })) as unknown as RpcHandler;
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
    expect(screen.getByText("contextCopyPathRelative")).toBeTruthy();
    expect(screen.getByText("contextCopyPathAbsolute")).toBeTruthy();
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

  it("复制相对路径：写入仓库相对路径并关菜单", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "contextmenu");
    fireEvent.click(screen.getByText("contextCopyPathRelative").closest("button")!);
    await settle();
    expect((globalThis as { __copied?: string }).__copied).toBe("src");
    expect(screen.queryByText("contextCopyPathRelative")).toBeNull();
  });

  it("复制绝对路径：daemon 仓库根 + 相对路径", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "contextmenu");
    fireEvent.click(screen.getByText("contextCopyPathAbsolute").closest("button")!);
    await settle();
    expect((globalThis as { __copied?: string }).__copied).toBe("/repo/src");
    expect(screen.queryByText("contextCopyPathAbsolute")).toBeNull();
  });

  it("仓库根缺失时绝对路径项禁用", async () => {
    installRpc({ dirRoot: null });
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "contextmenu");
    const absButton = screen.getByText("contextCopyPathAbsolute").closest("button");
    expect(absButton?.hasAttribute("disabled")).toBe(true);
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

describe("上下文菜单：锚定定位（回归：不跟手/跑位）", () => {
  it("右键坐标经面板原点换算，且测量完成前菜单不可见", async () => {
    mockWindowOrigin.x = 200; // 树面板在窗口 (200, 60)，宽 280 高 400
    mockWindowOrigin.y = 60;
    mockWindowOrigin.width = 280;
    mockWindowOrigin.height = 400;
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    // 在面板内 (260, 150) 处右键 → 面板内坐标应为 (52, 96)
    fireEvent.contextMenu(row("src"), { clientX: 260, clientY: 150 });
    await settle(0); // 只跑一帧：测量回调已排程
    const menu = screen.getByTestId("context-menu");
    const style = (menu as HTMLElement).style;
    if (style.opacity === "0") {
      // 首帧隐藏等测量：第二帧后必须落在换算后的坐标
      await settle();
    }
    expect(parseFloat(style.left)).toBeCloseTo(52, 0); // 260-200-8
    expect(parseFloat(style.top)).toBeCloseTo(96, 0); // 150-60+6
    mockWindowOrigin.x = 0;
    mockWindowOrigin.y = 0;
    mockWindowOrigin.width = 0;
    mockWindowOrigin.height = 0;
  });

  it("坐标贴近面板右缘时回卷，不越出面板", async () => {
    mockWindowOrigin.x = 200;
    mockWindowOrigin.y = 60;
    mockWindowOrigin.width = 280;
    mockWindowOrigin.height = 400;
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    // 右键点在面板几乎最右侧（面板内 x=270 → 菜单宽 220 放不下）
    fireEvent.contextMenu(row("src"), { clientX: 470, clientY: 150 });
    await settle(0);
    const menu = screen.getByTestId("context-menu");
    const style = (menu as HTMLElement).style;
    if (style.opacity === "0") await settle();
    expect(parseFloat(style.left)).toBeLessThanOrEqual(280 - 224 + 4);
    mockWindowOrigin.x = 0;
    mockWindowOrigin.y = 0;
    mockWindowOrigin.width = 0;
    mockWindowOrigin.height = 0;
  });
});

describe("上下文菜单：移动端长按定位（回归：跑到屏幕下面）", () => {
  it("长按 event 带 pageX/pageY 时走锚定坐标路径", async () => {
    mockWindowOrigin.x = 0;
    mockWindowOrigin.y = 0;
    mockWindowOrigin.width = 360;
    mockWindowOrigin.height = 640;
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    // 手机长按：native pageX/pageY（相对视口）
    fireLongPress(row("src"), { pageX: 120, pageY: 200 });
    await settle(0);
    const menu = screen.getByTestId("context-menu");
    const style = (menu as HTMLElement).style;
    await settle();
    expect(parseFloat(style.left)).toBeCloseTo(112, 0); // 120-0-8
    expect(parseFloat(style.top)).toBeCloseTo(206, 0); // 200-0+6
    mockWindowOrigin.width = 0;
    mockWindowOrigin.height = 0;
  });

  it("长按无坐标时 fallback 落在面板顶部区（top 定位，不落底部）", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    fireLongPress(row("src")); // 无 event：坐标缺失
    await settle();
    const menu = screen.getByTestId("context-menu");
    const style = (menu as HTMLElement).style;
    expect(style.top).toBe("80px");
    expect(style.bottom).toBe(""); // 不得再用 bottom 锚定（手机上会落到可视区外）
  });
});

describe("上下文菜单：点击外围关闭", () => {
  it("文档内点击菜单外任意位置（window pointerdown）关闭菜单", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "contextmenu");
    expect(screen.getByText("contextNewFile")).toBeTruthy();
    // 点击发生在插件面板之外（target 不是菜单）
    await act(async () => {
      fireEvent.pointerDown(window, { target: document.body });
    });
    expect(screen.queryByText("contextNewFile")).toBeNull();
  });

  it("点击菜单内部不关闭", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "contextmenu");
    const menu = screen.getByTestId("context-menu");
    await act(async () => {
      fireEvent.pointerDown(menu, { target: menu });
    });
    expect(screen.getByText("contextNewFile")).toBeTruthy();
  });

  it("点击透明遮罩层（backdrop）关闭菜单", async () => {
    installRpc();
    mount(newClient());
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    openMenuFor("src", "contextmenu");
    const backdrop = screen.getByLabelText("close", { selector: "button" });
    fireEvent.click(backdrop);
    expect(screen.queryByText("contextNewFile")).toBeNull();
  });
});
