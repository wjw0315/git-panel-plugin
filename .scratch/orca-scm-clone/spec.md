# Orca Git 面板 v2：1:1 复刻内置源代码控制的日常交互面 + 多仓库/子模块切换

Status: implemented（第一、二片已落地，见 issues/01 的 Result 段；AI/托管 PR/图谱按边界跳内置）

上游规格：`.scratch/orca-git-panel/spec.md`（v1，差分定位）。本规格是 v2 重写方向：不再做"只补缺口"，而是把内置 Source Control 的**日常交互面**在插件里复刻到位，唯一新增能力是**同一工作区内多仓库/主子模块切换**。

## 问题陈述

用户工作区里存在「主仓库 + 子模块/嵌套独立仓库」的项目结构。Orca 内置的 Source Control 只作用于工作区对应的那一个仓库，切换到子模块要先换工作区，或在终端里手动 `cd` + `git`。此前插件按"补缺口"做的自有布局（复核条 + 三个页签）与内置面板的肌肉记忆不一致，用户觉得"不太好用"：动作位置、分组方式、交互习惯都要重新学。

## 方案

把面板重做成**内置 Source Control 的克隆**：同样的信息架构（提交框在顶、Staged/Changes 两组、溢出菜单放全部远端动作、Git Graph 页签）、同样的交互（行内 stage/unstage/discard、folder 级批量、冲突横幅、进行中操作的中止/完成），并在面板顶部加一个**仓库切换器**：列出主仓库、`.gitmodules` 子模块、嵌套独立仓库，切换后整个面板（状态、提交、远端、历史、状态栏）都作用于所选仓库。

内置面板里依赖 Orca 自身基础设施的部分（AI 文本生成、托管 PR 编辑器、图谱画布）不在插件里重做，提供「在内置面板打开」的一键跳转。

## 1:1 的边界（先读这个）

**复刻**（与内置逐项对齐，含文案语义）：

- 提交区：提交信息框 + `Commit` / `Commit & Push` / `Commit & Sync` / `Commit & Force Push`；空暂存、空信息的禁用语义（"Nothing staged"、"Stage at least one file to commit"、"Enter a commit message"）。
- 分组：`Staged Changes` / `Changes`（已暂存在前，顺序可设置）；每行：文件路径 + `+/−`、stage/unstage、discard（未跟踪文件删除需确认文案）、**Open File**；folder 级 Stage folder / Unstage folder / Discard folder；Stage all / Unstage all / Discard all。
- 子模块行：显示子模块改动摘要；"Stage inside submodule" 直接跳到该子模块（与切换器联动）。
- 冲突横幅：Merge/Rebase/Cherry-pick/Revert in progress + 未解决冲突列表；`Abort`（`merge --abort` / `rebase --abort` / `cherry-pick --abort` / `revert --abort`）、`Complete merge`（`commit --no-edit`）、`--continue`。
- 溢出菜单（More commit and remote actions）：Commit、Commit & Push、Commit & Sync、Push、Force Push（`--force-with-lease`）、Create PR、Push then PR、Pull（`--no-rebase`）、Fast-forward（`--ff-only`）、Sync、Rebase from Base（基准分支可配，默认上游/远端默认分支）、Fetch（`--prune`）、Publish Branch（`push -u origin HEAD`）。菜单项的禁用态与原因文案对齐（"Branch is up to date"、"Not published"、"Stash first"、"Commit changes first"）。
- Git Graph 页签：提交列表（sha、subject、作者、相对时间）、按分支/哈希过滤、加载更多、每条提交的变更文件清单；分支对比（ahead/behind、PR 状态行）。
- 分支选择器：当前分支展示、切换（checkout 本地/远端分支）、新建分支、删除本地分支。
- 状态徽标：ahead/behind、干净/有改动。

**不复刻，跳内置**（点击 = `commands.run('sidebar.sourceControl.toggle')` 打开内置面板）：

- AI：生成提交信息、生成 PR 详情、Fix Commit/Push Failure With AI、Resolve Conflicts With AI。
- 托管评审：PR/MR 创建编辑器、堆叠 PR、Bitbucket/GitLab 托管线、linked review 分支推送。
- 图谱画布（提交图渲染）：插件内是文本提交列表，图形谱跳内置。

**新增（本规格的核心价值）**：

- 仓库切换器：主仓库 + `git submodule status` 的子模块 + 嵌套独立仓库（沿用 v1 的扫描：深度 3、上限 50）；显示 `名称 分支 脏点`；选择持久化（按工作区）；切换后面板全部动作与状态栏跟随；子模块行点"进去"就是切到它。

