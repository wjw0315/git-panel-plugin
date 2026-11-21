// 面板文案：跟随 Orca 的界面语言，zh* 用中文，其余英文。

import type { MergeReason, MergeStage } from './protocol'

export type Copy = {
  lang: 'zh' | 'en'
  title: string
  refresh: string
  repo: string
  staged: string
  modified: string
  untracked: string
  changes: string
  stashes: string
  stageAll: string
  unstageAll: string
  discardAll: string
  stage: string
  unstage: string
  discard: string
  remove: string
  stageSelected: string
  discardSelected: string
  selectedCount: (count: number) => string
  review: string
  dirty: string
  cleanState: string
  files: string
  stagedCount: (count: number) => string
  message: string
  messagePlaceholder: string
  amend: string
  commit: string
  needStaged: string
  needMessage: string
  needResolve: string
  commitTo: (kind: string, name: string) => string
  amendCommit: string
  newStash: string
  includeUntracked: string
  apply: string
  pop: string
  drop: string
  emptyRepo: string
  emptyRepoHint: string
  clean: string
  cleanHint: string
  noStashes: string
  noStashesHint: string
  remoteHost: string
  operationRunning: (operation: string) => string
  noCommit: string
  failed: string
  loading: string
  partial: string
  remote: string
  noRemote: string
  push: string
  pushForce: string
  confirmForce: string
  publishBranch: string
  fetch: string
  pull: string
  fastForward: string
  sync: string
  rebaseTo: (target: string) => string
  createPullRequest: string
  commitPush: string
  commitSync: string
  upToDate: string
  dirtyBlock: string
  groupPull: string
  groupIntegrate: string
  noUpstream: string
  forceLeaseHint: string
  prViaBrowser: string
  prViaCli: string
  filesCount: (count: number) => string
  stagedGroup: string
  changesGroup: string
  fileView: string
  viewTree: string
  viewFlat: string
  openFile: string
  showDiff: string
  enterSubmodule: string
  submoduleUninitialized: string
  submoduleNewCommits: string
  folderStage: string
  folderUnstage: string
  folderDiscard: string
  moreActions: string
  commitForce: string
  pushThenPullRequest: string
  conflictBanner: (operation: string, count: number) => string
  openBuiltIn: string
  kindRoot: string
  kindSubmodule: string
  kindNested: string
  tabHistory: string
  historyFilterPlaceholder: string
  loadMore: string
  prState: (state: string, number: number) => string
  prNone: string
  abortOperation: string
  continueOperation: string
  completeMerge: string
  branchSelect: string
  newBranch: string
  branchNamePlaceholder: string
  createBranch: string
  cancelBranch: string
  branchCard: string
  deleteBranch: string
  forceDeleteBranch: string
  currentBranchLabel: string
  remoteBranchTag: string
  noCommits: string
  moreShort: string
  createPr: string
  baseBranchTitle: string
  baseShort: string
  baseAhead: (count: number) => string
  baseUpToDate: string
  baseMissing: string
  baseCommits: (count: number) => string
  pullBase: string
  pullBaseFetch: string
  pullBaseLocal: string
  viewRaw: string
  hideRaw: string
  mergeFailure: (stage: MergeStage, reason: MergeReason) => string
  mergeDegraded: (reason: MergeReason) => string
  overwriteBlocked: (count: number) => string
  baseFellBack: (ref: string) => string
  localTag: string
  searchCommits: string
  commitMenu: string
  viewBranches: string
  expandCard: string
  collapseCard: string
  moreRemote: string

  switchTo: string
}

