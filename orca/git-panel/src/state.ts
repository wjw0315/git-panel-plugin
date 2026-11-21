// 面板共享状态与动作（无 JSX）：panel.tsx 只做组装，行渲染在 rows.tsx，页签在 tabs-*.tsx。
// 拆分原因：Orca 桌面端给每个面板文件 2000ms 转译预算，单文件 900+ 行会超。

import { atom, plugin, read, set, shell, host } from 'orca'
import type {
  FileChange,
  GitSnapshot,
  MergeReason,
  MergeStage,
  RepoSummary,
  StashEntry,
} from './protocol'
import { copy, type Copy } from './strings'

export const repos = atom<RepoSummary[]>([])
export const local = atom(true)
export const selected = atom('selectedRepo', '', { persist: 'workspace' })
export const snapshot = atom<GitSnapshot | null>(null)
export const stashes = atom<StashEntry[]>([])
export const message = atom('message', '')
export const amend = atom(false)
export const includeUntracked = atom(false)
export const forceConfirm = atom(false)
export const busy = atom(false)
export const error = atom<string | null>(null)
/** 当前展开的行内差异：`s:path`（已暂存）/ `w:path`（工作区）。 */
export const diffOpen = atom<string | null>(null)
export const diffText = atom<Record<string, string>>({})

function describeFailure(failure: unknown): string {
  if (failure && typeof failure === 'object' && 'message' in failure && typeof failure.message === 'string') {
    return failure.message
  }
  return String(failure)
}

export async function guard(work: () => Promise<unknown>): Promise<void> {
  set(busy, true)
  set(error, null)
  try {
    await work()
  } catch (failure) {
    set(error, describeFailure(failure))
  } finally {
    set(busy, false)
  }
}

export async function loadStashes(): Promise<void> {
  const root = read(selected)
  if (!root) return
  const answer = await plugin.request('git.stashList', { repoRoot: root })
  set(stashes, answer.stashes)
}

export async function loadSnapshot(fresh: boolean): Promise<void> {
  const root = read(selected)
  if (!root) return
  const base = baseRefFor(root)
  applySnapshot(await plugin.request('git.snapshot', { repoRoot: root, fresh, ...(base ? { base } : {}) }))
}

export async function loadWorkspace(): Promise<void> {
  await guard(async () => {
    const context = await host.call('workspace.readContext')
    const workspaceId = context?.workspaceId
    const answer = await plugin.request('git.repos', workspaceId ? { workspaceId } : {})
    set(local, answer.local)
    set(repos, answer.repos)
    const wanted = read(selected)
    const next =
      answer.repos.find((repo) => repo.root === wanted && repo.initialized) ??
      answer.repos.find((repo) => repo.initialized) ??
      answer.repos[0]
    if (!next) {
      set(selected, '')
      set(snapshot, null)
      set(stashes, [])
      return
    }
    set(selected, next.root)
    set(diffOpen, null)
    set(historySkip, 0)
    await Promise.all([loadSnapshot(true), loadStashes(), loadHistory(true), loadPullRequestStatus(), loadBranches()])
  })
}

export async function selectRepo(root: string): Promise<void> {
  set(selected, root)
  set(snapshot, null)
  set(diffOpen, null)
  set(diffText, {})
  await guard(async () => {
    set(historySkip, 0)
    await Promise.all([
      loadSnapshot(true),
      loadStashes(),
      loadHistory(true),
      loadPullRequestStatus(),
      loadBranches(),
    ])
  })
}

export async function applyRequest(request: Promise<GitSnapshot>): Promise<void> {
  await guard(async () => {
    applySnapshot(await request)
  })
}

export function toggleDiff(path: string, staged: boolean): void {
  const key = `${staged ? 's' : 'w'}:${path}`
  if (read(diffOpen) === key) {
    set(diffOpen, null)
    return
  }
  set(diffOpen, key)
  if (read(diffText)[key] === undefined) {
    void guard(async () => {
      const diff = await plugin.request('git.fileDiff', {
        repoRoot: read(selected),
        path,
        staged,
      })
      set(diffText, { ...read(diffText), [key]: diff.text })
    })
  }
}

/** 提交的四种收尾：commit / push / sync / force（对齐内置四按钮）。 */
export function commitWith(kind: 'commit' | 'push' | 'sync' | 'force'): void {
  set(forceConfirm, false)
  void guard(async () => {
    const name =
      kind === 'commit'
        ? 'git.commit'
        : kind === 'push'
          ? 'git.commitPush'
          : kind === 'sync'
            ? 'git.commitSync'
            : 'git.commitForce'
    const next = await plugin.request(name, {
      repoRoot: read(selected),
      message: read(message),
      amend: read(amend),
    })
    applySnapshot(next)
    set(amend, false)
    set(message, '')
    await loadStashes()
  })
}

