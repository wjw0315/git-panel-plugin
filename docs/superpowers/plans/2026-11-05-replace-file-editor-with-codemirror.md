---
change: replace-file-editor-with-codemirror
design-doc: docs/openspec/changes/replace-file-editor-with-codemirror/design.md
base-ref: 812432cb17b6c89f6ce7c7bf2af40dbe70a8e065
---

# 实施计划：用 CodeMirror 6 替换文件页编辑器

<!-- comet-task-authority: docs/openspec/changes/replace-file-editor-with-codemirror/tasks.md -->

依据：`docs/openspec/changes/replace-file-editor-with-codemirror/{proposal.md,design.md,specs/file-editor/spec.md}`。
配置：autonomous + tdd + standard review。每个任务先记录 RED（失败测试/失败编译）再实现 GREEN；任务完成以 tests.md 勾选 + 检查证据为准。

## 1. 依赖与打包可行性

### 1.1 安装 CodeMirror 6 并让 typecheck 通过

<!-- comet-task-ref:cc70203b-082e-4749-98ce-9ae1f3e4aa2b -->

- 范围：`package.json` 增加 `@codemirror/state`、`@codemirror/view`、`@codemirror/commands`、`@codemirror/language`、`@codemirror/search`、`@codemirror/autocomplete`（如需要）与 `@codemirror/lang-{javascript,json,markdown,html,css,python,java,cpp,rust,xml,yaml,sql}`；`tsconfig.json` 加 `DOM` lib（仅 client 需要，注意 server 文件仍只用 node 类型）。
- 约束：只加 devDependencies（插件由 daemon 打包，运行时依赖从 bundle 解析）；版本用 `^6` 一档，避免多语言包版本漂移。
- 验收：`npm install` 成功；`npm run typecheck` 通过；`git diff package.json` 只含预期依赖。
- 回退：删除新增依赖与 tsconfig lib 改动，回到当前基线。

### 1.2 用 daemon 同参数做打包 spike

<!-- comet-task-ref:6a639315-636d-4a19-b5a5-1a61b1eecea6 -->

- 范围：用脚本（临时文件，不提交）以 esbuild `bundle: true, format: "cjs", platform: "neutral", target: "es2020", supported: { "async-await": false }, mainFields: ["module","main"], external: [SDK 列表, "@tanstack/react-query", "react", "react/jsx-runtime", "react-native", "zod"]` 编译一个含 `await import("@codemirror/view")` 的入口。
- 验收：编译成功；产物可在 jsdom 中 `require` 且不因模块顶层访问 `document`/`navigator` 抛错；记录产物字节数（写入计划或验证报告）。
- 理由：daemon 编译失败会直接让插件无法加载，必须在写业务代码前确认。

### 1.3 依据 spike 结论定稿或回退

<!-- comet-task-ref:7487886e-28cc-41cf-b450-8acae0144ee0 -->

- 若 1.2 通过：继续第 2 组；把实测体积写入 design.md 的 Risks。
- 若失败或体积不可接受：记录实测数据，改走「只读静态高亮增强 + TextInput 编辑」最小方案，更新 design.md 与本计划，并在 tasks.md 调整后续任务（属于小规模增量，不重开 Open/Design）。
- 验收：design.md 的 Risks 段落含实测结论，或计划/任务已按回退方案改写。

## 2. 编辑器核心模块

依赖：1.x 完成。所有模块放 `client/editor/`，纯函数与 React 组件分离，便于单测。

### 2.1 能力检测

<!-- comet-task-ref:3006d608-6b38-45fa-b0d0-4906d00bc310 -->

- 实现 `capability.ts`：`canUseDom()` 检查 `typeof document !== "undefined" && typeof document.createElement === "function"`，并要求 `Platform.OS === "web"`；模块级缓存成功结果与失败结果；导出 `resetCapabilityCacheForTests()`。
- TDD：先写 `tests/editor-capability.test.ts` 覆盖有/无 document、Platform 非 web、缓存不重试 → RED → 实现 → GREEN。
- 验收：`npx vitest run tests/editor-capability.test.ts` 通过。

### 2.2 语言映射

<!-- comet-task-ref:a0aff306-7322-42b7-bdf5-5ed86182e89a -->

