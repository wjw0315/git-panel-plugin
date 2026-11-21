// 面板渲染（v2 内置克隆布局）：worker 用假应答替身，断言人看到的东西与发出的请求。
// 注意：Collapsible 的 title / ListItem 的 description 是 props，finder 的 text 看不到，
// 这类断言走 view.tree() 正则。
import { assert, mockHost, mount, test } from 'orca/testing'
import * as panel from './panel'
import { buildTree } from './changes-tree'
import type { GitSnapshot, StashEntry } from './protocol'

const snapshot: GitSnapshot = {
  repoRoot: '/repo',
  branch: 'feat/git-panel',
  detached: false,
  ahead: 1,
  behind: 0,
  hasUpstream: true,
  upstream: 'origin/feat/git-panel',
  remote: {
    name: 'origin',
    url: 'git@github.com:jiaweiwu/git-panel-plugin.git',
    host: 'github.com',
    provider: 'github',
    compareUrl: 'https://github.com/jiaweiwu/git-panel-plugin/compare/main...feat%2Fgit-panel?expand=1',
    cli: null,
    baseBranch: 'main',
  },
  base: {
    ref: 'origin/main',
    exists: true,
    ahead: 2,
    commits: [
      { sha: '9f8e7d6', subject: 'feat: base moved on' },
      { sha: '8a7b6c5', subject: 'fix: base also fixed this' },
    ],
   overwritten: { files: [], total: 0 },
    fellBackTo: null,
  },
  operation: null,
  conflicts: [],
  staged: [{ path: 'src/staged.ts', status: 'modified', additions: 2, deletions: 1 }],
  modified: [
    { path: 'src/modified.ts', status: 'modified', additions: 5, deletions: 0 },
    { path: 'README.md', status: 'modified', additions: 4, deletions: 0 },
  ],
  untracked: [{ path: 'notes.md', status: 'untracked', additions: 3, deletions: 0 }],
  submodules: [
    { path: 'vendor/inner', state: 'newCommits', commit: 'a1b2c3d', describe: 'inner: bump' },
  ],
  lastCommit: { sha: 'abc1234', subject: 'feat: earlier work' },
  partial: false,
}

const stash: StashEntry = {
  index: 0,
  ref: 'stash@{0}',
  message: 'WIP on main: 1a2b3c4 try something',
  branch: 'main',
  at: 1_700_000_000_000,
}

