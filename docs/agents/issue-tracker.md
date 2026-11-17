# 问题追踪：本地 Markdown

本仓库的 issue 和规格以 `.scratch/` 下的 Markdown 文件存放。

## 约定

- 一个功能一个目录：`.scratch/<feature-slug>/`
- 规格文件：`.scratch/<feature-slug>/spec.md`
- 实现工单：每个工单一个文件，位于 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号，绝不合并成单个 tickets 文件
- 分类状态写在每个工单文件顶部附近的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论和对话历史追加到文件末尾的 `## Comments` 标题下

## 当技能要求“发布到 issue tracker”

在 `.scratch/<feature-slug>/` 下新建文件（必要时先创建目录）。

## 当技能要求“获取对应工单”

读取指定路径的文件。用户通常会直接给出路径或 issue 编号。

## Wayfinding 操作

供 `/wayfinder` 使用。**地图**是一个文件，每个**子工单**对应一个文件。

- **地图**：`.scratch/<effort>/map.md`，存放 Notes / Decisions-so-far / Fog 正文。
- **子工单**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 开始编号，正文写问题本身。`Type:` 行记录工单类型（`research`/`prototype`/`grilling`/`task`）；`Status:` 行记录 `claimed`/`resolved`。
- **阻塞**：顶部附近的 `Blocked by: NN, NN` 行。当它列出的每个文件都是 `resolved` 时，该工单解除阻塞。
- **前沿（Frontier）**：扫描 `.scratch/<effort>/issues/`，找出未关闭、未阻塞、未被认领的文件；编号最小者优先。
- **认领（Claim）**：把 `Status:` 设为 `claimed`，并在开始任何工作前保存。
- **解决（Resolve）**：在 `## Answer` 标题下追加答案，把 `Status:` 设为 `resolved`，然后把上下文指针（要点 + 链接）追加到 `map.md` 的 Decisions-so-far。
