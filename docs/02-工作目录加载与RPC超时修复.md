# Git Panel for Paseo：工作目录加载与 RPC 超时修复

- 日期：2026-11-04
- 现象：项目文件夹有时候没有加载当前工作目录的项目文件夹，导致使用异常
- 状态：已修复并验证；`git-panel` running

## 1. 问题现象

用户反馈：

> 项目文件夹有时候没有加载当前工作目录的项目文件夹，导致使用异常。

实际观察到的表现：

- 文件页有时空白、只显示“仓库”标题，或显示某个嵌套仓库而不是当前工作目录；
- 面板顶部能显示分支/变更数，但内容区报：
  `Request failed: Plugin RPC timed out: git-panel.invoke requestType=plugin.rpc.invoke.request code=handler_error`
- 点“重试”不一定恢复；大仓库（`geer2-xnm-code`）上更明显；
- 某个 workspace 的 Git 标签页一直“加载中”，换 workspace 才恢复。

## 2. 根因

### 2.1 仓库默认选中逻辑错误（主因）

`GitPanel` 旧逻辑：

```ts
const selectedRepo =
  repoEntries.find((entry) => entry.path === state.repo) ??
  repoEntries[0] ??
  null;
```

当工作目录本身不是 Git 仓库、但目录里含嵌套仓库时，`repoEntries[0]` 是那个嵌套仓库；`repo` 变成嵌套路径，文件页又直接用 `repo` 作为根，于是显示的是子仓库，不是当前目录。

### 2.2 文件根与仓库选择强绑定

旧版没有“文件是否跟随仓库”的设置，切仓库必然换文件根。DSH 原版默认文件根固定在项目根（`filesFollowRepo` 默认 false），两者语义不一致。

### 2.3 慢盘/大仓库快照超过 30 秒

快照会：

- 为未跟踪文件读取行数（最多 100 个文件、每个 1 MiB）；
- 对最多 300 个变更路径做 `stat` 取 mtime；
- 文件页对每个目录做 `readdir + stat + git check-ignore`。

在备份盘/大仓库上偶发超过 Paseo 的 30 秒 RPC 超时。超时后 React Query 保留旧 `data` 但 `isError=true`，于是出现“分支显示了、内容区报超时”。

同时没有并发合并：面板 5 秒轮询 + 多个 agent 的 pill 轮询会对同一仓库重复跑 `git status`，进一步放大超时概率。

### 2.4 目录读取错误被吞掉

`dirList` handler 曾 `catch { return { path, entries: [], truncated: false } }`，权限/超时/路径错误时表现为空白列表，而不是错误。

### 2.5 workspace 尚未加载/其他主机

`useWorkspace` 为 null 时一直显示“加载中”，没有超时提示；如果标签页属于其他主机的 workspace，会永久转圈。

## 3. 修复

| 文件 | 改动 |
|---|---|
| `client/panel.tsx` | `selectedRepo` 只接受 `state.repo` 或 workspace 根（`path === ""`），**不再回退 `repos[0]`**；工作目录不是 Git 仓库时 `hasRepo=false`，文件页仍从 cwd 开始；仓库弹层增加“工作区”条目；`cwd` 增加 `projectRootPath` 回退；5 秒未加载显示“工作区尚未加载”；新增 `GitAgentPanel`，按 `agent.cwd` 取目录 |
| `client/files.tsx` | 文件根默认 `repo=""`（cwd）；新增 `filesFollowRepo` 开关；顶部显示实际根路径；目录读取错误显示错误；文本预览增加词法着色 |
| `client/settings.tsx` | 新增“文件浏览跟随仓库”开关（默认关） |
| `shared/git.ts` | settings 增加 `filesFollowRepo: boolean.default(false)` |
| `index.client.tsx` | 注册 `git-panel-agent` agent 面板；新增 “Open Git panel for this agent” 命令 |
| `client/pill.tsx` | 点击标记改开 agent 级面板；轮询错峰、按 agent 去重、inflight 去重；刷新间隔 60s，设置轮询 15s |
| `index.server.ts` | 同一 `cwd+repo` 的快照**合并为单个 Promise**并缓存 1.2s；`dirList` 不再吞错 |
| `server/snapshot.ts` | 可选 enrich 设 **8 秒总预算**；status 超时 15s，其他 git 5–10s；mtime 改顺序采样并受预算约束；numstat 失败返回空统计而不是拖死 |
| `server/files.ts` | 单目录最多 500 项；文件大小只取前 300 项；`check-ignore` 最多 300 条、3 秒超时；路径仍做 realpath 包含检查 |
| `server/history.ts` | history 超时 15s |
| `server/repos.ts` | `rev-parse` 8s、`symbolic-ref` 5s，避免扫描被单条 git 卡住 30s |

## 4. 修复后行为

- 当前工作目录不是 Git 仓库但含子仓库：默认不选子仓库；文件页从当前目录开始；“总览/变更”显示“不是 Git 仓库”，可点“文件”继续浏览。
- 文件页默认固定在工作区/agent 目录；只有打开“文件浏览跟随仓库”后，切仓库才换根。
- 大仓库/慢盘：快照在 8 秒预算内返回（未跟踪行数/mtime 可能标记 partial），同一仓库并发请求合并；文件页单目录 500 项上限，不再等到 30 秒超时。
- 打开 agent 级面板时使用该 agent 的 `cwd`，与 DSH 原版“当前会话工作目录”的语义一致。
- workspace 未加载超过 5 秒显示明确提示，而不是一直转圈。
- 目录读取失败会显示错误，不再静默空白。

## 5. 验收

```bash
cd /Users/jiaweiwu/paseo-plugins/git-panel
npm run typecheck     # 通过
paseo plugin reload git-panel
paseo plugin ls       # git-panel  running  yes
paseo plugin logs git-panel  # Plugin ready
```

- 在 `geer2-xnm-code`（之前触发 30 秒超时的仓库）实测：总览、变更、文件页正常加载；文件页根路径显示为当前工作目录；未再出现 `Plugin RPC timed out`。
- 在本地 workspace 实测：输入框标记 `● JiaweiWu (master) *` 正常；点击标记打开 agent 面板。
- 设置页实测：输入框标记开关、编辑文件、文件浏览跟随仓库、默认 diff、变更列表、刷新间隔均可保存并生效。
- 非 Git 工作目录的“默认不选嵌套仓库”分支做了代码级检查，未单独造一个 Paseo workspace 做 UI 回归。

## 6. 回归注意事项

- client 端改动后必须在 Paseo 按 **⌘R**，否则运行的是旧 bundle。
- server 端改动后 `paseo plugin reload git-panel` 即可。
- 修改源码后同步快照：`rsync -a --delete --exclude node_modules --exclude .git --exclude '*.log' /Users/jiaweiwu/paseo-plugins/git-panel/ /Users/jiaweiwu/baidu_backup/macm1air/own/JiaweiWu/AI/raw/paseo/git-panel/`
- `paseo plugin install` 已安装的插件来自运行源码；仓库快照只用于留档/恢复。

## 7. 相关文档

- [01-初始需求与复刻说明.md](01-初始需求与复刻说明.md)
- 插件 README：`AI/raw/paseo/git-panel/README.md`
