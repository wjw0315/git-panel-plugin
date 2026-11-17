import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChangesTab } from "../client/changes";
import type { Strings } from "../client/strings";
import type { GitSnapshot } from "../shared/git";
import { rpc, type RpcHandler } from "./stubs/plugin-client";

/**
 * 回归：窄面板里变更页只放得下一栏。差异必须进弹层，不能和列表各占一半
 * （各占一半时两栏都窄到看不见内容）。
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
  dirty: true,
  staged: 0,
  modified: 1,
  untracked: 0,
  conflicted: 0,
      branchState: null,
  ahead: 0,
  behind: 0,
  hasUpstream: false,
  remote: null,
  lastCommit: null,
  changes: [{ path: "a.txt", status: "modified", staged: false }],
  stats: {
    fileCount: 1,
    staged: 0,
    modified: 1,
    untracked: 0,
    insertions: 1,
    deletions: 1,
    lastChangeAt: null,
    headCommittedAt: null,
    partial: false,
  },
  truncated: false,
  checkedAt: 0,
};

const DIFF = {
  ok: true as const,
  text: "@@ -1 +1 @@\n-old\n+new",
  binary: false,
  tooLarge: false,
  newLines: 3,
};

afterEach(() => {
  cleanup();
  rpc.handler = null;
});

function installRpc() {
  rpc.handler = (name) => {
    if (name === "git.diff") return (async () => DIFF) as unknown as RpcHandler;
    if (name === "git.stash-list")
      return (async () => ({ entries: [] })) as unknown as RpcHandler;
    if (name === "git.last-message")
      return (async () => ({ message: "" })) as unknown as RpcHandler;
    if (name === "git.action") return (async () => ({ ok: true })) as unknown as RpcHandler;
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

function tree(mode: "narrow" | "medium" | "wide") {
  return (
    <QueryClientProvider client={newClient()}>
      <ChangesTab
        cwd="/repo"
        repo=""
        snapshot={SNAPSHOT}
        theme={THEME}
        strings={STRINGS}
        mode={mode}
        initialView="flat"
        initialDiffMode="unified"
      />
    </QueryClientProvider>
  );
}

describe("变更页在窄/中档只渲染列表，差异进弹层", () => {
  for (const mode of ["narrow", "medium"] as const) {
    it(`${mode} 档：初始无内联差异，点文件后弹层里出差异`, async () => {
      installRpc();
      render(tree(mode));

      expect(screen.queryByText("diff")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "a.txt" }));

      const modal = screen.getByTestId("modal");
      expect(await within(modal).findByText("@@ -1 +1 @@")).toBeTruthy();
      // 工单 04：窄/中档强制统一视图，弹层里不再出现对照切换开关；
      // 展开全部仍可用。
      expect(within(modal).queryByRole("button", { name: "unified" })).toBeNull();
      expect(within(modal).queryByRole("button", { name: "split" })).toBeNull();
      expect(within(modal).getByRole("button", { name: "expandAll" })).toBeTruthy();

      fireEvent.click(within(modal).getByTestId("modal-close"));
      expect(screen.queryByTestId("modal")).toBeNull();
    });
  }
});

describe("变更页在宽档左右分栏", () => {
  it("点文件只更新右侧差异，不弹层", async () => {
    installRpc();
    render(tree("wide"));

    fireEvent.click(screen.getByRole("button", { name: "a.txt" }));

    expect(screen.queryByTestId("modal")).toBeNull();
    expect(await screen.findByText("@@ -1 +1 @@")).toBeTruthy();
    expect(screen.getByText("old")).toBeTruthy();
  });
});

describe("宽拖窄时已选文件不丢", () => {
  it("宽档选中后切窄档，差异退回弹层且仍可打开", async () => {
    installRpc();
    const view = render(tree("wide"));

    fireEvent.click(screen.getByRole("button", { name: "a.txt" }));
    expect(await screen.findByText("@@ -1 +1 @@")).toBeTruthy();

    view.rerender(tree("narrow"));
    expect(screen.queryByText("@@ -1 +1 @@")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "a.txt" }));
    const modal = screen.getByTestId("modal");
    expect(await within(modal).findByText("@@ -1 +1 @@")).toBeTruthy();
  });
});
