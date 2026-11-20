import type { z } from "zod";
import type { GitCommit, showRpc } from "../shared/git";
import { GitError, git } from "./git";
import { resolveRepoRoot } from "./repos";
import { statusOf } from "./snapshot";

type ShowInput = z.output<typeof showRpc.input>;
type ShowOutput = z.input<typeof showRpc.output>;

const FIELD = "\x1f";

function parseNumstat(stdout: string): { insertions: number; deletions: number } {
  let insertions = 0;
  let deletions = 0;
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    const [add, del] = line.split("\t");
    const added = Number(add);
    const removed = Number(del);
    if (Number.isFinite(added)) insertions += added;
    if (Number.isFinite(removed)) deletions += removed;
  }
  return { insertions, deletions };
}

export async function getShow(input: ShowInput): Promise<ShowOutput> {
  const root = await resolveRepoRoot(input.cwd, input.repo);
  const meta = await git(root, ["show", "-s", `--format=%H${FIELD}%h${FIELD}%an${FIELD}%aI${FIELD}%s`, input.ref], {
    accept: [128],
  });
  if (meta.code !== 0) {
    throw new GitError("not-found", meta.stderr.trim() || `Unknown revision ${input.ref}`);
  }
  const parts = meta.stdout.trim().split(FIELD);
  const commit: GitCommit | null =
    parts.length >= 5 && parts[0]
      ? {
          hash: parts[0],
          shortHash: parts[1] ?? "",
          author: parts[2] ?? "",
          dateIso: parts[3] ?? "",
          subject: parts.slice(4).join(FIELD),
        }
      : null;

  const [bodyResult, filesResult, numstatResult] = await Promise.all([
    git(root, ["show", "-s", "--format=%b", input.ref], { accept: [128] }),
    git(root, ["show", "--format=", "--name-status", "--find-renames", input.ref], {
      accept: [128],
    }),
    git(root, ["show", "--format=", "--numstat", "--find-renames", input.ref], {
      accept: [128],
    }),
  ]);

  const files: Array<{ path: string; status: ReturnType<typeof statusOf> }> = [];
  for (const line of filesResult.stdout.split("\n")) {
    if (line.trim() === "") continue;
    const parts = line.split("\t");
    const code = parts[0]?.[0] ?? "";
    const path = parts.length >= 3 ? (parts[2] ?? "") : (parts[1] ?? "");
    if (path === "") continue;
    files.push({ path, status: statusOf(code) });
  }

  const totals = parseNumstat(numstatResult.stdout);
  return {
    commit,
    body: bodyResult.stdout.trim(),
    files,
    insertions: totals.insertions,
    deletions: totals.deletions,
  };
}
