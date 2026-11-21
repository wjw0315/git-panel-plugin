// git 执行层：argv 数组调用、状态解析、快照缓存、以及面板用到的写操作。
// 约定：所有命令都以 `-C <repoRoot>` 固定工作目录，永不使用进程自身 cwd，也不拼 shell 字符串。

import { execFile } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type {
  BaseStatus,
  MergeBaseOutcome,
  BranchList,
  CommitFile,
  FileChange,
  FileStatus,
  GitOperation,
  GitSnapshot,
  LogCommit,
  PullRequestResult,
  PullRequestStatus,
  RemoteInfo,
  SubmoduleEntry,
  StashEntry,
} from './protocol'
import { classifyFailure } from './git-failure'

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_BUFFER = 4 * 1024 * 1024
const CACHE_MS = 1_200
const UNTRACKED_BUDGET_MS = 8_000
const UNTRACKED_LIMIT = 200
const UNTRACKED_BYTES = 256 * 1024

/** 交给面板时只带 host 认识的 code，其余一律 action_failed。 */
export class GitError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export type GitResult = { code: number; stdout: string; stderr: string }

export function runGit(
  repoRoot: string,
  args: readonly string[],
  options: { timeoutMs?: number; write?: boolean } = {}
): Promise<GitResult> {
  const env = options.write ? process.env : { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
  // Promise.withResolvers 需要 ES2024 lib，这里目标仍是 ES2022，手写一个等价的延迟器。
  let settle: (value: GitResult) => void = () => undefined
  const done = new Promise<GitResult>((resolve) => {
    settle = resolve
  })
  execFile(
    'git',
    ['-C', repoRoot, ...args],
    {
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      env,
      windowsHide: true,
    },
    (error, stdout, stderr) => {
      const code =
        error && typeof error.code === 'number' ? error.code : error ? -1 : 0
      settle({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    }
  )
  return done
}

function failure(result: GitResult, fallback: string): GitError {
  const detail = (result.stderr || result.stdout).trim().split('\n').slice(-3).join(' ')
  if (/index\.lock|Unable to create .*\.lock|another git process/i.test(detail)) {
    return new GitError(
      'conflict',
      `内置源代码控制或其他进程正在运行 git 操作，请稍后重试（${detail}）`
    )
  }
  return new GitError('action_failed', detail || fallback)
}

const STATUS_MAP: Record<string, FileStatus> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'typechange',
  U: 'conflict',
}

export type ParsedStatus = {
  branch: string | null
  detached: boolean
  ahead: number
  behind: number
  hasUpstream: boolean
  upstream: string | null
  staged: FileChange[]
  modified: FileChange[]
  untracked: FileChange[]
  conflicts: string[]
}

/** `git status --porcelain=v2 --branch -z`。 */
export function parseStatus(stdout: string): ParsedStatus {
  const parsed: ParsedStatus = {
    branch: null,
    detached: false,
    ahead: 0,
    behind: 0,
    hasUpstream: false,
    upstream: null,
    staged: [],
    modified: [],
    untracked: [],
    conflicts: [],
  }
  const tokens = stdout.split('\u0000')
  for (let i = 0; i < tokens.length; i += 1) {
    const line = tokens[i]
    if (!line) continue
    if (line.startsWith('# ')) {
      const [key, ...rest] = line.slice(2).split(' ')
      const value = rest.join(' ')
      if (key === 'branch.head') {
        if (value === '(detached)') parsed.detached = true
        else parsed.branch = value
      } else if (key === 'branch.upstream') {
        parsed.hasUpstream = true
        parsed.upstream = value
      } else if (key === 'branch.ab') {
        const [ahead, behind] = value.split(' ')
        parsed.ahead = Number(ahead?.replace('+', '') ?? 0) || 0
        parsed.behind = Number(behind?.replace('-', '') ?? 0) || 0
      }
      continue
    }
    if (line.startsWith('? ')) {
      parsed.untracked.push({ path: line.slice(2), status: 'untracked', additions: null, deletions: null })
      continue
    }
    if (line.startsWith('1 ') || line.startsWith('2 ') || line.startsWith('u ')) {
      const kind = line[0]
      const fields = line.split(' ')
      // `1` 有 8 个前缀字段，`2` 多一个改名计分，`u`（未合并）多到 10 个。
      const path =
        kind === '2'
          ? fields.slice(9).join(' ')
          : kind === 'u'
            ? fields.slice(10).join(' ')
            : fields.slice(8).join(' ')
      // `2` 的原始路径是下一个 NUL 分段。
      if (kind === '2') i += 1
      const index = fields[1]?.[0] ?? '.'
      const worktree = fields[1]?.[1] ?? '.'
      if (kind === 'u') {
        parsed.conflicts.push(path)
        continue
      }
      const stagedStatus = STATUS_MAP[index]
      if (stagedStatus) parsed.staged.push({ path, status: stagedStatus, additions: null, deletions: null })
      const worktreeStatus = STATUS_MAP[worktree]
      if (worktreeStatus) parsed.modified.push({ path, status: worktreeStatus, additions: null, deletions: null })
    }
  }
  return parsed
}

/** `git diff --numstat` 与 `--cached --numstat`。 */
function parseNumstat(stdout: string): Map<string, { additions: number | null; deletions: number | null }> {
  const map = new Map<string, { additions: number | null; deletions: number | null }>()
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const [additions, deletions, path] = line.split('\t')
    if (!path) continue
    map.set(path, {
      additions: additions === '-' ? null : Number(additions),
      deletions: deletions === '-' ? null : Number(deletions),
    })
  }
  return map
}

function withNumstat(files: FileChange[], map: Map<string, { additions: number | null; deletions: number | null }>): FileChange[] {
  return files.map((file) => {
    const stats = map.get(file.path)
    return stats ? { ...file, additions: stats.additions, deletions: stats.deletions } : file
  })
}

function countLines(repoRoot: string, path: string, deadline: number): number | null {
  if (Date.now() > deadline) return null
  try {
    const target = join(repoRoot, path)
    const info = existsSync(target) ? readFileSync(target, 'utf8') : null
    if (info === null) return null
    if (info.length > UNTRACKED_BYTES) return null
    if (info.indexOf('\u0000') >= 0) return null
    let lines = info.split('\n').length
    if (info.endsWith('\n')) lines -= 1
    return Math.max(0, lines)
  } catch {
    return null
  }
}

function readOperation(gitDir: string | null): GitOperation | null {
  if (!gitDir) return null
  if (existsSync(join(gitDir, 'MERGE_HEAD'))) return 'merge'
  if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))) {
    return 'rebase'
  }
  if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick'
  if (existsSync(join(gitDir, 'REVERT_HEAD'))) return 'revert'
  return null
}