export type RemoteRequest =
  | 'git.fetch'
  | 'git.pull'
  | 'git.fastForward'
  | 'git.sync'
  | 'git.push'
  | 'git.publish'
  | 'git.pushForce'
  | 'git.rebase'

export function runRemote(name: RemoteRequest): void {
  set(forceConfirm, false)
  void applyRequest(plugin.request(name, { repoRoot: read(selected) }))
}

export function forcePushPress(): void {
  if (!read(forceConfirm)) {
    set(forceConfirm, true)
    return
  }
  runRemote('git.pushForce')
}

/** 有 gh/glab 就让 worker 直接建；没有就用浏览器打开 compare 页（点击手势不丢）。 */
export function createPullRequest(pushFirst: boolean): void {
  const remote = read(snapshot)?.remote
  if (!remote) return
  if (!pushFirst && !remote.cli) {
    if (remote.compareUrl) void shell.openExternal(remote.compareUrl)
    return
  }
  void guard(async () => {
    const result = await plugin.request(
      pushFirst ? 'git.pushThenPullRequest' : 'git.pullRequest',
      { repoRoot: read(selected) }
    )
    if (result.via === 'link' && result.url) await shell.openExternal(result.url)
  })
}

export function openFile(path: string): void {
  void guard(() => plugin.request('git.openFile', { repoRoot: read(selected), path }))
}

export function newStash(): void {
  void guard(async () => {
    const next = await plugin.request('git.stashSave', {
      repoRoot: read(selected),
      message: read(message),
      includeUntracked: read(includeUntracked),
    })
    applySnapshot(next)
    set(message, '')
    await loadStashes()
  })
}

export function stashOp(entry: StashEntry, op: 'apply' | 'pop' | 'drop'): void {
  const repoRoot = read(selected)
  if (op === 'drop') {
    void guard(async () => {
      const answer = await plugin.request('git.stashDrop', { repoRoot, index: entry.index })
      set(stashes, answer.stashes)
    })
    return
  }
  void applyRequest(
    op === 'apply'
      ? plugin.request('git.stashApply', { repoRoot, index: entry.index })
      : plugin.request('git.stashPop', { repoRoot, index: entry.index })
  )
}

export function describeFile(file: FileChange): string {
  if (file.additions === null || file.deletions === null) return file.status
  return `+${file.additions} −${file.deletions}`
}

export function totals(snapshot: GitSnapshot): { added: number; removed: number; files: number } {
  const all = [...snapshot.staged, ...snapshot.modified, ...snapshot.untracked]
  return {
    added: all.reduce((sum, file) => sum + (file.additions ?? 0), 0),
    removed: all.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
    files: all.length,
  }
}

/** 提交按钮可用的单一判定（提交卡与更多动作共用）。 */
export function canCommitNow(text: Copy): boolean {
  return commitBlockReason(text) === null
}

/** 提交被挡住的原因（对齐内置：Conflicts / Nothing staged / Needs message）。 */
export function commitBlockReason(text: Copy): string | null {
  const snap = read(snapshot)
  if (!snap) return null
  if (snap.conflicts.length > 0 || snap.operation !== null) return text.needResolve
  if (read(amend)) return snap.lastCommit === null ? text.noCommit : null
  if (snap.staged.length === 0) return text.needStaged
  if (read(message).trim().length === 0) return text.needMessage
  return null
}

/** 非主仓库时提交按钮写明目标，避免把子模块的改动提交进主仓库。 */
export function commitTarget(text: Copy): string | null {
  const root = read(selected)
  const repo = read(repos).find((item) => item.root === root)
  if (!repo || repo.kind === 'root') return null
  return text.commitTo(
    repo.kind === 'submodule' ? text.kindSubmodule : text.kindNested,
    repo.name
  )
}

/** 组头批量：staged 先取消暂存再丢弃，与内置「unstage and revert」一致。 */
export function discardGroup(scope: 'staged' | 'changes'): void {
  const snap = read(snapshot)
  if (!snap) return
  const root = read(selected)
  const paths = (scope === 'staged' ? snap.staged : [...snap.modified, ...snap.untracked]).map(
    (file) => file.path
  )
  if (paths.length === 0) return
  if (scope === 'staged') {
    void guard(async () => {
      await applyRequest(plugin.request('git.unstage', { repoRoot: root, paths }))
      await applyRequest(plugin.request('git.discard', { repoRoot: root, paths }))
    })
    return
  }
  void applyRequest(plugin.request('git.discard', { repoRoot: root, paths }))
}

