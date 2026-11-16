## Why

Git 面板「文件」页的编辑器目前只是一个裸 `TextInput`：没有行号、没有语法高亮、没有快捷键、没有自动保存，只读预览也仅由 20 行正则 tokenizer 着色并在 4000 行处截断。用户在日常改配置、看代码时反复遇到「看不清结构、改完忘记保存、Markdown 只能看渲染结果」的问题，明确要求参照 Proma 的文本编辑器重做这一页。

Proma（本机 Electron 项目）的文件编辑器由三层组成：Markdown 用 `ink-mde`（CodeMirror 6）做实时预览，纯文本用 `<textarea>` + 1.5s 防抖自动保存，只读代码用 `@pierre/diffs`（shiki）做高保真高亮。Paseo 插件 UI 是 React Native primitives（桌面跑 Expo Web、移动端原生），无法直接搬运 DOM 依赖；但桌面端存在 DOM，可以用 CodeMirror 6 达成同等编辑体验，并在移动端优雅降级。

## What Changes

- 新增桌面端 CodeMirror 6 编辑器组件，替换文件页编辑态的 `TextInput`：行号、语法高亮、括号匹配、缩进、搜索、撤销栈、⌘S/⌘Enter 保存、Esc 退出。
- 只读预览同样改由 CodeMirror 6 渲染（`EditorState.readOnly`），替换现有正则高亮与 4000 行截断，补齐行号与语言着色。
- 采用 Proma 式保存模型：停止输入 1.5 秒防抖自动保存；`⌘S`/`⌘Enter` 立即保存；保存前仍用现有 sha256 基线做冲突检查，冲突时提示并保留草稿，不覆盖磁盘。
- Markdown 文件保留「预览 / 源码」切换，源码态由 CodeMirror 6 渲染与编辑；预览态继续使用 Paseo 的 `Markdown` 组件。
- 移动端或没有 DOM 的宿主（`Platform`/`hasDom` 判定失败）自动降级为现有 `TextInput` 编辑 + 现有文本预览，功能不缺失、不崩溃。
- 新增必要的设置项与双语文案：自动保存开关（默认开）、是否在编辑态启用语法高亮（默认开）。
- 依赖新增 `@codemirror/state`、`@codemirror/view`、`@codemirror/commands`、`@codemirror/language`、`@codemirror/search` 与若干 `@codemirror/lang-*` 语言包；客户端按需动态加载，避免原生端在模块求值阶段访问 DOM。

**不涉及**：Tiptap 富文本编辑、shiki/pierre 渲染、服务端 RPC 契约变更、可编辑文件白名单与 2 MiB 上限调整、全仓库搜索、多标签编辑器。

## Capabilities

### New Capabilities

- `file-editor`: 文件页的编辑与只读预览行为，包括桌面编辑器交互、自动保存与冲突处理、Markdown 源码/预览切换、移动端降级和大文件降级。

### Modified Capabilities

（无。仓库当前没有已归档的 main spec，本次新建 `file-editor` 能力。）

## Impact

- 代码：`client/files.tsx`（接入新编辑器、保存与冲突流程）、新增 `client/editor/`（CodeMirror 封装、语言映射、主题桥接）、`client/settings.tsx` 与 `client/strings.ts`（新设置与双语文案）、`client/diff.ts`（保留或收敛正则高亮）、`shared/git.ts`（设置 schema）。
- 依赖：新增 CodeMirror 6 系列包；不改变 Paseo 插件 SDK 版本，不改服务端 RPC。
- 部署：源码在仓库内实现与验证；运行副本 `/Users/jiaweiwu/paseo-plugins/git-panel` 需要同步文件并安装新依赖，然后 `paseo plugin reload git-panel`。
- 风险：Paseo 插件客户端由 esbuild（`platform: neutral`、`async-await` 降级）打包，需验证 CodeMirror 在 Expo Web 宿主中的挂载、尺寸测量与键盘事件；自动保存与 sha256 冲突的交互需要明确的状态机，避免循环保存或覆盖用户草稿。
