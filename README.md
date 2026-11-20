# git-panel-plugin

两个宿主、两个独立的 Git 面板实现，共享同一套工作流取舍，不共享代码。

| 目录 | 宿主 | 形态 | 验证 |
| --- | --- | --- | --- |
| [`paseo/`](paseo/README.md) | Paseo | workspace 标签页面板 + 输入框上方 `<仓库> (<分支>)` 标记（React Native，`@getpaseo/plugin`） | `cd paseo && npm run typecheck && npm test` |
| [`orca/git-panel/`](orca/git-panel/README.md) | Orca | 右侧边栏 components 面板 + 状态栏项（`orca` 语义组件，trusted-worker） | `cd orca/git-panel && tsc -p . && orca plugin test . --json` |

- Paseo 端的运行副本是 `/Users/jiaweiwu/paseo-plugins/git-panel`，同步用 `cd paseo && npm run prototype`。
- Orca 端设计规则只对 `orca/git-panel/` 生效，见 [`orca/git-panel/.impeccable.md`](orca/git-panel/.impeccable.md)。
- 两端的测试、类型检查和受宿主限制的约束互不影响，改动请在自己的目录里验完再提交。
