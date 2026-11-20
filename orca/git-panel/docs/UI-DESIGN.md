# Orca Git 面板 · UI 设计（v3）

Status: design ready — 未落地。落地目标 `src/app.tsx` / `panel-header.tsx` / `commit-card.tsx` / `changes-tree.tsx` / `rows.tsx`。
视觉稿：[`ui-design.html`](ui-design.html)（六个状态 + 亮色一屏，浏览器直接打开）。

## 1. 基线

**唯一参考 = Orca 内置 Source Control。** 信息架构、分组顺序、文案、禁用原因、动作位置全部对齐它；用户在这里练出的肌肉记忆必须直接生效。

**唯一增量 = 仓库切换器**（主仓库 / 子模块 / 嵌套独立仓库），因为内置 SCM 只作用于工作区对应的那一个仓库。

**出现条件**：`repos.length > 1`。单仓库工作区下切换器**不渲染**，面板与内置逐像素同级。这条是硬规则——多出来的那一行只在真的需要时出现。

设计上下文（用户、立场、约束）见 [`../.impeccable.md`](../.impeccable.md)。

## 2. 布局骨架

```
┌ 320px 右侧边栏 ─────────────────────────────────┐
│ ① 切换器  [子模块 · vendor/lib  main ●  ▾]        │  仅 repos>1
│ ② 分支行  ⎇ main ▾   ↑2 ↓0   [PR #128 ▸]        │
│ ③ 提交盒  ┌────────────────────────────────┐    │
│           │ Message                         │    │
│           │                                 │    │
│           │ [ Commit ▾ ]        [ ··· ]     │    │
│           └────────────────────────────────┘    │
│    ☐ Amend last commit                          │
│ ④ 冲突条  Callout(danger) Merge in progress      │
│           ⚠ src/a.ts  both modified             │
│           [继续] [保留文件] [保留删除]            │
│ ⑤ 分组    Staged Changes 3      [⤓][⤒][🗑]      │
│           M  src/app.ts            [−][⟳][↗]    │
│           M  src/panel.tsx         [−][⟳][↗]    │
│           Changes 2             [⤓][🗑]         │
│           M  src/state.ts          [+][⟳][↗]    │
│           ?  docs/new.md (未跟踪)   [+][🗑][↗]   │
│ ⑥ 页脚    [在内置 Source Control 中打开]          │
└─────────────────────────────────────────────────┘
```

自上而下只有一个主轴：**分支 → 提交 → 待提交内容**。任何时候打开面板，提交盒都在首屏内。

## 3. 组件映射（只用宿主目录）

| # | 区域 | Orca 组件 | 关键 props |
|---|---|---|---|
| ① | 切换器 | `Select` | `labelHidden`，`options` 由 repos 生成，`value` = 当前仓库根 |
| ② | 分支行 | `Row` + `IconButton(branch)` + `Text` + `Badge` | `justify="between"`，`gap="xs"`；ahead/behind 用 `Text size="sm" muted`，PR 用 `Badge tone="accent"` |
| ③ | 提交盒 | `Box border radius="md" padding="sm"` + `Textarea` + `Row` + `Button variant="solid"` + `IconButton(more)` | `Textarea rows=3 labelHidden placeholder=Message`；主按钮 `size="sm"`；`···` 打开动作页 |
| ③b | Amend | `Checkbox` | `label={amend}`，无 staged 时 `disabled` |
| ④ | 冲突条 | `Callout tone="danger" title` + `Stack` 冲突行 + `Row` 动作 | 每个冲突一行，动作最多三个（继续 / 保留文件 / 保留删除） |
| ⑤ | 分组头 | `Row justify="between"` + `Text weight="medium"` + `Text muted` 计数 + `IconButton` 批量 | 批量按钮 `size="xs" variant="ghost"`，`label` 必填（tooltip+读屏）；图标：stage all `add` / unstage all `remove` / discard all `delete`(tone danger) |
| ⑤ | 文件行 | `Stack` + `Row` + `Box grow` 两行文字 + 行内 `IconButton` | **不能用 `List`+`ListItem`**：宿主拒绝「List 里放非 ListItem」，整块会渲染失败；行也不需要 `onPress`，所以就是纯 `Row`。行内图标：stage `add` / unstage `remove` / discard `delete` / 差异 `code` / 打开 `open-external` |
| ⑤ | 目录行 | `Collapsible` + 行内批量 `IconButton` | `defaultOpen`，`description` = `n files` |
| ⑤ | 行内 diff | `CodeView` | `lineNumbers wrap={false}`，只读统一 diff |
| ⑥ | 页脚 | `Button variant="ghost" size="xs" icon="open-external"` | 跳内置 SCM |
| — | 空态 | `EmptyState` | clean / 无仓库 / 无上游 各一条 |
| — | 加载 | `Spinner labelHidden` + `Skeleton` | 首屏 `Skeleton`，增量刷新只 `Spinner` |

