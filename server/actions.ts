import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import type { actionRpc } from "../shared/git";
import { GitError, classifyGitError, git } from "./git";
import { assertSafeRelative, realInside } from "./paths";
import { resolveRepoRoot } from "./repos";
import { buildSnapshot } from "./snapshot";

type ActionInput = z.output<typeof actionRpc.input>;
type ActionOutput = z.input<typeof actionRpc.output>;
type Action = ActionInput["action"];

const LONG_TIMEOUT = 120_000;

function fail(code: string, message: string): ActionOutput {
  return { ok: false, error: { code, message } };
}

function normalizeError(error: unknown): ActionOutput {
  if (error instanceof GitError) {
    return fail(error.code, error.message);
  }
  const value = error as { code?: unknown; message?: unknown };
  const message = typeof value.message === "string" ? value.message : "Git action failed";
  const code = typeof value.code === "string" ? value.code : classifyGitError(message);
  return fail(code, message);
}

function ensurePaths(paths: readonly string[]): void {
  for (const path of paths) assertSafeRelative(path);
}

async function assertNotNestedRepo(root: string, path: string): Promise<void> {
  try {
    const info = await stat(join(root, path, ".git"));
    if (info) {
      throw new GitError(
        "nested-repo",
        `${path} is a Git repository; remove it from a terminal instead`,
      );
    }
  } catch (error) {
    if (error instanceof GitError) throw error;
  }
}

