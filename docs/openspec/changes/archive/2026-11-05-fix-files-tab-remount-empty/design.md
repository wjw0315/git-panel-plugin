# 修复方案：切回「文件」tab 后文件树为空

## 1. 现象

1. 打开 Git 面板 → 切到「文件」→ 目录树正常，点文件能预览。
2. 切到「总览」，再切到「变更」，然后切回「文件」。
3. 文件 tab 变成空白：没有目录树、也没有文件可点，刷新按钮也不能恢复，只有重载面板（或离开文件 tab 超过缓存回收时间）才恢复。

## 2. 根因

`client/panel.tsx` 用条件渲染切换内部 tab：

```tsx
} else if (state.tab === "files") {
  body = <FilesTab ... />;
}
```

因此离开「文件」会**卸载** `FilesTab`，切回来会**重新挂载**。而 `FilesTab` 把根目录列表从 React Query 缓存复制到本地 state：

```tsx
const rootQuery = useDirQuery(cwd, repo, "", true);
const [children, setChildren] = useState<Record<string, DirEntry[]>>({});

// A：缓存就绪 → 回填根目录
useEffect(() => {
  if (rootQuery.data) setChildren({ "": rootQuery.data.entries });
}, [rootQuery.data]);

// B：仓库变化 → 清空
useEffect(() => {
  setSelected(null);
  setExpanded(new Set());
  setChildren({});
  setEditing(false);
}, [repo]);
```

问题在 effect B 的依赖是 `[repo]`，而 **`useEffect` 在挂载时一定会执行一次**，不只在值变化时执行。重新挂载时同一轮提交里先跑 A（用缓存回填）再跑 B（清空），最终 `children` 为 `{}` → 目录树空白。

更关键的是它**不会自愈**：React Query v5 默认开启 `structuralSharing`（`query-core` 5.105.3 `replaceEqualDeep`）。目录内容没变时，重新请求的结果与缓存深度相等，`data` 会**保留旧引用**。于是 `[rootQuery.data]` 依赖不再变化 → effect A 不会再次回填 → 文件树一直是空的。点刷新按钮虽然会 refetch，但结果同样深度相等、引用不变，依然不触发 effect A。只有等到 query 缓存被回收（`gcTime` 默认 5 分钟）后重新拉取出新引用，才会恢复——这解释了「切回去就再也加载不出来」。

## 3. 修复

让 effect B 只在 `repo` **真正变化**时执行，挂载时不执行：

```tsx
const previousRepo = useRef(repo);
useEffect(() => {
  if (previousRepo.current === repo) return;
  previousRepo.current = repo;
  setSelected(null);
  setExpanded(new Set());
  setChildren({});
  setEditing(false);
}, [repo]);
```

- 挂载时 `children` / `expanded` / `selected` 本来就是初始值，跳过重置不损失任何行为。
- 切换仓库时仍然重置，保持原有语义（否则会显示上一个仓库的目录内容）。
- effect A 保持原样，挂载即可从缓存回填，切换 tab 往返后能被正确恢复。

## 3.1 同一个根因的第二个触发点：刷新按钮

目录树头部的刷新按钮原本是「先清空 `children` 再 `rootQuery.refetch()`」，同样把恢复寄托在 `data` 引用变化上。目录内容没变时（正常刷新最常见的情况）`structuralSharing` 保留旧引用 → 回填 effect 不触发 → 点一次刷新，树就没了。

修复：刷新不再先清空，改为 `refetch()` 之后用返回值显式回填：

```tsx
const refreshTree = () => {
  setExpanded(new Set());
  void rootQuery.refetch().then((result) => {
    if (result.data) setChildren({ "": result.data.entries });
  });
};
```

这样「内容没变」表现为树保持不动（正确语义），「内容变了」则由显式回填更新。

## 4. 回归测试

组件级回归测试：用真实 `useDirQuery`/React Query（只替换最底层 `useGitApi` 的 RPC 调用），模拟

1. 首次挂载 → 目录树渲染；
2. 卸载（切到其它 tab）；
3. 再次挂载，且 stub 返回**结构相等的新数组**（模拟 `structuralSharing` 保留引用）。

断言第 3 步目录树仍然渲染出条目。修复前该断言失败，修复后通过。

## 5. 不做的事

- 不改变 `FilesTab` 的可见行为（不新增持久化 tab 状态、不改变刷新策略）。
- 不修改 RPC 契约、服务端逻辑与设置项。
- 不在本次处理 `FilePreview` 在请求出错时渲染空白的问题（属于另一个独立缺陷，另行记录）。