function harness(
  options: {
    local?: boolean
    snapshotOverride?: GitSnapshot
    mergeOutcome?: 'auth-failure' | 'degraded'
  } = {}
) {
  const calls: string[] = []
  const host = mockHost({
    results: {
      'workspace.readContext': {
        workspaceId: 'ws-1',
        branch: 'feat/git-panel',
        displayName: 'repo',
        terminals: [],
      },
    },
    requests: {
      'git.repos': () => ({
        workspaceId: 'ws-1',
        cwd: options.local === false ? null : '/repo',
        local: options.local !== false,
        hostId: options.local === false ? 'ssh:build' : null,
        repos:
          options.local === false
            ? []
            : [
                { root: '/repo', name: 'repo', kind: 'root', branch: 'feat/git-panel', dirty: true, initialized: true },
                { root: '/repo/vendor/inner', name: 'inner', kind: 'submodule', branch: 'main', dirty: false, initialized: true },
              ],
      }),
      'git.snapshot': (input) => {
        calls.push(`snapshot:${input.repoRoot}`)
        if (input.base) calls.push(`base:${input.base}`)
        return options.snapshotOverride ?? snapshot
      },
      'git.stashList': () => ({ stashes: [stash] }),
      'git.stage': (input) => {
        calls.push(`stage:${input.paths.join(',')}`)
        return snapshot
      },
      'git.unstage': (input) => {
        calls.push(`unstage:${input.paths.join(',')}`)
        return snapshot
      },
      'git.discard': (input) => {
        calls.push(`discard:${input.paths.join(',')}`)
        return snapshot
      },
      'git.stageAll': () => {
        calls.push('stageAll')
        return snapshot
      },
      'git.unstageAll': () => {
        calls.push('unstageAll')
        return snapshot
      },
      'git.stageFolder': (input) => {
        calls.push(`stageFolder:${input.prefix}`)
        return snapshot
      },
      'git.unstageFolder': (input) => {
        calls.push(`unstageFolder:${input.prefix}`)
        return snapshot
      },
      'git.discardFolder': (input) => {
        calls.push(`discardFolder:${input.prefix}`)
        return snapshot
      },
      'git.fileDiff': (input) => {
        calls.push(`fileDiff:${input.staged ? 's' : 'w'}:${input.path}`)
        return { text: '@@ -1 +1 @@\n-old line\n+new line', truncated: false }
      },
      'git.openFile': (input) => {
        calls.push(`openFile:${input.path}`)
        return { opened: true as const, absolutePath: `/repo/${input.path}` }
      },
      'git.commit': (input) => {
        calls.push(`commit:${input.message}:${String(input.amend)}`)
        return { ...snapshot, staged: [], modified: [], untracked: [] }
      },
      'git.commitPush': (input) => {
        calls.push(`commitPush:${input.message}`)
        return { ...snapshot, staged: [], modified: [], untracked: [] }
      },
      'git.commitSync': (input) => {
        calls.push(`commitSync:${input.message}`)
        return { ...snapshot, staged: [], modified: [], untracked: [] }
      },
      'git.commitForce': (input) => {
        calls.push(`commitForce:${input.message}`)
        return { ...snapshot, staged: [], modified: [], untracked: [] }
      },
      'git.fetch': () => {
        calls.push('fetch')
        return snapshot
      },
      'git.push': () => {
        calls.push('push')
        return snapshot
      },
      'git.pushForce': () => {
        calls.push('pushForce')
        return snapshot
      },
      'git.publish': () => {
        calls.push('publish')
        return snapshot
      },
      'git.pull': () => {
        calls.push('pull')
        return snapshot
      },
      'git.fastForward': () => {
        calls.push('fastForward')
        return snapshot
      },
      'git.sync': () => {
        calls.push('sync')
        return snapshot
      },
      'git.rebase': () => {
        calls.push('rebase')
        return snapshot
      },
      'git.mergeBase': (input) => {
        calls.push(`mergeBase:${String(input.fetch !== false)}`)
        const merged = {
          ...snapshot,
          base: {
            ref: 'origin/main',
            exists: true,
            ahead: 0,
            commits: [],
            overwritten: { files: [], total: 0 },
            fellBackTo: null,
          },
        }
        if (options.mergeOutcome === 'auth-failure') {
          return {
            ok: false as const,
            stage: 'fetch' as const,
            reason: 'auth' as const,
            detail: 'fatal: Could not read from remote repository.',
            snapshot: merged,
          }
        }
        return {
          ok: true as const,
          snapshot: merged,
          degraded:
            options.mergeOutcome === 'degraded'
              ? { reason: 'auth' as const, detail: 'fatal: Could not read from remote repository.' }
              : null,
        }
      },
      'git.pullRequest': () => {
        calls.push('pullRequest')
        return { url: null, via: 'gh' as const }
      },
      'git.pushThenPullRequest': () => {
        calls.push('pushThenPullRequest')
        return { url: null, via: 'gh' as const }
      },
      'git.openBuiltIn': () => {
        calls.push('openBuiltIn')
        return { ran: true as const }
      },
      'git.stashSave': () => {
        calls.push('stashSave')
        return snapshot
      },
      'git.stashApply': (input) => {
        calls.push(`stashApply:${input.index}`)
        return snapshot
      },
      'git.stashPop': (input) => {
        calls.push(`stashPop:${input.index}`)
        return snapshot
      },
      'git.stashDrop': (input) => {
        calls.push(`stashDrop:${input.index}`)
        return { stashes: [] }
      },
      'git.abortOperation': () => {
        calls.push('abortOperation')
        return { ...snapshot, operation: null, conflicts: [] }
      },
      'git.continueOperation': () => {
        calls.push('continueOperation')
        return { ...snapshot, operation: null, conflicts: [] }
      },
      'git.completeMerge': () => {
        calls.push('completeMerge')
        return { ...snapshot, operation: null, conflicts: [] }
      },
      'git.log': (input) => {
        calls.push(`log:${input.skip}:${input.revision ?? ''}`)
        return {
          commits: [
            { sha: '1111111aaaa', subject: 'feat: third', author: 'Echo', at: 1_764_100_000_000, refs: 'HEAD -> feat/git-panel' },
            { sha: '2222222bbbb', subject: 'feat: second', author: 'Echo', at: 1_764_000_000_000, refs: '' },
          ],
          hasMore: input.skip > 0,
        }
      },
      'git.commitFiles': (input) => {
        calls.push(`commitFiles:${input.sha.slice(0, 7)}`)
        return { files: [{ path: 'src/panel.tsx', additions: 10, deletions: 2 }] }
      },
      'git.pullRequestStatus': () => {
        calls.push('pullRequestStatus')
        return { state: 'OPEN', number: 42, url: 'https://github.com/x/y/pull/42' }
      },
      'git.branchList': () => {
        calls.push('branchList')
        return {
          branches: [
            { name: 'feat/git-panel', remote: false, current: true },
            { name: 'main', remote: false, current: false },
            { name: 'origin/main', remote: true, current: false },
          ],
          detached: false,
        }
      },
      'git.branchCreate': (input) => {
        calls.push(`branchCreate:${input.name}`)
        return snapshot
      },
      'git.branchSwitch': (input) => {
        calls.push(`branchSwitch:${input.name}:${String(input.track)}`)
        return snapshot
      },
      'git.branchDelete': (input) => {
        calls.push(`branchDelete:${input.name}:${String(input.force)}`)
        return snapshot
      },
    },
  })
  return { host, calls }
}

