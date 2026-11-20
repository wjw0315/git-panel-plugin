import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { afterEach, describe, expect, it } from "vitest";
import { GitPanel } from "../client/panel";
import type { GitSnapshot } from "../shared/git";
import { rpc, type RpcHandler } from "./stubs/plugin-client";

/**
 * 回归（移动端）：切换仓库弹层只显示前 9 条，11 个仓库里最后 3 个
 * （geer2-ui-admin-vue3-xnm / geer2-xnm-devops / xxl-job）既看不到也滚不动。
 *
 * 根因：仓库列表包在 `maxHeight: 420` 的内嵌 ScrollView 里。弹层正文本身已是
 * 宿主的 sheet 滚动容器，内嵌滚动会被 sheet 手势吃掉，超出 420 的行就被裁掉。
 * 现在列表直接交给弹层正文滚动，且不得再加固定高度上限。
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
  branch: "master",
  head: COMMIT.shortHash,
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

/** 11 条 = 工作区 + 10 个嵌套仓库，与出问题的 geer2-xnm-code 工作区同形。 */
const REPOS = [
  { path: "", root: "/repo", name: "geer2-xnm-code", kind: "workspace" as const, branch: "master" },
  ...[
    "geer2-c-app-xnm",
    "geer2-design-company-xnm",
    "geer2-design-ui-xnm",
    "geer2-h5-xlm",
    "geer2-platforms-xnm",
    "geer2-tool-xnm",
    "geer2-ui-admin-platform-vue3-xnm",
    "geer2-ui-admin-vue3-xnm",
    "geer2-xnm-devops",
    "xxl-job",
  ].map((name) => ({
    path: name,
    root: `/repo/${name}`,
    name,
    kind: "nested" as const,
    branch: "master",
  })),
];

const PANEL_PROPS = {
  theme: THEME,
  layout: { compact: true, platform: "ios" },
  workspaceId: "ws",
  tab: { setModified: () => {} },
} as unknown as PluginWorkspacePanelProps;

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function installRpc() {
  rpc.handler = (name) => {
    if (name === "git.repos") return (async () => ({ cwd: "/repo", repos: REPOS })) as unknown as RpcHandler;
    if (name === "git.snapshot")
      return (async () => ({ ok: true, value: SNAPSHOT })) as unknown as RpcHandler;
    if (name === "git.refs")
      return (async () => ({
        current: "master",
        defaultBranch: "master",
        local: [{ name: "master", shortHash: COMMIT.shortHash }],
        remote: [],
        tags: [],
      })) as unknown as RpcHandler;
    if (name === "git.history")
      return (async () => ({ commits: [{ ...COMMIT, parents: [], refs: [] }], hasMore: false })) as unknown as RpcHandler;
    throw new Error(`Unexpected RPC in this test: ${name}`);
  };
}

async function openSwitcher() {
  installRpc();
  render(
    <QueryClientProvider client={newClient()}>
      <GitPanel {...PANEL_PROPS} />
    </QueryClientProvider>,
  );
  const trigger = await screen.findByRole("button", { name: "Switch repository" });
  // 仓库列表就绪前入口是禁用的（hasRepo=false）。
  await waitFor(() => expect(trigger.hasAttribute("disabled")).toBe(false));
  await act(async () => {
    fireEvent.click(trigger);
  });
  return screen.getByTestId("modal");
}

afterEach(() => {
  cleanup();
  rpc.handler = null;
});

describe("切换仓库弹层：所有仓库都可达", () => {
  it("11 个仓库全部渲染进弹层", async () => {
    const modal = await openSwitcher();
    for (const repo of REPOS) {
      expect(modal.textContent).toContain(repo.name === "geer2-xnm-code" ? "Workspace" : repo.name);
    }
  });

  it("弹层里没有固定高度上限，列表不被裁掉", async () => {
    const modal = await openSwitcher();
    const capped = Array.from(modal.querySelectorAll<HTMLElement>("[style]"))
      .map((el) => el.style.maxHeight)
      .filter((value) => value !== "");
    expect(capped).toEqual([]);
  });
});
