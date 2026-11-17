# 领域文档

工程技能在探索代码库时，应按本文件规则消费本仓库的领域文档。

## 探索前先读

- 仓库根目录的 **`GLOSSARY.md`**，或
- 如果存在 **`GLOSSARY-MAP.md`**：它指向每个上下文的 `GLOSSARY.md`。读取与当前主题相关的每一个。
- **`docs/adr/`**：读取涉及即将改动区域的 ADR。多上下文仓库还要检查 `src/<context>/docs/adr/` 中的上下文级决策。

如果这些文件不存在，**静默继续**。不要指出缺失，也不要一开始就建议创建它们。`/domain-modeling` 技能（通过 `/grill-with-docs` 和 `/improve-codebase-architecture` 到达）会在术语或决策真正确定时按需创建。

## 文件结构

单上下文仓库（大多数仓库）：

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（根目录存在 `GLOSSARY-MAP.md`）：

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← 上下文级决策
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

本仓库为**单上下文（single-context）**。

## 使用术语表词汇

当输出中提到领域概念（issue 标题、重构提案、假设、测试名）时，使用 `GLOSSARY.md` 定义的术语。不要漂移到术语表明确避免的同义词。

如果需要的概念还不在术语表中，这是一个信号：要么你在发明项目不使用的语言（重新考虑），要么存在真实缺口（记录给 `/domain-modeling`）。

## 标记 ADR 冲突

如果你的输出与现有 ADR 矛盾，明确指出来，不要静默覆盖：

> _与 ADR-0007（事件溯源订单）矛盾，但值得重新讨论，因为……_
