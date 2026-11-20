// 提交盒（对齐内置）：一个带边框的盒子，里面是信息框、提交主按钮 + 更多收尾、amend 开关。
// 禁用时右侧给一行原因，不弹 toast、不改布局。非主仓库时主按钮写明往哪个仓库提交。

import { Box, Button, Checkbox, IconButton, read, Row, set, Stack, Text, Textarea } from 'orca'
import type { Copy } from './strings'
import {
  amend,
  commitBlockReason,
  commitMenuOpen,
  commitTarget,
  commitWith,
  message,
  snapshot,
} from './state'

export function commitCard(text: Copy) {
  const snap = read(snapshot)
  const block = commitBlockReason(text)
  const allowed = block === null
  const target = commitTarget(text)
  const label = target ?? (read(amend) ? text.amendCommit : text.commit)
  const amendDisabled = snap === null || snap.operation !== null || snap.lastCommit === null

  return (
    <Box border radius="md" padding="sm">
      <Stack gap="xs">
        <Textarea
          label={text.message}
          labelHidden
          value={read(message)}
          rows={3}
          placeholder={text.message}
          onChange={(value) => set(message, value)}
        />

        <Row justify="between" align="center" gap="xs">
          <Row gap="xs" align="center">
            <Button variant="solid" disabled={!allowed} onPress={() => commitWith('commit')}>
              {label}
            </Button>
            <IconButton
              icon="expand"
              size="xs"
              variant="ghost"
              label={text.commitMenu}
              onPress={() => set(commitMenuOpen, !read(commitMenuOpen))}
            />
          </Row>
          {block ? (
            <Text size="xs" muted>
              {block}
            </Text>
          ) : null}
        </Row>

        {read(commitMenuOpen) ? (
          <Stack gap="none">
            <Button variant="ghost" size="sm" disabled={!allowed} onPress={() => commitWith('push')}>
              {text.commitPush}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!allowed || !snap?.hasUpstream}
              onPress={() => commitWith('sync')}
            >
              {text.commitSync}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              tone="danger"
              disabled={!allowed || !snap?.hasUpstream}
              onPress={() => commitWith('force')}
            >
              {text.commitForce}
            </Button>
          </Stack>
        ) : null}

        <Checkbox
          label={text.amend}
          checked={read(amend)}
          disabled={amendDisabled}
          onChange={(checked) => set(amend, checked)}
        />
      </Stack>
    </Box>
  )
}
