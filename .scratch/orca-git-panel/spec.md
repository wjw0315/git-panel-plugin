# Orca Git 面板：补齐内置源代码控制缺失的 amend / stash / 多仓库

Status: superseded（被 `.scratch/orca-scm-clone/spec.md` v2 取代：用户改为「1:1 复刻内置 + 多仓库切换」）

插件目录：`orca/git-panel/`（已用 `orca plugin create --template worker-panel` 脚手架，`orca plugin validate` 通过，pluginKey `local.git-panel`）。
脚手架当前是 worker-panel 模板的 counter 示例，由工单 01 替换。

## 问题陈述

Orca 内置的 Source Control 已经很全：暂存/丢弃、分支选择、远端 push/pull、建 PR、提交图（cherry-pick / revert / rebase / merge）。但有三件事它做不了：

1. **修正上次提交（amend）**：提交信息写错、漏文件时，只能去终端敲 `git commit --amend`。内置面板里搜不到 `--amend`，源码里也没有任何 `--amend` 调用。
2. **贮藏（stash）**：想临时切分支又不愿提交半成品时，内置面板只提示"先 commit 或 stash"，没有 stash 列表、apply、pop、drop 入口。
3. **一个工作区里的多个仓库**：Orca 一个 workspace 对应一个 worktree/项目，当工作区根下还嵌着独立 git 仓库（monorepo 里的 subrepo、`.scratch` 之类），内置面板只看得到根仓库。

另外，快速判断"当前分支脏不脏"需要切到 Source Control 页签，没有一个常驻的只读指示。

## 方案

做一个 Orca 插件（`trusted-worker` + 右侧边栏 components 面板），**只补内置面板的缺口，不重做已有能力**：

- 变更列表 + 单文件/全量 暂存、取消暂存、丢弃，提交，**修正上次提交（amend）**。
- **贮藏列表**：新建 stash（可带信息、可含未跟踪）、apply、pop、drop。
- **多仓库切换**：扫描工作区根与其下（深度 3、上限 50 个）独立仓库，切换后列表与状态栏都作用于所选仓库。
- **状态栏项**：常驻显示 `仓库名 分支名` + 脏标记，点击打开面板。
- 差异、文件浏览、提交图、push/pull、PR：**不实现**，交给内置能力（点文件用 `editor.open` 打开，跳内置差异视图）。

## 用户故事

