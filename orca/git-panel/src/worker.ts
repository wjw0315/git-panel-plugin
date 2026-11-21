// 插件自己的 worker：Node 进程，负责跑 git、解析工作区路径、更新状态栏。

import type { OrcaWorkerApi } from 'orca/worker'
import * as git from './git'
import { GitError } from './git'
import { scanRepos } from './repos'
import { relative } from 'node:path'
import type { GitRepos, GitSnapshot, GitStashes, PullRequestResult } from './protocol'

const STATUS_ITEM = 'git-branch'
const DEFAULT_REFRESH_SECONDS = 15

type Workspace = { id: string; path: string; hostId: string | null; name: string }

function isLocal(hostId: string | null): boolean {
  return !hostId || hostId === 'local'
}

function describe(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return String(error)
}

function fail(error: unknown): never {
  if (error instanceof GitError) throw error
  throw new GitError('action_failed', describe(error))
}

export default function activate(orca: OrcaWorkerApi): () => void {
  let queue: Promise<unknown> = Promise.resolve()
  let timer: number | null = null

  /** git 写操作串行化：内置源代码控制与面板同时动手时不互相踩 index.lock。 */
  function serial<T>(job: () => Promise<T>): Promise<T> {
    const next = queue.then(job, job)
    queue = next.catch(() => undefined)
    return next
  }

  async function listWorkspaces(): Promise<Workspace[]> {
    const answer = await orca.host.call('workspace.list', {})
    return answer.workspaces.map((workspace) => ({
      id: workspace.id,
      path: workspace.path,
      hostId: workspace.hostId,
      name: workspace.name,
    }))
  }

  async function resolveWorkspace(workspaceId?: string): Promise<Workspace | null> {
    const workspaces = await listWorkspaces()
    if (workspaceId) return workspaces.find((workspace) => workspace.id === workspaceId) ?? null
    const context = await orca.host.call('workspace.readContext', {})
    if (!context?.workspaceId) return workspaces[0] ?? null
    return workspaces.find((workspace) => workspace.id === context.workspaceId) ?? null
  }

  async function primaryRepo(): Promise<{ workspace: Workspace; repoRoot: string }> {
    const workspace = await resolveWorkspace()
    if (!workspace) throw new GitError('unavailable', '没有打开的工作区')
    if (!isLocal(workspace.hostId)) {
      throw new GitError('unavailable', `该工作区在 ${workspace.hostId} 上，插件只支持本机仓库`)
    }
    const repos = await scanRepos(workspace.path)
    const repo = repos[0]
    if (!repo) throw new GitError('unavailable', '工作区里没有 Git 仓库')
    return { workspace, repoRoot: repo.root }
  }

  function publish(snapshot: GitSnapshot): void {
    orca.panels.post('git.changed', { repoRoot: snapshot.repoRoot, snapshot })
  }

  async function refreshStatusBar(): Promise<void> {
    try {
      const workspace = await resolveWorkspace()
      if (!workspace || !isLocal(workspace.hostId)) {
        await orca.host.call('statusBar.update', { id: STATUS_ITEM, visible: false })
        return
      }
      const repos = await scanRepos(workspace.path)
      const repo = repos[0]
      if (!repo) {
        await orca.host.call('statusBar.update', { id: STATUS_ITEM, visible: false })
        return
      }
      const snapshot = await git.getSnapshot(repo.root)
      const dirty =
        snapshot.staged.length + snapshot.modified.length + snapshot.untracked.length > 0
      await orca.host.call('statusBar.update', {
        id: STATUS_ITEM,
        text: snapshot.branch ?? repo.name,
        tone: dirty ? 'warning' : 'neutral',
        tooltip: `${repo.name} · ${snapshot.branch ?? 'detached'}${dirty ? ' · 有未提交更改' : ''}`,
        visible: true,
      })
    } catch (error) {
      orca.log(`状态栏刷新失败：${describe(error)}`)
    }
  }

  async function restartTimer(): Promise<void> {
    if (timer) clearInterval(timer)
    timer = null
    const settings = await orca.settings.get()
    const seconds = Number(settings.refreshSeconds ?? DEFAULT_REFRESH_SECONDS)
    if (!Number.isFinite(seconds) || seconds <= 0) return
    timer = setInterval(() => {
      void refreshStatusBar()
    }, Math.max(5, seconds) * 1_000)
  }

  // ---- 面板请求 ----

  orca.panels.handle('git.repos', async (input): Promise<GitRepos> => {
    const workspace = await resolveWorkspace(input?.workspaceId)
    if (!workspace) throw new GitError('unavailable', '没有打开的工作区')
    if (!isLocal(workspace.hostId)) {
      return {
        workspaceId: workspace.id,
        cwd: null,
        local: false,
        hostId: workspace.hostId,
        repos: [],
      }
    }
    return {
      workspaceId: workspace.id,
      cwd: workspace.path,
      local: true,
      hostId: workspace.hostId,
      repos: await scanRepos(workspace.path),
    }
  })

  orca.panels.handle('git.snapshot', async (input) => {
    try {
      return await git.getSnapshot(input.repoRoot, input.fresh === true, input.base)
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.stage', async (input) => {
    try {
      const snapshot = await serial(() => git.stagePaths(input.repoRoot, input.paths))
      publish(snapshot)
      return snapshot
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.stageAll', async (input) => {
    try {
      const snapshot = await serial(() => git.stageAll(input.repoRoot))
      publish(snapshot)
      return snapshot
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.unstage', async (input) => {
    try {
      const snapshot = await serial(() => git.unstagePaths(input.repoRoot, input.paths))
      publish(snapshot)
      return snapshot
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.unstageAll', async (input) => {
    try {
      const snapshot = await serial(() => git.unstageAll(input.repoRoot))
      publish(snapshot)
      return snapshot
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.discard', async (input) => {
    try {
      const before = await git.getSnapshot(input.repoRoot, true)
      const untracked = before.untracked.map((file) => file.path)
      const picked = new Set(input.paths)
      const untrackedPicked = untracked.filter((path) => picked.has(path))
      if (untrackedPicked.length) {
        const settings = await orca.settings.get()
        if (settings.allowDiscardUntracked !== true) {
          throw new GitError(
            'invalid_params',
            '拒绝删除未跟踪文件：先在设置里打开「允许丢弃未跟踪文件」'
          )
        }
      }
      const snapshot = await serial(() =>
        git.discardPaths(input.repoRoot, input.paths, untracked)
      )
      publish(snapshot)
      return snapshot
    } catch (error) {
      fail(error)
    }
  })
  orca.panels.handle('git.stageFolder', async (input) => {
    try {
      const snapshot = await serial(() => git.stageFolder(input.repoRoot, input.prefix))
      publish(snapshot)
      return snapshot
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.unstageFolder', async (input) => {
    try {
      const snapshot = await serial(() => git.unstageFolder(input.repoRoot, input.prefix))
      publish(snapshot)
      return snapshot
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.discardFolder', async (input) => {
    try {
      // 目录批量含未跟踪文件（clean -fd），沿用同一设置开关。
      const settings = await orca.settings.get()
      if (settings.allowDiscardUntracked !== true) {
        throw new GitError('invalid_params', '拒绝删除未跟踪文件：先在设置里打开「允许丢弃未跟踪文件」')
      }
      const snapshot = await serial(() => git.discardFolder(input.repoRoot, input.prefix))
      publish(snapshot)
      return snapshot
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.fileDiff', async (input) => {
    try {
      return await git.fileDiff(input.repoRoot, input.path, input.staged)
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.openFile', async (input) => {
    try {
      const absolutePath = git.resolveRepoFile(input.repoRoot, input.path)
      const workspaces = await listWorkspaces()
      const workspace = workspaces.find(
        (row) => row.path === input.repoRoot || absolutePath.startsWith(`${row.path}/`)
      )
      if (!workspace) throw new GitError('unavailable', '这个文件不在当前工作区里')
      const path = relative(workspace.path, absolutePath)
      await orca.host.call('editor.open', { workspaceId: workspace.id, path })
      return { opened: true as const, absolutePath }
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.openBuiltIn', async () => {
    try {
      await orca.host.call('commands.run', { action: 'sidebar.sourceControl.toggle' })
      return { ran: true as const }
    } catch (error) {
      fail(error)
    }
  })

  /** 提交（含 amend）的前置校验，commit / commitPush / commitSync 共用。 */
  async function commitChecked(input: { repoRoot: string; message: string; amend: boolean }) {
    const before = await git.getSnapshot(input.repoRoot, true)
    if (input.amend) {
      if (before.operation) {
        throw new GitError('conflict', `正在 ${before.operation} 中，不能修正上次提交`)
      }
      if (!before.lastCommit) throw new GitError('invalid_params', '还没有提交可以修正')
    } else if (!before.staged.length) {
      throw new GitError('invalid_params', '暂存区为空，先暂存要提交的文件')
    }
    return git.commit(input.repoRoot, input.message, input.amend)
  }

  async function remoteAction(run: () => Promise<GitSnapshot>): Promise<GitSnapshot> {
    try {
      const snapshot = await serial(run)
      publish(snapshot)
      void refreshStatusBar()
      return snapshot
    } catch (error) {
      fail(error)
    }
  }

  orca.panels.handle('git.commit', async (input) =>
    remoteAction(() => commitChecked(input))
  )

  orca.panels.handle('git.commitPush', async (input) =>
    remoteAction(async () => {
      await commitChecked(input)
      return git.pushRemote(input.repoRoot, false)
    })
  )

  orca.panels.handle('git.commitSync', async (input) =>
    remoteAction(async () => {
      await commitChecked(input)
      return git.syncRemote(input.repoRoot)
    })
  )
  orca.panels.handle('git.commitForce', async (input) =>
    remoteAction(async () => {
      await commitChecked(input)
      return git.commitForce(input.repoRoot, input.message, input.amend)
    })
  )

  orca.panels.handle('git.fetch', async (input) => remoteAction(() => git.fetchRemote(input.repoRoot)))

  orca.panels.handle('git.pull', async (input) =>
    remoteAction(() => git.pullRemote(input.repoRoot, 'merge'))
  )

  orca.panels.handle('git.fastForward', async (input) =>
    remoteAction(() => git.pullRemote(input.repoRoot, 'ff'))
  )

  orca.panels.handle('git.sync', async (input) => remoteAction(() => git.syncRemote(input.repoRoot)))

  orca.panels.handle('git.push', async (input) =>
    remoteAction(() => git.pushRemote(input.repoRoot, false))
  )

  orca.panels.handle('git.publish', async (input) =>
    remoteAction(() => git.pushRemote(input.repoRoot, false))
  )

  orca.panels.handle('git.pushForce', async (input) =>
    remoteAction(() => git.pushRemote(input.repoRoot, true))
  )

  orca.panels.handle('git.rebase', async (input) =>
    remoteAction(() => git.rebaseOntoUpstream(input.repoRoot))
  )

  // 合并结果自带快照与失败原因（ok:false 不抛错），所以不复用 remoteAction。
  orca.panels.handle('git.mergeBase', async (input) => {
    try {
      const outcome = await serial(() =>
        git.mergeBase(input.repoRoot, {
          ...(input.base ? { base: input.base } : {}),
          ...(input.fetch === false ? { fetch: false } : {}),
        })
      )
      publish(outcome.snapshot)
      void refreshStatusBar()
      return outcome
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.abortOperation', async (input) =>
    remoteAction(() => git.abortOperation(input.repoRoot))
  )

  orca.panels.handle('git.continueOperation', async (input) =>
    remoteAction(() => git.continueOperation(input.repoRoot))
  )

  orca.panels.handle('git.completeMerge', async (input) =>
    remoteAction(() => git.completeMerge(input.repoRoot))
  )

  orca.panels.handle('git.log', async (input) => {
    try {
      return await git.listCommits(input.repoRoot, input.revision, input.skip, input.limit)
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.commitFiles', async (input) => {
    try {
      return { files: await git.commitFiles(input.repoRoot, input.sha) }
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.pullRequestStatus', async (input) => {
    try {
      return await git.pullRequestStatus(input.repoRoot)
    } catch {
      return null
    }
  })

  orca.panels.handle('git.branchList', async (input) => {
    try {
      return await git.listBranches(input.repoRoot)
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.branchCreate', async (input) =>
    remoteAction(() => git.createBranch(input.repoRoot, input.name))
  )

  orca.panels.handle('git.branchSwitch', async (input) =>
    remoteAction(() => git.switchBranch(input.repoRoot, input.name, input.track === true))
  )

  orca.panels.handle('git.branchDelete', async (input) =>
    remoteAction(() => git.deleteBranch(input.repoRoot, input.name, input.force))
  )

  orca.panels.handle('git.pullRequest', async (input): Promise<PullRequestResult> => {
    try {
      return await git.createPullRequest(input.repoRoot)
    } catch (error) {
      return fail(error)
    }
  })
  orca.panels.handle('git.pushThenPullRequest', async (input): Promise<PullRequestResult> => {
    try {
      return await git.pushThenPullRequest(input.repoRoot)
    } catch (error) {
      return fail(error)
    }
  })

  orca.panels.handle('git.stashList', async (input): Promise<GitStashes> => {
    try {
      return { stashes: await git.stashList(input.repoRoot) }
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.stashSave', async (input) => {
    try {
      const snapshot = await serial(() =>
        git.stashSave(input.repoRoot, input.message, input.includeUntracked)
      )
      publish(snapshot)
      return snapshot
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.stashApply', async (input) => {
    try {
      const snapshot = await serial(() =>
        git.stashApply(input.repoRoot, input.index, false)
      )
      publish(snapshot)
      return snapshot
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.stashPop', async (input) => {
    try {
      const snapshot = await serial(() => git.stashApply(input.repoRoot, input.index, true))
      publish(snapshot)
      return snapshot
    } catch (error) {
      fail(error)
    }
  })

  orca.panels.handle('git.stashDrop', async (input): Promise<GitStashes> => {
    try {
      return { stashes: await serial(() => git.stashDrop(input.repoRoot, input.index)) }
    } catch (error) {
      fail(error)
    }
  })

  // ---- 命令与状态栏 ----

  orca.commands.register('git.stageAll', () =>
    serial(async () => {
      const { repoRoot } = await primaryRepo()
      const snapshot = await git.stageAll(repoRoot)
      publish(snapshot)
      void refreshStatusBar()
      return `已暂存全部更改（${snapshot.staged.length} 个文件）`
    })
  )

  orca.commands.register('git.amendStaged', () =>
    serial(async () => {
      const { repoRoot } = await primaryRepo()
      const before = await git.getSnapshot(repoRoot, true)
      if (before.operation) throw new GitError('conflict', `正在 ${before.operation} 中`)
      if (!before.lastCommit) throw new GitError('invalid_params', '还没有提交可以修正')
      if (!before.staged.length) throw new GitError('invalid_params', '暂存区为空')
      const snapshot = await git.commit(repoRoot, '', true)
      publish(snapshot)
      void refreshStatusBar()
      return '已并入上次提交（沿用原提交信息）'
    })
  )

  orca.commands.register('git.stashAll', () =>
    serial(async () => {
      const { repoRoot } = await primaryRepo()
      const snapshot = await git.stashSave(repoRoot, 'Git Panel', true)
      publish(snapshot)
      void refreshStatusBar()
      return '已贮藏全部更改（含未跟踪文件）'
    })
  )

  orca.events.on('workspace.changed', () => {
    void refreshStatusBar()
  })
  orca.settings.onDidChange(() => {
    void restartTimer()
  })

  void restartTimer()
  void refreshStatusBar()

  return () => {
    if (timer) clearInterval(timer)
    timer = null
  }
}
