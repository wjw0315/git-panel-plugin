// 顶部两行（对齐内置）：分支行（分支 / 刷新 / 脏标记 / 搜索 / 更多）+ 上游与 PR 行。
// 创建 PR 不在顶部做成主按钮——它属于「更多提交与远端操作」，与内置菜单位置一致。

import { Badge, Button, IconButton, plugin, read, Row, Stack, Text } from 'orca'
import type { Copy } from './strings'
import { createPullRequest, derived, guard, prStatus, selected, showView, snapshot } from './state'

export function panelHeader(text: Copy) {
  const d = derived(text)
  const snap = read(snapshot)
  const pr = read(prStatus)

  return (
    <Stack gap="xs">
      <Row justify="between" align="center">
        <Row gap="xs" align="center">
          <IconButton
            icon="branch"
            size="xs"
            variant="ghost"
            label={text.viewBranches}
            onPress={() => showView('branches')}
          />
          <Text weight="medium" truncate>
            {snap?.branch ?? '—'}
          </Text>
          <IconButton
            icon="refresh"
            size="xs"
            variant="ghost"
            label={text.refresh}
            onPress={() =>
              void guard(() =>
                plugin.request('git.snapshot', { repoRoot: read(selected), fresh: true })
              )
            }
          />
        </Row>
        <Row gap="xs" align="center">
          <Badge tone={d.dirty ? 'warning' : 'success'}>
            {d.dirty ? text.dirty : text.cleanState}
          </Badge>
          <IconButton
            icon="search"
            size="xs"
            variant="ghost"
            label={text.searchCommits}
            onPress={() => showView('history')}
          />
          <IconButton
            icon="more"
            size="xs"
            variant="ghost"
            label={text.moreShort}
            onPress={() => showView('actions')}
          />
        </Row>
      </Row>

      <Row justify="between" align="center">
        <Text size="xs" muted truncate>
          {d.aheadBehind} · {snap?.upstream ?? text.noUpstream}
        </Text>
        {pr ? (
          <Button
            size="xs"
            variant="ghost"
            icon="open-external"
            onPress={() => createPullRequest(false)}
          >
            {text.prState(pr.state, pr.number)}
          </Button>
        ) : null}
      </Row>
    </Stack>
  )
}
