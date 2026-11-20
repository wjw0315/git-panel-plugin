// worker 的请求处理器：在临时 git 仓库上断言真实仓库状态。
import { assert, mockHost, mountWorker, test } from 'orca/testing'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as main from './worker'
import { runGit } from './git'

type Fixture = { root: string; workspaceId: string; hostId: string | null }

function repoFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'orca-git-panel-'))
  return root
}

async function gitInit(root: string): Promise<void> {
  await runGit(root, ['init', '-q'])
  await runGit(root, ['config', 'user.email', 'panel@example.com'])
  await runGit(root, ['config', 'user.name', 'Git Panel'])
  await runGit(root, ['config', 'commit.gpgsign', 'false'])
}

async function write(root: string, path: string, content: string): Promise<void> {
  const target = join(root, path)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content)
}

function hostFor(fixture: Fixture) {
  return mockHost({
    results: {
      'workspace.list': {
        workspaces: [
          {
            id: fixture.workspaceId,
            kind: 'worktree',
            name: 'repo',
            path: fixture.root,
            branch: 'main',
            hostId: fixture.hostId,
          },
        ],
        truncated: false,
      },
      'workspace.readContext': { workspaceId: fixture.workspaceId, branch: 'main', displayName: 'repo', terminals: [] },
      'editor.open': { opened: true },
    },
    settings: { refreshSeconds: 0, allowDiscardUntracked: true },
  })
}

async function setup(): Promise<{ fixture: Fixture; worker: Awaited<ReturnType<typeof mountWorker>> }> {
  const root = repoFixture()
  await gitInit(root)
  const fixture: Fixture = { root, workspaceId: 'ws-1', hostId: null }
  const worker = await mountWorker(main, { host: hostFor(fixture) })
  return { fixture, worker }
}

