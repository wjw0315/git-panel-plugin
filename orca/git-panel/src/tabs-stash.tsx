// 贮藏页签：新建（可含未跟踪）+ 应用/弹出/删除。

import { Button, EmptyState, List, ListItem, read, RelativeTime, Row, set, Stack, Switch } from 'orca'
import type { Copy } from './strings'
import { includeUntracked, newStash, stashOp, stashes } from './state'

export function stashTab(text: Copy) {
  const stashList = read(stashes)
  return (
    <Stack gap="sm">
      <Row justify="between" align="center">
        <Switch
          label={text.includeUntracked}
          checked={read(includeUntracked)}
          onChange={(checked) => set(includeUntracked, checked)}
        />
        <Button size="sm" variant="solid" onPress={newStash}>
          {text.newStash}
        </Button>
      </Row>
      {stashList.length ? (
        <List>
          {stashList.map((entry) => (
            <ListItem
              key={entry.ref}
              title={entry.message || entry.ref}
              description={entry.branch ? `${entry.ref} · ${entry.branch}` : entry.ref}
            >
              <Row gap="xs" align="center">
                <RelativeTime at={entry.at} muted />
                <Button size="sm" variant="outline" onPress={() => stashOp(entry, 'apply')}>
                  {text.apply}
                </Button>
                <Button size="sm" variant="ghost" onPress={() => stashOp(entry, 'pop')}>
                  {text.pop}
                </Button>
                <Button size="sm" variant="ghost" tone="danger" onPress={() => stashOp(entry, 'drop')}>
                  {text.drop}
                </Button>
              </Row>
            </ListItem>
          ))}
        </List>
      ) : (
        <EmptyState title={text.noStashes} description={text.noStashesHint} icon="package" />
      )}
    </Stack>
  )
}
