// 面板 ↔ worker 的契约，只在这里声明一次：src/panel.tsx 与 src/worker.ts 都读它。

export type FileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typechange'
  | 'conflict'
  | 'untracked'

export type FileChange = {
  path: string
  status: FileStatus
  /** untracked 文件的真实行数；二进制或预算耗尽时为 null。 */
  additions: number | null
  deletions: number | null
}

export type GitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert'

/** 远端信息：compare 链接与 CLI 都从本地读，不发网络请求。 */
export type RemoteInfo = {
  name: string | null
  url: string | null
  host: string | null
  provider: 'github' | 'gitlab' | 'other' | null
  /** 没装 gh/glab 时，面板用它在浏览器里打开创建 PR/MR 的页面。 */
  compareUrl: string | null
  /** 本机检测到的宿主 CLI。 */
  cli: 'gh' | 'glab' | null
  /** 用于比较/变基的默认分支名。 */
  baseBranch: string | null
}

/** 基准分支状态：当前分支离「要合入的目标」还差几个提交。 */
export type BaseStatus = {
  /** `origin/main` 这样的远端跟踪引用。 */
  ref: string
  /** 本地是否有这个远端跟踪分支（没 fetch 过就是 false）。 */
  exists: boolean
  /** 基准分支有、当前分支没有的提交数。 */
  ahead: number
  /** 上面那些提交的前几条（sha 短号 + 标题）。 */
  commits: { sha: string; subject: string }[]
  /** 合入会覆盖的本地未跟踪文件（最多列 10 个，另给总数）；有值时不允许合并。 */
  overwritten: { files: string[]; total: number }
  /** 选中的 ref 已不存在时的回退目标（回退后 ref 就是它）。 */
  fellBackTo: string | null
}

/** 拉取基准分支的结果：失败也要带回快照，好让冲突条/领先数照常刷新。 */
export type MergeStage = 'fetch' | 'merge'
export type MergeReason =
  | 'auth'
  | 'network'
  | 'ref-missing'
  | 'untracked-overwrite'
  | 'identity'
  | 'conflict'
  | 'other'

export type MergeBaseInput = {
  repoRoot: string
  /** 选中的基准 ref；缺省用远端默认分支。 */
  base?: string
  /** 合并前是否先 fetch；`false` 表示只合并本地已有的 remote-tracking ref。 */
  fetch?: boolean
}

export type MergeBaseOutcome =
  | {
      ok: true
      snapshot: GitSnapshot
      /** fetch 失败但本地有 ref，已用本地基准完成合并。 */
      degraded: { reason: MergeReason; detail: string } | null
    }
  | {
      ok: false
      stage: MergeStage
      reason: MergeReason
      detail: string
      snapshot: GitSnapshot
    }

export type GitSnapshot = {
  repoRoot: string
  branch: string | null
  detached: boolean
  ahead: number
  behind: number
  hasUpstream: boolean
  upstream: string | null
  remote: RemoteInfo
  /** 基准分支（远端默认分支）状态；没有远端或用不到时为 null。 */
  base: BaseStatus | null
  operation: GitOperation | null
  /** 未解决冲突的文件（porcelain v2 的 u 行）。 */
  conflicts: string[]
  staged: FileChange[]
  modified: FileChange[]
  untracked: FileChange[]
  /** 子模块清单（含未初始化），供 Changes 组显示子模块行。 */
  submodules: SubmoduleEntry[]
  lastCommit: { sha: string; subject: string } | null
  /** 行数统计超出预算时为 true。 */
  partial: boolean
}

export type RepoKind = 'root' | 'submodule' | 'nested'

export type RepoSummary = {
  root: string
  name: string
  kind: RepoKind
  branch: string | null
  dirty: boolean | null
  /** 子模块未初始化时为 false（`git submodule status` 前缀 `-`）。 */
  initialized: boolean
}

export type SubmoduleEntry = {
  path: string
  /** `git submodule status` 的前缀：空格=干净，+=有新提交，-=未初始化，U=冲突。 */
  state: 'clean' | 'newCommits' | 'uninitialized' | 'conflict'
  commit: string
  describe: string
}

export type GitRepos = {
  workspaceId: string | null
  cwd: string | null
  /** 工作区在另一台主机（ssh:/runtime:）上时为 false，此时 repos 为空。 */
  local: boolean
  hostId: string | null
  repos: RepoSummary[]
}

export type StashEntry = {
  index: number
  ref: string
  message: string
  branch: string | null
  at: number
}

export type GitStashes = { stashes: StashEntry[] }