test('story 1/30: header, branch row, commit card and the changes card', async () => {
  const { host } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  const drawn = JSON.stringify(view.tree())
  assert.match(drawn, /feat\/git-panel/)
  assert.match(drawn, /origin\/feat\/git-panel/)
  assert.match(drawn, /staged\.ts/)
  assert.match(drawn, /已暂存 1/)
  assert.deepEqual(view.errors, [])
  await view.unmount()
})

test('story 8: commit button stays disabled until a message exists; the caret opens three more', async () => {
  const { host, calls } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.select({ type: 'Tabs' }, 'commit')
  assert.equal(view.find({ role: 'button', text: '提交' })?.disabled, true)
  assert.match(JSON.stringify(view.tree()), /需要提交信息/)
  await view.type({ label: '提交信息' }, 'feat: 克隆布局')
  await view.press({ label: '更多提交方式' })
  assert.equal(view.find({ role: 'button', text: '提交并推送' })?.disabled, false)
  await view.press({ role: 'button', text: '提交' })
  assert.deepEqual(calls.filter((call) => call.startsWith('commit')), ['commit:feat: 克隆布局:false'])
  await view.unmount()
})

test('story 4/5/8/9: every file row carries stage / discard / open / diff actions', async () => {
  const { host, calls } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.press({ label: '暂存 src/modified.ts' })
  await view.press({ label: '放弃改动 src/modified.ts' })
  await view.press({ label: '打开文件 src/modified.ts' })
  await view.press({ label: '查看差异 src/modified.ts' })
  assert.deepEqual(calls.filter((call) => /^(stage|discard|openFile|fileDiff)/.test(call)), [
    'stage:src/modified.ts',
    'discard:src/modified.ts',
    'openFile:src/modified.ts',
    'fileDiff:w:src/modified.ts',
  ])
  assert.match(JSON.stringify(view.tree()), /new line/)
  await view.unmount()
})

