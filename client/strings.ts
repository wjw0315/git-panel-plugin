import { defineTranslations, useTranslation } from "@getpaseo/plugin/client";

const localeOnly = defineTranslations({ resources: { en: { _: "" } } });

export interface Strings {
  git: string;
  overview: string;
  changes: string;
  files: string;
  loading: string;
  refresh: string;
  fetch: string;
  pull: string;
  push: string;
  publish: string;
  branches: string;
  tags: string;
  noRepos: string;
  workspaceUnavailable: string;
  workspaceUnavailableHint: string;
  notGitRepo: string;
  selectRepo: string;
  workspaceRepo: string;
  nestedRepo: string;
  clean: string;
  dirty: string;
  ahead: string;
  behind: string;
  noUpstream: string;
  staged: string;
  modified: string;
  untracked: string;
  conflicted: string;
  deleted: string;
  renamed: string;
  typechange: string;
  noChanges: string;
  stageAll: string;
  unstageAll: string;
  stage: string;
  unstage: string;
  discard: string;
  discardConfirm: string;
  discardAllConfirm: string;
  commitMessage: string;
  commit: string;
  amend: string;
  amendHint: string;
  lastCommitMessage: string;
  commitEmpty: string;
  commitDone: string;
  stash: string;
  stashPush: string;
  stashMessage: string;
  stashList: string;
  stashEmpty: string;
  stashApply: string;
  stashPop: string;
  stashDrop: string;
  history: string;
  search: string;
  searchPlaceholder: string;
  loadMore: string;
  noCommits: string;
  changedFiles: string;
  insertions: string;
  deletions: string;
  commitDetail: string;
  author: string;
  date: string;
  parents: string;
  checkout: string;
  createBranch: string;
  branchName: string;
  from: string;
  deleteBranch: string;
  reset: string;
  resetSoft: string;
  resetMixed: string;
  resetHard: string;
  resetConfirm: string;
  revert: string;
  revertConfirm: string;
  tagCreate: string;
  tagName: string;
  tagMessage: string;
  tagDelete: string;
  tagConfirm: string;
  copyHash: string;
  copyMessage: string;
  copied: string;
  diff: string;
  unified: string;
  split: string;
  expandAll: string;
  collapse: string;
  binaryFile: string;
  imageFile: string;
  fileTooLarge: string;
  noPreview: string;
  panelCrashed: string;
  panelCrashedHint: string;
  save: string;
  saving: string;
  saved: string;
  unsaved: string;
  saveFailed: string;
  fileChanged: string;
  reload: string;
  keepDraft: string;
  discardDraft: string;
  editorUnavailable: string;
  readOnly: string;
  editFile: string;
  cancel: string;
  close: string;
  back: string;
  confirm: string;
  delete: string;
  settings: string;
  showPill: string;
  showPillHint: string;
  defaultDiff: string;
  defaultDiffHint: string;
  changesView: string;
  changesViewHint: string;
  refreshInterval: string;
  refreshIntervalHint: string;
  allowEdit: string;
  allowEditHint: string;
  autoSave: string;
  autoSaveHint: string;
  syntaxHighlight: string;
  syntaxHighlightHint: string;
  filesFollowRepo: string;
  filesFollowRepoHint: string;
  flat: string;
  tree: string;
  off: string;
  seconds: string;
  operationFailed: string;
  retry: string;
  repoRoot: string;
  branch: string;
  noBranches: string;
  noTags: string;
  local: string;
  remote: string;
  loadingDiff: string;
  lines: string;
  file: string;
  directory: string;
  parent: string;
}

