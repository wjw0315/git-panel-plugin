import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { afterEach, describe, expect, it } from "vitest";
import { ChangesTab } from "../client/changes";
import { GitPanel } from "../client/panel";
import type { Strings } from "../client/strings";
import type { GitSnapshot } from "../shared/git";
import { fireLayout } from "./stubs/react-native";
import { rpc, type RpcHandler } from "./stubs/plugin-client";

/**
 * 回归：面板极窄（320px）时所有操作仍可见可点——页签收成图标（无障碍
 * 标签与计数保留）、页头不溢出、提交详情头与提交输入区完整渲染，且
 * 全面板没有任何超过面板宽度的固定宽度样式。
 */

const THEME = {
  colors: {
    accent: "#0af",
    accentForeground: "#fff",
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

const COMMIT = {
  hash: "abcdef1234567890",
  shortHash: "abcdef1",
  subject: "fix: something",
  author: "dev",
  dateIso: "2026-11-17T00:00:00Z",
};

const SNAPSHOT: GitSnapshot = {
  root: "/repo",
  name: "repo",
  branch: "main",
  head: COMMIT.shortHash,
  unborn: false,
  detached: false,
  dirty: true,
  staged: 1,
  modified: 1,
  untracked: 0,
  conflicted: 0,
      branchState: null,
  ahead: 0,
  behind: 0,
  hasUpstream: false,
  remote: null,
  lastCommit: null,
  changes: [{ path: "a.txt", status: "modified", staged: true }],
  stats: {
    fileCount: 1,
    staged: 1,
    modified: 1,
    untracked: 0,
    insertions: 2,
    deletions: 1,
    lastChangeAt: null,
    headCommittedAt: null,
    partial: false,
  },
  truncated: false,
  checkedAt: 0,
};

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

const PANEL_PROPS = {
  theme: THEME,
  layout: { compact: false, platform: "web" },
  workspaceId: "ws",
  tab: { setModified: () => {} },
} as unknown as PluginWorkspacePanelProps;

function installPanelRpc() {
  rpc.handler = (name) => {
    if (name === "git.repos")
      return (async () => ({
        cwd: "/repo",
        repos: [
          { path: "", root: "/repo", name: "repo", kind: "workspace", branch: "main" },
        ],
      })) as unknown as RpcHandler;
    if (name === "git.snapshot")
      return (async () => ({ ok: true, value: SNAPSHOT })) as unknown as RpcHandler;
    if (name === "git.refs")
      return (async () => ({
        current: "main",
        defaultBranch: "main",
        local: [{ name: "main", shortHash: COMMIT.shortHash }],
        remote: [],
        tags: [],
      })) as unknown as RpcHandler;
    if (name === "git.history")
      return (async () => ({
        commits: [{ ...COMMIT, parents: [], refs: [] }],
        hasMore: false,
      })) as unknown as RpcHandler;
    if (name === "git.show")
      return (async () => ({
        commit: COMMIT,
        body: "body",
        files: [{ path: "a.txt", status: "modified" }],
        insertions: 2,
        deletions: 1,
      })) as unknown as RpcHandler;
    throw new Error(`Unexpected RPC in this test: ${name}`);
  };
}

/** 收集面板里所有落进 DOM 的固定宽度（stub 只透传数值 width），断言不越界面板宽度。 */
function fixedWidthsExceeding(panelWidth: number): string[] {
  const offenders: string[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[style]"))) {
    const width = el.style.width;
    if (width.endsWith("px") && Number.parseFloat(width) > panelWidth) {
      offenders.push(`${el.getAttribute("data-testid") ?? el.tagName}:${width}`);
    }
  }
  return offenders;
}

async function settle() {
  await act(async () => {});
}

afterEach(() => {
  cleanup();
  rpc.handler = null;
});

describe("面板 320px：页签收成图标", () => {
  it("三个页签全部可访问（图标 + 计数 + 无障碍标签），文字隐藏", async () => {
    installPanelRpc();
    render(
      <QueryClientProvider client={newClient()}>
        <GitPanel {...PANEL_PROPS} />
      </QueryClientProvider>,
    );
    const root = screen.getByTestId("git-panel");
    expect(await screen.findByRole("button", { name: "main" })).toBeTruthy();

    act(() => {
      fireLayout(root, 320);
    });
    await settle();

    // GitPanel 内部用 useStrings()，文案是真实英文表而非测试 proxy。
    for (const name of ["Overview", "Changes", "Files"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    // 文字收起：标签文本不再出现（无障碍标签仍指向同名）。
    expect(screen.queryByText("Overview")).toBeNull();
    expect(screen.queryByText("Files")).toBeNull();
  });

  it("页头图标按钮仍全部渲染，全面板无越界固定宽度", async () => {
    installPanelRpc();
    render(
      <QueryClientProvider client={newClient()}>
        <GitPanel {...PANEL_PROPS} />
      </QueryClientProvider>,
    );
    const root = screen.getByTestId("git-panel");
    await screen.findByRole("button", { name: "main" });

    act(() => {
      fireLayout(root, 320);
    });
    await settle();

    expect(screen.getByRole("button", { name: "Fetch" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch repository" })).toBeTruthy();

    const offenders = fixedWidthsExceeding(320);
    expect(offenders).toEqual([]);
  });
});

describe("面板 320px：提交详情头全部可点", () => {
  it("窄档选中提交后，返回/复制/打标签/回退/重置按钮全部渲染", async () => {
    installPanelRpc();
    render(
      <QueryClientProvider client={newClient()}>
        <GitPanel {...PANEL_PROPS} />
      </QueryClientProvider>,
    );
    const root = screen.getByTestId("git-panel");
    await screen.findByRole("button", { name: "main" });

    act(() => {
      fireLayout(root, 320);
    });
    await settle();

    fireEvent.click(
      screen.getByRole("button", { name: `${COMMIT.shortHash} ${COMMIT.subject}` }),
    );
    await settle();

    for (const name of ["Back", "Copy hash", "Create tag", "Revert", "Reset"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    // 返回键回到提交列表。
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await settle();
    expect(
      screen.getByRole("button", { name: `${COMMIT.shortHash} ${COMMIT.subject}` }),
    ).toBeTruthy();
  });
});

describe("面板 320px：提交输入区不裁切", () => {
  it("amend 复选框、暂存统计与提交按钮全部渲染", () => {
    rpc.handler = (name) => {
      if (name === "git.diff") return (async () => ({ ok: true, text: "" })) as unknown as RpcHandler;
      if (name === "git.last-commit-message")
        return (async () => ({ message: "" })) as unknown as RpcHandler;
      throw new Error(`Unexpected RPC in this test: ${name}`);
    };
    render(
      <QueryClientProvider client={newClient()}>
        <ChangesTab
          cwd="/repo"
          repo=""
          snapshot={SNAPSHOT}
          theme={THEME}
          strings={STRINGS}
          mode="narrow"
          initialView="flat"
          initialDiffMode="unified"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("checkbox", { name: "amend" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "commit" })).toBeTruthy();
    // 暂存统计文本存在（flex:1 可收缩 + 容器可换行，不会被挤出屏幕）。
    expect(screen.getByText(/1 staged/)).toBeTruthy();
  });
});