## 4. 密度与排布规则

| 项 | 值 | 依据 |
|---|---|---|
| 面板间距 | `Stack gap="sm"` 外层，区域内部 `gap="xs"` | 宿主 gap 尺度，无自定义 px |
| 行高 | 文件行 `min-h-7`（28px）由 `ListItem` 决定 | 与内置列表一致，320px 下 10 行可见 |
| 字号 | 主行 `Text`（13），次要 `Text size="sm" muted`（12），状态字母 `Text size="xs" weight="semibold"`（11） | 3 级，不再多 |
| 路径 | `title` = basename，`description` = 目录；过长 `truncate` | 320px 下先看见文件名 |
| 状态字母 | 固定 14px 列：`M` warning / `A`·`U` success / `D` danger / `R`·`C` accent | 字母而非图标：图标白名单里没有 M/A/D |
| 主按钮禁用 | `disabled` + 右侧 `Text size="xs" muted` 原因（未暂存 / 需要提交信息 / 有冲突） | 与内置的禁用语义逐条对齐，不弹 toast、不改布局 |
| 行内动作 | 最多 4 个，顺序固定：内容动作 → 差异 → 打开 → 丢弃（danger） | staged 3 个（无丢弃）、modified 4 个、untracked 3 个（删除替代差异）；超过 4 个挪进目录/分组批量 |
| 横向 | 永不横向滚动；`CodeView wrap={false}` 自带横向滚动 | — |
| 分隔 | 组间 `Separator`，组内不画线 | 卡片套卡片禁止 |

## 5. 仓库切换器（唯一增量）

**形态**：面板最顶部一行 `Select`，与下面分支行同样的视觉重量，不加边框、不加标题。

**选项文案**（qa 只需对齐这一条格式）：

```
主仓库 · geer2-xforms (main) ●
子模块 · vendor/lib (main)
嵌套仓库 · tools/cli (dev) ●
```

- 前缀 `kind` 是唯一的类型指示，`●` = 脏（`tone` 由 `Text` 表达，不用图标）。
- 排序：主仓库 → 子模块（按 `git submodule status`）→ 嵌套仓库（按路径）。
- 未初始化的子模块显示 `子模块 · vendor/lib（未初始化）` 且 `disabled`。
- 选择按 `workspaceId` 持久化。

**防误提交**（关键）：`kind !== 'root'` 时，提交盒的主按钮文案改成 `提交到 子模块 vendor/lib`，冲突条与空态保持不变。不用横幅、不用额外颜色——只在动作按钮上说清楚往哪写。

**不做的**：不做分栏列表、不做仓库卡片、不在切换器里放分支选择（分支行已经有了）。

## 6. 文案（与内置逐条对译）