1. 作为面板使用者，我想在一个侧边栏里看到当前仓库的已暂存、已修改、未跟踪文件分组，以便不用切页签就知道工作区状态。
2. 作为面板使用者，我想单个文件暂存/取消暂存，以便按需拼一次提交。
3. 作为面板使用者，我想全量暂存/全量取消暂存，以便一次性处理大批改动。
4. 作为面板使用者，我想放弃单个文件的未暂存改动，以便丢掉试探性修改。
5. 作为面板使用者，我想在放弃未跟踪文件前看到"将永久删除"的确认，以便不误删新文件。
6. 作为面板使用者，我想在提交框看到已暂存文件数和增删行数，以便提交前确认范围。
7. 作为面板使用者，我想提交时写多行提交信息，以便写清标题与正文。
8. 作为面板使用者，我想提交按钮在提交信息为空或暂存区为空时禁用，以便避免空提交。
9. 作为面板使用者，我想用"修正上次提交"把当前暂存内容并入上一条提交，以便补漏文件。
10. 作为面板使用者，我想开启修正时自动带入上一条提交信息，以便在其上编辑。
11. 作为面板使用者，我想在修正已推送的提交时看到提示，以便知道需要 force push 才能同步。
12. 作为面板使用者，我想在修正前确认不是合并提交或初始提交，以便不被 git 拒绝后才明白。
13. 作为面板使用者，我想新建贮藏并附一句说明，以便日后认出这堆改动。
14. 作为面板使用者，我想新建贮藏时可选是否包含未跟踪文件，以便处理新文件的半成品。
15. 作为面板使用者，我想看到贮藏列表（说明、分支、时间），以便挑出要恢复的那条。
16. 作为面板使用者，我想对某条贮藏执行 apply（保留条目），以便反复试用。
17. 作为面板使用者，我想对某条贮藏执行 pop（恢复并删除），以便用完即清。
18. 作为面板使用者，我想对某条贮藏执行 drop，以便丢弃过期草稿。
19. 作为面板使用者，我想在 apply/pop 发生冲突时看到冲突文件清单，以便去解决冲突。
20. 作为面板使用者，我想在贮藏列表为空时看到明确的空态，以便知道确实没有贮藏。
21. 作为面板使用者，我想自动识别工作区根仓库和其下的独立仓库，以便不用手动配置路径。
22. 作为面板使用者，我想在多个仓库间切换，以便一次看多个仓库的改动。
23. 作为面板使用者，我想记住上次选择的仓库，以便重开面板不用重选。
24. 作为面板使用者，我想在状态栏常驻看到 `仓库(分支)`，以便不打开面板也知道当前分支。
25. 作为面板使用者，我想状态栏在干净/有改动/未知三态下有不同颜色，以便一眼判断。
26. 作为面板使用者，我想点击状态栏项打开面板，以便一步进入。
27. 作为面板使用者，我想面板自动刷新（跟随 Orca 的工作区切换事件 + 定时轮询），以便看到 agent 刚做出的改动。
28. 作为面板使用者，我想刷新按钮在手，以便随时强制重读。
29. 作为面板使用者，我想命令面板里有"打开 Git 面板"和"暂存全部并修正上次提交"之类的入口，以便不开鼠标也能操作。
30. 作为面板使用者，我想面板跟随 Orca 的亮/暗主题与中英文语言，以便和界面其他部分一致。
31. 作为面板使用者，我想在非本机工作区（SSH 主机）上看到明确提示而不是静默失败或乱跑本机 git，以便知道这个面板不支持该工作区。
32. 作为面板使用者，我想 git 报错时看到原始 stderr 摘要，以便判断是权限、锁还是版本问题。
33. 作为面板使用者，我想在一个大仓库上操作不被卡死（超时 + 输出上限），以便面板不会假死。
34. 作为面板使用者，我想同时有内置 Source Control 在用时不互相踩 `index.lock`，以便两边操作都安全。
35. 作为面板维护者，我想插件在未安装 node_modules 时也能被 Orca 加载，以便用"打包依赖、不提交 node_modules"的方式分发。

## 实现决策

**运行形态与清单**

- `execution: trusted-worker`，`main` 指向 worker 入口；面板用 `"ui": "components"`（`src/panel.tsx`）。不引入构建步骤，Orca 自己转译 TS/TSX。
- `engines.orca` 取用到的最高 `Since`（components 面板与无构建入口需要 `>=1.4.246`；`statusBarItems` 需要 `>=1.4.248`，若实现状态栏则取 `>=1.4.248`）。
- 能力（`capabilities`）：`workspace:read`（`workspace.list`、`workspace.readContext`）、`workspace:write`（`editor.open`、`commands.run`）、`storage:own`、`settings:own`。不申请 `terminal:send`、`terminal:read`、`agent:*`。
- 贡献点：1 个 `panels`、若干 `commands`（打开面板、暂存全部、修正上次提交、新建贮藏）、`keybindings` 绑定其中两条、1 个 `statusBarItems`、`settings`（刷新间隔、默认视图、状态栏开关、是否允许丢弃未跟踪文件）。**不**使用 `hooks` 与 `events`（面板订阅 `workspace.changed`，worker 不需要 `contributes.events`）。

**面板 ↔ worker 契约**（`src/protocol.ts` 一处声明，两侧共用）

- 请求名以 `git.` 为前缀，全部返回 JSON，一次请求一个快照或一个动作：
  - `git.repos`：`{ cwd }` → 仓库列表（`{ root, name, branch, hasUpstream, dirty }`，扫描深度与上限固定）。
  - `git.snapshot`：`{ repoRoot }` → `{ staged[], modified[], untracked[], ahead, behind, hasUpstream, operation, lastCommit }`，其中 `operation` 暴露进行中的 merge/rebase/cherry-pick，用于禁用 amend 与提供中止入口。
  - `git.stage` / `git.unstage` / `git.discard` / `git.unstageAll` / `git.stageAll`：`{ repoRoot, paths[] }`。
  - `git.commit`：`{ repoRoot, message, amend }`。
  - `git.stashList` / `git.stashSave` / `git.stashApply` / `git.stashPop` / `git.stashDrop`。
  - 所有动作返回 `{ ok: true, snapshot }`，失败返回带 `code` 的错误（面板侧拿 `plugin.request` 的 rejection `code` 与 message）。
