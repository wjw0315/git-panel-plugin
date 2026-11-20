# Git Panel for Orca

内置 Source Control 的克隆，外加一项它没有的能力：**同一工作区里在 主仓库 / 子模块 / 嵌套仓库 之间切换**。

## 面板结构

- **仓库切换器**：`主仓库 · repo (branch) ●` / `子模块 · inner` / `嵌套仓库 · …`，带脏点与未初始化标记；选择按工作区记住。
- **分支行**：分支 `Select`（本地 / 远端标记，切换即 checkout）+ `＋` 新建（内联输入）；当前分支的 PR 状态 Badge 可点开链接。
- **提交卡**：`提交` / `提交并推送` / `提交并同步` / `提交并强推`（`--force-with-lease`），amend 开关。
- **冲突横幅**：`中止` / `继续`（rebase·cherry-pick·revert）/ `完成合并`（merge）。
- **变更页签**：`已暂存的更改` / `更改` 两组；行内 暂存·取消暂存·放弃·打开文件·行内 diff；目录小节支持 folder 级批量；子模块行「进入」= 切到该子模块。
- **历史页签**：分支/哈希前缀过滤、提交列表（sha·作者·refs·相对时间）、展开看提交文件、加载更多、PR 状态。
- **贮藏页签**：新建（可含未跟踪）/ 应用 / 弹出 / 删除。
- **更多动作页签**：与内置溢出菜单一一对应的 13 项（提交系 4 个、推送/发布/强推/创建 PR/先推再建 PR、获取/拉取/快进/同步/变基到上游），禁用原因可见；本地分支删除（未合并需二次确认）。
- 底部「在内置源代码控制中打开」：AI 生成提交信息 / PR 编辑 / 提交图这些仍走内置。

## 创建 PR

- 远端是 GitHub 且本机有 `gh`、或 GitLab 且有 `glab`：按按钮直接建 PR/MR（`--fill`）。
- 没有 CLI：按按钮用系统浏览器打开 compare 页面（链接由远端 URL 拼出，不联网探测）。

## 注意

- 插件是**桌面端**的面板：Orca 移动端（web 客户端）没有插件运行时，看不到这个面板，移动端自带 Source Control。
- 拉取/快进/同步/变基在树不干净时被禁用（与内置菜单一致），避免半提交状态被合并。同步先试快进，分叉时退回合并。

## 设计

- [`docs/UI-DESIGN.md`](docs/UI-DESIGN.md)：v3 UI 规格——内置 Source Control 的信息架构 1:1 复刻，唯一增量是仓库切换器（`repos > 1` 时出现）。
- [`docs/ui-design.html`](docs/ui-design.html)：视觉稿，八个屏幕（干净 / 有改动 / 切换器展开 / 冲突 / 更多动作 / 历史 / 亮色 / 280px 窄），浏览器直接打开。
- [`.impeccable.md`](.impeccable.md)：设计上下文（用户、立场、宿主约束），只对 `orca/git-panel/` 生效。

## 结构

- `src/protocol.ts`：面板 ↔ worker 的请求契约（`git.*`），两侧共用。
- `src/git.ts`：argv 数组执行器（`execFile('git', ['-C', root, …])`，10s 超时、4 MB 上限、1.2s 快照缓存与并发合并）+ `status --porcelain=v2` 解析 + 写操作。
- `src/repos.ts`：工作区里的仓库发现。
- `src/worker.ts`：请求处理器、命令、状态栏刷新；git 写操作串行化，`index.lock` 转成可读提示。
- `src/panel.tsx`：右侧边栏面板（v3，对齐内置）：仓库切换器（repos>1 才出现）→ 分支两行 → 提交盒（`Box` + 信息框 + 提交/`···` + 禁用原因 + amend）→ 冲突条 → 「已暂存的更改 / 更改」两组（组头批量、目录小节、行内动作、行内 diff）→ 底部「在内置源代码控制中打开」。
- `src/rows.tsx`：文件行（状态字母 + 名称/目录 + 行数 + 行内动作）、子模块行、更多动作行。**行必须是 `Stack`/`Row`，不能放 `List` 里**——宿主只接受 `ListItem` 作 `List` 的子节点，混入其它节点会整块渲染失败。
- `src/strings.ts`：中英文文案，跟随 `orca.locale`。

## 开发

```sh
orca plugin types .      # 生成 .orca/types（不入库）
tsc -p .                     # 全局 tsc；本包不装依赖，`npx tsc` 不可用
orca plugin test . --json
orca plugin check . --json    # 四个场景各渲染一次，出 PNG 供人眼验收
orca plugin dev watch .       # 载入 Orca，需要批准一次同意指纹
```

- 不提交 `node_modules`，也不引入依赖：只用 `node:child_process`、`node:fs`、`node:path`。
- `Promise.withResolvers` 需要 ES2024 lib，这里目标是 ES2022，`src/git.ts` 手写了等价的延迟器。
- 面板只在右侧边栏，不实现移动端专属布局；文案随 Orca 语言切换。

## 限制

- 插件在 Orca 运行时所在机器上执行 git：SSH / 远端运行时的工作区会显示提示，不会乱跑本机 git。
- 与内置 Source Control 并发写同一个仓库时可能撞 `index.lock`；本插件把写操作串行化并给出可读错误，不去协调内置面板的锁。
- 丢弃未跟踪文件默认关闭，需在设置里显式打开。
