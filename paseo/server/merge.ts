import type { z } from "zod";
import type { mergePreviewRpc } from "../shared/git";
import { GitError, git, gitOut } from "./git";
import { resolveRepoRoot } from "./repos";

type MergePreviewInput = z.output<typeof mergePreviewRpc.input>;
type MergePreviewOutput = z.output<typeof mergePreviewRpc.output>;

/**
 * Update-branch preview: commit count, merge conflict pre-check and
 * workspace cleanliness.
 *
 * merge = commits the source brings in (HEAD..branch), plus a side-effect-free
 * `merge-tree --write-tree` rehearsal (git ≥ 2.38; older versions degrade to
 * previewSupported=false). rebase has no dry-run, so it reports only the
 * moved-commit count (branch..HEAD).
 */
export async function getMergePreview(input: MergePreviewInput): Promise<MergePreviewOutput> {
  try {
    const root = await resolveRepoRoot(input.cwd, input.repo);
    const range =
      input.operation === "rebase" ? `${input.branch}..HEAD` : `HEAD..${input.branch}`;
    const count = await gitOut(root, ["rev-list", "--count", range]);
    const status = await gitOut(root, ["status", "--porcelain"]);
    const workspaceClean = status.trim() === "";

    let conflicts: string[] | null = null;
    let previewSupported = false;
    if (input.operation === "merge") {
      // 0 = clean, 1 = conflicts, other codes = old git without --write-tree.
      const rehearsal = await git(root, ["merge-tree", "--write-tree", "HEAD", input.branch], {
        accept: [0, 1, 129],
      });
      if (rehearsal.code === 0 || rehearsal.code === 1) {
        previewSupported = true;
        conflicts = rehearsal.code === 1 ? parseMergeTreeConflicts(rehearsal.stdout) : [];
      }
    }

    return { ok: true, commitCount: Number.parseInt(count.trim(), 10) || 0, conflicts, previewSupported, workspaceClean };
  } catch (error) {
    const code = error instanceof GitError ? error.code : "git-error";
    const message = error instanceof Error ? error.message : "Git command failed";
    return { ok: false, error: { code, message } };
  }
}

/**
 * Conflicted paths from `merge-tree --write-tree` output: index entries look
 * like `<mode> <oid> <stage>\t<path>` with stage 1/2/3; one file can appear
 * in several stages, so dedupe.
 */
function parseMergeTreeConflicts(stdout: string): string[] {
  const found = new Set<string>();
  for (const line of stdout.split("\n")) {
    const match = /^\d{6} [0-9a-f]{40} [123]\t(.+)$/.exec(line);
    if (match) found.add(match[1]!);
  }
  return [...found];
}