- worker 推送：`git.changed`（快照变化，面板更新），限 200 次/10 秒。

**git 执行层**

- 所有 git 调用走一个 argv 数组执行器：`execFile('git', ['-C', repoRoot, ...args])`，**不使用 shell 字符串拼接**；`timeout` 默认 10 秒，`maxBuffer` 上限 4 MB，超出按截断处理并标记。
- 工作目录锁定为仓库根（`-C`），永不使用进程自身 cwd。
- `git status --porcelain=v2 --branch -z` 解析为快照；未跟踪文件的行数统计与 mtime 取样设总预算 8 秒，超时返回部分统计而不阻塞。
- 同一仓库并发快照合并为一次执行，并做 1.2 秒内的结果复用，避免面板轮询与状态栏同时触发多份 `git status`。
- 动作前置守卫：`commit --amend` 前拒绝合并提交/初始提交/进行中操作；`discard` 未跟踪文件需要设置项允许且面板二次确认；`stash pop/apply` 前工作区必须干净或以 `--index` 语义明确提示冲突风险。

**工作区路径与多仓库**

- 工作区绝对路径只能从 worker 侧 `workspace.list` 拿（`workspace.readContext` 不带 path）。面板打开时把 `workspaceId` 传给 worker，worker 在 `workspace.list` 里按 id 找 `path` 与 `hostId`。
- `hostId` 不是本地（`ssh:…` / `runtime:…`）时，`git.repos` 直接返回 `unsupportedHost`，面板显示提示条，不尝试本地执行。
- 仓库扫描：从工作区根向下最多 3 层、最多 50 个仓库，跳过 `.git`、`node_modules`、`.venv`、构建产物目录；工作区根自身是 git 仓库时它排第一。
- 选中仓库持久化在 `storage`（按 `workspaceId` 分键），未选过时默认根仓库。

**状态栏与命令**

- 状态栏项显示 `分支名` 或 `仓库名 分支名`（窄时只显示分支），tone 映射：干净 `neutral`、有改动 `warning`、不可读 `danger`；worker 常驻（有 `main` 且有状态栏项时 Orca 会保持 worker 运行）按刷新间隔更新，并在 `workspace.changed` 时立即刷新。
- **已修正**：Orca 没有「打开指定插件面板」的 host API（`commands.run` 只跑内置动作），所以状态栏项不绑 `command`，只做只读指示；面板从右侧边栏打开。用户故事 26 按此收窄为「一眼看到分支」。
- `commands.run('sidebar.sourceControl.toggle')` 用于"在内置面板中查看"，避免重做差异/图谱。

**与内置 Source Control 共存**

- 不在插件内做 push/pull/fetch/branch 切换，减少与内置 SCM 的远端互斥冲突。
- 所有写操作串行化（worker 内单队列），并在动作失败且 stderr 含 `index.lock` 时返回可读提示（"内置源代码控制或其他进程正在运行 git 操作，请重试"）。

**UI**

- 面板三段式：顶部仓库选择器 + 分支/脏标记；中部 `Tabs`（变更 / 贮藏）；底部提交区（提交信息 `Textarea` + 提交/修正按钮）。
- 变更列表用 `List`/`ListItem`（文件路径、状态徽标、`+/-` 行数），行内操作按钮；批量操作用 `Toolbar`。
- 面板宽度由 Orca 右侧边栏决定，不实现窄屏分支逻辑；文本用 `truncate` 处理长路径。
- 国际化：读 `orca.locale`，`zh*` 用中文，其余英文；文案集中在一个 `strings` 模块。
- 不引入任何 UI 库；只用 `orca` 组件目录（无 DOM、无 hooks、状态放 `atom`）。

**打包与分发**