const cache = new Map<string, { at: number; snapshot: GitSnapshot }>()
const inFlight = new Map<string, Promise<GitSnapshot>>()

export function invalidateSnapshot(repoRoot: string): void {
  cache.delete(repoRoot)
  inFlight.delete(repoRoot)
}

/** 远端信息：全部从本地 git 读，不发网络请求。 */
export type ParsedRemote = RemoteInfo

function remoteWeb(host: string, path: string, provider: 'github' | 'gitlab' | 'other'): string | null {
  if (provider === 'other') return null
  return `https://${host}/${path.replace(/\.git$/, '')}`
}

/** 解析 `git@host:owner/repo.git`、`ssh://git@host/owner/repo.git`、`https://host/owner/repo.git`。 */
export function parseRemoteUrl(url: string): { host: string; path: string; provider: 'github' | 'gitlab' | 'other' } | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(trimmed)
  const uri = /^[a-z+]+:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(trimmed)
  const match = uri ?? scp
  if (!match) return null
  const host = match[1]
  const path = match[2].replace(/^\/+/, '')
  const provider = host === 'github.com' ? 'github' : host === 'gitlab.com' ? 'gitlab' : 'other'
  return { host, path, provider }
}

/** 本机 PATH 里有没有这个可执行文件（用来判断能否直接建 PR/MR）。 */
function hasBinary(name: string): boolean {
  const path = process.env.PATH ?? ''
  return path.split(':').some((dir) => Boolean(dir) && existsSync(join(dir, name)))
}

function buildRemote(name: string | null, url: string | null, baseBranch: string | null, branch: string | null): RemoteInfo {
  if (!name || !url) {
    return { name: null, url: null, host: null, provider: null, compareUrl: null, cli: null, baseBranch }
  }
  const parsed = parseRemoteUrl(url)
  const provider = parsed?.provider ?? null
  const web = parsed ? remoteWeb(parsed.host, parsed.path, parsed.provider) : null
  let compareUrl: string | null = null
  if (web && branch && baseBranch && provider === 'github') {
    compareUrl = `${web}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(branch)}?expand=1`
  } else if (web && branch && baseBranch && provider === 'gitlab') {
    compareUrl = `${web}/-/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(branch)}`
  }
  const cli = provider === 'github' && hasBinary('gh') ? 'gh' : provider === 'gitlab' && hasBinary('glab') ? 'glab' : null
  return { name, url, host: parsed?.host ?? null, provider, compareUrl, cli, baseBranch }
}

async function readRemote(repoRoot: string, branch: string | null): Promise<RemoteInfo> {
  const remoteName = await runGit(repoRoot, ['remote'])
  const names = remoteName.code === 0 ? remoteName.stdout.split('\n').map((line) => line.trim()).filter(Boolean) : []
  const name = names.includes('origin') ? 'origin' : names[0] ?? null
  if (!name) return buildRemote(null, null, null, branch)
  const [url, head] = await Promise.all([
    runGit(repoRoot, ['remote', 'get-url', name]),
    runGit(repoRoot, ['symbolic-ref', '--quiet', '--short', `refs/remotes/${name}/HEAD`]),
  ])
  const remoteUrl = url.code === 0 ? url.stdout.trim() : null
  const remoteHead = head.code === 0 ? head.stdout.trim().replace(`${name}/`, '') : ''
  return buildRemote(name, remoteUrl, remoteHead || 'main', branch)
}
const SUBMODULE_STATE: Record<string, SubmoduleEntry['state']> = {
  ' ': 'clean',
  '+': 'newCommits',
  '-': 'uninitialized',
  U: 'conflict',
}