- 实现 `languages.ts`：`languageFor(path): () => Promise<Extension | null>`，按扩展名返回懒加载函数；未知扩展返回 `async () => null`。
- TDD：先写 `tests/editor-languages.test.ts`（js/ts/json/md/html/css/py/java/cpp/rs/xml/yml/sql 命中，`.txt`/无扩展名返回 null）→ RED → GREEN。
- 验收：该测试通过，且动态 import 写法与 daemon 打包参数兼容（1.2 的 spike 复用）。

### 2.3 主题桥接

<!-- comet-task-ref:c4f83153-036e-4a80-b819-fa5ff2a987ed -->

- 实现 `theme.ts`：`createEditorTheme(theme: PluginTheme): Extension`，用 `EditorView.theme` 覆盖背景、前景、光标、选区、行号槽、活动行；`HighlightStyle` 将 comment/string/keyword/number 映射到现有配色。
- TDD：先写 `tests/editor-theme.test.ts` 断言关键颜色出现在生成的 theme spec 中 → RED → GREEN。
- 验收：测试通过；颜色值与 `client/diff.ts` 现有 token 配色一致（人工核对）。

### 2.4 CodeMirror 组件

<!-- comet-task-ref:6a3dc687-fb6f-4fde-9e2e-90f1985128f3 -->

- 实现 `codemirror.tsx`：`useEffect` 中创建 `EditorView`，父容器由 `View` 包裹的 DOM 节点承载；`Compartment` 管理 `readOnly`、语言、主题；配置行号、历史、搜索、括号匹配、缩进；`Prec.highest` 绑定 `Mod-s`/`Mod-Enter`/`Escape`；卸载时 `destroy()`。
- 边界：`value` 外部变化时用 `dispatch({changes})` 同步，不重建实例；只读时关闭编辑键位与历史。
- TDD：先写 `tests/editor-codemirror.test.tsx`（jsdom 挂载、value 更新、readOnly 切换、卸载无异常）→ RED → GREEN；若 jsdom 缺少测量 API 导致无法挂载，测试必须显式跳过并记录原因，不得伪造通过。
- 验收：该测试通过或明确 skip 并记录；`npm run typecheck` 通过。

### 2.5 纯文本降级组件

<!-- comet-task-ref:1a677438-0b77-49be-9a20-0f2870bb0616 -->

- 实现 `plain-text.tsx`：把现有 `TextInput` 编辑与纯文本预览抽成组件，props 与 CM 组件对齐；保留原有样式与 `textAlignVertical`。
- TDD：先写 `tests/editor-plain-text.test.tsx`（输入回调、只读渲染、行号）→ RED → GREEN。
- 验收：测试通过；`client/files.tsx` 现有行为测试（3.1 前）不受影响。

### 2.6 统一入口与降级

<!-- comet-task-ref:0e588ee1-3081-4506-8126-90c4848ddcf0 -->

- 实现 `index.tsx`：`Editor` 先判断能力 → 懒加载 `codemirror.tsx`（`React.lazy` 或 state + dynamic import）→ 失败或抛错回退 `plain-text`；用错误边界捕获 CM 渲染异常并上报（复用 `useErrorReport` 通道）。
- TDD：先写 `tests/editor-fallback.test.tsx` 覆盖三条路径（无 DOM、import reject、子组件 throw）→ RED → GREEN。
- 验收：测试通过；降级时控制台/日志有明确原因。

## 3. 文件页接入与保存

依赖：2.x 完成。

### 3.1 接入编辑与只读

<!-- comet-task-ref:2b8e19f6-3f63-4620-8c3f-93fb6cafb15e -->

- 改造 `client/files.tsx`：`FilePreview` 的编辑分支与只读文本分支改为 `<Editor>`；Markdown 保留 `Markdown` 预览与「预览/源码」切换，源码态用 `<Editor readOnly>`；图片/二进制/tooLarge 分支不变。
- TDD：扩展 `tests/files-tab.test.tsx`：打开文件、进入编辑、取消恢复、Markdown 切换 → 先 RED → 实现 → GREEN。
- 验收：该测试通过；`npm run typecheck` 通过。

### 3.2 自动保存状态机

<!-- comet-task-ref:d02e7a62-6f1c-4c44-b911-a5944291d9f4 -->

- 实现 `autosave.ts`：`createAutosave({ save, delayMs: 1500 })` 返回 `{ schedule(draft, baseSha), flush(), cancel(), state$() }`；单飞（saving 期间只记录最新草稿）；成功后由调用方更新基线；冲突错误终止调度并进入 `conflict`。
- TDD：先写 `tests/editor-autosave.test.ts`（fake timers：1.5s 后触发一次、连续输入只发最后一次、saving 期间再输入会排队一次、冲突后不再自动重试、成功回调收到新 sha）→ RED → GREEN。
- 验收：测试通过。

