import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import type { diffRpc } from "../shared/git";
import { git } from "./git";
import { assertSafeRelative } from "./paths";
import { resolveRepoRoot } from "./repos";
import { countLines, looksBinary } from "./text";

type DiffInput = z.output<typeof diffRpc.input>;
type DiffOutput = z.input<typeof diffRpc.output>;

const MAX_SYNTH_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_BYTES = 4 * 1024 * 1024;

export async function getDiff(input: DiffInput): Promise<DiffOutput> {
  const root = await resolveRepoRoot(input.cwd, input.repo);
  const path = input.path;
  assertSafeRelative(path);
  const context = input.context ?? 3;

  if (input.base === "worktree") {
    const status = await git(root, ["status", "--porcelain=v1", "-z", "--", path], {
      accept: [128],
    });
    if (status.stdout.startsWith("??")) {
      return synthesizeUntracked(root, path);
    }
  }

  let args: string[];
  let numstatArgs: string[];
  if (input.base === "worktree") {
    args = ["diff", "--no-color", "--no-ext-diff", `--unified=${context}`, "--", path];
    numstatArgs = ["diff", "--numstat", "--", path];
  } else if (input.base === "staged") {
    args = ["diff", "--cached", "--no-color", "--no-ext-diff", `--unified=${context}`, "--", path];
    numstatArgs = ["diff", "--cached", "--numstat", "--", path];
  } else {
    if (!input.commit) {
      return { ok: false, error: { code: "invalid-path", message: "commit is required" } };
    }
    args = [
      "show",
      "--format=",
      "--no-color",
      "--no-ext-diff",
      "--find-renames",
      `--unified=${context}`,
      input.commit,
      "--",
      path,
    ];
    numstatArgs = ["show", "--format=", "--numstat", "--find-renames", input.commit, "--", path];
  }

  const [diffResult, numstatResult] = await Promise.all([
    git(root, args, { accept: [128], maxBuffer: 32 * 1024 * 1024 }),
    git(root, numstatArgs, { accept: [128] }),
  ]);
  if (diffResult.code !== 0) {
    return {
      ok: false,
      error: { code: "git-error", message: diffResult.stderr.trim() || "git diff failed" },
    };
  }

  const binary = numstatResult.stdout.startsWith("-\t-");
  const text = binary ? "" : diffResult.stdout;
  const newLines = binary ? 0 : await countNewLines(root, input, path);
  return { ok: true, text, binary, tooLarge: false, newLines };
}

async function countNewLines(root: string, input: DiffInput, path: string): Promise<number> {
  try {
    let text: string;
    if (input.base === "worktree") {
      const absolute = join(root, path);
      const info = await stat(absolute);
      if (!info.isFile() || info.size > MAX_TEXT_BYTES) return 0;
      text = (await readFile(absolute)).toString("utf8");
    } else if (input.base === "staged") {
      const result = await git(root, ["show", `:${path}`], {
        accept: [128],
        maxBuffer: MAX_TEXT_BYTES,
      });
      if (result.code !== 0) return 0;
      text = result.stdout;
    } else if (input.commit) {
      const result = await git(root, ["show", `${input.commit}:${path}`], {
        accept: [128],
        maxBuffer: MAX_TEXT_BYTES,
      });
      if (result.code !== 0) return 0;
      text = result.stdout;
    } else {
      return 0;
    }
    return countLines(text);
  } catch {
    return 0;
  }
}

async function synthesizeUntracked(root: string, path: string): Promise<DiffOutput> {
  const absolute = join(root, path);
  let info;
  try {
    info = await stat(absolute);
  } catch {
    return { ok: false, error: { code: "file-not-found", message: `${path} does not exist` } };
  }
  if (!info.isFile()) {
    return { ok: false, error: { code: "invalid-path", message: `${path} is not a file` } };
  }
  if (info.size > MAX_SYNTH_BYTES) {
    return { ok: true, text: "", binary: false, tooLarge: true, newLines: 0 };
  }
  const buffer = await readFile(absolute);
  if (looksBinary(buffer)) {
    return { ok: true, text: "", binary: true, tooLarge: false, newLines: 0 };
  }
  const content = buffer.toString("utf8");
  const lines = content.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const tooLarge = lines.length > 5000;
  const shown = tooLarge ? lines.slice(0, 5000) : lines;
  const header = [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${path}`,
    `@@ -0,0 +1,${shown.length} @@`,
  ];
  const body = shown.map((line) => `+${line}`);
  return {
    ok: true,
    text: `${header.join("\n")}\n${body.join("\n")}\n`,
    binary: false,
    tooLarge,
    newLines: lines.length,
  };
}
