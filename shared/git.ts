import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** ------------------------------------------------------------------
 * Shared wire model for the Git panel.
 *
 * The server half runs git on the daemon machine; the client half renders
 * the result. Both import these schemas so the contract cannot drift.
 * ------------------------------------------------------------------ */

export const commitSchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  subject: z.string(),
  author: z.string(),
  dateIso: z.string(),
});
export type GitCommit = z.output<typeof commitSchema>;

export const refSchema = z.object({
  kind: z.enum(["branch", "remote", "tag"]),
  name: z.string(),
  head: z.boolean(),
});
export type GitRef = z.output<typeof refSchema>;

export const changeSchema = z.object({
  path: z.string(),
  status: z.enum([
    "added",
    "modified",
    "deleted",
    "renamed",
    "untracked",
    "conflicted",
    "typechange",
  ]),
  staged: z.boolean(),
  oldPath: z.string().optional(),
  isDirectory: z.boolean().optional(),
  insertions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
});
export type GitChange = z.output<typeof changeSchema>;

export const statsSchema = z.object({
  fileCount: z.number().int().nonnegative(),
  staged: z.number().int().nonnegative(),
  modified: z.number().int().nonnegative(),
  untracked: z.number().int().nonnegative(),
  insertions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  lastChangeAt: z.number().int().nullable(),
  headCommittedAt: z.string().nullable(),
  partial: z.boolean(),
});
export type WorktreeStats = z.output<typeof statsSchema>;

export const remoteSchema = z.object({
  name: z.string(),
  url: z.string(),
  webUrl: z.string().nullable(),
  host: z.string().nullable(),
  hostKind: z.enum(["github", "gitlab", "gitee", "bitbucket", "other"]),
});
export type GitRemote = z.output<typeof remoteSchema>;

