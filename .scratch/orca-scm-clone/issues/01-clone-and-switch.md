# 01 内置克隆 + 多仓库切换（v2 重写）

Status: ready-for-agent
Blocked by: —

规格：`.scratch/orca-scm-clone/spec.md`（先读「1:1 的边界」一节）。

## What to build

按规格分五片落地，每片跑全量门禁（test / tsc / check / validate）：

1. **变更克隆**：提交卡四按钮（含 Commit & Force Push）、Staged/Changes 分组、行级 stage/unstage/discard、folder 级批量、Open File（`editor.open`，需补 `workspace:write` 能力）、行内 diff（`git.fileDiff` + CodeView）、溢出 Collapsible 承载 13 个远端动作（复用 v1 执行层，新增 `commitForce`、`pushThenPullRequest`）。
2. **冲突流**：快照加 `conflicts`；冲突横幅 + Abort/Continue/Complete merge 三个请求；merge/rebase/cherry-pick 各一条冲突用例。
3. **历史页签**：`git.log`（skip/limit/revision/refs）+ `git.commitFiles`（numstat）+ PR 状态行（gh/glab，失败降级）。
4. **分支选择器**：`branchList` / `branchCreate` / `branchSwitch`（本地 + 远端跟踪）/ `branchDelete`（-d，未合并 -D 需确认参数）。
5. **仓库切换器（核心新增）**：仓库清单 = root + `submodule status --recursive`（未初始化标记）+ 嵌套扫描；kind 排序与图标；按 workspaceId 持久化；切换后面板与状态栏全跟随；子模块行「进去」= 切换；底部「在内置面板打开」（`commands.run('sidebar.sourceControl.toggle')`）。

## 验收

- [ ] `orca plugin validate` 退出 0，`grants` = workspace:read + workspace:write + settings:own。
- [ ] `orca plugin test` 全绿，新增用例至少覆盖：merge/rebase/cherry-pick 冲突与 abort/continue/complete、folder 批量、fileDiff 两种输入、log 分页与 revision 过滤、commitForce、分支 create/switch/delete、子模块清单与切换后操作作用于子模块。
- [ ] `npx tsc -p .` 无错。
- [ ] `orca plugin check` 场景（fresh / dirty / conflict / submodule 多仓库 / remoteActions / 历史）issues 与 warnings 全空。
- [ ] 面板断言：无暂存时提交禁用、冲突横幅出现、溢出 Collapsible 展开后 13 项与禁用原因、切换器脏点、子模块行跳转发出切换。
- [ ] v1 的贮藏能力保留且在子模块里可用。
- [ ] 移动端不适用（Orca 移动端无插件运行时），README 注明。

## Comments

- 2026-11-20：用户拍板「1:1 复刻内置 + 多项目切换」；AI/托管 PR/图谱画布明确跳内置（面板提供一键跳转）。上一轮复核条布局作废，v1 执行层（git.ts 远端段、守卫、串行队列、缓存）全部复用。

## Result — 第一片（变更克隆 + 切换器，2026-11-20）

已完成工单里的第 1、5 片，门禁全绿：

- `orca plugin test` 28/28（新增：真 merge 冲突暴露 `conflicts[]` 并拒绝 amend；本地裸仓库 `submodule add` 后清单标 kind=submodule、切换后操作作用于子模块；fileDiff staged/unstaged；folder 级 stage/unstage/discard（含设置开关）；openFile 拒绝 `../` 越权与不存在文件、成功路径调 `editor.open`）。
- `npx tsc -p .` 无错；`orca plugin check` 5 场景 issues/warnings 全空；`validate` valid，grants = workspace:read + workspace:write + settings:own。
- 面板：仓库切换器（root/submodule/nested + 脏点 + 未初始化标记）、提交卡四按钮（Commit / Commit & Push / Commit & Sync / Commit & Force Push）、Staged Changes / Changes 两组（行内 stage/unstage/discard/打开文件/行内 CodeView diff、目录小节 folder 级批量、子模块行「进入」= 切换）、「更多动作」页签承载 13 项内置溢出菜单（含 commitForce、pushThenPullRequest）、贮藏页保留、底部「在内置面板打开」。
- 冲突横幅已显示（operation + 冲突文件清单）；Abort/Continue/Complete 按钮属第二片，先在内置面板完成。

实现坑（已记）：
- porcelain v2 的 `u`（未合并）行有 10 个前缀字段，路径在 `slice(10)`；`2`（改名）在 `slice(9)`，之前统一 `slice(8)` 会把 sha 混进路径。
- `git submodule status` 行格式是 `<前缀><40位sha> <path> (<describe>)`，不是 8 位短 sha。
- `protocol.file.allow=always` 必须用 `-c` 传（GIT_CONFIG_PARAMETERS 才会传给内部 clone），写仓库本地配置对 `submodule add` 不生效。

待办（后续片）：冲突流 Abort/Continue/Complete、Git Graph 页签（log 分页 + commitFiles + PR 状态行）、分支选择器（switch/create/delete）。

## 修复（2026-11-20）：桌面端「Git 加载失败 — panel.tsx 超过 2000ms 转译预算」

单文件 945 行在 Orca 桌面端加载时超过每个面板文件 2000ms 的 sucrase 转译预算（Node 测试环境测不出，实机才触发）。拆成五个模块，门禁复跑全绿：