/** `git submodule status --recursive`；没有子模块时返回空数组。 */
export async function listSubmodules(repoRoot: string): Promise<SubmoduleEntry[]> {
  const result = await runGit(repoRoot, ['submodule', 'status', '--recursive'])
  if (result.code !== 0) return []
  const entries: SubmoduleEntry[] = []
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue
    // 行格式：`<前缀><40位sha> <path> (<describe>)`，前缀是 空格/+/-/U。
    const commit = line.slice(1, 41)
    const rest = line.slice(42)
    const open = rest.indexOf(' (')
    const path = (open < 0 ? rest : rest.slice(0, open)).trim()
    const describe = open < 0 ? '' : rest.slice(open + 2).replace(/\)$/, '').trim()
    if (!path) continue
    entries.push({
      path,
      state: SUBMODULE_STATE[line[0]] ?? 'clean',
      commit,
      describe,
    })
  }
  return entries
}

/** 合入 ref 时会覆盖的本地未跟踪文件：git 只拒绝「未跟踪且 incoming 也有」的路径。 */
async function readOverwritten(
  repoRoot: string,
  ref: string,
  untracked: string[]
): Promise<{ files: string[]; total: number }> {
  if (!untracked.length) return { files: [], total: 0 }
  const diff = await runGit(repoRoot, ['diff', '--name-only', '-z', `HEAD..${ref}`])
  if (diff.code !== 0) return { files: [], total: 0 }
  const incoming = new Set(diff.stdout.split('\u0000').filter(Boolean))
  const hit = untracked.filter((path) => incoming.has(path))
  return { files: hit.slice(0, 10), total: hit.length }
}

async function readBase(
  repoRoot: string,
  remote: RemoteInfo,
  untracked: string[],
  override?: string
): Promise<BaseStatus | null> {
  const fallback = remote.name && remote.baseBranch ? `${remote.name}/${remote.baseBranch}` : null
  let ref = override ?? fallback
  if (!ref) return null

  let fellBackTo: string | null = null
  let exists = (await runGit(repoRoot, ['rev-parse', '--verify', '--quiet', ref])).code === 0
  // 选中的 ref 没了（远端删分支 / 从没 fetch 过）：回退到远端默认，并明确告诉面板。
  if (!exists && override && fallback && override !== fallback) {
    if ((await runGit(repoRoot, ['rev-parse', '--verify', '--quiet', fallback])).code === 0) {
      ref = fallback
      exists = true
      fellBackTo = fallback
    }
  }

  const empty = { files: [], total: 0 }
  if (!exists) return { ref, exists: false, ahead: 0, commits: [], overwritten: empty, fellBackTo }

  const count = await runGit(repoRoot, ['rev-list', '--count', `HEAD..${ref}`])
  const ahead = count.code === 0 ? Number(count.stdout.trim()) || 0 : 0
  const overwritten = await readOverwritten(repoRoot, ref, untracked)
  if (ahead === 0) return { ref, exists: true, ahead: 0, commits: [], overwritten, fellBackTo }

  const log = await runGit(repoRoot, ['log', '-n', '5', '--format=%h%x00%s', `HEAD..${ref}`])
  const commits = log.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split('\u0000')
      return { sha: sha ?? '', subject: subject ?? '' }
    })
  return { ref, exists: true, ahead, commits, overwritten, fellBackTo }
}

async function buildSnapshot(repoRoot: string, base?: string): Promise<GitSnapshot> {
  const [status, gitDir, workingStats, stagedStats, log] = await Promise.all([
    runGit(repoRoot, ['status', '--porcelain=v2', '--branch', '-z']),
    runGit(repoRoot, ['rev-parse', '--absolute-git-dir']),
    runGit(repoRoot, ['diff', '--numstat', '--no-renames']),
    runGit(repoRoot, ['diff', '--cached', '--numstat', '--no-renames']),
    runGit(repoRoot, ['log', '-1', '--format=%H%x00%s']),
  ])
  if (status.code !== 0) throw failure(status, 'git status 失败')

  const parsed = parseStatus(status.stdout)
  const deadline = Date.now() + UNTRACKED_BUDGET_MS
  let partial = false
  const untracked = parsed.untracked.slice(0, UNTRACKED_LIMIT).map((file) => {
    const lines = countLines(repoRoot, file.path, deadline)
    if (lines === null) partial = true
    return { ...file, additions: lines, deletions: lines === null ? null : 0 }
  })

  const commitLine = log.code === 0 ? log.stdout.trim() : ''
  const [sha, subject] = commitLine.split('\u0000')
  const remote = await readRemote(repoRoot, parsed.branch)
  const baseStatus = await readBase(repoRoot, remote, parsed.untracked.map((file) => file.path), base)

  return {
    repoRoot,
    branch: parsed.branch,
    detached: parsed.detached,
    ahead: parsed.ahead,
    behind: parsed.behind,
    hasUpstream: parsed.hasUpstream,
    upstream: parsed.upstream,
    remote,
    base: baseStatus,
    operation: readOperation(gitDir.code === 0 ? gitDir.stdout.trim() : null),
    conflicts: parsed.conflicts,
    staged: withNumstat(parsed.staged, parseNumstat(stagedStats.stdout)),
    modified: withNumstat(parsed.modified, parseNumstat(workingStats.stdout)),
    untracked,
    submodules: await listSubmodules(repoRoot),
    lastCommit: sha ? { sha, subject: subject ?? '' } : null,
    partial: partial || parsed.untracked.length > UNTRACKED_LIMIT,
  }
}

