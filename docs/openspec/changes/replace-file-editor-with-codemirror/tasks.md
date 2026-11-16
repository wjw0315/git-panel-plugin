# Tasks

## 1. 依赖与打包可行性

- [x] 1.1 在 `package.json` 增加 CodeMirror 6 依赖（state/view/commands/language/search + 语言包，锁定 minor 版本），执行 `npm install` 成功，并调整 `tsconfig.json` 的 `lib`/`types` 以容纳 DOM 与 CM 类型，`npm run typecheck` 通过。 <!-- comet-task:cc70203b-082e-4749-98ce-9ae1f3e4aa2b -->
- [x] 1.2 用与 Paseo daemon 相同的 esbuild 参数（`bundle/cjs/platform=neutral/target=es2020/async-await 降级/external 仅 SDK+react+react-native+zod+react-query`）编译一个含 `await import()` CM 的临时入口，确认编译成功、产物可在 jsdom 中 require，并记录产物字节数。 <!-- comet-task:6a639315-636d-4a19-b5a5-1a61b1eecea6 -->
- [x] 1.3 根据 1.2 的结果确认或回退方案：若 CM 无法打包或体积不可接受，记录实测数据并改用「只读高亮增强 + TextInput 编辑」的最小方案，同步更新 design.md。 <!-- comet-task:7487886e-28cc-41cf-b450-8acae0144ee0 -->

## 2. 编辑器核心模块

- [x] 2.1 新建 `client/editor/capability.ts`：DOM/平台检测与结果缓存；单测覆盖「有 document 为真」「无 document 为假」「失败后不重试」。 <!-- comet-task:3006d608-6b38-45fa-b0d0-4906d00bc310 -->
- [x] 2.2 新建 `client/editor/languages.ts`：扩展名 → 语言包懒加载映射（js/ts/json/markdown/html/css/python/java/cpp/rust/xml/yaml/sql）；单测覆盖已知与未知扩展名。 <!-- comet-task:a0aff306-7322-42b7-bdf5-5ed86182e89a -->
- [x] 2.3 新建 `client/editor/theme.ts`：由 `PluginTheme.colors` 生成 CM 主题与 `HighlightStyle`；单测断言关键颜色被映射（背景、前景、行号、选区、注释/字符串/关键字）。 <!-- comet-task:c4f83153-036e-4a80-b819-fa5ff2a987ed -->
- [x] 2.4 新建 `client/editor/codemirror.tsx`：`EditorView` 挂载/销毁、`Compartment` 承载 readOnly/语言/主题、行号、搜索、缩进、撤销、`⌘S`/`⌘Enter`/`Esc` 键位；jsdom 冒烟测试验证挂载、value 变更、readOnly 切换与卸载不抛错。 <!-- comet-task:6a3dc687-fb6f-4fde-9e2e-90f1985128f3 -->
- [x] 2.5 新建 `client/editor/plain-text.tsx`：抽取现有 `TextInput` 编辑与纯文本预览逻辑，行为与当前版本一致；组件测试覆盖输入、保存回调与只读态。 <!-- comet-task:1a677438-0b77-49be-9a20-0f2870bb0616 -->
- [x] 2.6 新建 `client/editor/index.tsx`：能力检测 → 懒加载 CM → 失败/异常回退 `plain-text`；单测覆盖三条降级路径（无 DOM、import 失败、渲染抛错经错误边界回退）。 <!-- comet-task:0e588ee1-3081-4506-8126-90c4848ddcf0 -->

## 3. 文件页接入与保存

- [x] 3.1 改造 `client/files.tsx`：编辑态与只读态接入 `Editor`，Markdown 保留「预览/源码」切换，源码态使用编辑器；组件测试覆盖打开文件、进入编辑、取消恢复。 <!-- comet-task:2b8e19f6-3f63-4620-8c3f-93fb6cafb15e -->
- [x] 3.2 新建 `client/editor/autosave.ts`：1.5s 防抖、单飞请求、保存成功刷新 sha256 基线、冲突即停；单测用 fake timers 覆盖防抖、并发输入合并、冲突后不再自动保存。 <!-- comet-task:d02e7a62-6f1c-4c44-b911-a5944291d9f4 -->
- [x] 3.3 冲突处理与生命周期：冲突横幅（重新加载/保留草稿）、切文件与关闭面板前 flush、定时器清理；测试覆盖切文件时立即保存与冲突时不丢草稿。 <!-- comet-task:8b7dc9ff-acf9-4797-8bf3-44157252fab3 -->
- [x] 3.4 大文件与降级：超过字符预算时不挂载 CM、显示降级提示；单测覆盖超限路径，并验证既有 `tooLarge` 行为不变。 <!-- comet-task:3946a088-da3d-48c0-86c3-53c692f0f07e -->

## 4. 设置与文案

- [x] 4.1 在 `shared/git.ts` 增加 `autoSaveFile`、`editorSyntaxHighlight`（默认 `true`）并更新默认值；单测/类型检查确认设置 schema 与旧配置兼容（缺字段回落到默认）。 <!-- comet-task:40e9acb4-47e7-4e84-928b-2c8d5f9b34ef -->
- [x] 4.2 `client/settings.tsx` 增加两个开关，`client/strings.ts` 补齐中英文案；`npm run typecheck` 通过，且新文案在设置页可见（人工核对）。 <!-- comet-task:7aa8be96-94fb-42e4-917c-a1fd22867320 -->

## 5. 集成验证与交付

- [x] 5.1 `npm run typecheck` 与 `npm run test` 全绿，记录命令与输出。 <!-- comet-task:fb1480a9-bc62-4901-be5b-738b38dae341 -->
- [x] 5.2 桌面端手工验证：只读高亮/行号、编辑、⌘S、1.5s 自动保存、冲突提示、Markdown 源码切换、大文件降级，逐项记录实际结果。 <!-- comet-task:31160bab-e9b3-4545-84f0-2753d390a1b9 -->
- [x] 5.3 降级验证：模拟无 DOM（单测）与真实移动端/窄屏路径，确认编辑器回退为纯文本且面板不崩。 <!-- comet-task:cb6d771a-9211-4c1f-8d6b-26ecd9f89fb1 -->
- [x] 5.4 部署到运行副本：rsync 到 `/Users/jiaweiwu/paseo-plugins/git-panel`、运行副本 `npm install`、`paseo plugin reload git-panel`，在 Paseo 内冒烟一次并检查插件日志无异常。 <!-- comet-task:71996cf6-08b1-43ef-87ad-a2d599550e32 -->
- [x] 5.5 更新 `README.md` / `OVERVIEW*.md`：补充编辑器能力、自动保存与冲突行为、新增设置项与部署步骤。 <!-- comet-task:7ec262c1-b80f-4272-9c8c-3cceeab1d2d7 -->

## Workflow follow-up

- 归档前确认 Verify 报告覆盖 5.1–5.3 的证据。
- 归档交付方式（local / push / pr）在 `/comet-archive` 一次确认。
