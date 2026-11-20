import { readdir, realpath, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { GitRepoEntry } from "../shared/git";
import { git } from "./git";
import { normalizeCwd, resolveRepoPath, toPosixRelative } from "./paths";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".cache",
  ".turbo",
  ".parcel-cache",
  ".venv",
  "venv",
  "__pycache__",
  "Pods",
  "DerivedData",
  ".trash",
  ".yarn",
  "coverage",
  ".gradle",
  ".terraform",
  ".git",
]);

const MAX_DEPTH = 3;
const MAX_REPOS = 50;
// The nested-repository scan runs on every panel that opens (and on each repo
// switch). Cap it hard: a workspace with a huge tree must not delay the panel.
const SCAN_BUDGET_MS = 1500;
const REPO_CACHE_TTL_MS = 5_000;

export async function repoTop(directory: string): Promise<string> {
  const result = await git(directory, ["rev-parse", "--show-toplevel"], {
    accept: [128],
    timeout: 8_000,
  });
  const top = result.stdout.trim();
  if (result.code !== 0 || top === "") {
    throw Object.assign(new Error("Not a git repository"), { code: "not-a-git-repo" });
  }
  return realpath(top);
}

export async function resolveRepoRoot(cwd: string, repo: string): Promise<string> {
  const directory = resolveRepoPath(cwd, repo);
  try {
    return await repoTop(directory);
  } catch {
    throw Object.assign(new Error("Not a git repository"), { code: "not-a-git-repo" });
  }
}

/** Directory the file browser uses: the workspace itself, or the nested repository. */
export async function resolveFilesRoot(cwd: string, repo: string): Promise<string> {
  const directory = resolveRepoPath(cwd, repo);
  const info = await stat(directory);
  if (!info.isDirectory()) {
    throw Object.assign(new Error("Directory does not exist"), { code: "not-found" });
  }
  return realpath(directory);
}

export async function currentBranch(directory: string): Promise<string | null> {
  const result = await git(directory, ["symbolic-ref", "--short", "-q", "HEAD"], {
    accept: [1, 128],
    timeout: 5_000,
  });
  if (result.code !== 0) return null;
  const branch = result.stdout.trim();
  return branch === "" ? null : branch;
}

async function hasGitEntry(directory: string): Promise<boolean> {
  try {
    await stat(join(directory, ".git"));
    return true;
  } catch {
    return false;
  }
}

export interface RepoListResult {
  cwd: string;
  repos: GitRepoEntry[];
}

const repoCache = new Map<string, { at: number; value: RepoListResult }>();
const repoJobs = new Map<string, Promise<RepoListResult>>();

export async function listRepos(inputCwd: string): Promise<RepoListResult> {
  const cwd = await normalizeCwd(inputCwd);
  const cached = repoCache.get(cwd);
  if (cached && Date.now() - cached.at < REPO_CACHE_TTL_MS) {
    return cached.value;
  }
  // Several panels and pills ask for the same workspace at once; share one scan.
  const running = repoJobs.get(cwd);
  if (running) return running;
  const job = collectRepos(cwd).finally(() => repoJobs.delete(cwd));
  repoJobs.set(cwd, job);
  const value = await job;
  repoCache.set(cwd, { at: Date.now(), value });
  if (repoCache.size > 50) {
    const cutoff = Date.now() - 60_000;
    for (const [entryKey, entry] of repoCache) {
      if (entry.at < cutoff) repoCache.delete(entryKey);
    }
  }
  return value;
}

async function collectRepos(cwd: string): Promise<RepoListResult> {
  const repos: GitRepoEntry[] = [];
  const seen = new Set<string>();

  let workspaceRoot: string | null = null;
  try {
    workspaceRoot = await repoTop(cwd);
  } catch {
    // The workspace itself is not a repository; still scan for nested ones.
  }
  if (workspaceRoot && !seen.has(workspaceRoot)) {
    seen.add(workspaceRoot);
    repos.push({
      path: "",
      root: workspaceRoot,
      name: basename(workspaceRoot),
      kind: "workspace",
      branch: await currentBranch(workspaceRoot),
    });
  }

  // The budget must cover only the nested-repository walk. The two git
  // subprocesses above (rev-parse + symbolic-ref) can each stall for seconds
  // while a commit storm keeps every panel query refetching; counting them
  // against the budget made the walk skip the workspace's first level
  // entirely, collapsing the repo switcher to a single entry.
  const started = Date.now();
  const queue: Array<{ directory: string; depth: number }> = [{ directory: cwd, depth: 0 }];
  while (queue.length > 0 && repos.length < MAX_REPOS && Date.now() - started < SCAN_BUDGET_MS) {
    const current = queue.shift();
    if (!current || current.depth >= MAX_DEPTH) continue;
    let entries;
    try {
      entries = await readdir(current.directory, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const child = join(current.directory, entry.name);
      const childDepth = current.depth + 1;
      if (child === workspaceRoot) {
        if (childDepth < MAX_DEPTH) queue.push({ directory: child, depth: childDepth });
        continue;
      }
      if (await hasGitEntry(child)) {
        try {
          const root = await realpath(child);
          if (!seen.has(root) && repos.length < MAX_REPOS) {
            seen.add(root);
            repos.push({
              path: toPosixRelative(cwd, root),
              root,
              name: basename(root),
              kind: "nested",
              branch: await currentBranch(root),
            });
          }
        } catch {
          // A stale .git entry is not a usable repository.
        }
        continue;
      }
      if (childDepth < MAX_DEPTH) {
        queue.push({ directory: child, depth: childDepth });
      }
    }
  }

  repos.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "workspace" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
  return { cwd: resolve(cwd), repos };
}