export const snapshotSchema = z.object({
  root: z.string(),
  name: z.string(),
  branch: z.string().nullable(),
  head: z.string().nullable(),
  unborn: z.boolean(),
  detached: z.boolean(),
  dirty: z.boolean(),
  staged: z.number().int().nonnegative(),
  modified: z.number().int().nonnegative(),
  untracked: z.number().int().nonnegative(),
  conflicted: z.number().int().nonnegative(),
  /** 合并/变基进行中状态（探测 MERGE_HEAD / REBASE_HEAD）；null = 无进行中操作。 */
  branchState: z.enum(["merging", "rebasing"]).nullable(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  hasUpstream: z.boolean(),
  remote: remoteSchema.nullable(),
  lastCommit: commitSchema.nullable(),
  changes: z.array(changeSchema),
  stats: statsSchema,
  truncated: z.boolean(),
  checkedAt: z.number().int(),
});
export type GitSnapshot = z.output<typeof snapshotSchema>;

export const repoEntrySchema = z.object({
  /** Path relative to the workspace directory; "" is the workspace repository. */
  path: z.string(),
  root: z.string(),
  name: z.string(),
  kind: z.enum(["workspace", "nested"]),
  branch: z.string().nullable(),
});
export type GitRepoEntry = z.output<typeof repoEntrySchema>;

const failureSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type GitFailure = z.output<typeof failureSchema>;

const snapshotResultSchema = z.union([
  z.object({ ok: z.literal(true), value: snapshotSchema }),
  z.object({ ok: z.literal(false), error: failureSchema }),
]);

export const reposRpc = defineRpc({
  name: "git.repos",
  input: z.object({ cwd: z.string().min(1) }),
  output: z.object({
    cwd: z.string(),
    repos: z.array(repoEntrySchema),
  }),
});

export const snapshotRpc = defineRpc({
  name: "git.snapshot",
  input: z.object({
    cwd: z.string().min(1),
    /** Repository path from reposRpc; "" for the workspace repository. */
    repo: z.string(),
  }),
  output: snapshotResultSchema,
});

export const refsRpc = defineRpc({
  name: "git.refs",
  input: z.object({ cwd: z.string().min(1), repo: z.string() }),
  output: z.object({
    current: z.string().nullable(),
    defaultBranch: z.string().nullable(),
    local: z.array(
      z.object({
        name: z.string(),
        shortHash: z.string().nullable(),
        ahead: z.number().int().nonnegative().optional(),
        behind: z.number().int().nonnegative().optional(),
      }),
    ),
    remote: z.array(z.object({ name: z.string(), shortHash: z.string().nullable() })),
    tags: z.array(z.object({ name: z.string(), shortHash: z.string().nullable() })),
  }),
});

export const historyRpc = defineRpc({
  name: "git.history",
  input: z.object({
    cwd: z.string().min(1),
    repo: z.string(),
    limit: z.number().int().min(1).max(500).default(80),
    skip: z.number().int().nonnegative().default(0),
    ref: z.string().optional(),
    search: z.string().optional(),
    pathSearch: z.string().optional(),
    author: z.string().optional(),
    since: z.string().optional(),
  }),
  output: z.object({
    commits: z.array(
      commitSchema.extend({
        parents: z.array(z.string()),
        refs: z.array(refSchema),
      }),
    ),
    hasMore: z.boolean(),
  }),
});

export const showRpc = defineRpc({
  name: "git.show",
  input: z.object({
    cwd: z.string().min(1),
    repo: z.string(),
    ref: z.string().min(1),
  }),
  output: z.object({
    commit: commitSchema.nullable(),
    body: z.string(),
    files: z.array(z.object({ path: z.string(), status: changeSchema.shape.status })),
    insertions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
  }),
});

const diffBaseSchema = z.enum(["worktree", "staged", "commit"]);

export const diffRpc = defineRpc({
  name: "git.diff",
  input: z.object({
    cwd: z.string().min(1),
    repo: z.string(),
    path: z.string().min(1),
    base: diffBaseSchema,
    commit: z.string().optional(),
    context: z.number().int().min(0).max(100000).optional(),
    oldPath: z.string().optional(),
  }),
  output: z.union([
    z.object({
      ok: z.literal(true),
      text: z.string(),
      binary: z.boolean(),
      tooLarge: z.boolean(),
      newLines: z.number().int().nonnegative(),
    }),
    z.object({ ok: z.literal(false), error: failureSchema }),
  ]),
});

export const dirListRpc = defineRpc({
  name: "git.dir-list",
  input: z.object({
    cwd: z.string().min(1),
    repo: z.string(),
    path: z.string().default(""),
  }),
  output: z.object({
    path: z.string(),
    /** 浏览根的绝对路径（daemon 机器上）；客户端拼「复制绝对路径」用。 */
    root: z.string(),
    entries: z.array(
      z.object({
        name: z.string(),
        dir: z.boolean(),
        size: z.number().int().nonnegative().optional(),
        ignored: z.boolean().optional(),
      }),
    ),
    truncated: z.boolean(),
  }),
});

export const fileContentRpc = defineRpc({
  name: "git.file-content",
  input: z.object({
    cwd: z.string().min(1),
    repo: z.string(),
    path: z.string().min(1),
    forEdit: z.boolean().optional(),
  }),
  output: z.union([
    z.object({
      ok: z.literal(true),
      path: z.string(),
      variant: z.enum(["text", "image", "binary"]),
      content: z.string().optional(),
      dataUrl: z.string().optional(),
      mime: z.string().optional(),
      size: z.number().int().nonnegative(),
      mtimeMs: z.number(),
      sha256: z.string(),
      editable: z.boolean(),
      tooLarge: z.boolean(),
    }),
    z.object({ ok: z.literal(false), error: failureSchema }),
  ]),
});

export const fileWriteRpc = defineRpc({
  name: "git.file-write",
  input: z.object({
    cwd: z.string().min(1),
    repo: z.string(),
    path: z.string().min(1),
    content: z.string(),
    baseSha: z.string(),
  }),
  output: z.union([
    z.object({ ok: z.literal(true), sha256: z.string() }),
    z.object({ ok: z.literal(false), error: failureSchema }),
  ]),
});

/**
 * 文件树上下文菜单操作（spec: .scratch/file-tree-context-menu/spec.md）。
 * 写操作（createFile/createDir/rename/delete/upload）受 `allowFileEdit` 闸；
 * 系统打开器（reveal/open）受 `allowSystemOpen` 闸。路径全部仓库相对，安全校验在服务端。
 */
export const fsOpSchema = z.union([
  z.object({ kind: z.literal("createFile"), parentPath: z.string().default(""), name: z.string().min(1) }),
  z.object({ kind: z.literal("createDir"), parentPath: z.string().default(""), name: z.string().min(1) }),
  /** 仅同目录改名：path 的父目录即目标目录，newName 为纯名称。 */
  z.object({ kind: z.literal("rename"), path: z.string().min(1), newName: z.string().min(1) }),
  z.object({ kind: z.literal("delete"), path: z.string().min(1) }),
  z.object({ kind: z.literal("upload"), parentPath: z.string().default(""), name: z.string().min(1), contentBase64: z.string().min(1) }),
  z.object({ kind: z.literal("reveal"), path: z.string().min(1) }),
  z.object({ kind: z.literal("open"), path: z.string().min(1) }),
]);
export type FsOp = z.output<typeof fsOpSchema>;

export const fsOpRpc = defineRpc({
  name: "git.fs-op",
  input: z.object({
    cwd: z.string().min(1),
    repo: z.string(),
    op: fsOpSchema,
  }),
  output: z.union([
    z.object({
      ok: z.literal(true),
      /** 受影响目录（仓库相对、POSIX）；客户端按它局部刷新树。 */
      affectedDir: z.string(),
    }),
    z.object({ ok: z.literal(false), error: failureSchema }),
  ]),
});

export const lastMessageRpc = defineRpc({
  name: "git.last-message",
  input: z.object({ cwd: z.string().min(1), repo: z.string() }),
  output: z.object({ message: z.string() }),
});

export const stashListRpc = defineRpc({
  name: "git.stash-list",
  input: z.object({ cwd: z.string().min(1), repo: z.string() }),
  output: z.object({
    entries: z.array(
      z.object({
        index: z.number().int().nonnegative(),
        sha: z.string(),
        message: z.string(),
        branch: z.string().nullable(),
        relTime: z.string(),
      }),
    ),
  }),
});

/** Client-side render failures are reported here so they land in the plugin log. */
export const panelErrorRpc = defineRpc({
  name: "git.panel-error",
  input: z.object({
    surface: z.string(),
    message: z.string(),
    stack: z.string().optional(),
    componentStack: z.string().optional(),
  }),
  output: z.object({ ok: z.literal(true) }),
});

export const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stage"), paths: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("stageAll") }),
  z.object({ kind: z.literal("unstage"), paths: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("unstageAll") }),
  z.object({
    kind: z.literal("discard"),
    paths: z.array(z.string()).min(1),
    staged: z.boolean(),
  }),
  z.object({
    kind: z.literal("commit"),
    message: z.string().min(1),
    amend: z.boolean().optional(),
    paths: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal("checkout"),
    name: z.string().min(1),
    createFrom: z.string().optional(),
    /** name 是远端 ref（origin/xxx）；本地没有同名分支时创建跟踪分支。 */
    track: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("fetch") }),
  z.object({ kind: z.literal("pull") }),
  z.object({ kind: z.literal("push") }),
  z.object({ kind: z.literal("publish"), remote: z.string().min(1) }),
  z.object({
    kind: z.literal("tagCreate"),
    name: z.string().min(1),
    commit: z.string().min(1),
    message: z.string().optional(),
  }),
  z.object({ kind: z.literal("tagDelete"), name: z.string().min(1) }),
  z.object({ kind: z.literal("stashPush"), message: z.string().optional() }),
  z.object({ kind: z.literal("stashApply"), index: z.number().int().nonnegative(), sha: z.string() }),
  z.object({ kind: z.literal("stashPop"), index: z.number().int().nonnegative(), sha: z.string() }),
  z.object({ kind: z.literal("stashDrop"), index: z.number().int().nonnegative(), sha: z.string() }),
  z.object({ kind: z.literal("revert"), commit: z.string().min(1) }),
  z.object({ kind: z.literal("merge"), branch: z.string().min(1) }),
  z.object({ kind: z.literal("rebase"), onto: z.string().min(1) }),
  z.object({ kind: z.literal("abort") }),
  z.object({
    kind: z.literal("reset"),
    commit: z.string().min(1),
    mode: z.enum(["soft", "mixed", "hard"]),
  }),
]);
export type GitAction = z.output<typeof actionSchema>;

