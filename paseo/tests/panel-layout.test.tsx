import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import { afterEach, describe, expect, it } from "vitest";
import {
  PANEL_NARROW_MAX,
  PANEL_WIDE_MIN,
  resolvePanelMode,
  usePanelMode,
} from "../client/layout";
import { OverviewTab } from "../client/overview";
import { GitPanel } from "../client/panel";
import type { Strings } from "../client/strings";
import type { GitSnapshot } from "../shared/git";
import { fireLayout } from "./stubs/react-native";
import { rpc, type RpcHandler } from "./stubs/plugin-client";

/**
 * 回归：宽窄必须按面板容器自己的宽度算。宿主给的窗口宽度在面板被拖窄时
 * 仍是全窗口宽度，按窗口宽度判定会强行保留三栏，把中间列表挤到不可见。
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

const SNAPSHOT: GitSnapshot = {
  root: "/repo",
  name: "repo",
  branch: "main",
  head: "aaa",
  unborn: false,
  detached: false,
  dirty: false,
  staged: 0,
  modified: 0,
  untracked: 0,
  conflicted: 0,
      branchState: null,
  ahead: 0,
  behind: 0,
  hasUpstream: false,
  remote: null,
  lastCommit: null,
  changes: [],
  stats: {
    fileCount: 0,
    staged: 0,
    modified: 0,
    untracked: 0,
    insertions: 0,
    deletions: 0,
    lastChangeAt: null,
    headCommittedAt: null,
    partial: false,
  },
  truncated: false,
  checkedAt: 0,
};

const REFS = {
  current: "main",
  defaultBranch: "main",
  local: [{ name: "main", shortHash: "aaa" }],
  remote: [],
  tags: [],
};

afterEach(() => {
  cleanup();
  rpc.handler = null;
});

describe("resolvePanelMode 档位边界", () => {
  it("窄于 560 为窄档，560 起为中档", () => {
    expect(resolvePanelMode(PANEL_NARROW_MAX - 1)).toBe("narrow");
    expect(resolvePanelMode(PANEL_NARROW_MAX)).toBe("medium");
  });

  it("860 起为宽档，859 仍是中档", () => {
    expect(resolvePanelMode(PANEL_WIDE_MIN - 1)).toBe("medium");
    expect(resolvePanelMode(PANEL_WIDE_MIN)).toBe("wide");
  });

  it("compact 恒为窄档，与宽度无关", () => {
    expect(resolvePanelMode(1200, true)).toBe("narrow");
  });
});

function Probe({ compact = false }: { compact?: boolean }) {
  const { mode, onLayout } = usePanelMode(compact);
  return (
    <View testID="probe" onLayout={onLayout}>
      <Text>{mode}</Text>
    </View>
  );
}

describe("usePanelMode 按容器实测宽度切换", () => {
  it("未测量时回退窗口宽度（stub 为 1024，判宽档）", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("wide");
  });

  it("窗口不变、容器拖窄后立刻降为单栏档", () => {
    render(<Probe />);
    act(() => fireLayout(screen.getByTestId("probe"), 500));
    expect(screen.getByTestId("probe").textContent).toBe("narrow");

    act(() => fireLayout(screen.getByTestId("probe"), 700));
    expect(screen.getByTestId("probe").textContent).toBe("medium");

    act(() => fireLayout(screen.getByTestId("probe"), 900));
    expect(screen.getByTestId("probe").textContent).toBe("wide");
  });

  it("compact 时即使容器很宽也是窄档", () => {
    render(<Probe compact />);
    expect(screen.getByTestId("probe").textContent).toBe("narrow");
  });
});

function installRpc() {
  rpc.handler = (name) => {
    if (name === "git.refs") return (async () => REFS) as unknown as RpcHandler;
    if (name === "git.history")
      return (async () => ({ commits: [], hasMore: false })) as unknown as RpcHandler;
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

function mountOverview(mode: "narrow" | "medium" | "wide") {
  return render(
    <QueryClientProvider client={newClient()}>
      <OverviewTab
        cwd="/repo"
        repo=""
        snapshot={SNAPSHOT}
        theme={THEME}
        strings={STRINGS}
        mode={mode}
      />
    </QueryClientProvider>,
  );
}

/** RPC 桩用已解决的 Promise，act 一次就能把查询结果灌进渲染。 */
async function settle() {
  await act(async () => {});
}

describe("概览页按档位切换栏数", () => {
  it("窄档不内联分支栏，改由工具栏按钮打开", async () => {
    installRpc();
    mountOverview("narrow");
    await settle();

    expect(screen.getByRole("button", { name: "branches" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "main" })).toBeNull();
  });

  it("中档同样为单栏", async () => {
    installRpc();
    mountOverview("medium");
    await settle();

    expect(screen.getByRole("button", { name: "branches" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "main" })).toBeNull();
  });

  it("宽档内联分支栏，工具栏不再出现分支按钮", async () => {
    installRpc();
    mountOverview("wide");

    expect(await screen.findByRole("button", { name: "main" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "branches" })).toBeNull();
  });
});

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
    if (name === "git.refs") return (async () => REFS) as unknown as RpcHandler;
    if (name === "git.history")
      return (async () => ({ commits: [], hasMore: false })) as unknown as RpcHandler;
    throw new Error(`Unexpected RPC in this test: ${name}`);
  };
}

describe("面板按容器宽度而不是窗口宽度判定", () => {
  it("窗口很宽、面板拖到 500px 时概览变单栏，拖回 900px 恢复三栏", async () => {
    installPanelRpc();
    render(
      <QueryClientProvider client={newClient()}>
        <GitPanel {...PANEL_PROPS} />
      </QueryClientProvider>,
    );
    const root = screen.getByTestId("git-panel");

    // 首帧还没量到容器宽度，回退窗口宽度（stub 1024），保持三栏。
    expect(await screen.findByRole("button", { name: "main" })).toBeTruthy();

    act(() => fireLayout(root, 500));
    expect(await screen.findByRole("button", { name: /^Branches$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "main" })).toBeNull();

    act(() => fireLayout(root, 900));
    expect(await screen.findByRole("button", { name: "main" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Branches$/ })).toBeNull();
  });
});