const zh: Copy = {
  lang: 'zh',
  title: 'Git',
  refresh: '刷新',
  repo: '仓库',
  staged: '已暂存',
  modified: '已修改',
  untracked: '未跟踪',
  changes: '变更',
  stashes: '贮藏',
  stageAll: '全部暂存',
  unstageAll: '全部取消暂存',
  discardAll: '全部丢弃',
  stage: '暂存',
  unstage: '取消暂存',
  discard: '放弃改动',
  remove: '删除文件',
  stageSelected: '暂存所选',
  discardSelected: '丢弃所选',
  selectedCount: (count) => `已选 ${count} 项`,
  review: '复核',
  dirty: '有改动',
  cleanState: '干净',
  files: '文件',
  stagedCount: (count) => `已暂存 ${count}`,
  message: '提交信息',
  messagePlaceholder: '首行是标题，空行后是正文',
  amend: '修正上次提交',
  commit: '提交',
  needStaged: '未暂存任何文件',
  needMessage: '需要提交信息',
  needResolve: '有冲突',
  commitTo: (kind, name) => `提交到 ${kind} ${name}`,
  amendCommit: '修正提交',
  newStash: '新建贮藏',
  includeUntracked: '含未跟踪',
  apply: '应用',
  pop: '弹出',
  drop: '删除',
  emptyRepo: '没有找到 Git 仓库',
  emptyRepoHint: '这个工作区里没有 .git，或者仓库在更深的位置。',
  clean: '工作区干净',
  cleanHint: '没有已暂存、已修改或未跟踪的文件。',
  noStashes: '没有贮藏',
  noStashesHint: '「新建贮藏」会把当前改动收起来，工作区回到干净状态。',
  remoteHost: '该工作区在另一台主机上',
  operationRunning: (operation) => `正在 ${operation} 中，先处理完再进行。`,
  noCommit: '还没有可以修正的提交。',
  failed: '操作失败',
  loading: '读取中',
  partial: '部分文件的统计被跳过（超出预算）。',
  remote: '远端',
  noRemote: '没有配置远端',
  push: '推送',
  pushForce: '强制推送',
  confirmForce: '确认强制推送',
  publishBranch: '发布分支',
  fetch: '获取',
  pull: '拉取',
  fastForward: '快进',
  sync: '同步',
  rebaseTo: (target) => `变基到 ${target}`,
  createPullRequest: '创建 PR',
  commitPush: '提交并推送',
  commitSync: '提交并同步',
  upToDate: '已是最新',
  dirtyBlock: '先提交或贮藏改动',
  groupPull: '拉取',
  groupIntegrate: '整合',
  noUpstream: '还没有上游分支',
  forceLeaseHint: 'force-with-lease，覆盖远端历史',
  prViaBrowser: '在浏览器里打开创建页',
  prViaCli: '直接创建（已检测到 CLI）',
  filesCount: (count) => `${count} 个文件`,
  stagedGroup: '已暂存的更改',
  changesGroup: '更改',
  fileView: '展示方式',
  viewTree: '树形',
  viewFlat: '平铺',
  openFile: '打开文件',
  showDiff: '查看差异',
  enterSubmodule: '进入子模块',
  submoduleUninitialized: '未初始化',
  submoduleNewCommits: '子模块有新提交',
  folderStage: '暂存目录',
  folderUnstage: '取消暂存目录',
  folderDiscard: '丢弃目录',
  moreActions: '更多提交和远端动作',
  commitForce: '提交并强推',
  pushThenPullRequest: '先推送再创建 PR',
  conflictBanner: (operation, count) => `${operation} 进行中 · ${count} 个未解决冲突`,
  openBuiltIn: '在内置源代码控制中打开',
  kindRoot: '主仓库',
  kindSubmodule: '子模块',
  kindNested: '嵌套仓库',
  tabHistory: '历史',
  historyFilterPlaceholder: '分支名或哈希前缀，回车过滤',
  loadMore: '加载更多',
  prState: (state, number) => `PR #${number} · ${state}`,
  prNone: '没有关联 PR',
  abortOperation: '中止',
  continueOperation: '继续',
  completeMerge: '完成合并',
  branchSelect: '分支',
  newBranch: '新建分支',
  branchNamePlaceholder: '新分支名',
  createBranch: '创建并切换',
  cancelBranch: '取消',
  branchCard: '分支',
  deleteBranch: '删除',
  forceDeleteBranch: '强制删除',
  currentBranchLabel: '当前',
  remoteBranchTag: '远端',
  noCommits: '还没有提交',
  moreShort: '更多',
  createPr: '创建 PR',
  baseBranchTitle: '基准分支',
  baseShort: '基准',
  baseAhead: (count) => `基准领先 ${count} 个提交`,
  baseUpToDate: '基准已合入',
  baseMissing: '本地还没有这个基准分支，先获取',
  baseCommits: (count) => `${count} 个提交`,
  pullBase: '拉取基准分支',
  pullBaseFetch: '获取并合并',
  pullBaseLocal: '仅合并本地基准',
  viewRaw: '查看原始输出',
  hideRaw: '收起原始输出',
  mergeFailure: (stage, reason) => {
    if (stage === 'fetch') {
      if (reason === 'auth') return '获取失败：没有访问权限或仓库不存在。可以先点「仅合并本地基准」。'
      if (reason === 'network') return '获取失败：连不上远端（网络或代理）。可以先点「仅合并本地基准」。'
      return '获取失败：暂时拿不到远端更新。可以先点「仅合并本地基准」。'
    }
    if (reason === 'ref-missing') return '合并失败：这个基准分支不存在了，重新选一个。'
    if (reason === 'untracked-overwrite') return '合并失败：会覆盖本地未跟踪文件，先把它们移走或删掉。'
    if (reason === 'identity') return '合并失败：本机还没配置 git 用户名与邮箱。'
    if (reason === 'conflict') return '合并有冲突：去「更改」页解决后再继续。'
    return '合并失败，展开原始输出看看原因。'
  },
  mergeDegraded: (reason) =>
    `没能获取最新（${reason === 'auth' ? '无访问权限' : reason === 'network' ? '网络不通' : '远端不可用'}），已用本地缓存完成合并。`,
  overwriteBlocked: (count) => `合入会覆盖 ${count} 个未跟踪文件，先移走或删除它们：`,
  baseFellBack: (ref) => `原来选的基准已不存在，已回退到 ${ref}。`,
  localTag: '本地',
  searchCommits: '搜索提交',
  commitMenu: '更多提交方式',
  viewBranches: '分支',
  expandCard: '展开',
  collapseCard: '收起',
  moreRemote: '更多远端操作',
  switchTo: '切换',
}