export function stageGroup(scope: 'changes'): void {
  const snap = read(snapshot)
  if (!snap || scope !== 'changes') return
  void applyRequest(plugin.request('git.stageAll', { repoRoot: read(selected) }))
}

export function unstageGroup(): void {
  void applyRequest(plugin.request('git.unstageAll', { repoRoot: read(selected) }))
}

/** 基准页的失败/降级提示与「原始输出」开合。 */
export type BaseFailure = { stage: MergeStage; reason: MergeReason; detail: string }
export const baseFailure = atom<BaseFailure | null>(null)
export const baseDegraded = atom<MergeReason | null>(null)
export const baseDetailOpen = atom(false)

/** 拉取基准分支。`fetchFirst=false` 表示只合并本地已有的 remote-tracking ref。 */
export function pullBase(fetchFirst: boolean): void {
  const root = read(selected)
  const base = baseRefFor(root)
  set(baseFailure, null)
  set(baseDegraded, null)
  set(baseDetailOpen, false)
  void guard(async () => {
    const outcome = await plugin.request('git.mergeBase', {
      repoRoot: root,
      ...(base ? { base } : {}),
      fetch: fetchFirst,
    })
    applySnapshot(outcome.snapshot)
    if (!outcome.ok) {
      set(baseFailure, { stage: outcome.stage, reason: outcome.reason, detail: outcome.detail })
      return
    }
    if (outcome.degraded) set(baseDegraded, outcome.degraded.reason)
  })
}

/** 面板各处共用的派生态，集中算一次。 */
export function derived(text: Copy) {
  const snap = read(snapshot)
  const stats = snap ? totals(snap) : { added: 0, removed: 0, files: 0 }
  const dirty = stats.files > 0
  const clean = !dirty
  const remote = snap?.remote ?? null
  const canCommit = snap
    ? read(amend)
      ? !snap.operation && snap.lastCommit !== null
      : snap.staged.length > 0 && read(message).trim().length > 0
    : false
  const amendBlocked = snap?.operation
    ? text.operationRunning(snap.operation)
    : snap && !snap.lastCommit
      ? text.noCommit
      : null
  const canSync = Boolean(snap?.hasUpstream) && clean && !snap?.operation
  const rebaseTarget = snap?.upstream
    ? snap.upstream
    : remote?.name && remote.baseBranch
      ? `${remote.name}/${remote.baseBranch}`
      : null
  const canRebase = clean && !snap?.operation && rebaseTarget !== null
  const canPullRequest = Boolean(snap?.hasUpstream) && Boolean(remote?.cli ?? remote?.compareUrl)
  const aheadBehind = snap
    ? snap.ahead === 0 && snap.behind === 0
      ? text.upToDate
      : `↑${snap.ahead} ↓${snap.behind}`
    : ''
  return { snap, stats, dirty, clean, remote, canCommit, amendBlocked, canSync, rebaseTarget, canRebase, canPullRequest, aheadBehind }
}

// ---- 历史页签与分支选择器（第二片） ----

import type { BranchList, LogCommit, PullRequestStatus } from './protocol'

export const historyCommits = atom<LogCommit[]>([])
export const historyHasMore = atom(false)
export const historyFilter = atom('')
export const historySkip = atom(0)
export const commitFilesOpen = atom<string | null>(null)
export const commitFilesMap = atom<Record<string, { path: string; additions: number | null; deletions: number | null }[]>>({})
export const prStatus = atom<PullRequestStatus>(null)
export const branches = atom<BranchList['branches']>([])
export const branchDraft = atom('')
export const branchCreating = atom(false)
export const deleteConfirm = atom<string | null>(null)

const HISTORY_PAGE = 20

export async function loadHistory(reset: boolean): Promise<void> {
  await guard(async () => {
    const skip = reset ? 0 : read(historySkip)
    const revision = read(historyFilter).trim()
    const answer = await plugin.request('git.log', {
      repoRoot: read(selected),
      ...(revision ? { revision } : {}),
      skip,
      limit: HISTORY_PAGE,
    })
    set(historySkip, skip + HISTORY_PAGE)
    set(historyCommits, reset ? answer.commits : [...read(historyCommits), ...answer.commits])
    set(historyHasMore, answer.hasMore)
  })
}

