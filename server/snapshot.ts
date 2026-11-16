import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type {
  GitChange,
  GitCommit,
  GitRemote,
  GitSnapshot,
  WorktreeStats,
} from "../shared/git";
import { git } from "./git";
import { resolveRepoRoot } from "./repos";
import { countLines, looksBinary } from "./text";

const FIELD = "\x1f";
const MAX_CHANGES = 1000;
const MAX_UNTRACKED_READS = 100;
const MAX_UNTRACKED_BYTES = 1024 * 1024;
const MAX_MTIME_READS = 300;
/** Above this many changed paths the per-file enrichment is noise; skip it. */
const MAX_ENRICH_CHANGES = 300;
const MAX_UNTRACKED_TOTAL_BYTES = 8 * 1024 * 1024;
const ENRICH_BUDGET_MS = 3_000;

export function statusOf(code: string): GitChange["status"] {
  switch (code) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "added";
    case "T":
      return "typechange";
    case "U":
      return "conflicted";
    case "?":
      return "untracked";
    default:
      return "modified";
  }
}

export function parseStatus(stdout: string): GitChange[] {
  const records = stdout.split("\0");
  const out: GitChange[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 3) continue;
    const x = record[0] ?? " ";
    const y = record[1] ?? " ";
    let path = record.slice(3);
    let oldPath: string | undefined;
    if ("RC".includes(x) || "RC".includes(y)) {
      oldPath = records[index + 1];
      index += 1;
    }
    const isDirectory = path.endsWith("/");
    if (isDirectory) path = path.replace(/\/+$/, "");
    if (path === "") continue;
    if (x === "!" || y === "!") continue;
    if (x === "?" && y === "?") {
      out.push({ path, status: "untracked", staged: false, isDirectory });
      continue;
    }
    if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
      out.push({ path, status: "conflicted", staged: false, isDirectory });
      continue;
    }
    if (x !== " " && x !== "?") {
      out.push({
        path,
        status: statusOf(x),
        staged: true,
        isDirectory,
        ...(oldPath && "RC".includes(x) ? { oldPath } : {}),
      });
    }
    if (y !== " " && y !== "?") {
      out.push({
        path,
        status: statusOf(y),
        staged: false,
        isDirectory,
        ...(oldPath && "RC".includes(y) ? { oldPath } : {}),
      });
    }
  }
  return out;
}

export function parseRefs(decoration: string): GitCommitRefs {
  const refs: GitCommitRefs = [];
  for (const raw of decoration.split(",")) {
    let token = raw.trim();
    if (token === "") continue;
    let head = false;
    if (token.startsWith("HEAD -> ")) {
      head = true;
      token = token.slice("HEAD -> ".length).trim();
    } else if (token === "HEAD") {
      continue;
    }
    if (token.startsWith("tag: ")) {
      refs.push({ kind: "tag", name: token.slice("tag: ".length).trim(), head: false });
    } else if (token.startsWith("refs/tags/")) {
      refs.push({ kind: "tag", name: token.slice("refs/tags/".length), head: false });
    } else if (token.startsWith("refs/remotes/")) {
      refs.push({ kind: "remote", name: token.slice("refs/remotes/".length), head });
    } else if (token.startsWith("refs/heads/")) {
      refs.push({ kind: "branch", name: token.slice("refs/heads/".length), head });
    } else if (head) {
      refs.push({ kind: "branch", name: token, head });
    } else if (token.includes("/")) {
      refs.push({ kind: "remote", name: token, head });
    } else {
      refs.push({ kind: "branch", name: token, head });
    }
  }
  return refs;
}

import type { GitRef } from "../shared/git";
type GitCommitRefs = GitRef[];