test('story 6: a directory section offers folder-level actions', async () => {
  const { host, calls } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.press({ label: '暂存目录 src' })
  await view.press({ label: '丢弃目录 src' })
  assert.deepEqual(calls.filter((call) => /Folder/.test(call)), ['stageFolder:src', 'discardFolder:src'])
  await view.unmount()
})

test('story 10/11: a submodule row enters that repository', async () => {
  const { host, calls } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.press({ label: '进入子模块 vendor/inner' })
  const snapshots = calls.filter((call) => call.startsWith('snapshot:'))
  assert.equal(snapshots.length, 2, snapshots.join('|'))
  await view.unmount()
})

test('v3: the header shows how far the base branch is ahead, and the overflow can pull it in', async () => {
  const { host, calls } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  assert.equal(view.find({ role: 'button', text: '基准领先 2 个提交' }) !== null, true)
  await view.press({ role: 'button', text: '基准领先 2 个提交' })
  const drawn = JSON.stringify(view.tree())
  assert.match(drawn, /origin\/main/)
  assert.match(drawn, /feat: base moved on/)
  // 有未提交改动时不能合并，面板给出原因而不是静默失败。
  assert.equal(view.find({ role: 'button', text: '获取并合并' })?.disabled, true)
  assert.match(drawn, /先提交或贮藏改动/)
  await view.unmount()

  const clean = harness({
    snapshotOverride: { ...snapshot, staged: [], modified: [], untracked: [] },
  })
  const cleanView = await mount(panel, { host: clean.host, locale: 'zh-CN' })
  await cleanView.press({ role: 'button', text: '基准领先 2 个提交' })
  await cleanView.press({ role: 'button', text: '获取并合并' })
  assert.deepEqual(clean.calls.filter((call) => call.startsWith('mergeBase')), ['mergeBase:true'])
  await cleanView.unmount()

  // 只合并本地基准：不先 fetch，单独挂一次。
  const localOnly = harness({
    snapshotOverride: { ...snapshot, staged: [], modified: [], untracked: [] },
  })
  const localView = await mount(panel, { host: localOnly.host, locale: 'zh-CN' })
  await localView.press({ role: 'button', text: '基准领先 2 个提交' })
  await localView.press({ role: 'button', text: '仅合并本地基准' })
  assert.deepEqual(localOnly.calls.filter((call) => call.startsWith('mergeBase')), ['mergeBase:false'])
  await localView.unmount()
})

test('v3b: the base page lets you pick which branch is the base', async () => {
  const { host, calls } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.select({ type: 'Tabs' }, 'base')
  assert.equal(view.valueOf({ label: '基准分支' }), 'origin/main')
  await view.select({ label: '基准分支' }, 'main')
  assert.deepEqual(calls.filter((call) => call.startsWith('base:')), ['base:main'])
  await view.unmount()
})

test('v5: a failed merge explains itself in place and can show the raw output', async () => {
  const { host } = harness({
    mergeOutcome: 'auth-failure',
    snapshotOverride: { ...snapshot, staged: [], modified: [], untracked: [] },
  })
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.press({ role: 'button', text: '基准领先 2 个提交' })
  await view.press({ role: 'button', text: '获取并合并' })
  assert.match(JSON.stringify(view.tree()), /获取失败：没有访问权限/)
  await view.press({ role: 'button', text: '查看原始输出' })
  assert.match(JSON.stringify(view.tree()), /Could not read from remote repository/)
  await view.press({ role: 'button', text: '收起原始输出' })
  assert.equal(JSON.stringify(view.tree()).includes('Could not read from remote'), false)
  await view.unmount()
})