- 不提交 `node_modules`；若引入依赖则打包成单文件（`--external:orca --external:'orca/*'`）。目标是零依赖：只用 `node:child_process`、`node:fs`、`node:path`。
- 插件目录自成一个可发布的仓库根（`orca/git-panel`），文件数 < 2000、总量 < 50 MiB。
- `.orca/types/` 按 Orca 约定不入库（脚手架自带 `.gitignore`）；新检出的目录先跑一次 `orca plugin types orca/git-panel` 再 `tsc`。

## Testing Decisions

**什么算好测试**：只测外部可观察行为——worker 的请求名、输入、返回形状，以及真实 git 仓库上的最终状态（staged/unstaged/commit message/refs）。不测内部函数拆分、不测 git 参数拼写细节、不 mock 掉 git 本身（git 就在本机，用临时仓库）。

**seams（两个，均为既有宿主 seam，不新造）**

1. **worker 请求处理器**（首选、最高）：用 `orca/testing` 的 `mountWorker(main, { host })` 载入 worker，`worker.request('git.…')` 打请求；测试自己用 `mktemp` 建一个临时 git 仓库（`git init`、写文件、`git add`），断言快照与动作后的真实仓库状态。这覆盖 amend、stash、丢弃、多仓库扫描的全部行为。
2. **面板渲染**：用 `orca/testing` 的 `mount` + `mockRequests`（假 worker 应答）渲染面板，断言"画出了什么"（分组标题、行文本、禁用态、空态），不断言样式。`orca plugin check` 为每个关键状态（空工作区、有改动、有贮藏、非本机主机）各配一个 `src/panel.check.ts` 场景，产出 PNG 人眼验收。

**要测的模块**：`src/worker.ts`（请求处理器）、`src/panel.tsx`（渲染与交互）、`src/protocol.ts`（类型即契约，不单独测）。git 执行层不单独测——它只被 worker 处理器调用，行为在 seam 1 里已覆盖。

**先例**：本仓库 Paseo 侧 `tests/`（vitest + 宿主模块桩）是同一形态的 prior art：桩掉宿主边界、在边界上断言行为；Orca 侧对应工具是 `orca/testing` 的 `mountWorker` / `mount` / `mockHost` / `defineCheck`。

**门禁**：`orca plugin test orca/git-panel --json`（跑 `src/*.test.ts(x)`）+ `npx tsc -p orca/git-panel` + `orca plugin check orca/git-panel --json` + `orca plugin validate orca/git-panel --json`。

## Out of Scope

- 差异视图（统一/对照、词法高亮）：用内置差异。
- 提交图、提交详情、cherry-pick / revert / rebase / merge：用内置 `gitGraph`。
- push / pull / fetch / publish、分支切换与新建、标签、reset：用内置 Source Control。
- 文件树浏览与 CodeMirror 编辑：用内置 explorer 与编辑器；插件只通过 `editor.open` 打开文件。
- Paseo 版的"输入框 `<repo> (<branch>)` 标记"、"新工作区条目"、"workspace 头部按钮"：Orca 没有对应贡献点，用状态栏项替代。
- SSH / 远端运行时工作区上的 git 操作（明确提示不支持）。
- 移动端专属布局。
- 自定义编辑器（`customEditors`）与新建文件类型（`newFiles`）。

## Further Notes

- 本方案来自 2026-11-20 的可行性核验（Orca 1.4.265）：worker 是独立 Node 进程（`plugin-host-entry.js` 直接 `require node:fs/path/module/url` 后动态 `import` 插件入口），`node:child_process` 可用；host API 没有任何 git 读取接口，git 必须自己 shell 出去。
- 待闭环一项：worker 内 git 实跑尚未在真机 approve 后验证，但 `orca plugin test` 在普通 Node 里跑（unsandboxed），seam 1 的测试即可先证 git 调用链成立；`orca plugin dev watch` 的实机渲染留到 01 工单完成时确认。
- 加载与调试需要用户批准一次同意指纹（`execution: trusted-worker` + 四个能力）；批准就是授予在自己账号下跑任意代码，属人工动作。
- 与内置 SCM 的 `index.lock` 竞争是本插件唯一的系统性风险，处理原则是"少写、串行、报错可读"，不试图与内置面板协调锁。