export async function runAction(input: ActionInput): Promise<ActionOutput> {
  const root = await resolveRepoRoot(input.cwd, input.repo);
  const action: Action = input.action;
  let output = "";

  try {
    switch (action.kind) {
      case "stage": {
        ensurePaths(action.paths);
        output = (await git(root, ["add", "-A", "--", ...action.paths])).stdout;
        break;
      }
      case "stageAll": {
        output = (await git(root, ["add", "-A"])).stdout;
        break;
      }
      case "unstage": {
        ensurePaths(action.paths);
        const result = await git(root, ["restore", "--staged", "--", ...action.paths], {
          accept: [1, 128],
        });
        if (result.code !== 0) {
          if (/could not resolve HEAD|ambiguous argument 'HEAD'/i.test(result.stderr)) {
            output = (await git(root, ["rm", "--cached", "-r", "--", ...action.paths])).stdout;
          } else {
            throw new GitError(classifyGitError(result.stderr), result.stderr.trim());
          }
        } else {
          output = result.stdout;
        }
        break;
      }
      case "unstageAll": {
        const result = await git(root, ["restore", "--staged", "."], { accept: [1, 128] });
        if (result.code !== 0) {
          if (/could not resolve HEAD|ambiguous argument 'HEAD'/i.test(result.stderr)) {
            output = (await git(root, ["rm", "--cached", "-r", "--", "."])).stdout;
          } else {
            throw new GitError(classifyGitError(result.stderr), result.stderr.trim());
          }
        } else {
          output = result.stdout;
        }
        break;
      }
      case "discard": {
        ensurePaths(action.paths);
        for (const path of action.paths) {
          const status = await git(root, ["status", "--porcelain=v1", "-z", "--", path], {
            accept: [128],
          });
          const untracked = status.stdout.startsWith("??");
          if (untracked) {
            await assertNotNestedRepo(root, path);
            const absolute = await realInside(root, path);
            await rm(absolute, { recursive: true, force: true });
          } else if (action.staged) {
            await git(root, ["restore", "--staged", "--", path]);
          } else {
            await git(root, ["restore", "--worktree", "--", path]);
          }
        }
        break;
      }
      case "commit": {
        const message = action.message.trim();
        if (message === "") return fail("empty-message", "Commit message is required");
        if (action.paths && action.paths.length > 0) {
          ensurePaths(action.paths);
          await git(root, ["add", "-A", "--", ...action.paths]);
        }
        if (!action.amend) {
          const staged = await git(root, ["diff", "--cached", "--quiet"], { accept: [0, 1, 128] });
          if (staged.code === 0) {
            return fail("nothing-to-commit", "There are no staged changes to commit");
          }
        }
        const args = ["commit", "-m", message];
        if (action.amend) args.push("--amend");
        const result = await git(root, args, { timeout: 60_000 });
        output = `${result.stdout}${result.stderr}`;
        break;
      }
      case "checkout": {
        if (action.createFrom) {
          const result = await git(root, ["switch", "-c", action.name, action.createFrom]);
          output = `${result.stdout}${result.stderr}`;
        } else if (action.track) {
          const slash = action.name.indexOf("/");
          const localName = slash === -1 ? action.name : action.name.slice(slash + 1);
          const existing = await git(
            root,
            ["rev-parse", "--verify", "--quiet", `refs/heads/${localName}`],
            { accept: [1, 128] },
          );
          const result =
            existing.code === 0
              ? await git(root, ["switch", localName])
              : await git(root, ["switch", "--track", action.name]);
          output = `${result.stdout}${result.stderr}`;
        } else {
          const result = await git(root, ["switch", action.name]);
          output = `${result.stdout}${result.stderr}`;
        }
        break;
      }
      case "fetch": {
        const result = await git(root, ["fetch", "--all", "--prune"], {
          timeout: LONG_TIMEOUT,
        });
        output = `${result.stdout}${result.stderr}`;
        break;
      }
      case "pull": {
        const result = await git(root, ["pull", "--ff-only"], { timeout: LONG_TIMEOUT });
        output = `${result.stdout}${result.stderr}`;
        break;
      }
      case "push": {
        const result = await git(root, ["push"], { timeout: LONG_TIMEOUT });
        output = `${result.stdout}${result.stderr}`;
        break;
      }
      case "publish": {
        const result = await git(root, ["push", "-u", action.remote, "HEAD"], {
          timeout: LONG_TIMEOUT,
        });
        output = `${result.stdout}${result.stderr}`;
        break;
      }
      case "tagCreate": {
        const args = action.message
          ? ["tag", "-a", action.name, "-m", action.message, action.commit]
          : ["tag", action.name, action.commit];
        await git(root, args);
        break;
      }
      case "tagDelete": {
        await git(root, ["tag", "-d", action.name]);
        break;
      }
      case "stashPush": {
        const args = ["stash", "push"];
        if (action.message) args.push("-m", action.message);
        const result = await git(root, args, { timeout: 60_000 });
        output = `${result.stdout}${result.stderr}`;
        break;
      }
      case "stashApply":
      case "stashPop":
      case "stashDrop": {
        const actual = await git(root, ["rev-parse", `stash@{${action.index}}`], {
          accept: [128],
        });
        if (actual.code !== 0) return fail("not-found", "That stash entry no longer exists");
        if (actual.stdout.trim() !== action.sha) {
          return fail("index-busy", "The stash stack changed; reload and try again");
        }
        const verb =
          action.kind === "stashApply" ? "apply" : action.kind === "stashPop" ? "pop" : "drop";
        const result = await git(root, ["stash", verb, `stash@{${action.index}}`], {
          timeout: 60_000,
        });
        output = `${result.stdout}${result.stderr}`;
        break;
      }
      case "revert": {
        const result = await git(root, ["revert", "--no-edit", action.commit], {
          timeout: 60_000,
        });
        output = `${result.stdout}${result.stderr}`;
        break;
      }
      case "reset": {
        const result = await git(root, ["reset", `--${action.mode}`, action.commit]);
        output = `${result.stdout}${result.stderr}`;
        break;
      }
      default:
        return fail("invalid-action", "Unknown Git action");
    }

    const snapshot = await buildSnapshot(input.cwd, input.repo);
    const trimmed = output.trim();
    return {
      ok: true,
      snapshot,
      ...(trimmed === "" ? {} : { output: trimmed.slice(0, 8000) }),
    };
  } catch (error) {
    return normalizeError(error);
  }
}
