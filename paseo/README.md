# Git Panel for Paseo

把 DSH 插件 [`@xbzbing/dsh-git-panel`](https://github.com/xbzbing/dsh-git-panel) 的核心能力复刻到 [Paseo](https://paseo.sh)：一个 IDE 风格的 Git 工作面板，作为 workspace 标签页打开，并在每个智能体的输入框上方显示 `<仓库> (<分支>)` 标记。

面板只操作当前 workspace 的 Git 仓库，所有 git 命令以 argv 数组执行（无 shell 字符串拼接），工作目录锁定在仓库根，并带超时与输出上限。

## 安装

插件是目录型本地插件，已安装到本机 Paseo daemon：

```bash
paseo plugin install /Users/jiaweiwu/paseo-plugins/git-panel
paseo plugin ls          # 应显示 git-panel  running
```

本目录（`git-panel-plugin/paseo/`）是源码，Paseo 实际加载的是 `/Users/jiaweiwu/paseo-plugins/git-panel`。修改源码后在本目录同步到运行副本，再重载：

```bash
npm run typecheck && npm run test
npm run prototype     # rsync 到运行副本并 paseo plugin reload
cd /Users/jiaweiwu/paseo-plugins/git-panel && npm install   # 仅新增依赖后需要
```

新增依赖后必须在运行副本执行一次 `npm install`：Paseo daemon 用运行副本的 `node_modules` 编译插件。

## 打开面板

- **⌘K / Ctrl+K** → `Open Git panel`
- 主区域标签栏的 **+** → **Git**
- 点击输入框上方的 `● <仓库> (<分支>)` 标记

标记颜色：绿色 = 工作区干净，橙色 = 有未提交变更，灰色 = 状态未知。有未提交变更时标签带 `*`。

## 功能

- **多仓库切换**：自动识别 workspace 根仓库，以及子目录里的独立仓库（扫描深度 3、最多 50 个）。切换后总览、变更与输入框标记都作用于所选仓库；文件浏览默认仍固定在工作区目录，避免“项目文件夹被换成子仓库”。
- **Git 总览**：本地 / 远程分支、标签、提交历史图、提交详情与逐文件差异。支持按提交信息或 7–40 位哈希前缀搜索、加载更多。
- **变更记录**：已暂存 / 已修改 / 未跟踪分组，逐文件或批量暂存、取消暂存、放弃；平铺与按目录折叠两种视图；逐文件 `+/-` 行数；提交与 **Amend**；贮藏列表（应用 / 弹出 / 删除）。
- **提交 / 推送**：提交框、Amend（自动带入上一条提交信息）、fetch、pull（仅 fast-forward）、push；没有上游时提供 publish（`git push -u <remote> HEAD`）。
- **分支与提交操作**：切换 / 新建分支、创建轻量或附注标签、revert、reset（soft / mixed / hard，硬重置需二次确认）。
- **差异查看**：统一 / 对照两种布局，行号、词法着色、新增 / 删除配色、全部上下文展开。
- **文件浏览**：懒加载目录树、忽略项半透明、文本 / 图片 / Markdown 预览。桌面端阅读与编辑都使用 CodeMirror 6：行号、按扩展名的语法高亮、搜索、撤销、`⌘S`/`⌘Enter` 保存、`Esc` 退出；移动端或无 DOM 宿主自动降级为纯文本编辑器。文件根默认固定在工作区目录（与原版一致），可在设置里改为跟随所选仓库。
- **编辑保存**：停止输入 1.5 秒后自动保存（可在设置关闭），`⌘S` 随时保存。保存仍校验读取时的 sha256：磁盘被其他程序改过时拒绝覆盖，并给出「重新加载 / 保留草稿」两种处理。大文件超过字符预算时降级为纯文本预览。
- **窄屏 / 移动端**：`layout.compact` 或宽度不足时自动切换为单栏，差异与分支列表进入弹层。
- **当前目录跟随**：输入框标记与 `Open Git panel for this agent` 打开的是 agent 级面板，使用该 agent 的 `cwd`；普通 `Open Git panel` 使用 workspace 目录。
- **中英双语**：跟随 Paseo 应用语言（`zh*` 用中文，其余英文）。
- **设置页**：输入框标记开关、默认差异视图、变更列表默认视图、自动刷新间隔、是否允许编辑文件、自动保存、编辑态语法高亮、文件浏览是否跟随仓库。

## 设置

⌘K → `Configure Git panel`，或 Settings → Plugins → git-panel → 设置。

## 大仓库与慢盘

- 快照中的未跟踪文件行数统计与 mtime 采集有 8 秒总预算，超时只返回部分统计，不会拖到 Paseo 的 30 秒 RPC 超时。
- 同一仓库的并发快照会合并为一次 git 执行，并缓存 1.2 秒，避免面板轮询与输入框标记同时触发多份 `git status`。
- 文件页单个目录最多返回 500 项，文件大小只对前 300 项取样；目录读取失败会显示错误，而不是空白列表。
- 文件页默认固定在工作区目录；如果希望切仓库时文件根一起切换，在设置里打开「文件浏览跟随仓库」。

## 权限与边界

- **Git**：`git` CLI 必须可用；命令经 `execCommand` 以 argv 数组执行，cwd 固定为仓库根，单条命令 20 秒超时（fetch/pull/push 120 秒），输出上限 32 MiB。不使用 `--force`，不改 git 配置。
- **文件**：只读仓库内文件；路径做 realpath 包含检查，`.git` 不可浏览。写盘只有两种：
  - 放弃未跟踪条目：按确认删除工作区文件（条目本身是 Git 仓库时拒绝）。
  - 文件浏览中编辑：仅限 `json` `yaml` `yml` `xml` `properties` `md` `markdown` `txt` `toml` `conf` `ini` `cfg` `log` `csv` 与 `.gitignore` `.gitattributes` `.editorconfig` `.env*`，单文件 ≤ 2 MiB、UTF-8。保存时校验读取时的 sha256，文件被其他程序改过则拒绝覆盖；写入经同目录临时文件原子替换，保留权限位。
- **网络**：插件自身不发任何网络请求。fetch / pull / push 只在你点击后由 git 联网，凭据始终由 git 处理。
- **遥测**：无。

## 与 DSH 原版的差异

本复刻覆盖原版的主要工作流，以下为已知差异：

| 项目 | 状态 |
| --- | --- |
| AI 生成提交信息 | **未实现**。Paseo 没有把 metadata generation 暴露给插件；请使用 Paseo 原生提交框的生成能力，或手动填写。 |
| 提交历史图 | 简化的车道图（竖线 + 节点 + 分支连接），不含原版的弯折线与完整车道配色。 |
| 历史筛选 | 支持提交信息 / 哈希前缀；不支持作者、日期、历史路径子串筛选。 |
| 差异视图 | 统一 / 对照、全文展开；不支持按折叠块逐段展开、图片缩放/拖拽/全屏、语法高亮级别的词级 diff。 |
| 文件预览 | CodeMirror 6 行号 + 语法高亮（桌面）、Markdown、图片；HTML 不渲染。 |
| 多语言 | 中 / 英；原版支持 8 种语言。 |
| 输入框标记 | 用彩色圆点表示干净/变更（文字颜色由 Paseo 控制），标签带 `*`。 |

## 项目结构

```text
shared/git.ts        RPC 契约、zod 数据模型、设置定义
server/git.ts        execCommand → 带超时/上限的 git 运行器
server/repos.ts      workspace 仓库解析 + 嵌套仓库扫描
server/snapshot.ts   status / upstream / remote / 逐文件统计
server/history.ts    提交历史、分支/标签、贮藏、上一条提交信息
server/show.ts       提交详情与逐文件列表
server/diff.ts       工作区 / 暂存 / 提交差异与未跟踪文件合成
server/files.ts      目录树、文本/图片读取、带版本校验的原子写入
server/actions.ts    stage/unstage/discard/commit/amend/branch/tag/stash/reset/revert
client/panel.tsx     面板壳、仓库切换、标签页
client/overview.tsx  分支/提交历史/提交详情
client/changes.tsx   变更列表、提交框、贮藏
client/files.tsx     目录树与文件预览/编辑
client/diff-view.tsx 统一/对照差异
client/pill.tsx      输入框 <仓库> (<分支>) 标记
client/settings.tsx  设置页
```

## 文档

- [初始需求与复刻说明](docs/01-初始需求与复刻说明.md)
- [工作目录加载与 RPC 超时修复](docs/02-工作目录加载与RPC超时修复.md)

## 致谢

功能与交互设计来自 [xbzbing/dsh-git-panel](https://github.com/xbzbing/dsh-git-panel)（MIT）。本项目的 Paseo 适配为独立实现。
