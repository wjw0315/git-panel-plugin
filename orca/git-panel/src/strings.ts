// 面板文案：跟随 Orca 的界面语言，zh* 用中文，其余英文。

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
  searchCommits: string
  generateMessage: string
  commitMenu: string
  viewBranches: string
  backToChanges: string

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
  searchCommits: '搜索提交',
  generateMessage: '生成提交信息（内置）',
  commitMenu: '更多提交方式',
  viewBranches: '分支',
  backToChanges: '返回更改',
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
  searchCommits: 'Search commits',
  generateMessage: 'Generate message (built-in)',
  commitMenu: 'More commit actions',
  viewBranches: 'Branches',
  backToChanges: 'Back to changes',
  switchTo: 'Switch',
}

export function copy(locale: string): Copy {
  return locale.toLowerCase().startsWith('zh') ? zh : en
}
