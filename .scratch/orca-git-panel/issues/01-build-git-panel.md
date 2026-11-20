# 01 用 Git 面板替换脚手架示例

Status: resolved
Blocked by: —

规格：`.scratch/orca-git-panel/spec.md`

`orca/git-panel` 目前是 `worker-panel` 模板的 counter 示例（manifest 与 typings 均已生成、`orca plugin test` 与 `tsc` 通过）。本工单把示例换成规格里的最小可用形态。

## What to build

1. `src/protocol.ts` 声明 `git.*` 请求契约（repos / snapshot / stage* / unstage* / discard / commit / stash*），worker 与面板共用。
2. `src/git.ts`：argv 数组执行器（`execFile('git', ['-C', root, …])`，10s 超时、4 MB 上限）+ `status --porcelain=v2 --branch -z` 解析 + 快照缓存（1.2s）与并发合并。
3. `src/worker.ts`：登记全部处理器；`workspace.list` 解析 `path`/`hostId`，非本地主机返回 `unsupportedHost`；写操作单队列，`index.lock` 报可读错误。
4. `src/repos.ts`：仓库扫描（深度 3、上限 50，跳过 `.git`/`node_modules`），选中仓库按 `workspaceId` 存 `storage`。
5. `src/panel.tsx`：仓库选择器 + 分支/脏标记 + `Tabs`（变更 / 贮藏）+ 提交区（`Textarea` + 提交 / 修正上次提交）；空态、禁用态、错误提示。
6. `contributes`：commands（打开面板、暂存全部、修正上次提交、新建贮藏）、keybindings、`statusBarItems`（分支 + 脏标记，tone 三态）、`settings`（刷新间隔、状态栏开关、允许丢弃未跟踪文件）；`engines.orca` 提到 `>=1.4.248`，能力补 `workspace:read`/`workspace:write`/`settings:own`。
7. 文案模块 `src/strings.ts`，跟随 `orca.locale`。

## 验收

- [ ] `orca plugin validate orca/git-panel --json` 退出 0，`grants` 恰为上列能力。
- [ ] `orca plugin test orca/git-panel --json` 全绿：worker 用例在临时 git 仓库上验证 stage/unstage/discard/commit/amend/stash 的**真实仓库状态**；面板用例验证分组、禁用态、空态。
- [ ] `npx tsc -p orca/git-panel` 无错。
- [ ] `orca plugin check orca/git-panel --json` 的四个场景（空、有改动、有贮藏、非本机主机）无 issue，PNG 人眼确认。
- [ ] `git commit --amend` 在合并提交 / 初始提交 / 进行中操作时被拒绝并给出原因。
- [ ] 未跟踪文件丢弃需要设置允许 + 二次确认。
- [ ] 内置 Source Control 同时操作时不出现 `index.lock` 静默失败。

## Result

Status: resolved（2026-11-20）。实现在 `orca/git-panel/`，门禁全绿：

- `orca plugin validate orca/git-panel --json`：valid，errors []；能力只有 `workspace:read` + `settings:own`。
- `orca plugin test orca/git-panel --json`：14 个用例全过（worker 9 个在临时 git 仓库上断言真实仓库状态，面板 5 个断言渲染结果）。
- `npx tsc -p orca/git-panel`：无错。
- `orca plugin check orca/git-panel --json`：4 个场景（fresh / dirty / stashes / remote）issues []、warnings []。

与验收清单的差异：

- 状态栏项不绑 `command`：Orca 没有打开指定插件面板的 host API，改为只读指示（规格已就地修正）。
- 「点击打开面板」这一条从验收里去掉；其余全部达成。

剩下一步需要人工：`orca plugin dev load orca/git-panel --approve <fingerprint>` 把插件载入 Orca（第一次运行不给 `--approve` 会以 `approval_required` 退出并打印指纹）；载入后确认面板能读真实仓库、状态栏显示分支。文件再改动会换新指纹，需重新批准。

## UI 原型（2026-11-20）

交互与观感要重做，先出 4 个结构不同的变体让人挑：

- 文件：`orca/git-panel/prototype/ui.html`（单文件，双击即开，或 `python3 -m http.server` 后访问 `/orca/git-panel/prototype/ui.html`）。
- 切换：`?variant=A|B|C|D`，底部浮条左右箭头或 ←/→ 键翻页；浮条还能切 340/420 边栏宽度、开关 STATE 抽屉。
- 变体：A 行动流（一行一个主按钮 + 常驻提交条）、B 复核条（多选批量 + 底部复核）、C 控制台（等宽高密度 + j/k/s/u/d 键盘）、D 卡片栈（卡片 + 点行弹底部动作面板）。
- 共同约束：只使用 Orca components 面板已有的组件词汇，选中后能直接落回 `src/panel.tsx`；数据是内存假数据，不碰 git。
- 待定：选哪一个（或"B 的头部 + C 的密度"这类组合），定了再改实际面板并删掉其余变体。

