// 提交页（顶部 tab「提交」）：信息框、amend、已暂存文件、提交按钮 + ▾。
// 没有暂存也没有写信息时，页面顶部给一行提示，而不是整块空着。

import { Button, Checkbox, IconButton, read, Row, set, Stack, Text, Textarea } from 'orca'
import { fileRow } from './rows'
import type { Copy } from './strings'
import {
  amend,
  commitBlockReason,
  commitMenuOpen,
  commitTarget,
  commitWith,
  discardGroup,
  message,
  snapshot,
} from './state'

export function commitCard(text: Copy) {
  const snap = read(snapshot)
  const staged = snap?.staged ?? []
  const block = commitBlockReason(text)
  const allowed = block === null
  const target = commitTarget(text)
  const label = target ?? (read(amend) ? text.amendCommit : text.commit)
  const amendDisabled = snap === null || snap.operation !== null || snap.lastCommit === null

  return (
    <Stack gap="xs">
      <Row justify="between" align="center">
        <Text size="xs" muted>
          {staged.length ? text.stagedCount(staged.length) : text.needStaged}
        </Text>
        {staged.length ? (
          <IconButton
            icon="delete"
            size="xs"
            variant="ghost"
            tone="danger"
            label={text.discardAll}
            onPress={() => discardGroup('staged')}
          />
        ) : null}
      </Row>

      <Textarea
        label={text.message}
        labelHidden
        value={read(message)}
        rows={3}
        placeholder={read(amend) ? text.amend : text.message}
        onChange={(value) => set(message, value)}
      />

      <Checkbox
        label={text.amend}
        checked={read(amend)}
        disabled={amendDisabled}
        onChange={(checked) => set(amend, checked)}
      />

      {staged.map((file) => fileRow(file, text, 'staged'))}

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
    </Stack>
  )
}
