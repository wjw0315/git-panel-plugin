// 冲突条（对齐内置）：永远是第一个区块，抢在提交盒之前；操作名 + 未解决冲突清单 + 中止/继续。
import { Button, Callout, plugin, read, Row, Stack, Text } from 'orca'
import type { Copy } from './strings'
import { applyRequest, selected, snapshot } from './state'

const OPERATION_LABEL: Record<string, { zh: string; en: string }> = {
  merge: { zh: '合并进行中', en: 'Merge in progress' },
  rebase: { zh: '变基进行中', en: 'Rebase in progress' },
  'cherry-pick': { zh: '摘取进行中', en: 'Cherry-pick in progress' },
  revert: { zh: '回退进行中', en: 'Revert in progress' },
}

export function conflictBanner(text: Copy) {
  const snap = read(snapshot)
  if (!snap || (!snap.operation && snap.conflicts.length === 0)) return null
  const label = snap.operation ? OPERATION_LABEL[snap.operation] : null
  const title = label ? label[text.lang] : text.needResolve
  const blocked = snap.conflicts.length > 0

  return (
    <Callout tone="danger" title={title}>
      <Stack gap="xs">
        {snap.conflicts.length ? (
          <Stack gap="none">
            {snap.conflicts.map((path) => (
              <Row key={path} gap="xs" align="center">
                <Text size="xs" weight="semibold" tone="danger">
                  !
                </Text>
                <Text size="xs" truncate>
                  {path}
                </Text>
              </Row>
            ))}
          </Stack>
        ) : null}
        <Row gap="xs" align="center">
          <Button
            size="sm"
            variant="outline"
            tone="danger"
            onPress={() =>
              void applyRequest(plugin.request('git.abortOperation', { repoRoot: read(selected) }))
            }
          >
            {text.abortOperation}
          </Button>
          {snap.operation === 'merge' ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={blocked}
              onPress={() =>
                void applyRequest(plugin.request('git.completeMerge', { repoRoot: read(selected) }))
              }
            >
              {text.completeMerge}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={blocked}
              onPress={() =>
                void applyRequest(
                  plugin.request('git.continueOperation', { repoRoot: read(selected) })
                )
              }
            >
              {text.continueOperation}
            </Button>
          )}
        </Row>
      </Stack>
    </Callout>
  )
}