test('v5: a degraded merge says it used the local base', async () => {
  const { host } = harness({
    mergeOutcome: 'degraded',
    snapshotOverride: { ...snapshot, staged: [], modified: [], untracked: [] },
  })
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.press({ role: 'button', text: '基准领先 2 个提交' })
  await view.press({ role: 'button', text: '获取并合并' })
  assert.match(JSON.stringify(view.tree()), /已用本地缓存完成合并/)
  await view.unmount()
})

test('v6: the branch page filters by name and groups local vs remote', async () => {
  const { host } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.select({ type: 'Tabs' }, 'branch')

  let drawn = JSON.stringify(view.tree())
  assert.match(drawn, /本地 1/)
  assert.match(drawn, /远端 1/)

  // 过滤：本地组整组消失，只剩远端那一条。
  await view.type({ label: '搜索分支' }, 'origin')
  drawn = JSON.stringify(view.tree())
  assert.equal(drawn.includes('本地 1'), false)
  assert.match(drawn, /远端 1/)
  assert.match(drawn, /origin\/main/)

  // 无匹配
  await view.type({ label: '搜索分支' }, 'zzz', { replace: true })
  assert.match(JSON.stringify(view.tree()), /没有匹配的分支/)

  // 清空按钮恢复完整列表
  await view.press({ label: '清空搜索' })
  drawn = JSON.stringify(view.tree())
  assert.match(drawn, /本地 1/)
  assert.match(drawn, /远端 1/)
  await view.unmount()
})

test('v4.1: buildTree nests directories, sorts them, and keeps root files at the top', () => {
  const tree = buildTree([
    { path: 'src/utils/b.ts', status: 'modified', additions: 1, deletions: 0 },
    { path: 'src/a.ts', status: 'modified', additions: 1, deletions: 0 },
    { path: 'README.md', status: 'modified', additions: 1, deletions: 0 },
  ])
  assert.deepEqual(tree.dirs.map((dir) => dir.name), ['src'])
  assert.deepEqual(tree.dirs[0].dirs.map((dir) => dir.name), ['utils'])
  assert.deepEqual(tree.dirs[0].files.map((file) => file.path), ['src/a.ts'])
  assert.deepEqual(tree.files.map((file) => file.path), ['README.md'])
})

test('v4.1: the changes page switches between tree and flat display', async () => {
  const { host } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  assert.equal(view.valueOf({ label: '展示方式' }), 'tree')
  await view.select({ label: '展示方式' }, 'flat')
  assert.equal(view.valueOf({ label: '展示方式' }), 'flat')
  assert.match(JSON.stringify(view.tree()), /modified\.ts/)
  await view.unmount()
})

test('story 15-18: the stash card lists entries and can shelve the tree', async () => {
  const { host, calls } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.select({ type: 'Tabs' }, 'stash')
  assert.equal(view.find({ text: /WIP on main/ }) !== null, true)
  await view.press({ role: 'button', text: '新建贮藏' })
  await view.press({ role: 'button', text: '弹出' })
  assert.deepEqual(calls.filter((call) => /stash/.test(call)), ['stashSave', 'stashPop:0'])
  await view.select({ type: 'Tabs' }, 'commit')
  assert.match(JSON.stringify(view.tree()), /已暂存 1/)
  await view.unmount()
})

test('story 31: a workspace on another host is reported, not silently empty', async () => {
  const { host } = harness({ local: false })
  const view = await mount(panel, { host, locale: 'zh-CN' })
  assert.equal(view.find({ text: /另一台主机/ }) !== null, true)
  await view.unmount()
})