**结论（2026-11-20）：选 B「复核条」**，已按 B 重写 `src/panel.tsx`：分支/统计徽标 → 提交复核条（信息 + amend + 提交）→ 勾选条（暂存所选 / 丢弃所选）→ 已暂存 / 已修改 / 未跟踪三组 → 贮藏组。A/C/D 未落进插件。原型的其余变体留在这里只作对照，提交时应挪到独立分支或删除。

落地时被 Orca 拒绝的一条：**带 `onPress` 的 ListItem 里不能放 IconButton**，所以可勾选的行只负责勾选，行级按钮只剩下已暂存行的「取消暂存」，未暂存/未跟踪的丢弃改成勾选条上的「丢弃所选」。

## 远端动作补齐（2026-11-20）

用户要求把内置 Source Control 溢出菜单里的动作也做进插件。已实现（`src/git.ts` 远端段 + `src/worker.ts` 请求 + 面板「远端」组）：

| 菜单项 | 请求 | 实现 | 守卫 |
|---|---|---|---|
| 提交 | `git.commit` | `git commit -m` / `--amend` | 暂存区为空、进行中操作、无上一次提交 |
| 提交并推送 | `git.commitPush` | commit + push | 同上 |
| 提交并同步 | `git.commitSync` | commit + 先快进后合并的 pull + push | 需上游 |
| 推送 | `git.push` | `push <remote> <branch>` | 需上游 |
| 强制推送 | `git.pushForce` | `push --force-with-lease`，面板二次确认 | 需上游 |
| 创建 PR | `git.pullRequest` | 有 gh/glab 就 `--fill` 建；否则返回 compare 链接由面板开浏览器 | 需上游 + 远端可识别 |
| 拉取 | `git.pull` | `pull --no-rebase` | 干净、需上游、无进行中操作 |
| 快进 | `git.fastForward` | `pull --ff-only` | 同上 |
| 同步 | `git.sync` | 先 `--ff-only`，分叉回退 `--no-rebase` 再 push | 同上 |
| 变基到上游 | `git.rebase` | `rebase <upstream>`，无上游退到 `<remote>/<base>` | 干净、无进行中操作 |
| 获取 | `git.fetch` | `fetch --prune <remote>` | 有远端 |
| 发布分支 | `git.publish` | `push --set-upstream <remote> HEAD` | 无上游时可用 |

验证（22 个测试全过，远端用例用本地裸仓库，不联网）：publish→fetch→fast-forward、commitPush→amend→普通 push 被拒→pushForce 成功、commitSync 分叉时合并、脏树时 rebase 被拒、无 provider 时 pullRequest 报 `invalid_params`。面板用例覆盖：远端按钮发对应请求、强制推送两次点击、脏树禁用拉取/快进/同步、无 CLI 时 `shell.openExternal` 打开 compare 页。

## 移动端看不到插件（结论）

Orca 移动端是独立的 web 客户端（`app.asar.unpacked/out/mobile-web`），其中 **0 处** `plugin.rpc` / plugin panel 相关代码，只有自带的 Source Control（`sourceControl` 出现 597 次）。插件面板是桌面端 surface（右侧边栏 + 编辑器 tab），移动端不加载插件运行时，所以这个面板在手机上不存在；要手机上看 git，用 Orca 移动端自带的 Source Control。

## 样式与交互打磨（2026-11-20 第三轮）

用户反馈「太难看、交互不好」。重排 `src/panel.tsx`：

- **提交卡（Card）固定在顶部**：3 行提交信息 + amend 开关 + 三个按钮（提交并同步 / 提交并推送 / 提交✓），主操作永远可见。
- **三个页签**取代原来的单列堆叠：变更 N / 远端 / 贮藏 N（页签选择持久化）。
- **变更页**：勾选条（丢弃所选 / 暂存所选，sm 尺寸）+ 两个 Collapsible（已暂存、未暂存+未跟踪合并成一组，组头带 `+/−` 汇总）；干净时 EmptyState。
- **远端页**：三张 Card（推送 / 拉取 / 整合），每行 = 动作名 + 状态描述（↑↓、已是最新、先提交或贮藏改动、push -u origin HEAD、--force-with-lease、CLI/浏览器）+ 右侧 sm 按钮；有领先提交时「推送」变实心主按钮，双向分叉时「同步」变实心。
- **贮藏页**：含未跟踪开关 + 实心「新建贮藏」，条目右侧 应用/弹出/删除 + RelativeTime 相对时间。
- 按钮从 xs 提到 sm（命中面积），危险动作（强制推送/丢弃/删除）统一 danger ghost + 二次确认。

测试断言注意：Collapsible 的 title 和 ListItem 的 description 是 props，测试 finder 的 `text` 看不到，改用 `view.tree()` 正则断言（panel.test.tsx 两处）。
门禁：test 22/22、tsc 无错、check 5 场景（fresh/dirty/stashes/remoteActions/remote）issues+warnings 全空、validate valid。
