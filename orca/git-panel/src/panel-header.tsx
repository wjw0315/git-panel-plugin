// 顶部两行：分支行（分支 / 刷新 / 脏标记 / 搜索 / 更多）+ 上游与基准/PR 行。
// 面板没有页签：搜索图标展开「历史」卡，更多图标展开「更多远端操作」卡，基准 chip 展开「基准」卡。

import { Badge, Button, IconButton, plugin, read, Row, Stack, Text } from 'orca'
import type { Copy } from './strings'
import {
  createPullRequest,
  derived,
  guard,
  selectTab,
  prStatus,
  selected,
  snapshot,
} from './state'

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
            onPress={() => selectTab('branch')}
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
            onPress={() => selectTab('history')}
          />
          <IconButton
            icon="more"
            size="xs"
            variant="ghost"
            label={text.moreShort}
            onPress={() => selectTab('remote')}
          />
        </Row>
      </Row>

      <Row justify="between" align="center" gap="xs">
        <Text size="xs" muted truncate>
          {d.aheadBehind} · {snap?.upstream ?? text.noUpstream}
        </Text>
        <Row gap="xs" align="center">
          {snap?.base && snap.base.ahead > 0 ? (
            <Button
              size="xs"
              variant="ghost"
              tone="warning"
              icon="download"
              onPress={() => selectTab('base')}
            >
              {text.baseAhead(snap.base.ahead)}
            </Button>
          ) : null}
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
      </Row>
    </Stack>
  )
}