test('story 1: snapshot groups staged, modified and untracked files', async () => {
  const { fixture, worker } = await setup()
  await write(fixture.root, 'a.txt', 'one\n')
  await write(fixture.root, 'b.txt', 'two\n')
  await runGit(fixture.root, ['add', 'a.txt', 'b.txt'])
  await runGit(fixture.root, ['commit', '-q', '-m', 'first'])
  await write(fixture.root, 'a.txt', 'one\ntwo\n')
  await write(fixture.root, 'c.txt', 'new\n')
  await runGit(fixture.root, ['add', 'c.txt'])

  const snapshot = await worker.request('git.snapshot', { repoRoot: fixture.root, fresh: true })

  assert.deepEqual(
    snapshot.staged.map((file) => file.path),
    ['c.txt']
  )
  assert.deepEqual(
    snapshot.modified.map((file) => file.path),
    ['a.txt']
  )
  assert.deepEqual(snapshot.untracked, [])
  assert.equal(snapshot.lastCommit?.subject, 'first')
  assert.equal(snapshot.branch !== null && snapshot.branch.length > 0, true)
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

test('story 2/3: stage, unstage and stage everything', async () => {
  const { fixture, worker } = await setup()
  await write(fixture.root, 'a.txt', 'one\n')

  let snapshot = await worker.request('git.stage', { repoRoot: fixture.root, paths: ['a.txt'] })
  assert.deepEqual(snapshot.staged.map((file) => file.path), ['a.txt'])

  snapshot = await worker.request('git.unstage', { repoRoot: fixture.root, paths: ['a.txt'] })
  assert.deepEqual(snapshot.staged, [])
  assert.equal(snapshot.untracked.length, 1)

  snapshot = await worker.request('git.stageAll', { repoRoot: fixture.root })
  assert.deepEqual(snapshot.staged.map((file) => file.path), ['a.txt'])

  snapshot = await worker.request('git.unstageAll', { repoRoot: fixture.root })
  assert.deepEqual(snapshot.staged, [])
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

test('story 7/8: commit writes the message and then the box can clear', async () => {
  const { fixture, worker } = await setup()
  await write(fixture.root, 'a.txt', 'one\n')
  await worker.request('git.stageAll', { repoRoot: fixture.root })

  await assert.rejects(() => worker.request('git.commit', { repoRoot: fixture.root, message: '  ', amend: false }))

  const snapshot = await worker.request('git.commit', {
    repoRoot: fixture.root,
    message: 'feat: first',
    amend: false,
  })
  assert.equal(snapshot.lastCommit?.subject, 'feat: first')
  assert.deepEqual(snapshot.staged, [])
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

test('story 9/10: amend folds staged work into the last commit', async () => {
  const { fixture, worker } = await setup()
  await write(fixture.root, 'a.txt', 'one\n')
  await worker.request('git.stageAll', { repoRoot: fixture.root })
  await worker.request('git.commit', { repoRoot: fixture.root, message: 'first', amend: false })

  await write(fixture.root, 'b.txt', 'two\n')
  await worker.request('git.stageAll', { repoRoot: fixture.root })
  const before = await worker.request('git.snapshot', { repoRoot: fixture.root, fresh: true })
  assert.equal(before.lastCommit?.subject, 'first')

  const snapshot = await worker.request('git.commit', {
    repoRoot: fixture.root,
    message: 'first and second',
    amend: true,
  })
  assert.equal(snapshot.lastCommit?.subject, 'first and second')

  const count = await runGit(fixture.root, ['rev-list', '--count', 'HEAD'])
  assert.equal(count.stdout.trim(), '1')
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

test('story 12: amend refuses while a merge is in progress', async () => {
  const { fixture, worker } = await setup()
  await write(fixture.root, 'a.txt', 'one\n')
  await worker.request('git.stageAll', { repoRoot: fixture.root })
  await worker.request('git.commit', { repoRoot: fixture.root, message: 'first', amend: false })
  writeFileSync(join(fixture.root, '.git', 'MERGE_HEAD'), 'deadbeef\n')

  const snapshot = await worker.request('git.snapshot', { repoRoot: fixture.root, fresh: true })
  assert.equal(snapshot.operation, 'merge')

  await assert.rejects(
    () => worker.request('git.commit', { repoRoot: fixture.root, message: 'x', amend: true }),
    (failure: unknown) => (failure as { code?: string }).code === 'conflict'
  )
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

test('story 13-20: stash save, list, apply, pop and drop', async () => {
  const { fixture, worker } = await setup()
  await write(fixture.root, 'a.txt', 'one\n')
  await runGit(fixture.root, ['add', 'a.txt'])
  await runGit(fixture.root, ['commit', '-q', '-m', 'first'])
  await write(fixture.root, 'a.txt', 'changed\n')
  await write(fixture.root, 'fresh.txt', 'fresh\n')

  const shelved = await worker.request('git.stashSave', {
    repoRoot: fixture.root,
    message: 'wip: try',
    includeUntracked: true,
  })
  assert.deepEqual(shelved.modified, [])
  assert.deepEqual(shelved.untracked, [])

  let list = await worker.request('git.stashList', { repoRoot: fixture.root })
  assert.equal(list.stashes.length, 1)
  assert.match(list.stashes[0].message, /wip: try/)

  const applied = await worker.request('git.stashApply', { repoRoot: fixture.root, index: 0 })
  assert.deepEqual(applied.modified.map((file) => file.path), ['a.txt'])
  list = await worker.request('git.stashList', { repoRoot: fixture.root })
  assert.equal(list.stashes.length, 1)

  await worker.request('git.stashSave', { repoRoot: fixture.root, message: 'again', includeUntracked: true })
  list = await worker.request('git.stashList', { repoRoot: fixture.root })
  assert.equal(list.stashes.length, 2)

  const popped = await worker.request('git.stashPop', { repoRoot: fixture.root, index: 0 })
  assert.deepEqual(popped.modified.map((file) => file.path), ['a.txt'])
  list = await worker.request('git.stashList', { repoRoot: fixture.root })
  assert.equal(list.stashes.length, 1)
  assert.match(list.stashes[0].message, /wip: try/)

  await worker.request('git.stashSave', { repoRoot: fixture.root, message: 'third', includeUntracked: false })
  const dropped = await worker.request('git.stashDrop', { repoRoot: fixture.root, index: 0 })
  assert.equal(dropped.stashes.length, 1)
  assert.match(dropped.stashes[0].message, /wip: try/)
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

test('story 4/5: discarding an untracked file needs the setting', async () => {
  const root = repoFixture()
  await gitInit(root)
  const restricted = await mountWorker(main, {
    host: mockHost({
      results: {
        'workspace.list': {
          workspaces: [
            { id: 'ws-1', kind: 'worktree', name: 'repo', path: root, branch: 'main', hostId: null },
          ],
          truncated: false,
        },
      },
      settings: { refreshSeconds: 0, allowDiscardUntracked: false },
    }),
  })
  await write(root, 'loose.txt', 'x\n')
  await assert.rejects(
    () => restricted.request('git.discard', { repoRoot: root, paths: ['loose.txt'] }),
    (failure: unknown) => (failure as { code?: string }).code === 'invalid_params'
  )
  await restricted.deactivate()

  const allowed = await mountWorker(main, {
    host: mockHost({
      results: {
        'workspace.list': {
          workspaces: [
            { id: 'ws-1', kind: 'worktree', name: 'repo', path: root, branch: 'main', hostId: null },
          ],
          truncated: false,
        },
      },
      settings: { refreshSeconds: 0, allowDiscardUntracked: true },
    }),
  })
  const snapshot = await allowed.request('git.discard', { repoRoot: root, paths: ['loose.txt'] })
  assert.deepEqual(snapshot.untracked, [])
  await allowed.deactivate()
  rmSync(root, { recursive: true, force: true })
})

test('story 21/22: a workspace with a nested repository lists both', async () => {
  const root = repoFixture()
  await write(root, 'docs/readme.md', 'hi\n')
  await gitInit(root)
  await mkdirSync(join(root, 'packages', 'inner'), { recursive: true })
  writeFileSync(join(root, 'packages', 'inner', 'a.txt'), 'a\n')
  await gitInit(join(root, 'packages', 'inner'))

  const worker = await mountWorker(main, {
    host: mockHost({
      results: {
        'workspace.list': {
          workspaces: [
            { id: 'ws-1', kind: 'worktree', name: 'repo', path: root, branch: 'main', hostId: null },
          ],
          truncated: false,
        },
      },
      settings: { refreshSeconds: 0 },
    }),
  })
  const answer = await worker.request('git.repos', { workspaceId: 'ws-1' })
  assert.equal(answer.local, true)
  assert.equal(answer.repos.length, 2)
  assert.equal(answer.repos[0].root, root)
  assert.match(answer.repos[1].root, /inner$/)
  await worker.deactivate()
  rmSync(root, { recursive: true, force: true })
})

test('story 31: a workspace on another host reports it instead of running local git', async () => {
  const root = repoFixture()
  const worker = await mountWorker(main, {
    host: mockHost({
      results: {
        'workspace.list': {
          workspaces: [
            { id: 'ws-remote', kind: 'worktree', name: 'repo', path: '/srv/repo', branch: 'main', hostId: 'ssh:build' },
          ],
          truncated: false,
        },
      },
      settings: { refreshSeconds: 0 },
    }),
  })
  const answer = await worker.request('git.repos', { workspaceId: 'ws-remote' })
  assert.equal(answer.local, false)
  assert.deepEqual(answer.repos, [])
  assert.equal(answer.hostId, 'ssh:build')
  await worker.deactivate()
  rmSync(root, { recursive: true, force: true })
})

// ---- 远端动作：用本地裸仓库当远端，全程不联网 ----

async function remoteFixture(): Promise<{ base: string; bare: string; work: string }> {
  const base = mkdtempSync(join(tmpdir(), 'orca-git-remote-'))
  const bare = join(base, 'remote.git')
  await runGit(base, ['init', '--bare', '-q', bare])
  const work = join(base, 'work')
  await runGit(base, ['clone', '-q', bare, work])
  await runGit(work, ['config', 'user.email', 'panel@example.com'])
  await runGit(work, ['config', 'user.name', 'Git Panel'])
  await runGit(work, ['config', 'commit.gpgsign', 'false'])
  return { base, bare, work }
}

async function workerAt(work: string) {
  return mountWorker(main, {
    host: mockHost({
      results: {
        'workspace.list': {
          workspaces: [
            { id: 'ws-1', kind: 'worktree', name: 'repo', path: work, branch: 'main', hostId: null },
          ],
          truncated: false,
        },
      },
      settings: { refreshSeconds: 0, allowDiscardUntracked: true },
    }),
  })
}

test('story 33/34: publish, fetch and fast-forward against a local bare remote', async () => {
  const { base, bare, work } = await remoteFixture()
  const worker = await workerAt(work)
  await write(work, 'a.txt', 'one\n')
  await worker.request('git.stageAll', { repoRoot: work })
  await worker.request('git.commit', { repoRoot: work, message: 'first', amend: false })

  const published = await worker.request('git.publish', { repoRoot: work })
  assert.equal(published.hasUpstream, true)
  assert.equal(published.ahead, 0)

  // 另一份克隆推一个提交，回来 fetch 后落后 1，快进后追平。
  const other = join(base, 'other')
  await runGit(base, ['clone', '-q', bare, other])
  await runGit(other, ['config', 'user.email', 'other@example.com'])
  await runGit(other, ['config', 'user.name', 'Other'])
  await runGit(other, ['config', 'commit.gpgsign', 'false'])
  writeFileSync(join(other, 'b.txt'), 'two\n')
  await runGit(other, ['add', '-A'])
  await runGit(other, ['commit', '-q', '-m', 'second'])
  await runGit(other, ['push', '-q', 'origin', 'HEAD'])

  const fetched = await worker.request('git.fetch', { repoRoot: work })
  assert.equal(fetched.behind, 1)
  const fast = await worker.request('git.fastForward', { repoRoot: work })
  assert.equal(fast.behind, 0)

  await worker.deactivate()
  rmSync(base, { recursive: true, force: true })
})

test('story 35/36: push, then force push after rewriting the last commit', async () => {
  const { base, work } = await remoteFixture()
  const worker = await workerAt(work)
  await write(work, 'a.txt', 'one\n')
  await worker.request('git.stageAll', { repoRoot: work })
  const first = await worker.request('git.commitPush', {
    repoRoot: work,
    message: 'first',
    amend: false,
  })
  assert.equal(first.hasUpstream, true)
  assert.equal(first.ahead, 0)

  await write(work, 'a.txt', 'rewritten\n')
  await worker.request('git.stageAll', { repoRoot: work })
  await worker.request('git.commit', { repoRoot: work, message: 'rewritten', amend: true })

  await assert.rejects(
    () => worker.request('git.push', { repoRoot: work }),
    (failure: unknown) => (failure as { code?: string }).code === 'action_failed'
  )
  const forced = await worker.request('git.pushForce', { repoRoot: work })
  assert.equal(forced.ahead, 0)

  await worker.deactivate()
  rmSync(base, { recursive: true, force: true })
})

test('story 37/38: sync commits and lands both sides; rebase refuses a dirty tree', async () => {
  const { base, bare, work } = await remoteFixture()
  const worker = await workerAt(work)
  await write(work, 'a.txt', 'one\n')
  await worker.request('git.stageAll', { repoRoot: work })
  await worker.request('git.commitPush', { repoRoot: work, message: 'first', amend: false })

  await write(work, 'dirty.txt', 'x\n')
  await assert.rejects(
    () => worker.request('git.rebase', { repoRoot: work }),
    (failure: unknown) => (failure as { code?: string }).code === 'invalid_params'
  )
  await worker.request('git.discard', { repoRoot: work, paths: ['dirty.txt'] })

  const other = join(base, 'other-sync')
  await runGit(base, ['clone', '-q', bare, other])
  await runGit(other, ['config', 'user.email', 'other@example.com'])
  await runGit(other, ['config', 'user.name', 'Other'])
  writeFileSync(join(other, 'b.txt'), 'two\n')
  await runGit(other, ['add', '-A'])
  await runGit(other, ['commit', '-q', '-m', 'second', '--no-gpg-sign'])
  await runGit(other, ['push', '-q', 'origin', 'HEAD'])

  await write(work, 'c.txt', 'three\n')
  await worker.request('git.stageAll', { repoRoot: work })
  const synced = await worker.request('git.commitSync', { repoRoot: work, message: 'third', amend: false })
  assert.equal(synced.behind, 0)
  assert.equal(synced.ahead, 0)

  const rebased = await worker.request('git.rebase', { repoRoot: work })
  assert.equal(rebased.operation, null)

  await worker.deactivate()
  rmSync(base, { recursive: true, force: true })
})

test('story 39: creating a PR needs a provider link or gh/glab', async () => {
  const { base, work } = await remoteFixture()
  const worker = await workerAt(work)
  await write(work, 'a.txt', 'one\n')
  await worker.request('git.stageAll', { repoRoot: work })
  await worker.request('git.commitPush', { repoRoot: work, message: 'first', amend: false })

  await assert.rejects(
    () => worker.request('git.pullRequest', { repoRoot: work }),
    (failure: unknown) => (failure as { code?: string }).code === 'invalid_params'
  )

  await worker.deactivate()
  rmSync(base, { recursive: true, force: true })
})

// ---- v2 克隆片：冲突、子模块、行内 diff、目录批量、提交并强推 ----

test('v2: a real merge conflict surfaces conflicts[] and blocks amend', async () => {
  const { fixture, worker } = await setup()
  await write(fixture.root, 'shared.txt', 'base\n')
  await runGit(fixture.root, ['add', '-A'])
  await worker.request('git.commit', { repoRoot: fixture.root, message: 'base', amend: false })

  await runGit(fixture.root, ['checkout', '-q', '-b', 'side'])
  await write(fixture.root, 'shared.txt', 'side\n')
  await runGit(fixture.root, ['commit', '-q', '-am', 'side change'])
  await runGit(fixture.root, ['checkout', '-q', '-'])
  await write(fixture.root, 'shared.txt', 'main\n')
  await runGit(fixture.root, ['commit', '-q', '-am', 'main change'])
  await runGit(fixture.root, ['merge', 'side'])

  const snapshot = await worker.request('git.snapshot', { repoRoot: fixture.root, fresh: true })
  assert.equal(snapshot.operation, 'merge')
  assert.deepEqual(snapshot.conflicts, ['shared.txt'])

  await assert.rejects(
    () => worker.request('git.commit', { repoRoot: fixture.root, message: 'x', amend: true }),
    (failure: unknown) => (failure as { code?: string }).code === 'conflict'
  )
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

test('v2: submodule status feeds the repo list with kind=submodule', async () => {
  const base = mkdtempSync(join(tmpdir(), 'orca-git-sub-'))
  const bare = join(base, 'inner.git')
  await runGit(base, ['init', '--bare', '-q', bare])
  const seed = join(base, 'seed')
  await runGit(base, ['clone', '-q', bare, seed])
  await runGit(seed, ['config', 'user.email', 's@e.com'])
  await runGit(seed, ['config', 'user.name', 'S'])
  writeFileSync(join(seed, 'lib.txt'), 'one\n')
  await runGit(seed, ['add', '-A'])
  await runGit(seed, ['commit', '-q', '-m', 'seed'])
  await runGit(seed, ['push', '-q', 'origin', 'HEAD'])

  const mainRepo = join(base, 'main')
  await runGit(base, ['init', '-q', mainRepo])
  await runGit(mainRepo, ['config', 'user.email', 'm@e.com'])
  await runGit(mainRepo, ['config', 'user.name', 'M'])
  // protocol.file.allow 必须走 `-c`（GIT_CONFIG_PARAMETERS 会传给子进程的 clone），
  // 写进仓库本地配置对 submodule add 的内部 clone 不生效。
  await runGit(mainRepo, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', bare, 'vendor/inner'])
  await runGit(mainRepo, ['commit', '-q', '-m', 'add submodule'])

  const worker = await mountWorker(main, {
    host: mockHost({
      results: {
        'workspace.list': {
          workspaces: [
            { id: 'ws-1', kind: 'worktree', name: 'main', path: mainRepo, branch: 'master', hostId: null },
          ],
          truncated: false,
        },
        'editor.open': { opened: true },
      },
      settings: { refreshSeconds: 0 },
    }),
  })
  const answer = await worker.request('git.repos', { workspaceId: 'ws-1' })
  assert.equal(answer.repos.length, 2)
  assert.equal(answer.repos[0].kind, 'root')
  assert.equal(answer.repos[0].root, mainRepo)
  assert.equal(answer.repos[1].kind, 'submodule')
  assert.equal(answer.repos[1].root, join(mainRepo, 'vendor', 'inner'))
  assert.equal(answer.repos[1].initialized, true)

  // 子模块被切换后，操作作用于子模块。
  const inner = answer.repos[1].root
  writeFileSync(join(inner, 'lib.txt'), 'two\n')
  const staged = await worker.request('git.stageAll', { repoRoot: inner })
  assert.equal(staged.repoRoot, inner)
  assert.equal(staged.staged.length, 1)
  // 子模块里提交后，主仓库的 submodule status 才会显示 `+`（有新提交）。
  await runGit(inner, ['-c', 'user.email=i@e.com', '-c', 'user.name=I', 'commit', '-q', '-m', 'bump'])

  const snapshot = await worker.request('git.snapshot', { repoRoot: mainRepo, fresh: true })
  assert.equal(snapshot.submodules.length, 1)
  assert.equal(snapshot.submodules[0].path, 'vendor/inner')
  assert.equal(snapshot.submodules[0].state, 'newCommits')

  await worker.deactivate()
  rmSync(base, { recursive: true, force: true })
})

test('v2: fileDiff returns unified text for staged and unstaged inputs', async () => {
  const { fixture, worker } = await setup()
  await write(fixture.root, 'a.txt', 'one\n')
  await runGit(fixture.root, ['add', '-A'])
  await worker.request('git.commit', { repoRoot: fixture.root, message: 'first', amend: false })
  await write(fixture.root, 'a.txt', 'one\ntwo\n')
  await runGit(fixture.root, ['add', 'a.txt'])
  await write(fixture.root, 'a.txt', 'one\ntwo\nthree\n')

  const staged = await worker.request('git.fileDiff', {
    repoRoot: fixture.root,
    path: 'a.txt',
    staged: true,
  })
  assert.match(staged.text, /\+two/)
  assert.equal(staged.truncated, false)

  const unstaged = await worker.request('git.fileDiff', {
    repoRoot: fixture.root,
    path: 'a.txt',
    staged: false,
  })
  assert.match(unstaged.text, /\+three/)
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

test('v2: folder-level stage, unstage and discard need the setting', async () => {
  const root = repoFixture()
  await gitInit(root)
  mkdirSync(join(root, 'pkg'), { recursive: true })
  writeFileSync(join(root, 'pkg', 'a.txt'), 'a\n')
  writeFileSync(join(root, 'pkg', 'b.txt'), 'b\n')

  const worker = await mountWorker(main, {
    host: mockHost({
      results: {
        'workspace.list': {
          workspaces: [
            { id: 'ws-1', kind: 'worktree', name: 'r', path: root, branch: 'main', hostId: null },
          ],
          truncated: false,
        },
      },
      settings: { refreshSeconds: 0, allowDiscardUntracked: false },
    }),
  })
  let staged = await worker.request('git.stageFolder', { repoRoot: root, prefix: 'pkg' })
  assert.equal(staged.staged.length, 2)
  staged = await worker.request('git.unstageFolder', { repoRoot: root, prefix: 'pkg' })
  assert.equal(staged.staged.length, 0)

  await assert.rejects(
    () => worker.request('git.discardFolder', { repoRoot: root, prefix: 'pkg' }),
    (failure: unknown) => (failure as { code?: string }).code === 'invalid_params'
  )
  await worker.deactivate()

  const allowed = await mountWorker(main, {
    host: mockHost({
      results: {
        'workspace.list': {
          workspaces: [
            { id: 'ws-1', kind: 'worktree', name: 'r', path: root, branch: 'main', hostId: null },
          ],
          truncated: false,
        },
      },
      settings: { refreshSeconds: 0, allowDiscardUntracked: true },
    }),
  })
  const after = await allowed.request('git.discardFolder', { repoRoot: root, prefix: 'pkg' })
  assert.deepEqual(after.untracked, [])
  await allowed.deactivate()
  rmSync(root, { recursive: true, force: true })
})

test('v2: openFile rejects traversal and accepts a real file', async () => {
  const { fixture, worker } = await setup()
  await write(fixture.root, 'ok.txt', 'x\n')

  await assert.rejects(
    () => worker.request('git.openFile', { repoRoot: fixture.root, path: '../escape.txt' }),
    (failure: unknown) => (failure as { code?: string }).code === 'invalid_params'
  )
  await assert.rejects(
    () => worker.request('git.openFile', { repoRoot: fixture.root, path: 'missing.txt' }),
    (failure: unknown) => (failure as { code?: string }).code === 'invalid_params'
  )

  const opened = await worker.request('git.openFile', {
    repoRoot: fixture.root,
    path: 'ok.txt',
  })
  assert.equal(opened.opened, true)
  const editorCalls = worker.host.callsOf('editor.open')
  assert.equal(editorCalls.length, 1)
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

// ---- v2 第二片：冲突流、历史、分支 ----

test('v2b: merge conflict → complete merge after marking resolved; abort works too', async () => {
  const { fixture, worker } = await setup()
  await write(fixture.root, 'shared.txt', 'base\n')
  await runGit(fixture.root, ['add', '-A'])
  await worker.request('git.commit', { repoRoot: fixture.root, message: 'base', amend: false })

  await runGit(fixture.root, ['checkout', '-q', '-b', 'side'])
  await write(fixture.root, 'shared.txt', 'side\n')
  await runGit(fixture.root, ['commit', '-q', '-am', 'side'])
  await runGit(fixture.root, ['checkout', '-q', '-'])
  await write(fixture.root, 'shared.txt', 'main\n')
  await runGit(fixture.root, ['commit', '-q', '-am', 'main'])
  await runGit(fixture.root, ['merge', 'side'])

  // 冲突未解决：完成合并被拒；标记解决后成功。
  await assert.rejects(
    () => worker.request('git.completeMerge', { repoRoot: fixture.root }),
    (failure: unknown) => (failure as { code?: string }).code === 'invalid_params'
  )
  await runGit(fixture.root, ['add', 'shared.txt'])
  const merged = await worker.request('git.completeMerge', { repoRoot: fixture.root })
  assert.equal(merged.operation, null)
  assert.deepEqual(merged.conflicts, [])

  // 再造一个冲突验证 abort 回到干净状态（side 已并入，换 side2）。
  await runGit(fixture.root, ['checkout', '-q', '-b', 'side2'])
  await write(fixture.root, 'shared.txt', 'side2\n')
  await runGit(fixture.root, ['commit', '-q', '-am', 'side2'])
  await runGit(fixture.root, ['checkout', '-q', '-'])
  await write(fixture.root, 'shared.txt', 'main3\n')
  await runGit(fixture.root, ['commit', '-q', '-am', 'main3'])
  await runGit(fixture.root, ['merge', 'side2']).catch(() => undefined)
  const aborted = await worker.request('git.abortOperation', { repoRoot: fixture.root })
  assert.equal(aborted.operation, null)
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

test('v2b: rebase conflict → resolve → continue produces the rebased commit', async () => {
  const { fixture, worker } = await setup()
  await write(fixture.root, 'a.txt', 'base\n')
  await runGit(fixture.root, ['add', '-A'])
  await worker.request('git.commit', { repoRoot: fixture.root, message: 'base', amend: false })

  await runGit(fixture.root, ['checkout', '-q', '-b', 'feature'])
  await write(fixture.root, 'a.txt', 'feature\n')
  await runGit(fixture.root, ['commit', '-q', '-am', 'feature'])
  await runGit(fixture.root, ['checkout', '-q', '-'])
  await write(fixture.root, 'a.txt', 'mainline\n')
  await runGit(fixture.root, ['commit', '-q', '-am', 'mainline'])
  await runGit(fixture.root, ['rebase', 'feature']).catch(() => undefined)

  const conflicted = await worker.request('git.snapshot', { repoRoot: fixture.root, fresh: true })
  assert.equal(conflicted.operation, 'rebase')
  assert.equal(conflicted.conflicts.length, 1)

  await write(fixture.root, 'a.txt', 'feature+mainline\n')
  await runGit(fixture.root, ['add', 'a.txt'])
  const done = await worker.request('git.continueOperation', { repoRoot: fixture.root })
  assert.equal(done.operation, null)

  const log = await worker.request('git.log', { repoRoot: fixture.root, skip: 0, limit: 10 })
  assert.equal(log.commits.length, 3)
  assert.equal(log.hasMore, false)
  assert.match(log.commits[0].subject, /mainline/)
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

test('v2b: log paginates and filters by revision; commitFiles lists the tree', async () => {
  const { fixture, worker } = await setup()
  for (const subject of ['one', 'two', 'three']) {
    await write(fixture.root, `${subject}.txt`, `${subject}\n`)
    await runGit(fixture.root, ['add', '-A'])
    await worker.request('git.commit', { repoRoot: fixture.root, message: subject, amend: false })
  }

  const page1 = await worker.request('git.log', { repoRoot: fixture.root, skip: 0, limit: 2 })
  assert.equal(page1.commits.length, 2)
  assert.equal(page1.hasMore, true)
  assert.match(page1.commits[0].subject, /three/)
  const page2 = await worker.request('git.log', { repoRoot: fixture.root, skip: 2, limit: 2 })
  assert.equal(page2.commits.length, 1)
  assert.equal(page2.hasMore, false)

  const filterRef = await runGit(fixture.root, ['rev-parse', 'HEAD~1'])
  const filtered = await worker.request('git.log', {
    repoRoot: fixture.root,
    revision: filterRef.stdout.trim(),
    skip: 0,
    limit: 10,
  })
  assert.equal(filtered.commits.length, 2)

  const head = await runGit(fixture.root, ['rev-parse', 'HEAD'])
  const files = await worker.request('git.commitFiles', {
    repoRoot: fixture.root,
    sha: head.stdout.trim(),
  })
  assert.deepEqual(
    files.files.map((file) => file.path),
    ['three.txt']
  )
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

test('v2b: branch list / create / switch (local and tracking) / delete', async () => {
  const { fixture, worker } = await setup()
  await write(fixture.root, 'a.txt', 'one\n')
  await runGit(fixture.root, ['add', '-A'])
  await worker.request('git.commit', { repoRoot: fixture.root, message: 'first', amend: false })

  // 本地分支：创建即切换；切回默认分支；未合并删除被拒、强制删除成功。
  const created = await worker.request('git.branchCreate', { repoRoot: fixture.root, name: 'topic' })
  assert.equal(created.branch, 'topic')
  const currentBranch = (await runGit(fixture.root, ['branch', '--show-current'])).stdout.trim()
  assert.equal(currentBranch, 'topic')

  await write(fixture.root, 'b.txt', 'only-on-topic\n')
  await runGit(fixture.root, ['add', '-A'])
  await runGit(fixture.root, ['commit', '-q', '-m', 'topic only'])

  const back = await worker.request('git.branchSwitch', {
    repoRoot: fixture.root,
    name: 'main',
    track: false,
  }).catch(async () => worker.request('git.branchSwitch', { repoRoot: fixture.root, name: 'master', track: false }))
  assert.notEqual(back.branch, 'topic')

  await assert.rejects(
    () => worker.request('git.branchDelete', { repoRoot: fixture.root, name: 'topic', force: false }),
    (failure: unknown) => (failure as { code?: string }).code === 'conflict'
  )
  const deleted = await worker.request('git.branchDelete', {
    repoRoot: fixture.root,
    name: 'topic',
    force: true,
  })
  assert.equal(deleted.branch, back.branch)

  const list = await worker.request('git.branchList', { repoRoot: fixture.root })
  assert.equal(list.branches.filter((branch) => branch.current).length, 1)
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})

test('v2b: pullRequestStatus returns null without gh', async () => {
  const { fixture, worker } = await setup()
  const status = await worker.request('git.pullRequestStatus', { repoRoot: fixture.root })
  assert.equal(status, null)
  await worker.deactivate()
  rmSync(fixture.root, { recursive: true, force: true })
})
