import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../server/snapshot";

/**
 * 回归：push 之后面板顶栏的 `↑1` 一直挂着。
 *
 * buildSnapshot 会把上一份快照喂回来做增量省算力，但「上一份是否可复用」的
 * 指纹只看 HEAD / 分支 / 工作区变更——push 不移动这三样，于是一次 push 之后
 * 每次轮询都原样返回旧快照，ahead 永远停在 push 前的数字，直到工作区出现改动。
 */

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

describe("buildSnapshot：push 后 ahead/behind 必须刷新", () => {
  it("工作区与 HEAD 都没动时，也不得复用上一份快照里的 ahead", async () => {
    const base = mkdtempSync(join(tmpdir(), "git-panel-ahead-"));
    const remote = join(base, "remote.git");
    const work = join(base, "work");
    git(base, ["init", "-q", "--bare", remote]);

    git(base, ["clone", "-q", remote, work]);
    git(work, ["config", "user.email", "t@example.com"]);
    git(work, ["config", "user.name", "t"]);
    writeFileSync(join(work, "a.txt"), "1\n");
    git(work, ["add", "."]);
    git(work, ["commit", "-q", "-m", "init"]);
    git(work, ["push", "-q", "-u", "origin", "HEAD"]);

    writeFileSync(join(work, "b.txt"), "2\n");
    git(work, ["add", "."]);
    git(work, ["commit", "-q", "-m", "second"]);

    const beforePush = await buildSnapshot(work, "");
    expect(beforePush.ahead).toBe(1);

    git(work, ["push", "-q"]);

    // 轮询：同一个 cwd/repo，上一份快照作为 previous 喂回来。
    const afterPush = await buildSnapshot(work, "", { previous: beforePush });
    expect(afterPush.ahead).toBe(0);
    expect(afterPush.behind).toBe(0);
  }, 20_000);
});