const en: Strings = {
  git: "Git",
  overview: "Overview",
  changes: "Changes",
  files: "Files",
  loading: "Loading…",
  refresh: "Refresh",
  fetch: "Fetch",
  pull: "Pull",
  push: "Push",
  publish: "Publish",
  branches: "Branches",
  tags: "Tags",
  noRepos: "No Git repository found in this workspace",
  workspaceUnavailable: "Workspace not loaded",
  workspaceUnavailableHint:
    "This tab belongs to a workspace that is not loaded on the selected host. Select the workspace in the sidebar, or check the host connection.",
  notGitRepo: "This folder is not a Git repository",
  selectRepo: "Switch repository",
  workspaceRepo: "Workspace",
  nestedRepo: "Nested",
  clean: "Clean",
  dirty: "Uncommitted changes",
  ahead: "ahead",
  behind: "behind",
  noUpstream: "No upstream",
  staged: "Staged",
  modified: "Modified",
  untracked: "Untracked",
  conflicted: "Conflicted",
  deleted: "Deleted",
  renamed: "Renamed",
  typechange: "Type changed",
  noChanges: "Working tree clean",
  stageAll: "Stage all",
  unstageAll: "Unstage all",
  stage: "Stage",
  unstage: "Unstage",
  discard: "Discard",
  discardConfirm: "Discard changes in this file? This cannot be undone.",
  discardAllConfirm: "Discard all unstaged and untracked changes? This cannot be undone.",
  commitMessage: "Commit message",
  commit: "Commit",
  amend: "Amend",
  amendHint: "Replace the previous commit",
  lastCommitMessage: "Last commit message",
  commitEmpty: "Write a commit message first",
  commitDone: "Commit created",
  stash: "Stash",
  stashPush: "Stash changes",
  stashMessage: "Optional stash message",
  stashList: "Stashes",
  stashEmpty: "No stashes",
  stashApply: "Apply",
  stashPop: "Pop",
  stashDrop: "Drop",
  history: "History",
  search: "Search",
  searchPlaceholder: "Message or hash prefix",
  loadMore: "Load more",
  noCommits: "No commits",
  changedFiles: "Changed files",
  insertions: "insertions",
  deletions: "deletions",
  commitDetail: "Commit",
  author: "Author",
  date: "Date",
  parents: "Parents",
  checkout: "Checkout",
  createBranch: "Create branch",
  branchName: "New branch name",
  from: "from",
  deleteBranch: "Delete branch",
  reset: "Reset",
  resetSoft: "Soft",
  resetMixed: "Mixed",
  resetHard: "Hard",
  resetConfirm: "Reset the current branch to this commit? Hard reset discards changes.",
  revert: "Revert",
  revertConfirm: "Create a commit that reverts this commit?",
  tagCreate: "Create tag",
  tagName: "Tag name",
  tagMessage: "Optional annotation",
  tagDelete: "Delete tag",
  tagConfirm: "Delete this tag?",
  copyHash: "Copy hash",
  copyMessage: "Copy message",
  copied: "Copied",
  diff: "Diff",
  unified: "Unified",
  split: "Split",
  expandAll: "Full context",
  collapse: "Collapse",
  binaryFile: "Binary file",
  imageFile: "Image",
  fileTooLarge: "File is too large to preview",
  noPreview: "No preview available",
  panelCrashed: "This panel hit an error",
  panelCrashedHint: "Retry re-renders the panel; the details were written to the plugin log.",
  save: "Save",
  saving: "Saving…",
  saved: "Saved",
  unsaved: "Unsaved",
  saveFailed: "Save failed",
  fileChanged: "The file changed on disk; reload before saving",
  reload: "Reload",
  keepDraft: "Keep draft",
  discardDraft: "Discard draft",
  editorUnavailable: "Code editor unavailable; using the plain text editor",
  readOnly: "Read-only",
  editFile: "Edit",
  cancel: "Cancel",
  close: "Close",
  back: "Back",
  confirm: "Confirm",
  delete: "Delete",
  settings: "Git panel",
  showPill: "Composer branch marker",
  showPillHint: "Show <repo> (<branch>) on each agent's composer.",
  defaultDiff: "Default diff view",
  defaultDiffHint: "Layout new diffs start with.",
  changesView: "Changes list",
  changesViewHint: "Flat rows or a directory tree.",
  refreshInterval: "Auto refresh",
  refreshIntervalHint: "How often the panel polls git status.",
  allowEdit: "Edit files",
  allowEditHint: "Allow saving config and documentation files from the Files tab.",
  autoSave: "Auto save",
  autoSaveHint: "Save the draft 1.5 seconds after typing stops. ⌘S always saves; a file changed on disk is never overwritten.",
  syntaxHighlight: "Syntax highlighting",
  syntaxHighlightHint: "Highlight the grammar while editing. Turn off for very large files.",
  filesFollowRepo: "Files follow repository",
  filesFollowRepoHint: "When off, Files always starts at the workspace directory; when on, it follows the selected repository.",
  flat: "Flat",
  tree: "Tree",
  off: "Off",
  seconds: "s",
  operationFailed: "Operation failed",
  retry: "Retry",
  repoRoot: "Repository",
  branch: "Branch",
  noBranches: "No branches",
  noTags: "No tags",
  local: "Local",
  remote: "Remote",
  loadingDiff: "Loading diff…",
  lines: "lines",
  file: "File",
  directory: "Directory",
  parent: "Parent",
};