### 3.3 冲突与生命周期

<!-- comet-task-ref:8b7dc9ff-acf9-4797-8bf3-44157252fab3 -->

- 在 `FilePreview` 增加冲突横幅（「重新加载」= 重新拉取内容并重置草稿；「保持草稿」= 关闭横幅、保持 conflict 状态直到手动保存）；切文件/关闭面板前 `flush()`；卸载清定时器；保存成功把返回的 `sha256` 写回基线。
- TDD：扩展 `tests/files-tab.test.tsx`（切文件触发立即保存、冲突时保留草稿且不覆盖、重新加载后恢复可编辑）→ RED → GREEN。
- 验收：测试通过；人工在桌面端复现一次冲突（外部改文件后自动保存）。

### 3.4 大文件与降级

<!-- comet-task-ref:3946a088-da3d-48c0-86c3-53c692f0f07e -->

- 逻辑：`tooLarge` 或内容长度 > `PREVIEW_CHAR_LIMIT`（40 万字符）时不挂载 CM，显示纯文本 + 降级提示；保留服务端 2 MiB 限制。
- TDD：扩展测试覆盖超限路径与提示文案 → RED → GREEN。
- 验收：测试通过；打开大文件面板不卡死（人工）。

## 4. 设置与文案

### 4.1 设置 schema

<!-- comet-task-ref:40e9acb4-47e7-4e84-928b-2c8d5f9b34ef -->

- `shared/git.ts` 增加 `autoSaveFile: z.boolean().default(true)`、`editorSyntaxHighlight: z.boolean().default(true)`，更新 `DEFAULT_SETTINGS`；旧配置缺字段时回落默认。
- TDD：先写测试断言默认值合并与解析 → RED → GREEN。
- 验收：测试通过，`npm run typecheck` 通过。

### 4.2 设置 UI 与双语文案

<!-- comet-task-ref:7aa8be96-94fb-42e4-917c-a1fd22867320 -->

- `client/settings.tsx` 增加两个 `SettingsSwitch`；`client/strings.ts` 补中英文；文案说明自动保存与冲突行为。
- 验收：`npm run typecheck` 通过；设置页人工可见两个开关（5.2 一并核对）。

## 5. 集成验证与交付

### 5.1 全量检查

<!-- comet-task-ref:fb1480a9-bc62-4901-be5b-738b38dae341 -->

- `npm run typecheck`、`npm run test` 全绿；用 `comet check run replace-file-editor-with-codemirror build --local -- npm run typecheck` 与 `... -- npm run test` 录制证据（cwd = 项目根）。

### 5.2 桌面手工验证

<!-- comet-task-ref:31160bab-e9b3-4545-84f0-2753d390a1b9 -->

- 部署到运行副本后逐项验证：行号/高亮、编辑、⌘S、1.5s 自动保存、冲突提示与两种处理、Markdown 源码切换、大文件降级；结果写 `docs/superpowers/reports/2026-11-05-editor-verify.md`。

### 5.3 降级验证

<!-- comet-task-ref:cb6d771a-9211-4c1f-8d6b-26ecd9f89fb1 -->

- 单测覆盖无 DOM；真实端以窄屏/移动布局打开文件确认回退为纯文本且不崩。

### 5.4 部署到运行副本

<!-- comet-task-ref:71996cf6-08b1-43ef-87ad-a2d599550e32 -->

- `rsync -a --delete --exclude node_modules --exclude .git --exclude '*.log' <repo>/ /Users/jiaweiwu/paseo-plugins/git-panel/`
- 运行副本 `npm install`（新依赖）
- `paseo plugin reload git-panel`，检查 `paseo plugin logs git-panel` 无异常
- 回退：把运行副本恢复到上一个可用提交 + `npm install` + reload。

### 5.5 文档

<!-- comet-task-ref:7ec262c1-b80f-4272-9c8c-3cceeab1d2d7 -->

- 更新 `README.md`、`OVERVIEW.md`、`OVERVIEW.zh-CN.md`：编辑器能力、自动保存/冲突行为、新设置项、部署步骤。

## 审查安排（standard）

- 每完成一个任务组（1/2/3/4）后，由独立审查者（子代理）复查该组 diff（spec 符合性 + 风险点）。
- 最后一段（第 5 组）不单独审查，交由 Verify 的唯一最终集成审查。
