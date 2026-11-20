import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStatus, buildSnapshot } from "../server/snapshot";

/**
 * 回归：变更页把「未跟踪目录」当成文件条目下发，客户端点击后走 diff 接口，
 * 服务端返回 `<path> is not a file`。
 * （真实案例：.scratch/file-tree-context-menu/ 在变更列表里显示成一个
 * "文件夹"，点击即报错。）
 */

const root = mkdtempSync(join(tmpdir(), "git-panel-untracked-"));
execFileSync("git", ["init", "-q"], { cwd: root });
execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
execFileSync("git", ["config", "user.name", "t"], { cwd: root });
writeFileSync(join(root, "tracked.txt"), "hello\n");
execFileSync("git", ["add", "."], { cwd: root });
execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: root });
mkdirSync(join(root, "scratch-notes"), { recursive: true });
writeFileSync(join(root, "scratch-notes/a.md"), "a\n");
writeFileSync(join(root, "scratch-notes/b.md"), "b\n");

describe("parseStatus：未跟踪目录的折叠条目", () => {
  it("porcelain 的 `?? dir/` 解析为 isDirectory 条目", () => {
    const changes = parseStatus("\u0000?? scratch-notes/\u0000");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: "scratch-notes",
      status: "untracked",
      isDirectory: true,
    });
  });
});

describe("buildSnapshot：变更列表不得把目录当文件下发", () => {
  it("未跟踪目录展开为其中每个文件", async () => {
    const snap = await buildSnapshot(root, "");
    const dirEntry = snap.changes.find((change) => change.isDirectory);
    expect(dirEntry).toBeUndefined();

    const untracked = snap.changes
      .filter((change) => change.status === "untracked")
      .map((change) => change.path);
    expect(untracked).toContain("scratch-notes/a.md");
    expect(untracked).toContain("scratch-notes/b.md");
    expect(untracked).not.toContain("scratch-notes");
  });

  it("目录里的文件可正常统计行数（enrichment 不再把目录当文件读）", async () => {
    const snap = await buildSnapshot(root, "");
    const a = snap.changes.find((change) => change.path === "scratch-notes/a.md");
    expect(a?.insertions).toBe(1);
  });
});
