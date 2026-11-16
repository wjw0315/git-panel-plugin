import type { z } from "zod";
import type { historyRpc, refsRpc, stashListRpc } from "../shared/git";
import { git } from "./git";
import { resolveRepoRoot } from "./repos";
import { parseRefs } from "./snapshot";

const FIELD = "\x1f";
const RECORD = "\x1e";
const LOG_FORMAT = `%H${FIELD}%h${FIELD}%P${FIELD}%an${FIELD}%aI${FIELD}%D${FIELD}%s${RECORD}`;

type HistoryInput = z.output<typeof historyRpc.input>;
type RefsInput = z.output<typeof refsRpc.input>;
type StashInput = z.output<typeof stashListRpc.input>;

export async function getHistory(input: HistoryInput) {
  const root = await resolveRepoRoot(input.cwd, input.repo);
  const limit = input.limit;
  const skip = input.skip;
  const search = input.search?.trim() ?? "";
  const pathSearch = input.pathSearch?.trim().toLowerCase() ?? "";
  const isHash = /^[0-9a-fA-F]{7,40}$/.test(search);

  const args: string[] = ["log", "--topo-order", "--decorate=short", `--pretty=format:${LOG_FORMAT}`];
  let revision: string | null = null;
  if (search !== "" && isHash) {
    const resolved = await git(root, ["rev-parse", "--verify", `${search}^{commit}`], {
      accept: [128],
    });
    if (resolved.code === 0) revision = resolved.stdout.trim();
  }
  if (revision === null) {
    if (input.ref) args.push(input.ref);
    else args.push("--all");
    if (search !== "" && !isHash) {
      args.push("--grep", search, "--fixed-strings", "--regexp-ignore-case");
    }
    if (input.author) args.push(`--author=${input.author}`);
    if (input.since) args.push(`--since=${input.since}`);
    if (pathSearch !== "") args.push("--name-only");
    if (revision === null) args.push("-n", String(pathSearch === "" ? limit + 1 : Math.max(limit * 4, 200)));
    args.push("--skip", String(skip));
    if (revision !== null) args.push(revision);
  } else {
    args.push("-n", String(limit), revision);
  }

  const result = await git(root, args, {
    accept: [128],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 15_000,
  });
  if (result.code !== 0) {
    return { commits: [], hasMore: false };
  }

  const commits: Array<{
    hash: string;
    shortHash: string;
    subject: string;
    author: string;
    dateIso: string;
    parents: string[];
    refs: ReturnType<typeof parseRefs>;
  }> = [];
  for (const raw of result.stdout.split(RECORD)) {
    const record = raw.replace(/^\n+/, "");
    if (record.trim() === "") continue;
    const newline = record.indexOf("\n");
    const headerLine = newline === -1 ? record : record.slice(0, newline);
    const fileText = newline === -1 ? "" : record.slice(newline + 1);
    const parts = headerLine.split(FIELD);
    if (parts.length < 7) continue;
    const [hash, shortHash, parentsRaw, author, dateIso, decoration, ...subjectParts] = parts;
    if (!hash || !shortHash) continue;
    if (pathSearch !== "" && !fileText.toLowerCase().includes(pathSearch)) continue;
    commits.push({
      hash,
      shortHash,
      author: author ?? "",
      dateIso: dateIso ?? "",
      subject: subjectParts.join(FIELD),
      parents: (parentsRaw ?? "").trim() === "" ? [] : (parentsRaw ?? "").trim().split(/\s+/),
      refs: parseRefs(decoration ?? ""),
    });
    if (commits.length >= limit) break;
  }

  const hasMore =
    pathSearch === ""
      ? result.stdout.split(RECORD).filter((part) => part.trim() !== "").length > limit
      : commits.length >= limit;
  return { commits, hasMore };
}

export async function getRefs(input: RefsInput) {
  const root = await resolveRepoRoot(input.cwd, input.repo);
  const [currentResult, localResult, remoteResult, tagResult] = await Promise.all([
    git(root, ["symbolic-ref", "--short", "-q", "HEAD"], { accept: [1, 128] }),
    git(root, ["for-each-ref", "--format=%(refname:short)%09%(objectname:short)%09%(upstream:track)", "refs/heads"], {
      accept: [128],
    }),
    git(root, ["for-each-ref", "--format=%(refname:short)%09%(objectname:short)", "refs/remotes"], {
      accept: [128],
    }),
    git(root, ["for-each-ref", "--format=%(refname:short)%09%(objectname:short)", "refs/tags"], {
      accept: [128],
    }),
  ]);

  const current = currentResult.code === 0 ? currentResult.stdout.trim() || null : null;
  const local = localResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", shortHash = "", track = ""] = line.split("\t");
      const ahead = /ahead (\d+)/.exec(track);
      const behind = /behind (\d+)/.exec(track);
      return {
        name,
        shortHash: shortHash === "" ? null : shortHash,
        ...(ahead ? { ahead: Number(ahead[1]) } : {}),
        ...(behind ? { behind: Number(behind[1]) } : {}),
      };
    })
    .filter((branch) => branch.name !== "");

  const remote = remoteResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", shortHash = ""] = line.split("\t");
      return { name, shortHash: shortHash === "" ? null : shortHash };
    })
    .filter((branch) => branch.name !== "" && !branch.name.endsWith("/HEAD"));

  const tags = tagResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", shortHash = ""] = line.split("\t");
      return { name, shortHash: shortHash === "" ? null : shortHash };
    })
    .filter((tag) => tag.name !== "");

  let defaultBranch: string | null = null;
  const remoteHead = await git(root, ["symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD"], {
    accept: [1, 128],
  });
  if (remoteHead.code === 0) {
    defaultBranch = remoteHead.stdout.trim().replace(/^origin\//, "") || null;
  }
  if (defaultBranch === null) {
    const names = new Set(local.map((branch) => branch.name));
    defaultBranch = names.has("main") ? "main" : names.has("master") ? "master" : null;
  }

  return { current, defaultBranch, local, remote, tags };
}

export async function getStashList(input: StashInput) {
  const root = await resolveRepoRoot(input.cwd, input.repo);
  const result = await git(
    root,
    ["stash", "list", `--format=%gd${FIELD}%H${FIELD}%gs${FIELD}%cr`],
    { accept: [128] },
  );
  if (result.code !== 0) return { entries: [] };
  const entries: Array<{
    index: number;
    sha: string;
    message: string;
    branch: string | null;
    relTime: string;
  }> = [];
  for (const line of result.stdout.split("\n")) {
    if (line.trim() === "") continue;
    const [selector = "", sha = "", subject = "", relTime = ""] = line.split(FIELD);
    const match = /stash@\{(\d+)\}/.exec(selector);
    if (!match) continue;
    const index = Number(match[1]);
    let branch: string | null = null;
    let message = subject;
    const parsed = /^(?:WIP on|On) (.+?): (.*)$/s.exec(subject);
    if (parsed) {
      branch = parsed[1] === "(no branch)" ? null : (parsed[1] ?? null);
      message = parsed[2] ?? "";
    }
    entries.push({
      index,
      sha: sha.trim(),
      message: message.trim(),
      branch,
      relTime: relTime.trim(),
    });
  }
  return { entries };
}

export async function getLastMessage(input: { cwd: string; repo: string }) {
  const root = await resolveRepoRoot(input.cwd, input.repo);
  const result = await git(root, ["log", "-1", "--format=%B"], { accept: [128] });
  return { message: result.code === 0 ? result.stdout.trim() : "" };
}
