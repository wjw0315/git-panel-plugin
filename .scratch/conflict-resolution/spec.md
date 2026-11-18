# 冲突解决：在面板内解决合并/变基冲突并完成操作

Status: ready-for-agent

## 问题陈述

用户在面板里发起合并或变基，git 撞上冲突后，面板只停在一句话：「冲突：1」。冲突文件能被看到、也能点开，但**到此为止**——不能把文件标记为已解决，也没有「继续合并 / 继续变基」的按钮，唯一的出路是「中止」，或者切回终端手敲 `git add` + `git merge --continue`。

于是「更新分支」这条链路在冲突处断成两截：面板负责发起，终端负责收尾。更糟的是冲突文件点开是空白的（diff 是 combined diff 格式，解析不出 hunk），用户连「哪几行冲突」都要靠外部编辑器才能知道；而冲突行上的「丢弃」按钮对 unmerged 路径会直接报错。

## 方案

把冲突态做成一条能走完的闭环，仍在面板内：

1. 冲突文件以**置顶清单**呈现，每行三个动作：`标记已解决`（保留工作区里已手工合并好的内容）、`保留当前分支`、`保留来源分支`（变基态下标签自动翻转成「保留目标分支 / 保留我的提交」）。
2. 冲突清空后，`继续合并 / 继续变基` 按钮点亮，一键完成操作并产生提交；仍有未解决文件时按钮禁用并显示剩余数量。
3. `中止` 保持原位（既有能力），随时可退回操作前状态。
4. 入口两处：变更视图底部的「冲突 N」行变成可点击入口；「更新分支」对话框的进行中态直接内嵌同一份解决清单。
5. 冲突文件的 diff 不再空白——按工作区全文（含 `<<<<<<<` 冲突标记）呈现，让用户先看清再决定。

## 用户故事

1. 作为面板使用者，我想在合并撞冲突后直接看到所有冲突文件的清单，以便不用去终端 `git status` 就知道要处理哪些文件。
2. 作为面板使用者，我想对每个冲突文件点一下「标记已解决」，以便在外部编辑器合并完成后告诉 git 这个文件处理好了。
3. 作为面板使用者，我想一键「保留当前分支」这个版本，以便在整文件级别直接选我方，不必手工删冲突标记。
4. 作为面板使用者，我想一键「保留来源分支」这个版本，以便在整文件级别直接选对方。
5. 作为面板使用者，我想在变基进行中时看到「保留目标分支 / 保留我的提交」而不是「我方/对方」，以便不会因为 git 的 ours/theirs 语义反转而保留错的一侧。
6. 作为面板使用者，我想在中止合并过程中看到当前还剩几个未解决文件，以便判断离「继续」还有多远。
7. 作为面板使用者，我想在所有冲突清空后点「继续合并」一键完成合并，以便不必回终端敲 `merge --continue`。
8. 作为面板使用者，我想在变基冲突全部解决后点「继续变基」让后续提交继续应用，以便一口气完成整个变基。
9. 作为面板使用者，我想在还有未解决文件时「继续」按钮保持禁用并告诉我原因，以便避免点了报错。
10. 作为面板使用者，我想在服务端拦下「带未解决冲突的继续」时收到再明确不过的错误，以便知道先去解决哪个文件。
11. 作为面板使用者，我想「继续」成功后对话框自动关闭、提交历史与 ahead/behind 刷新，以便立刻确认结果。
12. 作为面板使用者，我想「继续」失败（例如变基后提交变空）时看到 git 的原始错误，以便知道这不是面板的 bug。
13. 作为面板使用者，我想在冲突清单里点文件名就能看该文件的冲突内容，以便不用切到编辑器就知道冲突在哪几行。
14. 作为面板使用者，我想冲突文件的 diff 显示 `<<<<<<<`、`=======`、`>>>>>>>` 这些标记，以便清楚分辨双方内容。
15. 作为面板使用者，我想冲突文件的行上不再出现会报错的「丢弃」按钮，以便不被无效操作误导。
16. 作为面板使用者，我想在变更视图底部「冲突 N」那一行直接进入解决界面，以便从最显眼的提示处出发。
17. 作为面板使用者，我想在「更新分支」对话框的进行中态里就地解决冲突，以便发起和收尾在同一个地方完成。
18. 作为面板使用者，我想在冲突中途关掉面板、之后再从「冲突 N」入口回到同一状态继续处理，以便中断处理不会丢上下文。
19. 作为面板使用者，我想解决动作支持多选批量执行，以便一次标记多个文件。
20. 作为面板使用者，我想在任何时刻仍能一键中止，以便试错后干净退回操作前状态。
21. 作为面板使用者，我想继续/中止之后不会有任何自动 push，以便由我自己决定何时同步远端。
22. 作为面板使用者，我想执行中的按钮显示 pending 且不重复触发，以便不会因为连点发出两条 git 命令。
23. 作为面板使用者，我想在中文与英文界面下都看到对应的冲突解决文案，以便和面板其他部分一致。
24. 作为面板使用者，我想冲突解决动作也带悬停提示，以便第一次用时知道每个按钮做什么。