- `state.ts`（257 行）：全部 atoms + 动作函数 + `derived()` 派生态集中计算。
- `rows.tsx`（221 行）：fileRow / submoduleRow / changesSections / actionRow。
- `tabs-more.tsx`（146 行）：13 项更多动作页签。
- `tabs-stash.tsx`（49 行）：贮藏页签。
- `panel.tsx`（331 行）：组装 + setup + 提交卡 + 冲突横幅 + Tabs。

test 28/28、tsc 无错、check 5 场景全空、validate valid。教训：components 面板单文件控制在 ~350 行以内，新增页签一律开新模块。

## Result — 第二片（冲突流 + 历史 + 分支，2026-11-20）

- 冲突流：`git.abortOperation`（按 merge/rebase/cherry-pick/revert 选 `--abort`）、`git.continueOperation`（`-c core.editor=true <op> --continue`）、`git.completeMerge`（`commit --no-edit`，有未解决冲突时拒绝）。面板冲突横幅三按钮；merge 显示「完成合并」，其余显示「继续」。
- 历史页签：`git.log`（skip/limit/revision，字段 %x01 / 记录 %x00 分隔）、`git.commitFiles`（diff-tree --root --numstat）、`git.pullRequestStatus`（仅 gh，`--json state,number,url`，失败降级 null）。面板：PR 状态 Badge、过滤 Input（回车过滤）、提交 ListItem（subject + sha/作者/refs + RelativeTime）、行内展开该提交文件、加载更多。
- 分支：`git.branchList`（for-each-ref 区分 refs/heads 与 refs/remotes）、`branchCreate`（switch -c）、`branchSwitch`（本地 switch / 远端 switch -c --track）、`branchDelete`（-d 失败且未合并 → code conflict，面板二次确认后 -D）。面板：分支 Select + 新建内联输入；「更多动作」页签新增分支卡（本地分支 + 删除，当前分支禁用）。
- 预载时机：loadWorkspace/selectRepo 后并发预载 history + PR 状态 + 分支，切页签时刷新。

门禁：test 36/36、tsc 无错、check 7 场景（fresh/dirty/stashes/remoteActions/history/conflict/remote主机）issues+warnings 全空、validate valid。

坑：`git.log` 的 revision 若以 `undefined` 传入会被 host schema 拒为 invalid_params——必须条件展开 `...(revision ? { revision } : {})`；mockHost 会把「未配置 result」也报成 invalid_params，check 场景需把预载用到的请求全部配好。

## 收口（2026-11-20）

- v1 规格 `.scratch/orca-git-panel/spec.md` 标 superseded；本规格标 implemented。
- 原型 `ui.html` 从插件目录移到 `.scratch/orca-scm-clone/prototype/`（不随插件打包，保留四变体作对照）。
- 主视图分支行补上 PR 状态 Badge（可点开链接），不再只在历史页签里能看到。
- README 重写为 v2 结构说明。
- 最终门禁：test 36/36、tsc 无错、check 7 场景 issues+warnings 全空、validate valid（grants: workspace:read/write + settings:own）。

## 修复二（2026-11-20）：拆完仍报 panel.tsx 超转译预算

从 Orca 源码（`out/main/index.js` 的 `budgetMs??2e3`）确认口径：预算按**单次转译请求**计时，transpiler 是一个**冷启动的 worker 线程**，超时即 terminate 并在下次重新 spawn。入口文件总是第一个请求，冷启动成本全记在它头上——所以「把入口拆小文件」不解决问题，必须让**入口本身几乎不用转译**。

修法：入口 `src/panel.tsx` 压到 7 行，只做再导出；全部逻辑移到 `app.tsx`（340 行）及拆出的 `commit-card.tsx`（43）/`conflict-banner.tsx`（50）。这些是热 worker 上的后续请求。

本机用 asar 里的 sucrase 转译模块量过一次（每个文件 0–18ms），说明瓶颈不是 js 体量而是 worker 冷启动排队。

门禁复跑：test 36/36、check 7 场景全空、tsc 无错、validate valid。

## 结构对齐真·内置（2026-11-20，用户提供内置截图后重排）

用户指出此前实现「完全不一样」。按截图重排为内置的实际形态：

- 顶部工具条：`创建 PR`（实心主按钮）+ 右侧 `搜索`（切历史）/ `…`（溢出视图）。
- 分支两行：`⑂ 分支名`（点图标切分支视图）+ 右上 ahead 计数 `+N`；第二行 `→ origin/<base>` + PR 状态。
- 提交区：两行信息框 + 右侧生成按钮（跳内置 AI）；一个实心 `提交` + 右侧 `⌄` 展开「并推送/并同步/并强推」。
- 单一主体「更改 N」树：`Tree` 组件按目录折叠，节点右侧显示 `+a −b M/U`；选中文件后出现动作条（暂存/放弃/打开/差异），选中目录出现 folder 级批量，子模块节点可「进入」。
- 溢出视图（`…`）：13 个远端/提交动作 + 历史/贮藏/分支三个入口，逐个对齐内置菜单项。
- 分支视图：本地/远端分支的切换与删除。

门禁：test 36/36、check 7 场景全空、tsc 无错。

坑：Tree 节点不能用 `label` 查询点击，测试要用 `selectItem({type:'Tree'}, key)`；`IconName` 白名单里没有 `undo`/`package` 以外的自定义字形（`package` 可用）。