| 场景 | 内置（EN） | 面板（zh） |
|---|---|---|
| 分组 | `Staged Changes` / `Changes` / `Conflicts` | 已暂存的更改 / 更改 / 冲突 |
| 提交禁用 | `Nothing staged` / `Needs message` / `Conflicts` | 未暂存任何文件 / 需要提交信息 / 有冲突 |
| 主按钮 | `Commit` | 提交 |
| 菜单 | `More commit and remote actions` | 更多提交与远端操作 |
| 菜单项 | `Commit & Push` / `Commit & Sync` / `Commit & Force Push` | 提交并推送 / 提交并同步 / 提交并强推 |
| 远端 | `Push` / `Fetch` / `Pull` / `Fast-forward` / `Sync` / `Rebase from Base` / `Publish Branch` / `Create PR` / `Push then PR` | 推送 / 获取 / 拉取 / 快进 / 同步 / 变基到上游 / 发布分支 / 创建 PR / 先推再建 PR |
| 禁用原因 | `Branch is up to date` / `Not published` / `Commit changes first` / `Stash first` / `No branch` | 分支已是最新 / 未发布 / 请先提交更改 / 请先贮藏 / 无分支 |
| 丢弃确认 | `Discard all unstaged changes?` + `…cannot be undone` | 丢弃全部未暂存更改？+ 不可撤销 |
| 冲突 | `Merge in progress` / `Abort merge` / `Complete merge` | 合并进行中 / 中止合并 / 完成合并 |

## 7. 与内置的差异（全部有理由）

| 项 | 内置 | 本面板 | 理由 |
|---|---|---|---|
| 仓库切换 | 无 | 顶部 `Select` | 本插件存在价值 |
| 顶部 `Create PR` | 无（在溢出菜单里） | 同样只在「更多」页 | 与内置一致，顶部不放主按钮 |
| 溢出菜单 | 下拉菜单 | 「更多」页内的 13 行 | 组件目录没有 menu；行内带禁用原因，比 tooltip 更可读 |
| 提交图 | 图谱画布 | 文本提交列表 + 展开文件 | `CodeView` 之外没有画布组件 |
| AI 文案/PR 编辑 | 有 | 跳内置（面板底部一行） | 插件拿不到宿主 AI 通道；提交盒里也不再放「生成」按钮 |
| 冲突行 | 可标记已解决 / 保留一侧 | 只读清单 + 中止 / 继续 / 完成合并 | `git checkout --ours/--theirs` 与 `git add` 的解决动作尚未进 worker，属于下一步 |
| 贮藏 | 无（在内置的其他位置） | 独立页签 | 净增值，不与内置冲突 |
| 行内 diff | 内置编辑器 | `CodeView` 统一 diff | 只读，编辑跳编辑器 |

## 7b. 实现现状（2026-11-20）

本文第 2–5 节已落到 `src/`：

| 设计项 | 落点 | 状态 |
|---|---|---|
| 提交盒 `Box` + `Textarea` + 提交/`···` + 禁用原因 + amend `Checkbox` | `commit-card.tsx` | 完成 |
| 两组（已暂存的更改 / 更改）+ 组头批量图标 | `changes-tree.tsx` | 完成 |
| 目录小节（`Collapsible`）+ 目录级批量 | `changes-tree.tsx` | 完成 |
| 状态字母列、名称/目录两行、行数、行内动作 | `rows.tsx` | 完成 |
| 顶部两行（分支 / 上游 / PR / 脏标记 / 搜索 / 更多） | `panel-header.tsx` | 完成 |
| 冲突条 `Callout danger` + 操作名 + 冲突清单 | `conflict-banner.tsx` | 完成 |
| 切换器 `kind !== root` 时主按钮写目标 | `state.ts` `commitTarget()` | 完成 |
| 冲突行级解决动作 | — | 未做，见 §7 |

§8 第 5 步的「出图」改为结构核对：本机 `orca plugin check` 只输出渲染树（不落 PNG），像素级验收要在 Orca 里 `orca plugin dev watch .` 后看真实面板。

## 8. 落地顺序（已完成）

1. ~~提交盒抽成 `Box` 三件套~~
2. ~~分组头加批量 `IconButton`~~
3. ~~文件行加状态字母列~~
4. ~~切换器加 `kind !== 'root'` 的主按钮文案~~
5. 收尾：`orca plugin dev watch .` 后在 Orca 里逐屏对照第 2 节骨架

## 9. 门禁

```sh
cd orca/git-panel
tsc -p .                 # 全局 tsc 5.9；`npx tsc` 会失败（本包不装依赖）
orca plugin test . --json
orca plugin check . --json
```