export async function loadPullRequestStatus(): Promise<void> {
  await guard(async () => {
    set(prStatus, null)
    const status = await plugin.request('git.pullRequestStatus', { repoRoot: read(selected) })
    set(prStatus, status)
  })
}

export async function loadBranches(): Promise<void> {
  await guard(async () => {
    const answer = await plugin.request('git.branchList', { repoRoot: read(selected) })
    set(branches, answer.branches)
  })
}

export function toggleCommitFiles(sha: string): void {
  if (read(commitFilesOpen) === sha) {
    set(commitFilesOpen, null)
    return
  }
  set(commitFilesOpen, sha)
  if (read(commitFilesMap)[sha] === undefined) {
    void guard(async () => {
      const answer = await plugin.request('git.commitFiles', { repoRoot: read(selected), sha })
      set(commitFilesMap, { ...read(commitFilesMap), [sha]: answer.files })
    })
  }
}

async function refreshAfterBranchChange(): Promise<void> {
  await Promise.all([loadHistory(true), loadBranches()])
}

export function switchBranch(name: string, track: boolean): void {
  void guard(async () => {
    const next = await plugin.request('git.branchSwitch', {
      repoRoot: read(selected),
      name,
      track,
    })
    applySnapshot(next)
    await refreshAfterBranchChange()
  })
}

export function createBranch(): void {
  const name = read(branchDraft).trim()
  if (!name) return
  set(branchDraft, '')
  set(branchCreating, false)
  void guard(async () => {
    const next = await plugin.request('git.branchCreate', { repoRoot: read(selected), name })
    applySnapshot(next)
    await refreshAfterBranchChange()
  })
}

export function deleteBranch(name: string, force: boolean): void {
  set(deleteConfirm, null)
  void guard(async () => {
    const next = await plugin.request('git.branchDelete', {
      repoRoot: read(selected),
      name,
      force,
    })
    applySnapshot(next)
    await loadBranches()
  })
}

// ---- 顶部页签（v4.1：卡片列表改成顶部 tab 切换，一次只显示一页内容） ----

export type TabId = 'commit' | 'changes' | 'base' | 'history' | 'stash' | 'branch' | 'remote'

/** 更改页的文件展示方式：树形（逐层目录）或平铺（一列）。 */
export type FileView = 'tree' | 'flat'
export const fileView = atom<FileView>('fileView', 'tree', { persist: 'plugin' })
/** 每个仓库自己选的基准分支（ref 形如 origin/main 或本地分支名）；没选过就用远端默认。 */
export const baseRefs = atom<Record<string, string>>('baseRefs', {}, { persist: 'plugin' })

/** 统一入口：写快照的同时处理「基准 ref 回退」，避免面板记住一个已不存在的选择。 */
export function applySnapshot(next: GitSnapshot | null): void {
  set(snapshot, next)
  if (!next || !next.base?.fellBackTo) return
  const stored = read(baseRefs)[next.repoRoot]
  if (stored && stored !== next.base.ref) {
    set(baseRefs, { ...read(baseRefs), [next.repoRoot]: '' })
  }
}

export function baseRefFor(root: string): string | undefined {
  const ref = read(baseRefs)[root]
  return ref && ref.length ? ref : undefined
}

/** 换基准分支：记住选择并重拉快照（基准领先数、提交清单都跟着变）。 */
export function setBaseRef(ref: string): void {
  const root = read(selected)
  if (!root) return
  set(baseRefs, { ...read(baseRefs), [root]: ref })
  set(baseFailure, null)
  set(baseDegraded, null)
  void guard(async () => {
    applySnapshot(await plugin.request('git.snapshot', { repoRoot: root, fresh: true, ...(ref ? { base: ref } : {}) }))
  })
}
/** 树形视图里展开的目录路径；一级目录默认展开。 */
export const openDirs = atom<Record<string, boolean>>('openDirs', {}, { persist: 'plugin' })

export function dirOpen(path: string, fallback: boolean): boolean {
  const saved = read(openDirs)[path]
  return saved === undefined ? fallback : saved
}

export function toggleDir(path: string, fallback: boolean): void {
  set(openDirs, { ...read(openDirs), [path]: !dirOpen(path, fallback) })
}
export const activeTab = atom<TabId>('tab', 'changes', { persist: 'plugin' })
export const commitMenuOpen = atom(false)

export function selectTab(id: TabId): void {
  set(activeTab, id)
  if (id === 'history') {
    void loadHistory(true)
    void loadPullRequestStatus()
  }
  if (id === 'branch' || id === 'base') void loadBranches()
}
