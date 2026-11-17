import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChangesTab } from "../client/changes";
import type { Strings } from "../client/strings";
import type { GitSnapshot } from "../shared/git";
import { rpc } from "./stubs/plugin-client";

/**
 * 回归：目录型 change（isDirectory）出现在变更列表时，点击它会发起 git.diff
 * 请求，服务端对目录返回 `<path> is not a file`。目录条目必须不可触发 diff。
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
  modified: 0,
  untracked: 1,
  conflicted: 0,
  branchState: null,
  ahead: 0,
  behind: 0,
  hasUpstream: false,
  remote: null,
  lastCommit: null,
  changes: [
    { path: ".scratch/file-tree-context-menu", status: "untracked", staged: false, isDirectory: true },
  ],
  stats: {
    fileCount: 1,
    staged: 0,
    modified: 0,
    untracked: 1,
    insertions: 0,
    deletions: 0,
    lastChangeAt: null,
    headCommittedAt: null,
    partial: false,
  },
  truncated: false,
  checkedAt: 0,
};

const calls: string[] = [];

afterEach(() => {
  cleanup();
  rpc.handler = null;
  calls.length = 0;
});

function installRpc() {
  rpc.handler = (name) => {
    calls.push(name);
    if (name === "git.diff")
      return (async () => ({
        ok: true,
        text: "@@",
        binary: false,
        tooLarge: false,
        newLines: 1,
      })) as never;
    if (name === "git.stash-list") return (async () => ({ entries: [] })) as never;
    if (name === "git.last-message") return (async () => ({ message: "" })) as never;
    if (name === "git.action") return (async () => ({ ok: true })) as never;
    return (async () => ({})) as never;
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

function tree(view: "flat" | "tree") {
  return (
    <QueryClientProvider client={newClient()}>
      <ChangesTab
        cwd="/repo"
        repo=""
        snapshot={SNAPSHOT}
        theme={THEME}
        strings={STRINGS}
        mode="narrow"
        initialView={view}
        initialDiffMode="unified"
      />
    </QueryClientProvider>
  );
}

describe("目录型变更条目不可触发 diff", () => {
  for (const view of ["flat", "tree"] as const) {
    it(`${view} 视图：点击目录条目不发 git.diff`, async () => {
      installRpc();
      render(tree(view));

      if (view === "tree") {
        // 树视图先把 .scratch 分组展开，叶子才会出现。
        fireEvent.click(screen.getByRole("button", { name: ".scratch" }));
      }
      const row = screen.getByRole("button", { name: /file-tree-context-menu/ });
      fireEvent.click(row);
      // react-query 异步发起；等待一拍确认没有请求出去。
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(calls).not.toContain("git.diff");
      expect(screen.queryByTestId("modal")).toBeNull();
    });
  }
});