export type RepoInput = { repoRoot: string; fresh?: boolean; /** 选中的基准分支引用；缺省用远端默认分支。 */ base?: string }
export type PathsInput = { repoRoot: string; paths: string[] }
export type FolderInput = { repoRoot: string; prefix: string }
export type FileDiffInput = { repoRoot: string; path: string; staged: boolean }
export type FileDiffResult = { text: string; truncated: boolean }
export type OpenFileInput = { repoRoot: string; path: string }
export type CommitInput = { repoRoot: string; message: string; amend: boolean }
export type StashSaveInput = { repoRoot: string; message: string; includeUntracked: boolean }
export type StashInput = { repoRoot: string; index: number }
export type PullRequestResult = { url: string | null; via: 'gh' | 'glab' | 'link' }
export type PullRequestStatus = { state: string; number: number; url: string } | null
export type LogInput = { repoRoot: string; revision?: string; skip: number; limit: number }
export type LogCommit = { sha: string; subject: string; author: string; at: number; refs: string }
export type LogResult = { commits: LogCommit[]; hasMore: boolean }
export type CommitFilesInput = { repoRoot: string; sha: string }
export type CommitFile = { path: string; additions: number | null; deletions: number | null }
export type BranchList = { branches: { name: string; remote: boolean; current: boolean }[]; detached: boolean }
export type BranchCreateInput = { repoRoot: string; name: string }
export type BranchSwitchInput = { repoRoot: string; name: string; track?: boolean }
export type BranchDeleteInput = { repoRoot: string; name: string; force: boolean }

declare module 'orca' {
  interface PluginRequests {
    'git.repos': { input: { workspaceId?: string }; output: GitRepos }
    'git.snapshot': { input: RepoInput; output: GitSnapshot }
    'git.stage': { input: PathsInput; output: GitSnapshot }
    'git.unstage': { input: PathsInput; output: GitSnapshot }
    'git.stageAll': { input: RepoInput; output: GitSnapshot }
    'git.unstageAll': { input: RepoInput; output: GitSnapshot }
    'git.discard': { input: PathsInput; output: GitSnapshot }
    'git.stageFolder': { input: FolderInput; output: GitSnapshot }
    'git.unstageFolder': { input: FolderInput; output: GitSnapshot }
    'git.discardFolder': { input: FolderInput; output: GitSnapshot }
    'git.fileDiff': { input: FileDiffInput; output: FileDiffResult }
    'git.openFile': { input: OpenFileInput; output: { opened: true; absolutePath: string } }
    'git.commit': { input: CommitInput; output: GitSnapshot }
    'git.commitPush': { input: CommitInput; output: GitSnapshot }
    'git.commitSync': { input: CommitInput; output: GitSnapshot }
    'git.commitForce': { input: CommitInput; output: GitSnapshot }
    'git.fetch': { input: RepoInput; output: GitSnapshot }
    'git.pull': { input: RepoInput; output: GitSnapshot }
    'git.fastForward': { input: RepoInput; output: GitSnapshot }
    'git.sync': { input: RepoInput; output: GitSnapshot }
    'git.push': { input: RepoInput; output: GitSnapshot }
    'git.pushForce': { input: RepoInput; output: GitSnapshot }
    'git.publish': { input: RepoInput; output: GitSnapshot }
    'git.rebase': { input: RepoInput; output: GitSnapshot }
    'git.mergeBase': { input: MergeBaseInput; output: MergeBaseOutcome }
    'git.pullRequest': { input: RepoInput; output: PullRequestResult }
    'git.pushThenPullRequest': { input: RepoInput; output: PullRequestResult }
    'git.abortOperation': { input: RepoInput; output: GitSnapshot }
    'git.continueOperation': { input: RepoInput; output: GitSnapshot }
    'git.completeMerge': { input: RepoInput; output: GitSnapshot }
    'git.log': { input: LogInput; output: LogResult }
    'git.commitFiles': { input: CommitFilesInput; output: { files: CommitFile[] } }
    'git.branchList': { input: RepoInput; output: BranchList }
    'git.branchCreate': { input: BranchCreateInput; output: GitSnapshot }
    'git.branchSwitch': { input: BranchSwitchInput; output: GitSnapshot }
    'git.branchDelete': { input: BranchDeleteInput; output: GitSnapshot }
    'git.pullRequestStatus': { input: RepoInput; output: PullRequestStatus }
    'git.openBuiltIn': { input: { workspaceId?: string }; output: { ran: true } }
    'git.stashList': { input: RepoInput; output: GitStashes }
    'git.stashSave': { input: StashSaveInput; output: GitSnapshot }
    'git.stashApply': { input: StashInput; output: GitSnapshot }
    'git.stashPop': { input: StashInput; output: GitSnapshot }
    'git.stashDrop': { input: StashInput; output: GitStashes }
  }
  interface PluginPanelEvents {
    'git.changed': { repoRoot: string; snapshot: GitSnapshot }
  }
}