const zh: Strings = {
  git: "Git",
  overview: "总览",
  changes: "变更",
  files: "文件",
  loading: "加载中…",
  refresh: "刷新",
  fetch: "获取",
  pull: "拉取",
  push: "推送",
  publish: "发布分支",
  branches: "分支",
  tags: "标签",
  noRepos: "当前工作区没有找到 Git 仓库",
  workspaceUnavailable: "工作区尚未加载",
  workspaceUnavailableHint:
    "这个标签页所属的工作区没有在当前主机加载。请在左侧切换到该工作区，或检查主机连接。",
  notGitRepo: "这个目录不是 Git 仓库",
  selectRepo: "切换仓库",
  workspaceRepo: "工作区",
  nestedRepo: "嵌套",
  clean: "干净",
  dirty: "有未提交变更",
  ahead: "领先",
  behind: "落后",
  noUpstream: "未设置上游",
  staged: "已暂存",
  modified: "已修改",
  untracked: "未跟踪",
  conflicted: "冲突",
  deleted: "已删除",
  renamed: "重命名",
  typechange: "类型变更",
  noChanges: "工作区干净",
  stageAll: "全部暂存",
  unstageAll: "全部取消暂存",
  stage: "暂存",
  unstage: "取消暂存",
  discard: "放弃",
  discardConfirm: "放弃这个文件的改动？此操作无法撤销。",
  discardAllConfirm: "放弃全部未暂存与未跟踪的改动？此操作无法撤销。",
  commitMessage: "提交信息",
  commit: "提交",
  amend: "修补",
  amendHint: "替换上一条提交",
  lastCommitMessage: "上一条提交信息",
  commitEmpty: "请先填写提交信息",
  commitDone: "提交成功",
  stash: "贮藏",
  stashPush: "贮藏改动",
  stashMessage: "可选的贮藏说明",
  stashList: "贮藏记录",
  stashEmpty: "暂无贮藏",
  stashApply: "应用",
  stashPop: "弹出",
  stashDrop: "删除",
  history: "提交历史",
  search: "搜索",
  searchPlaceholder: "提交信息或哈希前缀",
  loadMore: "加载更多",
  noCommits: "暂无提交",
  changedFiles: "变更文件",
  insertions: "新增",
  deletions: "删除",
  commitDetail: "提交详情",
  author: "作者",
  date: "日期",
  parents: "父提交",
  checkout: "切换",
  createBranch: "新建分支",
  branchName: "新分支名",
  from: "基于",
  deleteBranch: "删除分支",
  reset: "重置",
  resetSoft: "软重置",
  resetMixed: "混合重置",
  resetHard: "硬重置",
  resetConfirm: "把当前分支重置到这个提交？硬重置会丢弃改动。",
  revert: "还原提交",
  revertConfirm: "创建一个还原这次提交的新提交？",
  tagCreate: "新建标签",
  tagName: "标签名",
  tagMessage: "可选的附注",
  tagDelete: "删除标签",
  tagConfirm: "删除这个标签？",
  copyHash: "复制哈希",
  copyMessage: "复制信息",
  copied: "已复制",
  diff: "差异",
  unified: "统一",
  split: "对照",
  expandAll: "全部上下文",
  collapse: "收起",
  binaryFile: "二进制文件",
  imageFile: "图片",
  fileTooLarge: "文件太大，无法预览",
  noPreview: "没有可用的预览",
  panelCrashed: "面板渲染出错",
  panelCrashedHint: "点「重试」重新渲染面板；错误详情已写入插件日志。",
  save: "保存",
  saving: "保存中…",
  saved: "已保存",
  unsaved: "未保存",
  saveFailed: "保存失败",
  fileChanged: "文件在编辑期间被改动，请重新加载后再保存",
  reload: "重新加载",
  keepDraft: "保留草稿",
  discardDraft: "放弃草稿",
  editorUnavailable: "代码编辑器不可用，已切换为纯文本编辑器",
  readOnly: "只读",
  editFile: "编辑",
  cancel: "取消",
  close: "关闭",
  back: "返回",
  confirm: "确认",
  delete: "删除",
  settings: "Git 面板",
  showPill: "输入框分支标记",
  showPillHint: "在每个智能体输入框上方显示 <仓库> (<分支>)。",
  defaultDiff: "默认差异视图",
  defaultDiffHint: "新打开的差异使用的布局。",
  changesView: "变更列表",
  changesViewHint: "平铺行或按目录折叠的树形。",
  refreshInterval: "自动刷新",
  refreshIntervalHint: "面板轮询 git 状态的间隔。",
  allowEdit: "编辑文件",
  allowEditHint: "允许在文件页保存配置与文档类文件。",
  autoSave: "自动保存",
  autoSaveHint: "停止输入 1.5 秒后自动保存；⌘S 始终可保存；磁盘上的文件被改动时不会覆盖。",
  syntaxHighlight: "语法高亮",
  syntaxHighlightHint: "编辑时按扩展名着色；超大文件可关闭以降低开销。",
  filesFollowRepo: "文件浏览跟随仓库",
  filesFollowRepoHint: "关闭时文件页始终从工作区目录开始；开启后跟随所选仓库。",
  flat: "平铺",
  tree: "树形",
  off: "关闭",
  seconds: "秒",
  operationFailed: "操作失败",
  retry: "重试",
  repoRoot: "仓库",
  branch: "分支",
  noBranches: "暂无分支",
  noTags: "暂无标签",
  local: "本地",
  remote: "远程",
  loadingDiff: "正在加载差异…",
  lines: "行",
  file: "文件",
  directory: "目录",
  parent: "上级",
};

export function useLocale(): string {
  return useTranslation(localeOnly).locale;
}

export function useStrings(): Strings {
  const { locale } = useTranslation(localeOnly);
  return locale.toLowerCase().startsWith("zh") ? zh : en;
}

export function isChinese(locale: string): boolean {
  return locale.toLowerCase().startsWith("zh");
}