export function parseRemote(name: string, url: string): GitRemote {
  let host: string | null = null;
  let path: string | null = null;
  const scp = /^(?:[^@\s/]+@)?([^:/\s]+):(.+)$/.exec(url);
  const uri = /^(?:https?|git|ssh):\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/.exec(url);
  if (uri) {
    host = uri[1] ?? null;
    path = uri[2] ?? null;
  } else if (scp && !/^[A-Za-z]:[\\/]/.test(url)) {
    host = scp[1] ?? null;
    path = scp[2] ?? null;
  } else if (url.startsWith("/")) {
    path = url;
  }
  if (path) {
    path = path.replace(/^\/+/, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  }
  const hostKind = classifyHost(host);
  return {
    name,
    url,
    webUrl: host && path ? `https://${host}/${path}` : null,
    host,
    hostKind,
  };
}

function classifyHost(host: string | null): GitRemote["hostKind"] {
  const value = (host ?? "").toLowerCase();
  if (value.includes("github")) return "github";
  if (value.includes("gitlab")) return "gitlab";
  if (value.includes("gitee")) return "gitee";
  if (value.includes("bitbucket")) return "bitbucket";
  return "other";
}

function parseCommit(stdout: string): GitCommit | null {
  const line = stdout.trim();
  if (line === "") return null;
  const [hash, shortHash, author, dateIso, ...subjectParts] = line.split(FIELD);
  if (!hash || !shortHash) return null;
  return {
    hash,
    shortHash,
    author: author ?? "",
    dateIso: dateIso ?? "",
    subject: subjectParts.join(FIELD),
  };
}

function parseNumstatMap(stdout: string): Map<string, { insertions: number; deletions: number }> {
  const map = new Map<string, { insertions: number; deletions: number }>();
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const added = Number(parts[0]);
    const removed = Number(parts[1]);
    let path = parts.slice(2).join("\t");
    if (path.includes(" => ")) {
      path = path.slice(path.lastIndexOf(" => ") + 4);
    }
    path = path.replace(/^\{/, "").replace(/\}$/, "");
    if (!Number.isFinite(added) || !Number.isFinite(removed)) continue;
    map.set(path, { insertions: added, deletions: removed });
  }
  return map;
}

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

export interface SnapshotOptions {
  /** Cap on untracked-file reads for line counting (tests use a smaller cap). */
  untrackedReads?: number;
  /**
   * The last snapshot of this repository. When the working tree still matches
   * its fingerprint the expensive enrichment (numstat, untracked line counts,
   * mtimes) is reused, so a poll only costs one `git status`.
   */
  previous?: GitSnapshot | null;
}

/** Identity of everything a snapshot exposes apart from `checkedAt`. */
function fingerprintOf(snapshot: {
  changes: GitChange[];
  head: string | null;
  branch: string | null;
}): string {
  const hash = createHash("sha1");
  hash.update(snapshot.head ?? "");
  hash.update("\u0000");
  hash.update(snapshot.branch ?? "");
  for (const change of snapshot.changes) {
    hash.update(`\u0000${change.staged ? "s" : "w"}:${change.status}:${change.path}`);
  }
  return hash.digest("hex");
}

