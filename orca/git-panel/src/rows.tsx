// 行级渲染：文件行（状态字母 + 名称 + 目录 + 行数 + 行内动作 + 行内 diff）、子模块行、更多动作行。
// 行不绑 onPress——Orca 拒绝「带 onPress 的 ListItem 内放按钮」，所以行就是 Row，动作是 IconButton。

import {
  Box,
  Button,
  CodeView,
  IconButton,
  plugin,
  read,
  Row,
  Spinner,
  Stack,
  Text,
  type Tone,
} from 'orca'
import type { FileChange, GitSnapshot, SubmoduleEntry } from './protocol'
import type { Copy } from './strings'
import {
  applyRequest,
  diffOpen,
  diffText,
  openFile,
  selectRepo,
  selected,
  toggleDiff,
} from './state'

const STATUS_LETTER: Record<string, string> = {
  modified: 'M',
  added: 'A',
  untracked: '?',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typechange: 'T',
  conflict: 'U',
}

const STATUS_TONE: Record<string, Tone> = {
  modified: 'warning',
  added: 'success',
  untracked: 'success',
  deleted: 'danger',
  conflict: 'danger',
  renamed: 'accent',
  copied: 'accent',
}

function splitPath(path: string): { name: string; dir: string } {
  const slash = path.lastIndexOf('/')
  return slash < 0
    ? { name: path, dir: '' }
    : { name: path.slice(slash + 1), dir: path.slice(0, slash) }
}

function lineStat(file: FileChange): string {
  const parts: string[] = []
  if (file.additions !== null && file.additions > 0) parts.push(`+${file.additions}`)
  if (file.deletions !== null && file.deletions > 0) parts.push(`−${file.deletions}`)
  return parts.join(' ')
}

/** 文件行：字母 + 文件名（+ 可选目录副行）+ 行数 + 行内动作；没有展开 diff 时只有一行。 */
export function fileRow(
  file: FileChange,
  text: Copy,
  group: 'staged' | 'changes',
  showDir = true
) {
  const staged = group === 'staged'
  const untracked = file.status === 'untracked'
  const key = `${staged ? 's' : 'w'}:${file.path}`
  const open = read(diffOpen) === key
  const diff = read(diffText)[key]
  const { name, dir } = splitPath(file.path)
  const root = read(selected)
  const stat = lineStat(file)

  const row = (
      <Row gap="xs" align="center">
        <Text size="xs" weight="semibold" tone={STATUS_TONE[file.status] ?? 'neutral'}>
          {STATUS_LETTER[file.status] ?? 'M'}
        </Text>
        <Box grow direction="column" gap="none">
          <Text size="sm" truncate>
            {name}
          </Text>
          {dir && showDir ? (
            <Text size="xs" muted truncate>
              {dir}
            </Text>
          ) : null}
        </Box>
        {stat ? (
          <Text size="xs" muted>
            {stat}
          </Text>
        ) : null}
        <Row gap="none" align="center">
          {staged ? (
            <IconButton
              icon="remove"
              size="xs"
              variant="ghost"
              label={`${text.unstage} ${file.path}`}
              onPress={() =>
                void applyRequest(
                  plugin.request('git.unstage', { repoRoot: root, paths: [file.path] })
                )
              }
            />
          ) : (
            <IconButton
              icon="add"
              size="xs"
              variant="ghost"
              label={`${text.stage} ${file.path}`}
              onPress={() =>
                void applyRequest(
                  plugin.request('git.stage', { repoRoot: root, paths: [file.path] })
                )
              }
            />
          )}
          {untracked ? (
            <IconButton
              icon="delete"
              size="xs"
              variant="ghost"
              tone="danger"
              label={`${text.remove} ${file.path}`}
              onPress={() =>
                void applyRequest(
                  plugin.request('git.discard', { repoRoot: root, paths: [file.path] })
                )
              }
            />
          ) : (
            <IconButton
              icon="code"
              size="xs"
              variant="ghost"
              label={`${text.showDiff} ${file.path}`}
              onPress={() => toggleDiff(file.path, staged)}
            />
          )}
          <IconButton
            icon="open-external"
            size="xs"
            variant="ghost"
            label={`${text.openFile} ${file.path}`}
            onPress={() => openFile(file.path)}
          />
          {!staged && !untracked ? (
            <IconButton
              icon="delete"
              size="xs"
              variant="ghost"
              tone="danger"
              label={`${text.discard} ${file.path}`}
              onPress={() =>
                void applyRequest(
                  plugin.request('git.discard', { repoRoot: root, paths: [file.path] })
                )
              }
            />
          ) : null}
        </Row>
      </Row>
  )

  if (!open) return row
  return (
    <Stack gap="xs">
      {row}
      {diff === undefined ? (
        <Spinner label={text.loading} labelHidden />
      ) : (
        <CodeView code={diff} label={file.path} lineNumbers wrap={false} />
      )}
    </Stack>
  )
}

/** 子模块行：状态 + 「进入」= 切到该子模块。 */
export function submoduleRow(entry: SubmoduleEntry, text: Copy, root: string) {
  const state =
    entry.state === 'uninitialized'
      ? text.submoduleUninitialized
      : entry.state === 'newCommits' || entry.state === 'conflict'
        ? text.submoduleNewCommits
        : entry.describe || entry.commit
  return (
    <Row gap="xs" align="center">
      <Text size="xs" weight="semibold" muted>
        ▣
      </Text>
      <Box grow direction="column" gap="none">
        <Text size="sm" truncate>
          {entry.path}
        </Text>
        <Text size="xs" muted truncate>
          {state}
        </Text>
      </Box>
      {entry.state === 'uninitialized' ? null : (
        <IconButton
          icon="next"
          size="xs"
          variant="ghost"
          label={`${text.enterSubmodule} ${entry.path}`}
          onPress={() => void selectRepo(`${root}/${entry.path}`)}
        />
      )}
    </Row>
  )
}

/** 更多动作页签的一行：左侧名称+状态，右侧动作按钮，单行高度。 */
export function actionRow(props: {
  key: string
  title: string
  description: string
  label: string
  onPress: () => void
  disabled?: boolean
  primary?: boolean
  danger?: boolean
}) {
  return (
    <Row key={props.key} justify="between" align="center" gap="xs">
      <Stack gap="none">
        <Text size="sm">{props.title}</Text>
        <Text size="xs" muted>
          {props.description}
        </Text>
      </Stack>
      <Button
        size="xs"
        variant={props.primary ? 'solid' : props.danger ? 'ghost' : 'outline'}
        tone={props.danger ? 'danger' : 'neutral'}
        disabled={props.disabled === true}
        onPress={props.onPress}
      >
        {props.label}
      </Button>
    </Row>
  )
}