/** 1.2 秒内复用同一仓库的快照，并发请求合并为一次执行。`fresh` 跳过复用；`base` 换基准分支时缓存键跟着变。 */
export async function getSnapshot(
  repoRoot: string,
  fresh = false,
  base?: string
): Promise<GitSnapshot> {
  const key = base ? `${repoRoot}::${base}` : repoRoot
  if (!fresh) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.snapshot
    const running = inFlight.get(key)
    if (running) return running
  }
  const job = buildSnapshot(repoRoot, base).finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, job)
  const snapshot = await job
  cache.set(key, { at: Date.now(), snapshot })
  return snapshot
}

async function must(repoRoot: string, args: readonly string[], fallback: string): Promise<void> {
  const result = await runGit(repoRoot, args, { write: true })
  if (result.code !== 0) throw failure(result, fallback)
}

async function changed(repoRoot: string): Promise<GitSnapshot> {
  invalidateSnapshot(repoRoot)
  return getSnapshot(repoRoot, true)
}

export async function stagePaths(repoRoot: string, paths: string[]): Promise<GitSnapshot> {
  if (!paths.length) throw new GitError('invalid_params', '没有选择文件')
  await must(repoRoot, ['add', '--', ...paths], 'git add 失败')
  return changed(repoRoot)
}

export async function stageAll(repoRoot: string): Promise<GitSnapshot> {
  await must(repoRoot, ['add', '-A'], 'git add -A 失败')
  return changed(repoRoot)
}

async function resetIndex(repoRoot: string, paths: string[]): Promise<void> {
  const unstage = await runGit(repoRoot, ['reset', '-q', 'HEAD', '--', ...paths], { write: true })
  if (unstage.code === 0) return
  // 还没有任何提交时 HEAD 不存在，退回从索引移除。
  await must(repoRoot, ['rm', '-r', '-q', '--cached', '--', ...paths], 'git reset 失败')
}

export async function unstagePaths(repoRoot: string, paths: string[]): Promise<GitSnapshot> {
  if (!paths.length) throw new GitError('invalid_params', '没有选择文件')
  await resetIndex(repoRoot, paths)
  return changed(repoRoot)
}

export async function unstageAll(repoRoot: string): Promise<GitSnapshot> {
  const unstage = await runGit(repoRoot, ['reset', '-q', 'HEAD'], { write: true })
  if (unstage.code !== 0) {
    const root = await runGit(repoRoot, ['rev-parse', '--show-toplevel'])
    const top = root.code === 0 ? root.stdout.trim() : repoRoot
    await must(repoRoot, ['rm', '-r', '-q', '--cached', '--', '.'], `git reset 失败（${top}）`)
  }
  return changed(repoRoot)
}

/** `untracked` 里的路径按删除处理，其余按还原工作区处理。 */
export async function discardPaths(
  repoRoot: string,
  paths: string[],
  untracked: string[]
): Promise<GitSnapshot> {
  if (!paths.length) throw new GitError('invalid_params', '没有选择文件')
  const untrackedSet = new Set(untracked)
  const tracked = paths.filter((path) => !untrackedSet.has(path))
  const removed = paths.filter((path) => untrackedSet.has(path))
  if (tracked.length) {
    await must(repoRoot, ['restore', '--worktree', '--', ...tracked], 'git restore 失败')
  }
  for (const path of removed) {
    rmSync(join(repoRoot, path), { recursive: true, force: true })
  }
  return changed(repoRoot)
}

export async function commit(
  repoRoot: string,
  message: string,
  amend: boolean
): Promise<GitSnapshot> {
  const text = message.trim()
  if (!amend && !text) throw new GitError('invalid_params', '提交信息不能为空')
  if (amend) {
    await must(repoRoot, text ? ['commit', '--amend', '-m', text] : ['commit', '--amend', '--no-edit'], 'git commit --amend 失败')
  } else {
    await must(repoRoot, ['commit', '-m', text], 'git commit 失败')
  }
  return changed(repoRoot)
}