const en: Copy = {
  lang: 'en',
  title: 'Git',
  refresh: 'Refresh',
  repo: 'Repository',
  staged: 'Staged',
  modified: 'Changes',
  untracked: 'Untracked',
  changes: 'Changes',
  stashes: 'Stashes',
  stageAll: 'Stage all',
  unstageAll: 'Unstage all',
  discardAll: 'Discard all',
  stage: 'Stage',
  unstage: 'Unstage',
  discard: 'Discard',
  remove: 'Delete file',
  stageSelected: 'Stage selected',
  discardSelected: 'Discard selected',
  selectedCount: (count) => `${count} selected`,
  review: 'Review',
  dirty: 'Changes',
  cleanState: 'Clean',
  files: 'files',
  stagedCount: (count) => `${count} staged`,
  message: 'Commit message',
  messagePlaceholder: 'Subject on the first line, body after a blank line',
  amend: 'Amend last commit',
  commit: 'Commit',
  needStaged: 'Nothing staged',
  needMessage: 'Needs message',
  needResolve: 'Conflicts',
  commitTo: (kind, name) => `Commit to ${kind} ${name}`,
  amendCommit: 'Amend commit',
  newStash: 'New stash',
  includeUntracked: 'Include untracked',
  apply: 'Apply',
  pop: 'Pop',
  drop: 'Drop',
  emptyRepo: 'No Git repository found',
  emptyRepoHint: 'This workspace has no .git, or the repository is deeper than three levels.',
  clean: 'Working tree clean',
  cleanHint: 'Nothing staged, modified or untracked.',
  noStashes: 'No stashes',
  noStashesHint: 'New stash shelves the current changes and leaves the workspace clean.',
  remoteHost: 'This workspace lives on another host',
  operationRunning: (operation) => `${operation} in progress: finish it first.`,
  noCommit: 'There is no commit to amend yet.',
  failed: 'Something went wrong',
  loading: 'Loading',
  partial: 'Some file stats were skipped (budget reached).',
  remote: 'Remote',
  noRemote: 'No remote configured',
  push: 'Push',
  pushForce: 'Force push',
  confirmForce: 'Confirm force push',
  publishBranch: 'Publish branch',
  fetch: 'Fetch',
  pull: 'Pull',
  fastForward: 'Fast-forward',
  sync: 'Sync',
  rebaseTo: (target) => `Rebase onto ${target}`,
  createPullRequest: 'Create PR',
  commitPush: 'Commit and push',
  commitSync: 'Commit and sync',
  upToDate: 'Up to date',
  dirtyBlock: 'Commit or stash first',
  groupPull: 'Pull',
  groupIntegrate: 'Integrate',
  noUpstream: 'No upstream branch yet',
  forceLeaseHint: 'force-with-lease, rewrites remote history',
  prViaBrowser: 'Open the creation page in the browser',
  prViaCli: 'Create directly (CLI detected)',
  filesCount: (count) => `${count} files`,
  stagedGroup: 'Staged Changes',
  changesGroup: 'Changes',
  fileView: 'Display',
  viewTree: 'Tree',
  viewFlat: 'Flat',
  openFile: 'Open file',
  showDiff: 'Show diff',
  enterSubmodule: 'Enter submodule',
  submoduleUninitialized: 'Not initialized',
  submoduleNewCommits: 'Submodule has new commits',
  folderStage: 'Stage folder',
  folderUnstage: 'Unstage folder',
  folderDiscard: 'Discard folder',
  moreActions: 'More commit and remote actions',
  commitForce: 'Commit & Force Push',
  pushThenPullRequest: 'Push then create PR',
  conflictBanner: (operation, count) => `${operation} in progress · ${count} unresolved conflicts`,
  openBuiltIn: 'Open in built-in Source Control',
  kindRoot: 'Main repo',
  kindSubmodule: 'Submodule',
  kindNested: 'Nested repo',
  tabHistory: 'History',
  historyFilterPlaceholder: 'Branch or sha prefix, Enter to filter',
  loadMore: 'Load more',
  prState: (state, number) => `PR #${number} · ${state}`,
  prNone: 'No linked PR',
  abortOperation: 'Abort',
  continueOperation: 'Continue',
  completeMerge: 'Complete merge',
  branchSelect: 'Branch',
  newBranch: 'New branch',
  branchNamePlaceholder: 'New branch name',
  createBranch: 'Create and switch',
  cancelBranch: 'Cancel',
  branchCard: 'Branches',
  deleteBranch: 'Delete',
  forceDeleteBranch: 'Force delete',
  currentBranchLabel: 'current',
  remoteBranchTag: 'remote',
  noCommits: 'No commits yet',
  moreShort: 'More',
  createPr: 'Create PR',
  baseBranchTitle: 'Base branch',
  baseShort: 'Base',
  baseAhead: (count) => `Base is ${count} commit(s) ahead`,
  baseUpToDate: 'Base is already in',
  baseMissing: 'Base branch is not fetched yet',
  baseCommits: (count) => `${count} commit(s)`,
  pullBase: 'Pull base branch',
  pullBaseFetch: 'Fetch and merge',
  pullBaseLocal: 'Merge local base only',
  viewRaw: 'Show raw output',
  hideRaw: 'Hide raw output',
  mergeFailure: (stage, reason) => {
    if (stage === 'fetch') {
      if (reason === 'auth') return 'Fetch failed: no access to the remote. Try “Merge local base only”.'
      if (reason === 'network') return 'Fetch failed: cannot reach the remote. Try “Merge local base only”.'
      return 'Fetch failed: remote is unavailable. Try “Merge local base only”.'
    }
    if (reason === 'ref-missing') return 'Merge failed: that base branch no longer exists.'
    if (reason === 'untracked-overwrite') return 'Merge failed: it would overwrite untracked files.'
    if (reason === 'identity') return 'Merge failed: git user.name/email is not configured.'
    if (reason === 'conflict') return 'Merge has conflicts: resolve them on the Changes tab.'
    return 'Merge failed. Show the raw output for details.'
  },
  mergeDegraded: (reason) =>
    `Could not fetch the latest (${reason === 'auth' ? 'no access' : reason === 'network' ? 'network' : 'remote unavailable'}); merged with the local base instead.`,
  overwriteBlocked: (count) => `Merging would overwrite ${count} untracked file(s); move or delete them first:`,
  baseFellBack: (ref) => `The selected base no longer exists; fell back to ${ref}.`,
  localTag: 'local',
  searchCommits: 'Search commits',
  commitMenu: 'More commit actions',
  viewBranches: 'Branches',
  expandCard: 'Expand',
  collapseCard: 'Collapse',
  moreRemote: 'More remote actions',
  switchTo: 'Switch',
}

export function copy(locale: string): Copy {
  return locale.toLowerCase().startsWith('zh') ? zh : en
}