## 实现决策

**契约（shared schema）**

- `actionSchema` 新增两个 kind，继续走现有 `git.action` RPC，不新建 RPC 通道：
  - `{ kind: "resolve", paths: string[], strategy?: "ours" | "theirs" }` —— `paths` 至少一项；`strategy` 省略表示「保留工作区现状」。
  - `{ kind: "continue" }` —— 无参数。
- `paths` 沿用现有 action 的路径安全约束（`assertSafeRelative`，git 以 argv 数组执行，无 shell 注入面）。
- 不新增查询 RPC：冲突清单已由快照的 `changes[].status === "conflicted"` 与 `conflicted` 计数提供，进行中态由既有 `branchState` 提供。

**resolve 语义（服务端）**

- 无 `strategy`：`git add -A -- <paths>`——用户在编辑器里清掉冲突标记后，用这条把它们交给 git。
- `strategy: "ours" | "theirs"`：先 `git checkout --ours|--theirs -- <path>` 取整文件某一侧，再 `git add -- <path>`。
- 某一侧不存在时（delete/modify 冲突，`checkout` 报 `does not have our version`）回退 `git rm -f -- <path>`：语义等价于「保留那一侧的删除」。
- 批量路径逐条执行，任一失败按现有错误分类上抛，不静默跳过。

**ours/theirs 的语义翻转（本 spec 最重要的正确性决策）**

- `branchState === "merging"`：`ours` = 当前分支，`theirs` = 来源分支。
- `branchState === "rebasing"`：git 内部把 `ours` 指向上游（目标分支），`theirs` 指向被变基的我的提交。
- 因此**服务端字段名保持 git 原义**（`ours` / `theirs`），**翻转只发生在文案层**：UI 按 `branchState` 选标签，`merging` 显示「保留当前分支 / 保留来源分支」，`rebasing` 显示「保留目标分支 / 保留我的提交」。
- 这条已用 /tmp 玩具仓实测确认（变基中 `checkout --theirs` 取回的是我的提交内容）。

**continue 语义（服务端）**

- 先探测未解决冲突：`git diff --name-only --diff-filter=U`；非空则拒绝，复用现有 `conflict` 错误码并附冲突文件清单（`error.conflicts` 已在该契约里）。
- 再按进行中态分派：`MERGE_HEAD` 存在 → `git -c core.editor=true merge --continue`；rebase 状态存在 → `git -c core.editor=true rebase --continue`；两者皆无 → `invalid-action`。
- `-c core.editor=true` 是必须的：`rebase --continue` 会打开编辑器确认提交信息，不设则服务端命令挂到超时。
- 继续后仍可能失败（如变基后某个提交变空、变基又撞下一轮冲突）：不特殊处理，原样透传 git 输出；下一轮冲突会重新出现在冲突清单里。

**UI（client）**

- 新增纯展示组件 `ConflictResolver`（新文件，与 `update-branch.tsx` 同级形态）：入参为 `branchState`、冲突文件路径列表、pending 与三个回调（解决 / 继续 / 中止）。不自己发 RPC，回调由宿主下发——与 `UpdateBranchDialog` 的既有分层一致。
- 每行：文件名（monospace，可点击看 diff）+ `标记已解决` + `保留…`（按 `branchState` 选标签）+ 悬停 hint。
- 底部：`继续合并 / 继续变基`（文件数 > 0 时禁用并显示「还剩 N 个文件」）+ `中止`（沿用既有文案与确认）。
- 两处入口：
  - `changes.tsx` 底部原本只渲染一行的「冲突：N」改为可点击入口，点开弹出 `ConflictResolver`（复用现有 Modal 形态）。批量解决对应当前选中的冲突文件集合。
  - `UpdateBranchDialog` 的进行中态：把「在终端或外部工具解决冲突」的说明替换为内嵌的 `ConflictResolver` 清单，保留标题与中止按钮。
