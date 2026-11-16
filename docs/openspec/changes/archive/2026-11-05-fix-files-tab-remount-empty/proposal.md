## Why

用户报告：首次进入 Git 面板的「文件」tab 时文件树加载正常，切到「总览」再切到「变更」，切回「文件」后文件内容就再也加载不出来（文件树空白、无任何文件可点）。

这是 2026-11-04 交付版本（`docs/02-工作目录加载与RPC超时修复.md`）后的回归，会直接卡住日常「总览 → 变更 → 文件」的来回切换，只能重载面板或等缓存过期才恢复。

## What Changes

- 修复 `client/files.tsx` 在**挂载时**误执行的「仓库切换重置」逻辑，使从缓存回填的文件树不会被同一次提交清空。
- 保持行为不变的部分：切换仓库时仍要清空文件树/展开态/选中文件；RPC 契约、数据模型、设置项均不变。

**不涉及**：新增能力、public API（RPC 契约）、数据结构（schema）变更或跨模块协调。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无。仓库当前没有 main spec，本次只修复实现缺陷，不改变 spec 级验收场景）

## Impact

- 代码：`client/files.tsx`（状态初始化 effect）。运行源码 `/Users/jiaweiwu/paseo-plugins/git-panel` 与仓库快照需同步。
- 依赖：可能新增开发期测试依赖（vitest 等），不影响插件运行时依赖。
- 系统：Paseo 桌面端需 ⌘R 重载 client bundle 才能看到修复。