test('story 16: the overflow view holds every built-in menu item', async () => {
  const { host, calls } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.press({ label: '更多' })
  const drawn = JSON.stringify(view.tree())
  for (const label of [
    '提交并推送',
    '提交并同步',
    '提交并强推',
    '推送',
    '发布分支',
    '强制推送',
    '创建 PR',
    '先推送再创建 PR',
    '获取',
    '拉取',
    '快进',
    '同步',
    '变基到',
  ]) {
    assert.match(drawn, new RegExp(label), `missing ${label}`)
  }
  await view.press({ role: 'button', text: '获取' })
  await view.press({ role: 'button', text: '推送' })
  await view.press({ role: 'button', text: '强制推送' })
  assert.deepEqual(calls.filter((call) => /^(fetch|push)/.test(call)), ['fetch', 'push'])
  assert.equal(view.find({ role: 'button', text: '确认强制推送' }) !== null, true)
  await view.press({ role: 'button', text: '确认强制推送' })
  assert.deepEqual(calls.filter((call) => /^(fetch|push)/.test(call)), ['fetch', 'push', 'pushForce'])
  await view.unmount()
})

test('story 45/46: a dirty tree blocks pull/fast-forward/sync', async () => {
  const { host } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.press({ label: '更多' })
  assert.equal(view.find({ role: 'button', text: '拉取' })?.disabled, true)
  assert.equal(view.find({ role: 'button', text: '快进' })?.disabled, true)
  assert.equal(view.find({ role: 'button', text: '同步' })?.disabled, true)
  assert.match(JSON.stringify(view.tree()), /先提交或贮藏改动/)
  await view.unmount()
})

test('story 47/35: PR from the overflow view opens the compare page; the footer jumps to the built-in panel', async () => {
  const { host, calls } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.press({ label: '更多' })
  await view.press({ role: 'button', text: '创建 PR' })
  const opened = view.host.callsOf('shell.openExternal')
  assert.equal(opened.length, 1)
  assert.match(JSON.stringify(opened[0]), /compare/)
  await view.press({ role: 'button', text: '在内置源代码控制中打开' })
  assert.deepEqual(calls.filter((call) => call === 'openBuiltIn'), ['openBuiltIn'])
  await view.unmount()
})

test('v2b: conflict banner offers abort and the right continue action', async () => {
  const { host, calls } = harness({
    snapshotOverride: { ...snapshot, operation: 'rebase', conflicts: [] },
  })
  const view = await mount(panel, { host, locale: 'zh-CN' })
  assert.match(JSON.stringify(view.tree()), /中止/)
  await view.press({ role: 'button', text: '继续' })
  assert.deepEqual(calls.filter((call) => /Operation/.test(call)), ['continueOperation'])
  await view.unmount()
})

test('v2b: the history view shows PR status, commits and per-commit files', async () => {
  const { host, calls } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.press({ label: '搜索提交' })
  assert.equal(view.find({ text: /PR #42/ }) !== null, true)
  assert.match(JSON.stringify(view.tree()), /feat: third/)
  await view.press({ label: '查看差异 1111111' })
  assert.deepEqual(calls.filter((call) => call.startsWith('commitFiles')), ['commitFiles:1111111'])
  await view.type({ label: '历史' }, 'main', { replace: true, submit: true })
  const logCalls = calls.filter((call) => call.startsWith('log'))
  assert.equal(logCalls[logCalls.length - 1], 'log:0:main')
  await view.select({ type: 'Tabs' }, 'changes')
  assert.match(JSON.stringify(view.tree()), /已暂存 1/)
  await view.unmount()
})

test('v2b: the branch view switches and deletes local branches', async () => {
  const { host, calls } = harness()
  const view = await mount(panel, { host, locale: 'zh-CN' })
  await view.press({ label: '分支' })
  await view.press({ role: 'button', text: '切换' })
  assert.deepEqual(calls.filter((call) => call.startsWith('branchSwitch')), ['branchSwitch:main:false'])
  await view.press({ label: '删除 main' })
  await view.press({ role: 'button', text: '强制删除' })
  assert.deepEqual(calls.filter((call) => call.startsWith('branchDelete')), ['branchDelete:main:true'])
  await view.unmount()
})
