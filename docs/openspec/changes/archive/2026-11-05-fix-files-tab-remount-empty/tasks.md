## 1. 回归测试（RED）

- [x] 1.1 在插件工程中引入组件测试基础（vitest + jsdom + react-native 轻量 stub），并在 package.json 增加 `test` 脚本 <!-- comet-task:2955ef14-1627-4773-9dc0-247ef2d0d316 -->
- [x] 1.2 新增 `tests/files-tab.test.tsx`：模拟「挂载 → 卸载（切到其它 tab）→ 重新挂载且目录数据深度相等」；断言重新挂载后目录树仍有条目。修复前该用例必须失败 <!-- comet-task:0896e146-9e9b-4698-9ace-a21a98b0c184 -->

## 2. 修复（GREEN）

- [x] 2.1 修改 `client/files.tsx`：让仓库切换重置 effect 跳过首次挂载，只在 `repo` 真正变化时执行 <!-- comet-task:12d29c41-22b0-440a-a864-2e4da2efdc12 -->
- [x] 2.2 重跑 `tests/files-tab.test.tsx`，确认由失败转为通过 <!-- comet-task:dae121ed-c5e1-45d7-9309-5523d2bdd961 -->

## 3. 验证

- [x] 3.1 运行 `npm test` 与 `npm run typecheck`，记录真实输出 <!-- comet-task:7447a130-0cac-4038-bd34-b345b61a9714 -->
- [x] 3.2 同步到运行源码 `/Users/jiaweiwu/paseo-plugins/git-panel` 并 `paseo plugin reload git-panel` 确认 Plugin ready；界面「文件 → 总览 → 变更 → 文件」走查需用户在 Paseo 按 ⌘R 后确认（结果记入验证报告） <!-- comet-task:184d5a71-268a-42de-ab0e-48afc65fc779 -->

## 4. 刷新路径（用户复测补充）

- [x] 4.1 修复「点击刷新后文件树消失」：刷新不再依赖 `rootQuery.data` 引用变化，改为用 refetch 结果显式回填 `children`；补第三条回归用例并同步到运行源码
