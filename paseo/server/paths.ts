import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { GitError } from "./git";

export async function normalizeCwd(cwd: string): Promise<string> {
  const absolute = resolve(cwd);
  let info;
  try {
    info = await stat(absolute);
  } catch {
    throw new GitError("cwd-unavailable", `Workspace directory does not exist: ${cwd}`);
  }
  if (!info.isDirectory()) {
    throw new GitError("cwd-unavailable", `Workspace path is not a directory: ${cwd}`);
  }
  return realpath(absolute).catch(() => absolute);
}

export function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Resolve the repository path a client selected, staying inside the workspace. */
export function resolveRepoPath(cwd: string, repo: string): string {
  if (repo === "") return cwd;
  if (isAbsolute(repo)) {
    throw new GitError("invalid-repo", "Repository path must be relative");
  }
  const absolute = resolve(cwd, repo);
  if (!isInside(cwd, absolute)) {
    throw new GitError("invalid-repo", "Repository path escapes the workspace");
  }
  return absolute;
}

/** Validate a repository-relative file path (no absolute paths, no `..`, no `.git`). */
export function assertSafeRelative(path: string): void {
  if (path === "") {
    throw new GitError("invalid-path", "Path is required");
  }
  if (isAbsolute(path) || path.includes("\0")) {
    throw new GitError("invalid-path", "Path must be relative");
  }
  const parts = path.split(/[\\/]+/);
  if (parts.some((part) => part === "..")) {
    throw new GitError("invalid-path", "Path escapes the repository");
  }
  if (parts[0] === ".git") {
    throw new GitError("write-denied", "The .git directory is not browsable");
  }
}

/** Resolve a repository-relative path and prove it stays inside the root. */
export function resolveInside(root: string, path: string): string {
  assertSafeRelative(path);
  const absolute = resolve(root, path);
  if (!isInside(root, absolute)) {
    throw new GitError("invalid-path", "Path escapes the repository");
  }
  return absolute;
}

/** Resolve symlinks for a path that must stay inside the root. */
export async function realInside(root: string, path: string): Promise<string> {
  const absolute = resolveInside(root, path);
  try {
    const real = await realpath(absolute);
    if (!isInside(root, real)) {
      throw new GitError("write-denied", "Path resolves outside the repository");
    }
    return real;
  } catch (error) {
    if (error instanceof GitError) throw error;
    return absolute;
  }
}

export function toPosixRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}
