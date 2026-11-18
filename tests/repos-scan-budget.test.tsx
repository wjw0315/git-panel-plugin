import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 复现：切换仓库列表在提交风暴下只剩 workspace 一条。
 *
 * collectRepos 的扫描预算从 repoTop() 调用前开始计时，而 repoTop 与
 * currentBranch(workspace) 是两个串行 git 子进程。连续点击提交会让
 * 面板全量刷新（status/diff/graph 并发），git 子进程排队，这两个前置
 * 调用一旦合计超过 SCAN_BUDGET_MS，BFS 一轮都不进，嵌套仓库全部丢失。
 */
const gitMock = vi.hoisted(() => ({
  calls: 0,
  slowFirstN: 0,
  slowMs: 0,
}));

vi.mock("../server/git", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/git")>();
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  return {
    ...actual,
    git: async (cwd: string, args: readonly string[]) => {
      gitMock.calls += 1;
      if (gitMock.calls <= gitMock.slowFirstN) await sleep(gitMock.slowMs);
      if (args[0] === "rev-parse") return { stdout: `${cwd}\n`, stderr: "", code: 0 };
      if (args[0] === "symbolic-ref") return { stdout: "master\n", stderr: "", code: 0 };
      return { stdout: "", stderr: "", code: 0 };
    },
  };
});

const { listRepos } = await import("../server/repos");

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "gitpanel-reposcan-"));
  await mkdir(join(root, "nested-a", ".git"), { recursive: true });
  await mkdir(join(root, "nested-b", ".git"), { recursive: true });
  gitMock.calls = 0;
  gitMock.slowFirstN = 0;
  gitMock.slowMs = 0;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  root = "";
});

describe("repo scan under commit-storm latency", () => {
  it("基线：无延迟时返回 workspace + 2 个嵌套仓库", async () => {
    const result = await listRepos(root);
    expect(result.repos).toHaveLength(3);
    expect(result.repos[0].kind).toBe("workspace");
    expect(result.repos.map((entry) => entry.name)).toContain("nested-a");
    expect(result.repos.map((entry) => entry.name)).toContain("nested-b");
  });

  it("前两个 git 调用各 800ms 时仍应返回全部 3 个仓库（当前丢光嵌套 = RED）", async () => {
    gitMock.slowFirstN = 2;
    gitMock.slowMs = 800;
    const result = await listRepos(root);
    expect(result.repos).toHaveLength(3);
  });
});