export async function stashSave(
  repoRoot: string,
  message: string,
  includeUntracked: boolean
): Promise<GitSnapshot> {
  const args = ['stash', 'push']
  if (includeUntracked) args.push('--include-untracked')
  if (message.trim()) args.push('-m', message.trim())
  await must(repoRoot, args, 'git stash 失败')
  return changed(repoRoot)
}

export async function stashList(repoRoot: string): Promise<StashEntry[]> {
  const result = await runGit(repoRoot, ['stash', 'list', '--format=%gd%x00%gs%x00%ct'])
  if (result.code !== 0) return []
  const entries: StashEntry[] = []
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue
    const [ref, subject, seconds] = line.split('\u0000')
    const index = Number(/stash@\{(\d+)\}/.exec(ref ?? '')?.[1] ?? Number.NaN)
    if (Number.isNaN(index)) continue
    const message = subject ?? ''
    const branch = /^(?:WIP on|On) ([^:]+):/.exec(message)?.[1] ?? null
    entries.push({
      index,
      ref: ref ?? `stash@{${index}}`,
      message,
      branch,
      at: (Number(seconds) || 0) * 1000,
    })
  }
  return entries
}

export async function stashApply(repoRoot: string, index: number, pop: boolean): Promise<GitSnapshot> {
  const ref = `stash@{${index}}`
  await must(repoRoot, ['stash', pop ? 'pop' : 'apply', '--index', ref], `git stash ${pop ? 'pop' : 'apply'} 失败`)
  return changed(repoRoot)
}

export async function stashDrop(repoRoot: string, index: number): Promise<StashEntry[]> {
  await must(repoRoot, ['stash', 'drop', `stash@{${index}}`], 'git stash drop 失败')
  return stashList(repoRoot)
}

// ---- 远端操作：与内置 Source Control 的菜单同名同义 ----

export function requireClean(snapshot: GitSnapshot, action: string): void {
  if (snapshot.staged.length || snapshot.modified.length || snapshot.untracked.length) {
    throw new GitError('invalid_params', `${action}前请先提交或贮藏当前改动`)
  }
}

export function requireUpstream(snapshot: GitSnapshot, action: string): void {
  if (!snapshot.hasUpstream) {
    throw new GitError('invalid_params', `${action}需要上游分支，先「发布分支」`)
  }
}

export function requireNoOperation(snapshot: GitSnapshot): void {
  if (snapshot.operation) {
    throw new GitError('conflict', `正在 ${snapshot.operation} 中，先处理完`)
  }
}

