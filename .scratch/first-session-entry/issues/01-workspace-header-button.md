# 01: 首次发起会话时的入口（工作区头部按钮）

**What to build:** 首次发起会话前（新建 workspace 页、新建智能体草稿、无 agent 的工作区）也能看到并打开 Git 面板。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] 每个工作区在工作区标题栏注册一个 Git 按钮（分支图标 + 工作树状态点）
- [x] 点击打开该工作区的 `git-panel` 面板
- [x] 工作区干净为绿点、有未提交变更为橙点、未知为灰点
- [x] 旧版本已存设置缺 `showHeaderButton` 时按默认显示
- [x] 设置页可关闭该按钮
- [x] 工作区被归档/移除后按钮随之移除
- [x] 标签显示 `Git · <仓库> (<分支>)`，脏工作树带 `*`；`Git ·` 前缀让人一眼认出这是插件入口而不是 Paseo 自带的控件
- [x] 目视确认：草稿态输入框页面上标题栏按钮可见、点击能开面板
- [x] 新建 workspace 页面的条目可点击，跳转到该项目对应工作区并打开 Git 面板（已实拍验证）

## Comments

- 2026-11-20：根因不是本插件的 bug。`addComposerPill` 契约要求 `agentId`，而 Paseo（0.16.2，`app-dist` bundle 里的 `AgentConversationPanel`）只在 `hasActiveComposer && !draft` 时渲染 composer track bar，草稿态连 Paseo 自带的 diff 统计 pill 都不画。故改走 workspace 级 `addHeaderButton`（0.15 起就有，不需升 SDK）：新增 `client/header-button.tsx`，通过 `client.paseo.workspaces.list({ subscribe: {} })` 枚举工作区，注册 id 为 `git-panel-header` 的头部按钮，`snapshotRpc` 取分支/脏状态做 tooltip 与状态点，60 秒轮询 + 工作区列表变更时重列。
- 新增设置 `showHeaderButton`（默认 true，设置页“工作区头部按钮”开关，与 `showComposerPill` 并列）。
- 回归测试 `tests/header-button.test.tsx` 9 条通过；全量 186 条通过；`tsc --noEmit` 通过。
- 已同步运行副本并 `paseo plugin reload git-panel`，插件 running。
- 2026-11-20 复核「用户看不到」的完整结论（含两次自我误判）：
  1. 探针 `hdr-render` 只证明组件被挂载，不等于可见——据此断言「只是太小」是错的。
  2. 探针 `hdr-box` 量到 `{x:818, y:9.5, width:25, height:16}`，我把它读成「按钮被挤压成 25px」也是错的：25×16 只是图标内层 View（16 图标 + 3 gap + 6 点），按钮本身连 label 完整存在。
  3. 用 `GPTEST` 重命名 label 验证时第一次失败，原因是 `refresh()` 在 300ms 后把 label 覆盖回 `<repo> (<branch>)`——临时标记必须同时打在初始注册和刷新两条路径上，否则验证无效。
  4. 最终实拍确认：按钮就在工作区标题栏右侧、`Commit` 左边，一直可见；用户没认出它，因为它长得像 Paseo 自带的分支控件。
  修正：label 加 `Git · ` 前缀（初始与刷新后都带），tooltip 保持 `Git: <root> (<branch>) [*]`。所有探针已移除（`grep -E "GPTEST|panelErrorRpc|client0|hdr-box|hdr-render"` 无残留）。
- 2026-11-19 追加「新建 workspace 页面」入口（用户实测反馈：那屏什么都没有）。该路由没有 workspaceId、没有 agent、也没有工作区标题栏，header button / composer pill 都无从挂载；改用 0.16 的 `addNewWorkspaceItem`，在 project/host/隔离方式那一行后面显示 `⎇ <项目> · 基于 <ref>`（worktree 再补 `· 新分支 <branch>` / `· 自动新建分支`；local 不再重复"本地目录"，因为旁边已有"本地"下拉）。为此把 `@getpaseo/plugin` 0.15.0 → 0.16.2，`paseo-plugin.json` requirements 同步 `>=0.16.0`。实拍验证：新建 workspace 页面出现 `⎇ JiaweiWu · 基于 master · 本地目录`（随后精简为 `基于 master`），回归测试 `tests/new-workspace-item.test.tsx` 6 条。
- 2026-11-19 再修「点击没有效果」：第一版 new-workspace 条目是纯 View+Text，没有 onPress。改用宿主控件 `Action`（`@getpaseo/plugin/client/ui`），点击时用 `client.openPanel("git-panel", { workspaceId })` 打开面板。workspaceId 的来源：`client.paseo.workspaces.list({})` 找 `projectId` 相同的工作区，按 `activityAt` 降序取第一个，跳过 `archivingAt`/`internal`；30 秒模块级缓存避免每次进页面都拉 67 条。找不到可用工作区时按钮 disabled 并在标题里说明原因。实拍验证：新建 workspace 页显示 `⎇ git-panel-plugin · 基于 origin…`，点击后跳到「功能开发」工作区并打开 `Git` 面板（`.scratch/first-session-entry/new-workspace-entry-clicked-20261119.png`）。回归：`pickWorkspaceForProject` 3 条新用例，全量 195 条通过。
- 仍未做 `addComposerItem`（0.16）：草稿态确实会渲染，但 item 拿不到 workspaceId/agentId，无法可靠打开面板；也未做 `addWorkspaceRowBadgeItem`（0.16）：徽标组件没有 onPress，只能显示状态。
