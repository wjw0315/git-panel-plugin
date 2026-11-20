// 历史页签：PR 状态行 + 过滤 + 提交列表（点开看变更文件）+ 加载更多。

import {
  Badge,
  Button,
  Collapsible,
  IconButton,
  Input,
  List,
  ListItem,
  read,
  RelativeTime,
  Row,
  set,
  Spinner,
  Stack,
  Text,
} from 'orca'
import type { Copy } from './strings'
import {
  commitFilesMap,
  commitFilesOpen,
  historyCommits,
  historyFilter,
  historyHasMore,
  loadHistory,
  prStatus,
  toggleCommitFiles,
} from './state'
import { navRow } from './rows'

export function historyTab(text: Copy) {
  const commits = read(historyCommits)
  const status = read(prStatus)
  const open = read(commitFilesOpen)

  return (
    <Stack gap="sm">
      {navRow(text, 'history')}
      <Row justify="between" align="center">
        <Badge tone={status ? 'accent' : 'neutral'}>
          {status ? text.prState(status.state, status.number) : text.prNone}
        </Badge>
        <IconButton
          icon="refresh"
          size="xs"
          variant="ghost"
          label={text.refresh}
          onPress={() => {
            void loadHistory(true)
          }}
        />
      </Row>

      <Input
        label={text.tabHistory}
        labelHidden
        type="search"
        value={read(historyFilter)}
        placeholder={text.historyFilterPlaceholder}
        onChange={(value) => set(historyFilter, value)}
        onSubmit={() => {
          void loadHistory(true)
        }}
      />

      {commits.length === 0 ? (
        <Text size="xs" muted>
          {text.noCommits}
        </Text>
      ) : (
        <List>
          {commits.map((commit) => {
            const files = read(commitFilesMap)[commit.sha]
            return (
              <ListItem
                key={commit.sha}
                title={commit.subject}
                description={`${commit.sha.slice(0, 7)} · ${commit.author}${
                  commit.refs ? ` · ${commit.refs}` : ''
                }`}
              >
                <Stack gap="xs">
                  <Row gap="xs" align="center">
                    <RelativeTime at={commit.at} muted />
                    <IconButton
                      icon="code"
                      size="xs"
                      variant="ghost"
                      label={`${text.showDiff} ${commit.sha.slice(0, 7)}`}
                      onPress={() => toggleCommitFiles(commit.sha)}
                    />
                  </Row>
                  {open === commit.sha ? (
                    files === undefined ? (
                      <Spinner label={text.loading} labelHidden />
                    ) : files.length ? (
                      <Collapsible title={text.filesCount(files.length)} defaultOpen>
                        <List>
                          {files.map((file) => (
                            <ListItem
                              key={file.path}
                              title={file.path}
                              description={`+${file.additions ?? '?'} −${file.deletions ?? '?'}`}
                            />
                          ))}
                        </List>
                      </Collapsible>
                    ) : null
                  ) : null}
                </Stack>
              </ListItem>
            )
          })}
        </List>
      )}

      {read(historyHasMore) ? (
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            void loadHistory(false)
          }}
        >
          {text.loadMore}
        </Button>
      ) : null}
    </Stack>
  )
}