export async function buildSnapshot(
  cwd: string,
  repo: string,
  options: SnapshotOptions = {},
): Promise<GitSnapshot> {
  const root = await resolveRepoRoot(cwd, repo);
  const checkedAt = Date.now();
  // Paseo cancels plugin RPCs after 30s. Keep the optional enrichment work
  // (untracked line counts, mtimes) inside a short budget so a huge checkout on
  // a slow disk still returns a usable snapshot instead of timing out.
  const deadline = checkedAt + ENRICH_BUDGET_MS;

  const [
    statusResult,
    branchResult,
    headResult,
    logResult,
    remoteNamesResult,
    upstreamResult,
  ] = await Promise.all([
    git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"], {
      timeout: 15_000,
    }),
    git(root, ["symbolic-ref", "--short", "-q", "HEAD"], { accept: [1, 128], timeout: 8_000 }),
    git(root, ["rev-parse", "--short", "HEAD"], { accept: [128], timeout: 8_000 }),
    git(root, ["log", "-1", `--format=%H${FIELD}%h${FIELD}%an${FIELD}%aI${FIELD}%s`], {
      accept: [128],
      timeout: 8_000,
    }),
    git(root, ["remote"], { accept: [128], timeout: 8_000 }),
    git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
      accept: [1, 128],
      timeout: 8_000,
    }),
  ]);

  const changes = parseStatus(statusResult.stdout);
  const truncated = changes.length > MAX_CHANGES;
  const limitedChanges = truncated ? changes.slice(0, MAX_CHANGES) : changes;

  const branch = branchResult.code === 0 ? branchResult.stdout.trim() || null : null;
  const head = headResult.code === 0 ? headResult.stdout.trim() || null : null;
  const unborn = head === null;
  const detached = branch === null && head !== null;
  const lastCommit = logResult.code === 0 ? parseCommit(logResult.stdout) : null;

  const stagedPaths = new Set(limitedChanges.filter((c) => c.staged).map((c) => c.path));
  const modifiedPaths = new Set(
    limitedChanges.filter((c) => !c.staged && c.status !== "untracked").map((c) => c.path),
  );
  const untrackedPaths = new Set(
    limitedChanges.filter((c) => c.status === "untracked").map((c) => c.path),
  );
  const conflicted = limitedChanges.filter((c) => c.status === "conflicted").length;

  const previous = options.previous ?? null;
  if (previous && fingerprintOf(previous) === fingerprintOf({ changes: limitedChanges, head, branch })) {
    return { ...previous, root, checkedAt };
  }

  const hasUpstream = upstreamResult.code === 0 && upstreamResult.stdout.trim() !== "";

  const remoteNames = remoteNamesResult.stdout
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);
  const remoteName =
    remoteNames.length > 0
      ? remoteNames.includes("origin")
        ? "origin"
        : (remoteNames[0] ?? "origin")
      : null;

  const [countResult, urlResult, numstatResult] = await Promise.all([
    hasUpstream
      ? git(root, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], {
          accept: [128],
          timeout: 8_000,
        })
      : Promise.resolve({ stdout: "", stderr: "", code: 0 }),
    remoteName
      ? git(root, ["remote", "get-url", remoteName], { accept: [128], timeout: 8_000 })
      : Promise.resolve({ stdout: "", stderr: "", code: 0 }),
    git(root, unborn ? ["diff", "--numstat", "--cached"] : ["diff", "--numstat", "HEAD"], {
      accept: [128],
      timeout: 10_000,
    }).catch(() => ({ stdout: "", stderr: "", code: 128 })),
  ]);

  let ahead = 0;
  let behind = 0;
  if (hasUpstream) {
    const [aheadRaw, behindRaw] = countResult.stdout.trim().split(/\s+/);
    ahead = Number(aheadRaw) || 0;
    behind = Number(behindRaw) || 0;
  }

  let remote: GitRemote | null = null;
  if (remoteName && urlResult.code === 0 && urlResult.stdout.trim() !== "") {
    remote = parseRemote(remoteName, urlResult.stdout.trim());
  }

  const totals = parseNumstat(numstatResult.stdout);
  const statByPath = parseNumstatMap(numstatResult.stdout);

  // Untracked files contribute no numstat rows; read a bounded sample so the
  // header still shows their added lines. Large worktrees skip this entirely:
  // the numbers there are dominated by the tracked diff anyway.
  const enrich = limitedChanges.length <= MAX_ENRICH_CHANGES;
  const untrackedReadCap = options.untrackedReads ?? MAX_UNTRACKED_READS;
  let untrackedInsertions = 0;
  let untrackedPartial = !enrich;
  let untrackedReads = 0;
  let untrackedBytes = 0;
  for (const change of limitedChanges) {
    if (!enrich) break;
    if (change.status !== "untracked" || change.isDirectory) continue;
    if (Date.now() > deadline) {
      untrackedPartial = true;
      break;
    }
    if (untrackedReads >= untrackedReadCap) {
      untrackedPartial = true;
      break;
    }
    untrackedReads += 1;
    try {
      const absolute = join(root, change.path);
      const info = await stat(absolute);
      if (!info.isFile() || info.size > MAX_UNTRACKED_BYTES) {
        untrackedPartial = true;
        continue;
      }
      if (untrackedBytes + info.size > MAX_UNTRACKED_TOTAL_BYTES) {
        untrackedPartial = true;
        break;
      }
      untrackedBytes += info.size;
      const buffer = await readFile(absolute);
      if (looksBinary(buffer)) continue;
      const lines = countLines(buffer.toString("utf8"));
      untrackedInsertions += lines;
      statByPath.set(change.path, { insertions: lines, deletions: 0 });
    } catch {
      untrackedPartial = true;
    }
  }

  let lastChangeAt: number | null = null;
  const mtimePaths = enrich
    ? [...new Set(limitedChanges.map((c) => c.path))].slice(0, MAX_MTIME_READS)
    : [];
  for (const path of mtimePaths) {
    if (Date.now() > deadline) break;
    try {
      const value = (await stat(join(root, path))).mtimeMs;
      if (value > (lastChangeAt ?? 0)) lastChangeAt = Math.floor(value);
    } catch {
      // A missing path (deleted/renamed) simply does not contribute an mtime.
    }
  }

  const stats: WorktreeStats = {
    fileCount: new Set(limitedChanges.map((c) => c.path)).size,
    staged: stagedPaths.size,
    modified: modifiedPaths.size,
    untracked: untrackedPaths.size,
    insertions: totals.insertions + untrackedInsertions,
    deletions: totals.deletions,
    lastChangeAt,
    headCommittedAt: lastCommit?.dateIso ?? null,
    partial: truncated || untrackedPartial,
  };

  const changesWithStats = limitedChanges.map((change) => {
    const stat = statByPath.get(change.path);
    return stat ? { ...change, insertions: stat.insertions, deletions: stat.deletions } : change;
  });

  return {
    root,
    name: basename(root),
    branch,
    head,
    unborn,
    detached,
    dirty: limitedChanges.length > 0,
    staged: stagedPaths.size,
    modified: modifiedPaths.size,
    untracked: untrackedPaths.size,
    conflicted,
    ahead,
    behind,
    hasUpstream,
    remote,
    lastCommit,
    changes: changesWithStats,
    stats,
    truncated,
    checkedAt,
  };
}