/**
 * Read-only preview for the update-branch dialog. `operation` decides the
 * direction of the count: merge counts commits the source branch brings in
 * (HEAD..<branch>), rebase counts commits of the current branch that would
 * move onto the target (<branch>..HEAD). Later tickets extend the output
 * with conflict pre-check data; failures (unknown ref, empty repo) come
 * back as an ok/error union so the dialog can degrade quietly.
 */
export const mergePreviewRpc = defineRpc({
  name: "git.merge-preview",
  input: z.object({
    cwd: z.string().min(1),
    repo: z.string(),
    branch: z.string().min(1),
    operation: z.enum(["merge", "rebase"]),
  }),
  output: z.union([
    z.object({
      ok: z.literal(true),
      commitCount: z.number().int().nonnegative(),
      /** merge：冲突文件列表（空=无冲突）；rebase 或预检不可用时为 null。 */
      conflicts: z.array(z.string()).nullable(),
      /** merge 冲突预演是否可用（git < 2.38 无 --write-tree 时为 false）。rebase 恒为 false。 */
      previewSupported: z.boolean(),
      /** 工作区是否干净（无未提交更改）。 */
      workspaceClean: z.boolean(),
    }),
    z.object({ ok: z.literal(false), error: failureSchema }),
  ]),
});