## 用户故事

1. 作为面板使用者，我想看到和内置面板一样的分组（Staged Changes / Changes），以便不用重新学布局。
2. 作为面板使用者，我想在提交框下面直接选 Commit / Commit & Push / Commit & Sync / Commit & Force Push，以便一步完成常用的四种收尾。
3. 作为面板使用者，我想在没暂存时看到"Nothing staged"、没写信息时提交禁用，以便和内置面板的反馈一致。
4. 作为面板使用者，我想逐文件 stage / unstage，以便拼一次精确的提交。
5. 作为面板使用者，我想逐文件夹 stage / unstage / discard，以便处理大目录改动。
6. 作为面板使用者，我想全量 Stage all / Unstage all / Discard all，以便一键清场。
7. 作为面板使用者，我想丢弃未跟踪文件前看到"将永久删除"的确认，以便不误删新文件。
8. 作为面板使用者，我想点文件名用 Orca 编辑器打开它（Open File），以便马上改代码。
9. 作为面板使用者，我想点行内差异图标展开统一 diff（只读），以便不离开面板看改动。
10. 作为面板使用者，我想看到子模块行的改动摘要，以便知道子模块动了什么。
11. 作为面板使用者，我想点"Stage inside submodule"直接把面板切到那个子模块，以便在子模块里继续暂存。
12. 作为面板使用者，我想在合并进行中看到 Merge in progress 横幅与未解决冲突清单，以便知道卡在哪。
13. 作为面板使用者，我想一键 Abort merge / Abort rebase / Abort cherry-pick / Abort revert，以便回到操作前。
14. 作为面板使用者，我想在解决完冲突后点 Complete merge 完成提交，以便不用去终端敲 `git commit --no-edit`。
15. 作为面板使用者，我想在 rebase/cherry-pick 冲突解决后点 Continue，以便继续剩下的提交。
16. 作为面板使用者，我想从溢出菜单跑全部 13 个远端动作（对齐内置菜单），以便不必记住两套菜单。
17. 作为面板使用者，我想每个远端动作在不可用时给出与内置一致的原因（Branch is up to date / Not published / Stash first / Commit changes first），以便知道下一步做什么。
18. 作为面板使用者，我想 Force Push 走 `--force-with-lease` 并二次确认，以便不裸覆盖远端。
19. 作为面板使用者，我想创建 PR 时优先用 gh/glab，没装 CLI 就开 compare 页，以便两条路都能走。
20. 作为面板使用者，我想先 Push 再创建 PR 一气呵成，以便省一次点击。
21. 作为面板使用者，我想在 Git Graph 页签看到提交列表（sha、subject、作者、相对时间），以便快速回溯。
22. 作为面板使用者，我想按分支名或哈希前缀过滤提交，以便定位某条提交。
23. 作为面板使用者，我想分页加载更多提交，以便大仓库不卡。
24. 作为面板使用者，我想点开一条提交看它的变更文件与 `+/−`，以便复查这次提交动了什么。
25. 作为面板使用者，我想看到当前分支对基准分支的 ahead/behind，以便知道要不要推/拉。
26. 作为面板使用者，我想看到该分支的 PR 状态行（gh/glab 可用时），以便不用去网页查。
27. 作为面板使用者，我想在分支选择器里切换到本地或远端分支，以便不开终端。
28. 作为面板使用者，我想从当前 HEAD 新建分支并立即切换，以便开始新工作。
29. 作为面板使用者，我想删除已合并的本地分支（未合并需确认），以便清理分支列表。
30. 作为多仓库项目使用者，我想在面板顶部切换 主仓库 / 子模块 / 嵌套仓库，以便一个面板管完整项目。
31. 作为多仓库项目使用者，我想切换器里看到每个仓库的分支与脏点，以便知道哪个仓库有未提交改动。
32. 作为多仓库项目使用者，我想上次选的仓库被记住（按工作区），以便重开面板不用重选。
33. 作为多仓库项目使用者，我想切换仓库后状态栏立即跟随所选仓库，以便状态栏与面板永远说同一件事。
34. 作为多仓库项目使用者，我想在非主仓库里执行全部动作（提交/远端/历史/分支），以便子模块的工作流与主仓库完全一致。
35. 作为面板使用者，我想点「在内置面板打开」跳到 Orca 的 Source Control，以便需要 AI 生成提交信息或 PR 编辑器时无缝切换。
36. 作为面板使用者，我想面板跟随亮暗主题与中英文，以便与 Orca 一致。
37. 作为面板使用者，我想 git 报错（锁、冲突、远端拒绝）时看到可读的中文错误与原因，以便自己判断怎么办。
38. 作为面板使用者，我想大仓库上操作有超时与输出上限，以便面板不假死。
39. 作为面板使用者，我想在 SSH/远端主机的工作区看到明确"不支持"，以便知道去内置面板。
40. 作为面板维护者，我想零 npm 依赖、不提交 node_modules，以便分发与加载简单。

