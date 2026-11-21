// 基准页（顶部 tab「基准分支」）：选基准、看它领先多少与哪些提交、拉取。
// 拉取拆成「获取并合并」与「仅合并本地基准」；失败原因就地一行红字，原始输出按需展开。

import { Button, Code, Collapsible, read, Row, Select, set, Stack, Text } from 'orca'
import type { Copy } from './strings'
import {
  baseDegraded,
  baseDetailOpen,
  baseFailure,
  baseRefFor,
  branches,
  derived,
  pullBase,
  selected,
  setBaseRef,
  snapshot,
} from './state'

export function baseCard(text: Copy) {
  const snap = read(snapshot)
  if (!snap) return null
  const root = read(selected)
  const base = snap.base
  const chosen = baseRefFor(root) ?? base?.ref ?? ''
  const overwritten = base?.overwritten ?? { files: [], total: 0 }
  const blockedByOverwrite = overwritten.total > 0
  const d = derived(text)
  // 有未提交的已跟踪改动 / 正在合并时才整体禁用；未跟踪文件只在其会被覆盖时挡（见 overwritten）。
  const blocked = snap.staged.length > 0 || snap.modified.length > 0 || snap.operation !== null
  const failure = read(baseFailure)
  const degraded = read(baseDegraded)

  const remote = read(branches).filter((branch) => branch.remote)
  const local = read(branches).filter((branch) => !branch.remote)
  const options = [
    ...remote.map((branch) => ({ value: branch.name, label: branch.name })),
    ...local.map((branch) => ({ value: branch.name, label: `${branch.name} · ${text.localTag}` })),
  ]
  // 列表还没回来时至少保留当前基准，避免空选项把宿主控件变成不可用节点。
  if (chosen && !options.some((option) => option.value === chosen)) {
    options.unshift({ value: chosen, label: chosen })
  }

  return (
    <Stack gap="xs">
      {options.length ? (
        <Select
          label={text.baseBranchTitle}
          value={chosen}
          options={options}
          onChange={(value) => setBaseRef(value)}
        />
      ) : null}

      <Row justify="between" align="center" gap="xs">
        <Text size="sm" weight="medium" truncate>
          {base?.ref ?? '—'}
        </Text>
        <Text size="xs" tone={base && base.ahead > 0 ? 'warning' : 'success'}>
          {!base
            ? text.baseMissing
            : base.ahead > 0
              ? text.baseAhead(base.ahead)
              : text.baseUpToDate}
        </Text>
      </Row>

      {base?.commits.length ? (
        <Collapsible title={text.baseCommits(base.ahead)} defaultOpen>
          <Stack gap="none">
            {base.commits.map((commit) => (
              <Row key={commit.sha} gap="xs" align="center">
                <Text size="xs" muted>
                  {commit.sha}
                </Text>
                <Text size="xs" truncate>
                  {commit.subject}
                </Text>
              </Row>
            ))}
          </Stack>
        </Collapsible>
      ) : null}

      <Row gap="xs" align="center">
        <Button
          size="xs"
          variant="outline"
          icon="download"
          disabled={blocked || blockedByOverwrite || !base || base.ahead === 0}
          onPress={() => pullBase(true)}
        >
          {text.pullBaseFetch}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={blocked || blockedByOverwrite || !base || base.ahead === 0}
          onPress={() => pullBase(false)}
        >
          {text.pullBaseLocal}
        </Button>
      </Row>

      {blocked ? (
        <Text size="xs" muted>
          {snap.operation ? text.operationRunning(snap.operation) : text.dirtyBlock}
        </Text>
      ) : null}

      {blockedByOverwrite ? (
        <Stack gap="none">
          <Text size="xs" tone="warning">
            {text.overwriteBlocked(overwritten.total)}
          </Text>
          {overwritten.files.map((path) => (
            <Text key={path} size="xs" muted truncate>
              {path}
            </Text>
          ))}
          {overwritten.total > overwritten.files.length ? (
            <Text size="xs" muted>
              …
            </Text>
          ) : null}
        </Stack>
      ) : null}

      {base?.fellBackTo ? (
        <Text size="xs" muted>
          {text.baseFellBack(base.fellBackTo)}
        </Text>
      ) : null}

      {failure ? (
        <Stack gap="xs">
          <Text size="xs" tone="danger">
            {text.mergeFailure(failure.stage, failure.reason)}
          </Text>
          <Row gap="xs" align="center">
            <Button
              size="xs"
              variant="ghost"
              onPress={() => set(baseDetailOpen, !read(baseDetailOpen))}
            >
              {read(baseDetailOpen) ? text.hideRaw : text.viewRaw}
            </Button>
          </Row>
          {read(baseDetailOpen) ? <Code block>{failure.detail || '—'}</Code> : null}
        </Stack>
      ) : null}

      {degraded ? (
        <Text size="xs" muted>
          {text.mergeDegraded(degraded)}
        </Text>
      ) : null}
    </Stack>
  )
}
