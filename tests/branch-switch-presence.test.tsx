import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OverviewTab } from "../client/overview";
import type { PanelMode } from "../client/layout";
import type { Strings } from "../client/strings";
import type { GitSnapshot } from "../shared/git";
import { rpc, type RpcHandler } from "./stubs/plugin-client";

/**
 * 反馈环：总览页的「分支切换能力」在三个档位都必须存在——
 * 宽档左侧分支栏内联可点；窄/中档通过分支入口按钮打开弹层后可点。
 * 任何一档点不到分支行、或弹层里出不来 Checkout 按钮，本环变红。
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
  local: [
    { name: "main", shortHash: "aaa" },
    { name: "feature-x", shortHash: "bbb" },
  ],
  remote: [],
  tags: [],
};

function installRpc() {
  rpc.handler = (name) => {
    if (name === "git.refs") return (async () => REFS) as unknown as RpcHandler;
    if (name === "git.history")
      return (async () => ({ commits: [], hasMore: false })) as unknown as RpcHandler;
    if (name === "git.show")
      return (async () => ({
        commit: null,
        body: "",
        files: [],
        insertions: 0,
        deletions: 0,
      })) as unknown as RpcHandler;
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

function mountOverview(mode: PanelMode) {
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

async function settle() {
  await act(async () => {});
}

afterEach(() => {
  cleanup();
  rpc.handler = null;
});

describe("总览页分支切换能力（三档都必须存在）", () => {
  it("宽档：左侧分支栏内联，点非当前分支出 Checkout 按钮", async () => {
    installRpc();
    mountOverview("wide");

    expect(await screen.findByRole("button", { name: "feature-x" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "feature-x" }));

    expect(screen.getByRole("button", { name: "checkout feature-x" })).toBeTruthy();
  });

  for (const mode of ["narrow", "medium"] as const) {
    it(`${mode} 档：分支入口按钮 → 弹层 → 分支行 → Checkout 按钮`, async () => {
      installRpc();
      mountOverview(mode);
      await settle();

      // 入口：工具栏分支图标按钮。
      fireEvent.click(screen.getByRole("button", { name: "branches" }));
      await settle();

      // 弹层里看得到两个分支。
      expect(screen.getByRole("button", { name: "main" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "feature-x" })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "feature-x" }));
      expect(screen.getByRole("button", { name: "checkout feature-x" })).toBeTruthy();
    });
  }
});