## 实现决策

**总体**：沿用 v1 的骨架（`trusted-worker` + components 面板 + `git.*` 请求契约 + argv 执行器 + 串行写队列 + 1.2s 快照缓存）。v2 改的是面板信息架构与请求面，不改执行层的安全约定。

**能力与贡献点**：能力新增 `workspace:write`（`editor.open` 打开文件）；贡献点新增：分支选择器相关命令、Git Graph 页签（同一面板内第二个 Tab）、「在内置面板打开」命令（`commands.run('sidebar.sourceControl.toggle')`）。状态栏项保留并跟随所选仓库。

**仓库切换器（新增核心）**：

- 仓库清单 = 工作区根仓库 + `git submodule status --recursive`（含未初始化的 `-` 前缀条目，显示"未初始化"）+ 嵌套独立仓库扫描（v1 的 `findRepoRoots`）。
- 每项：`{ root, name, kind: 'root' | 'submodule' | 'nested', branch, dirty }`；`kind` 决定图标与排序（root → submodule → nested，按路径）。
- 选择按 `workspaceId` 持久化；切换 = 重拉快照/贮藏/提交历史，清空勾选与确认态。
- 子模块行的「Stage inside submodule」= `selectRepo(该子模块)`。

**快照扩展**：在 v1 的 `GitSnapshot` 上增加 `conflicts: string[]`（porcelain v2 的 `u` 条目路径）与 `operation` 细化（已有 merge/rebase/cherry-pick/revert；rebase 再分 `rebase-merge`/`rebase-apply` 不需要，横幅文案统一 "Rebase in progress"）。溢出菜单的 13 个动作映射保持 v1 已实现的请求名，新增：`git.commitForce`（commit 后 `--force-with-lease` push）、`git.pushThenPullRequest`（push 成功后建 PR）、`git.abortOperation`（按当前 operation 选 `--abort` 子命令）、`git.continueOperation`（`rebase --continue` / `cherry-pick --continue` / `revert --continue`）、`git.completeMerge`（`commit --no-edit`）。

**行内差异（新增）**：`git.fileDiff` 请求返回 `git diff [--cached] -- <path>` 的统一 diff 文本（上限 200KB，超出截断标记）；面板用 `CodeView`（行号开、wrap 关）只读展示，行内展开/收起。不做双栏与语法高亮（组件目录没有；需要时跳内置）。

**Open File（新增）**：worker 校验路径相对所选仓库且存在，`editor.open({ workspaceId, path: 绝对路径 })`；需要 `workspace:write`。

**Git Graph 页签（新增，列表形态）**：`git.log` 请求：`{ repoRoot, revision?, skip, limit }` → `{ commits: [{ sha, subject, author, at, refs }], hasMore }`（`--skip/--max-count`、`--pretty` 自定义分隔符解析）；`git.commitFiles` 请求：某提交的 `diff-tree --numstat`。PR 状态行：`gh pr view --json state,number,url` / `glab mr view`，失败静默降级为无状态行。

**分支选择器（新增）**：`git.branchList`（本地 + 远端 + HEAD 标记 + ahead/behind）、`git.branchCreate`（`switch -c`）、`git.branchSwitch`（`switch` 本地 / `switch -c -t` 远端跟踪）、`git.branchDelete`（`branch -d`，未合并改 `-D` 需面板二次确认）。溢出菜单不动，分支操作集中在选择器。

**溢出菜单形态**：Orca 组件目录没有菜单组件；用「更多动作」Collapsible（默认收起）承载 13 项，每项一行：动作名 + 状态描述 + 按钮，danger 项（Force Push）二次确认。语义与内置溢出菜单一一对应。

**面板信息架构（对齐内置）**：

```
仓库切换器（Select，含脏点标记）
分支行：分支选择器 | ahead/behind | PR 状态
提交卡：信息框（多行） | [Commit] [Commit & Push] [Commit & Sync] [Commit & Force Push]
冲突横幅（有操作进行中或未解决冲突时）
Tab 变更：Staged Changes 组 / Changes 组（含子模块行、folder 级动作、行内 diff、Open File）
Tab 历史：过滤器 | 提交列表（点开看文件）
更多动作（Collapsible）：13 个远端动作
贮藏组：保留 v1 能力（内置没有，是我们的净增值）
「在内置面板打开」：底部一行 ghost 按钮
```