- 冲突行（`status === "conflicted"`）不再渲染「丢弃」按钮：该操作调 `git restore --worktree`，对 unmerged 路径必报错。冲突行的次要动作改为 `标记已解决`。

**冲突文件的 diff**

- 现实现走 `git diff -- <path>`，对 unmerged 路径输出 combined diff（`@@@ -a,b -c,d +e,f @@@` 三列头），客户端的 hunk 解析器只认单范围 `@@`，结果 hunks 为空、面板显示「无预览」。
- 本次让服务端在 `base === "worktree"` 且该路径处于 unmerged（`git ls-files -u -- <path>` 非空）时，改以「工作区全文」合成 diff（复用现有未跟踪文件的合成路径），使 `<<<<<<<` / `=======` / `>>>>>>>` 标记可见；`base === "staged"` 与 commit 视图不变。

**文案与可访问性**

- `strings.ts` 双语言（en + zh）新增全部冲突解决 key；新按钮全部带 hint，满足既有 hint 覆盖测试的强制要求。

## 测试决策

- 只测外部行为：契约可解析性、组件渲染与回调参数。不测 git 命令拼装的内部细节。
- 采用**单一接缝**（与仓库既有先例一致）：
  - 契约测试（先例：`merge/rebase action 契约` 一节）：`resolve` 带/不带 `strategy` 均接受、`paths` 空数组与未知 `strategy` 拒绝、`continue` 无参数接受、`{"kind":"continue", ...多余字段}` 不破坏解析。
  - 组件渲染测试（先例：`tests/update-branch.test.tsx`，testing-library + jsdom + `strings` Proxy）：`ConflictResolver` 渲染文件行、点击各动作回传正确 `(path, strategy)`、变基态标签为「目标分支/我的提交」而非「当前/来源」、冲突未清空时继续按钮禁用、清空后可用并回调、中止回调、pending 时不重复触发。
  - 集成渲染测试（先例：`tests/changes-directory.test.tsx` + `rpc.handler` 桩）：冲突快照下变更视图出现可点击的冲突入口，点开渲染解决清单，点击动作发出 `git.action`（`kind: "resolve"`），且冲突行不再渲染「丢弃」。
- 服务端 git argv（`checkout --ours` / `git rm` 回退 / `-c core.editor=true continue`）不新增单测接缝，沿用既有先例：靠 typecheck + 真实仓库人工验收。三处机制已在 /tmp 玩具仓实测过（见补充说明）。
- 回归：`npm test` 全量与 `npm run typecheck` 保持通过。

## 范围外

- 三段式对照视图（ours / base / theirs 并排）与逐块挑选合并：本迭代只做整文件级别的三种选择。
- 面板内直接编辑冲突标记（冲突文件多为业务源码，不在可编辑扩展名白名单内）。
- `git rebase --skip` / `--quit` 等旁路动作，以及变基提交变空后的自动处理。
- 冲突类型细分（`UU`/`DU`/`AU`/`DD`…）在 UI 上单独标识：服务端在 `checkout` 失败时自动回退 `git rm`，UI 不需要感知。
- 合并/变基/继续之后的自动 push。
- 服务端 git 命令的单元测试接缝（需要改造 `execCommand` 注入点，不在本迭代）。

## 补充说明

- 本 spec 是 `.scratch/update-branch/spec.md` 明确列为「范围外」的那条（面板内解决冲突与继续操作）的接续工作。原 spec 的范围外声明在本次落地后需要回改一行，指向本目录。
- **UI 原型（待拍板）**：三变体原型（A 就地展开 / B 全屏接管 / C 对话框清单）作为 primary source 留存在 `prototype/conflict-resolution` 分支的 `.scratch/conflict-resolution/prototype.html`，不进 main。三变体均带「合并中 / 变基中」开关用于验证 ours/theirs 标签翻转。拍板后把结论写回本节并删掉落选变体。
- 三处关键机制已于 2026-11-17 在 /tmp 玩具仓实测：
  1. 合并冲突 → `git checkout --ours` 取回当前分支内容，`GIT_EDITOR=true git merge --continue` 成功产生合并提交；
  2. 变基冲突 → `git checkout --theirs` 取回的是**我的提交**内容（ours/theirs 反转成立）；`git rebase --continue` 不设 editor 会停在编辑器；
  3. delete/modify 冲突 → `git checkout --ours` 报 `does not have our version`，`git rm -qf` 后继续变基成功。
- `git merge --continue` 在未解决冲突时报 `... needs merge / You must edit all merge conflicts`，与我们的前置拦截一致，属双保险。