function runCommand(cwd: string, file: string, args: readonly string[], timeoutMs = 60_000): Promise<GitResult> {
  let settle: (value: GitResult) => void = () => undefined
  const done = new Promise<GitResult>((resolve) => {
    settle = resolve
  })
  execFile(
    file,
    [...args],
    { cwd, timeout: timeoutMs, maxBuffer: MAX_BUFFER, env: process.env, windowsHide: true },
    (error, stdout, stderr) => {
      const code = error && typeof error.code === 'number' ? error.code : error ? -1 : 0
      settle({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    }
  )
  return done
}

function remoteName(snapshot: GitSnapshot): string {
  return snapshot.remote.name ?? 'origin'
}

export async function fetchRemote(repoRoot: string): Promise<GitSnapshot> {
  const snapshot = await getSnapshot(repoRoot, true)
  await must(repoRoot, ['fetch', '--prune', remoteName(snapshot)], 'git fetch 失败')
  return changed(repoRoot)
}

/** `merge` 对应内置的「拉取」（允许合并提交），`ff` 对应「快进」。 */
export async function pullRemote(repoRoot: string, mode: 'merge' | 'ff'): Promise<GitSnapshot> {
  const snapshot = await getSnapshot(repoRoot, true)
  requireNoOperation(snapshot)
  requireUpstream(snapshot, mode === 'ff' ? '快进' : '拉取')
  requireClean(snapshot, mode === 'ff' ? '快进' : '拉取')
  await must(
    repoRoot,
    mode === 'ff' ? ['pull', '--ff-only'] : ['pull', '--no-rebase'],
    mode === 'ff' ? 'git pull --ff-only 失败' : 'git pull 失败'
  )
  return changed(repoRoot)
}

export async function pushRemote(repoRoot: string, force: boolean): Promise<GitSnapshot> {
  const snapshot = await getSnapshot(repoRoot, true)
  requireNoOperation(snapshot)
  const remote = remoteName(snapshot)
  const args = ['push']
  if (force) args.push('--force-with-lease')
  if (snapshot.hasUpstream) args.push(remote, snapshot.branch ?? 'HEAD')
  else args.push('--set-upstream', remote, 'HEAD')
  await must(repoRoot, args, force ? 'git push --force-with-lease 失败' : 'git push 失败')
  return changed(repoRoot)
}

export async function syncRemote(repoRoot: string): Promise<GitSnapshot> {
  const snapshot = await getSnapshot(repoRoot, true)
  requireNoOperation(snapshot)
  requireUpstream(snapshot, '同步')
  requireClean(snapshot, '同步')
  // 能快进就快进；已经分叉时退回合并，避免同步直接失败。
  const fast = await runGit(repoRoot, ['pull', '--ff-only'], { write: true })
  if (fast.code !== 0) {
    await must(repoRoot, ['pull', '--no-rebase'], 'git pull 失败')
  }
  await must(repoRoot, ['push', remoteName(snapshot), snapshot.branch ?? 'HEAD'], 'git push 失败')
  return changed(repoRoot)
}

/** 变基到上游；没有上游时退到 `origin/<base>`。 */
export async function rebaseOntoUpstream(repoRoot: string): Promise<GitSnapshot> {
  const snapshot = await getSnapshot(repoRoot, true)
  requireNoOperation(snapshot)
  requireClean(snapshot, '变基')
  const target =
    snapshot.upstream ??
    (snapshot.remote.name && snapshot.remote.baseBranch
      ? `${snapshot.remote.name}/${snapshot.remote.baseBranch}`
      : null)
  if (!target) throw new GitError('invalid_params', '没有可用的变基目标分支')
  await must(repoRoot, ['rebase', target], `git rebase ${target} 失败`)
  return changed(repoRoot)
}

/** 拉取基准分支：可选先 fetch，再把选中的基准合进当前分支（可中止，不推送）。
 *  fetch 失败但本地已有该 ref 时降级用本地基准继续合并——用户要的是「合进来」，不该被网络挡住。 */
export async function mergeBase(
  repoRoot: string,
  options: { base?: string; fetch?: boolean } = {}
): Promise<MergeBaseOutcome> {
  const snapshot = await getSnapshot(repoRoot, true, options.base)
  requireNoOperation(snapshot)
  // 未跟踪文件本身不妨碍合并，只有「会被合入覆盖」的那些才挡（下面按 overwritten 判断）。
  if (snapshot.staged.length || snapshot.modified.length) {
    throw new GitError('invalid_params', '拉取基准分支前请先提交或贮藏当前改动')
  }
  const ref = snapshot.base?.ref ?? options.base
  if (!ref) throw new GitError('invalid_params', '没有可用的基准分支')

  let degraded: { reason: ReturnType<typeof classifyFailure>; detail: string } | null = null
  if (options.fetch !== false) {
    const fetched = await runGit(repoRoot, ['fetch', '--prune', remoteName(snapshot)], { write: true })
    if (fetched.code !== 0) {
      const detail = fetched.stderr.trim()
      const reason = classifyFailure(detail)
      const exists = await runGit(repoRoot, ['rev-parse', '--verify', '--quiet', ref])
      if (exists.code !== 0) {
        return { ok: false, stage: 'fetch', reason, detail, snapshot: await changed(repoRoot) }
      }
      degraded = { reason, detail }
    }
  }

  if (snapshot.base && snapshot.base.overwritten.total > 0) {
    return {
      ok: false,
      stage: 'merge',
      reason: 'untracked-overwrite',
      detail: snapshot.base.overwritten.files.join('\n'),
      snapshot,
    }
  }

  const merged = await runGit(repoRoot, ['merge', '--no-edit', ref], { write: true })
  if (merged.code !== 0) {
    const detail = merged.stderr.trim() || merged.stdout.trim()
    return {
      ok: false,
      stage: 'merge',
      reason: classifyFailure(detail),
      detail,
      snapshot: await changed(repoRoot),
    }
  }
  return { ok: true, snapshot: await changed(repoRoot), degraded }
}

/** 有 gh/glab 就直接建 PR/MR；否则返回 compare 链接让面板在浏览器里打开。 */
export async function createPullRequest(repoRoot: string): Promise<PullRequestResult> {
  const snapshot = await getSnapshot(repoRoot, true)
  requireUpstream(snapshot, '创建 PR')
  const cli = snapshot.remote.cli
  if (!cli) {
    if (!snapshot.remote.compareUrl) {
      throw new GitError('invalid_params', '这个远端没有可用的创建 PR 链接')
    }
    return { url: snapshot.remote.compareUrl, via: 'link' }
  }
  const args = cli === 'gh' ? ['pr', 'create', '--fill'] : ['mr', 'create', '--fill', '--yes']
  const result = await runCommand(repoRoot, cli, args)
  if (result.code !== 0) throw failure(result, `${cli} 创建 PR 失败`)
  const url = /https?:\/\/\S+/.exec(result.stdout)?.[0] ?? null
  return { url, via: cli }
}

// ---- 目录批量 / 行内 diff / 打开文件 / 提交并强推 / 先推再建 PR ----
/** 目录前缀批量：`git add -- <prefix>`；prefix 需以 `/` 结尾或为目录名。 */
export async function stageFolder(repoRoot: string, prefix: string): Promise<GitSnapshot> {
  const spec = prefix.endsWith('/') ? prefix : `${prefix}/`
  await must(repoRoot, ['add', '--', spec], 'git add 失败')
  return changed(repoRoot)
}

export async function unstageFolder(repoRoot: string, prefix: string): Promise<GitSnapshot> {
  const spec = prefix.endsWith('/') ? prefix : `${prefix}/`
  await resetIndex(repoRoot, [spec])
  return changed(repoRoot)
}

/** 目录批量丢弃：已跟踪走 restore，未跟踪走 clean -fd；调用方负责确认。 */
export async function discardFolder(repoRoot: string, prefix: string): Promise<GitSnapshot> {
  const spec = prefix.endsWith('/') ? prefix : `${prefix}/`
  const restore = await runGit(repoRoot, ['restore', '--worktree', '--', spec], { write: true })
  if (restore.code !== 0 && !/no added paths|did not match/i.test(restore.stderr)) {
    throw failure(restore, 'git restore 失败')
  }
  await must(repoRoot, ['clean', '-f', '-d', '--', spec], 'git clean 失败')
  return changed(repoRoot)
}

const DIFF_LIMIT = 200 * 1024

/** 单文件统一 diff 文本（只读）；超限截断并标记。 */
export async function fileDiff(
  repoRoot: string,
  path: string,
  staged: boolean
): Promise<{ text: string; truncated: boolean }> {
  const args = ['diff', staged ? '--cached' : 'HEAD', '--', path]
  const result = await runGit(repoRoot, args)
  const empty = (await runGit(repoRoot, ['rev-list', '-1', 'HEAD'])).code !== 0
  if (result.code !== 0 && !empty) throw failure(result, 'git diff 失败')
  const text = result.stdout
  if (text.length <= DIFF_LIMIT) return { text, truncated: false }
  return { text: `${text.slice(0, DIFF_LIMIT)}\n…（diff 超过 200KB，已截断）`, truncated: true }
}

/** 校验 path 在仓库内且文件存在，返回绝对路径；worker 再交给 editor.open。 */
export function resolveRepoFile(repoRoot: string, path: string): string {
  if (!path || path.includes('..') || path.startsWith('/') || path.includes('\\')) {
    throw new GitError('invalid_params', '路径不合法')
  }
  const absolute = join(repoRoot, path)
  if (!existsSync(absolute)) throw new GitError('invalid_params', `文件不存在：${path}`)
  return absolute
}

/** 提交后按 --force-with-lease 推送（对齐内置 Commit & Force Push）。 */
export async function commitForce(
  repoRoot: string,
  message: string,
  amend: boolean
): Promise<GitSnapshot> {
  const snapshot = await commit(repoRoot, message, amend)
  await must(
    repoRoot,
    ['push', '--force-with-lease', snapshot.remote.name ?? 'origin', snapshot.branch ?? 'HEAD'],
    'git push --force-with-lease 失败'
  )
  return changed(repoRoot)
}

/** 先推送再创建 PR（对齐内置 Push then PR）。 */
export async function pushThenPullRequest(repoRoot: string): Promise<PullRequestResult> {
  await pushRemote(repoRoot, false)
  return createPullRequest(repoRoot)
}

// ---- 冲突流：中止 / 继续 / 完成合并（对齐内置横幅三动作） ----

const ABORT_FLAG: Record<GitOperation, string> = {
  merge: 'merge',
  rebase: 'rebase',
  'cherry-pick': 'cherry-pick',
  revert: 'revert',
}

/** 按当前进行中的操作选对 --abort 子命令；没有操作时直接报错。 */
export async function abortOperation(repoRoot: string): Promise<GitSnapshot> {
  const snapshot = await getSnapshot(repoRoot, true)
  if (!snapshot.operation) throw new GitError('invalid_params', '没有进行中的操作')
  const name = ABORT_FLAG[snapshot.operation]
  await must(repoRoot, [name, '--abort'], `git ${name} --abort 失败`)
  return changed(repoRoot)
}

/** rebase / cherry-pick / revert 的 --continue；core.editor=true 防止弹出编辑器。 */
export async function continueOperation(repoRoot: string): Promise<GitSnapshot> {
  const snapshot = await getSnapshot(repoRoot, true)
  if (!snapshot.operation || snapshot.operation === 'merge') {
    throw new GitError('invalid_params', '当前操作没有 --continue')
  }
  await must(
    repoRoot,
    ['-c', 'core.editor=true', snapshot.operation, '--continue'],
    `git ${snapshot.operation} --continue 失败`
  )
  return changed(repoRoot)
}

/** 合并冲突解决后完成合并提交。 */
export async function completeMerge(repoRoot: string): Promise<GitSnapshot> {
  const snapshot = await getSnapshot(repoRoot, true)
  if (snapshot.operation !== 'merge') throw new GitError('invalid_params', '没有进行中的合并')
  if (snapshot.conflicts.length) throw new GitError('invalid_params', '还有未解决的冲突')
  await must(repoRoot, ['commit', '--no-edit'], 'git commit --no-edit 失败')
  return changed(repoRoot)
}

// ---- 历史页签：提交列表、提交文件、PR 状态 ----

/** `git log` 分页；字段用 %x01 分隔、记录用 %x00 分隔，subject 里的空格安全。 */
export async function listCommits(
  repoRoot: string,
  revision: string | undefined,
  skip: number,
  limit: number
): Promise<{ commits: LogCommit[]; hasMore: boolean }> {
  const args = [
    'log',
    `--skip=${skip}`,
    `--max-count=${limit + 1}`,
    '--pretty=format:%H%x01%an%x01%at%x01%D%x01%s%x00',
  ]
  if (revision) args.push(revision)
  const result = await runGit(repoRoot, args)
  if (result.code !== 0) {
    // 空仓库 / 无效 revision：给空结果而不是抛错，让面板显示空态。
    return { commits: [], hasMore: false }
  }
  const commits: LogCommit[] = []
  for (const record of result.stdout.split('\u0000')) {
    if (!record.trim()) continue
    const [sha, author, at, refs, subject] = record.split('\u0001')
    if (!sha) continue
    commits.push({ sha, subject: subject ?? '', author: author ?? '', at: (Number(at) || 0) * 1000, refs: refs ?? '' })
  }
  const hasMore = commits.length > limit
  return { commits: commits.slice(0, limit), hasMore }
}

/** 某个提交的变更文件（含首提交的 --root）。 */
export async function commitFiles(repoRoot: string, sha: string): Promise<CommitFile[]> {
  const result = await runGit(repoRoot, ['diff-tree', '-r', '--root', '--numstat', '--no-commit-id', sha])
  if (result.code !== 0) return []
  return [...parseNumstat(result.stdout).entries()].map(
    ([path, stat]) => ({ path, additions: stat.additions, deletions: stat.deletions })
  )
}

/** gh 有 JSON 输出，glab 没有；只走 gh，失败/没装一律返回 null（面板显示空态）。 */
export async function pullRequestStatus(repoRoot: string): Promise<PullRequestStatus> {
  const snapshot = await getSnapshot(repoRoot, true)
  if (snapshot.remote.cli !== 'gh') return null
  const result = await runCommand(repoRoot, 'gh', ['pr', 'view', '--json', 'state,number,url'])
  if (result.code !== 0) return null
  try {
    const parsed = JSON.parse(result.stdout) as { state?: string; number?: number; url?: string }
    if (!parsed.state || !parsed.number || !parsed.url) return null
    return { state: parsed.state, number: parsed.number, url: parsed.url }
  } catch {
    return null
  }
}

// ---- 分支：清单 / 新建 / 切换 / 删除 ----

export async function listBranches(repoRoot: string): Promise<BranchList> {
  const [snapshot, refs] = await Promise.all([
    getSnapshot(repoRoot, true),
    runGit(repoRoot, [
      'for-each-ref',
      '--format=%(refname)%01%(refname:short)',
      'refs/heads',
      'refs/remotes',
    ]),
  ])
  const branches: BranchList['branches'] = []
  for (const line of refs.stdout.split('\n')) {
    if (!line.trim()) continue
    const [full, short] = line.split('\u0001')
    // `refs/remotes/<remote>/HEAD` 会被短成 `<remote>`，按完整 refname 过滤。
    if (!short || full?.endsWith('/HEAD') === true) continue
    const isRemote = full?.startsWith('refs/remotes/') === true
    branches.push({
      name: short,
      remote: isRemote,
      current: !isRemote && Boolean(snapshot.branch) && short === snapshot.branch,
    })
  }
  return { branches, detached: snapshot.detached }
}

export async function createBranch(repoRoot: string, name: string): Promise<GitSnapshot> {
  if (!name.trim()) throw new GitError('invalid_params', '分支名不能为空')
  await must(repoRoot, ['switch', '-c', name.trim()], `git switch -c ${name} 失败`)
  return changed(repoRoot)
}

export async function switchBranch(repoRoot: string, name: string, track: boolean): Promise<GitSnapshot> {
  if (!name.trim()) throw new GitError('invalid_params', '分支名不能为空')
  const branch = name.trim()
  if (track) {
    await must(repoRoot, ['switch', '-c', branch, '--track', branch], `git switch --track ${branch} 失败`)
  } else {
    await must(repoRoot, ['switch', branch], `git switch ${branch} 失败`)
  }
  return changed(repoRoot)
}

export async function deleteBranch(repoRoot: string, name: string, force: boolean): Promise<GitSnapshot> {
  if (!name.trim()) throw new GitError('invalid_params', '分支名不能为空')
  const branch = name.trim()
  const result = await runGit(repoRoot, ['branch', force ? '-D' : '-d', branch], { write: true })
  if (result.code !== 0 && !force) {
    throw new GitError(
      'conflict',
      `分支未合并，删除被拒绝（${failure(result, '').message}）；确认要丢弃时用强制删除`
    )
  }
  if (result.code !== 0) throw failure(result, `git branch -D ${branch} 失败`)
  return changed(repoRoot)
}