**文案**：沿用内置语义逐条对译（"Nothing staged"、"Stash first"、"Branch is up to date"、"Not published"…），中英双语随 `orca.locale`。

## Testing Decisions

好测试 = 只测外部行为：worker 请求名/输入/返回形状，与真实 git 仓库的最终状态；面板断言"画出了什么"（分组标题、行、禁用态、横幅），不断言样式与内部函数。

**seams（沿用 v1 的两个，不新建）**：

1. **worker 请求处理器**（主 seam）：`mountWorker` + 临时 git 仓库。v2 新增用例全部在这一层造状态：
   - 冲突：两个分支改同一行 → merge 冲突 → 断言 `conflicts` 与 `operation`；`abortOperation` 回到干净；手工标记冲突解决后 `completeMerge` 产生合并提交。rebase/cherry-pick 冲突同理各一条。
   - folder 级 stage/unstage/discard：目录多文件一次断言。
   - `fileDiff`：暂存/未暂存两种输入的 diff 文本包含 `+++`/`---` 行。
   - `log`/`commitFiles`：分页（skip/limit）、revision 过滤、refs 标记。
   - `commitForce`：改写已推提交后走 `--force-with-lease` 成功；`pushThenPullRequest` 在无 CLI 时返回链接。
   - 分支：create/switch（本地与远端跟踪）/delete（已合并 -d 成功、未合并 -D 需显式确认参数）。
   - 子模块：`git submodule add` 本地裸仓库作为子模块 → 仓库清单 kind 标记正确、切换后操作作用于子模块。
2. **面板渲染**：`mount` + `mockRequests`；断言内置克隆的关键状态：无暂存禁用、冲突横幅与 Abort/Complete、子模块行跳转（发出 selectRepo）、diff 展开（CodeView 内容）、溢出 Collapsible 展开后的 13 行与禁用原因、仓库切换器选项与脏点。

**要测的模块**：worker（全部新请求）、panel（克隆布局与切换器）、git 执行层不单独测（行为都在 seam 1 覆盖）。

**先例**：v1 的 `src/worker.test.ts`（临时仓库 + 真断言）与 `src/panel.test.tsx`（mockRequests + tree 正则）。

**门禁**：`orca plugin test` + `npx tsc -p .` + `orca plugin check`（场景：fresh / dirty / conflict / submodule 多仓库 / remoteActions / 历史）+ `orca plugin validate`。

## Out of Scope

- AI 能力（生成提交信息、PR 详情、修复失败、解决冲突）——跳内置。
- 托管 PR/MR 编辑器、堆叠 PR、Bitbucket/GitLab 托管集成与 linked review 推送——跳内置。
- 图谱画布渲染（图形提交图）——插件内是文本提交列表。
- 双栏 diff、语法高亮 diff、冲突编辑器——`CodeView` 只读统一 diff，编辑冲突跳内置/编辑器。
- SSH/远端主机工作区上的 git 操作（明确提示不支持）。
- tag 创建/删除、reset、cherry-pick/revert 主动发起（内置溢出菜单也没有这些；保留 v1 已有的 revert/reset？——**不保留**，v2 严格对齐内置溢出菜单 + 分支选择器，避免再长出自有功能）。
- 移动端（Orca 移动端无插件运行时）。

## Further Notes

- **与内置面板的关系**：这是刻意的功能重叠。存在价值 = 多仓库/子模块切换 + 单面板全流程；AI 与托管评审继续用内置（面板底部一键跳转）。若 Orca 未来给内置 SCM 加多仓库，本插件的价值就只剩差分，届时应重新评估去留。
- 上一轮的「复核条」布局作废；v1 的远端动作执行层（`src/git.ts` 远端段、守卫、串行队列）全部保留复用。
- 测试断言注意（沿用 v1 记录）：Collapsible title / ListItem description 是 props，finder 的 text 看不到，用 `view.tree()` 正则断言；带 onPress 的 ListItem 内不能放 IconButton（行内 stage/discard 按钮只放在不可勾选的行，可勾选行走勾选条或行内展开）。
- 工作量大约是 v1 的 2–3 倍（冲突流、log 分页、分支操作、子模块联动都是新面）；建议按 变更克隆 → 冲突流 → 历史 → 分支 → 子模块联动 的顺序分片落地，每片跑全量门禁。