export const actionRpc = defineRpc({
  name: "git.action",
  input: z.object({
    cwd: z.string().min(1),
    repo: z.string(),
    action: actionSchema,
  }),
  output: z.union([
    z.object({
      ok: z.literal(true),
      snapshot: snapshotSchema,
      output: z.string().optional(),
    }),
    z.object({
      ok: z.literal(false),
      error: failureSchema.extend({
        /** 冲突类失败的冲突文件清单（从 git 输出解析）；非冲突失败无此字段。 */
        conflicts: z.array(z.string()).optional(),
      }),
    }),
  ]),
});

/** Settings shared by the client (rendering) and server (write gates). */
export const gitPanelSettings = defineSettings({
  id: "git-panel",
  scope: "host",
  version: 1,
  schema: z.object({
    showComposerPill: z.boolean().default(true),
    showHeaderButton: z.boolean().default(true),
    defaultDiffView: z.enum(["unified", "split"]).default("unified"),
    changesView: z.enum(["flat", "tree"]).default("flat"),
    refreshIntervalMs: z.number().int().min(0).max(60000).default(5000),
    allowFileEdit: z.boolean().default(true),
    /** 系统 opener（在 Finder 中显示 / 用默认应用打开）开关；远程 daemon 场景可关。 */
    allowSystemOpen: z.boolean().default(true),
    filesFollowRepo: z.boolean().default(false),
    autoSaveFile: z.boolean().default(true),
    editorSyntaxHighlight: z.boolean().default(true),
  }),
});
export type GitPanelSettings = z.output<typeof gitPanelSettings.schema>;

export const DEFAULT_SETTINGS: GitPanelSettings = {
  showComposerPill: true,
  showHeaderButton: true,
  defaultDiffView: "unified",
  changesView: "flat",
  refreshIntervalMs: 5000,
  allowFileEdit: true,
  allowSystemOpen: true,
  filesFollowRepo: false,
  autoSaveFile: true,
  editorSyntaxHighlight: true,
};

/** Editable file extensions, mirroring dsh-git-panel's allow list. */
export const EDITABLE_EXTENSIONS = new Set([
  "json",
  "yaml",
  "yml",
  "xml",
  "properties",
  "md",
  "markdown",
  "txt",
  "toml",
  "conf",
  "ini",
  "cfg",
  "log",
  "csv",
]);
export const EDITABLE_FILENAMES = new Set([
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
]);

export function isEditablePath(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  if (EDITABLE_FILENAMES.has(name)) return true;
  if (name.startsWith(".env.")) return true;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return EDITABLE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
