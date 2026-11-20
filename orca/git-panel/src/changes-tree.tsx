// 变更区（对齐内置）：已暂存的更改 / 更改 两组，组头右侧是批量动作。
// 文件按一级目录折叠成小节，目录头放目录级批量；根目录文件直接列出。
// 组只在有内容时出现；全空时显示空态，不留标题。

import {
  Collapsible,
  EmptyState,
  IconButton,
  plugin,
  read,
  Row,
  Stack,
  Text,
  type OrcaNode,
} from 'orca'
import type { FileChange, GitSnapshot } from './protocol'
import type { Copy } from './strings'
import { fileRow, submoduleRow } from './rows'
import {
  applyRequest,
  discardGroup,
  selected,
  stageGroup,
  unstageGroup,
} from './state'

function groupHeader(title: string, count: number, actions: OrcaNode) {
  return (
    <Row justify="between" align="center">
      <Row gap="xs" align="center">
        <Text size="sm" weight="medium">
          {title}
        </Text>
        <Text size="xs" muted>
          {count}
        </Text>
      </Row>
      <Row gap="none" align="center">
        {actions}
      </Row>
    </Row>
  )
}

/** 目录小节：标题是目录名，右侧三个目录级动作。 */
function folderSection(dir: string, files: FileChange[], text: Copy, group: 'staged' | 'changes') {
  const root = read(selected)
  const staged = group === 'staged'
  return (
    <Collapsible key={dir} title={dir} description={text.filesCount(files.length)} defaultOpen>
      <Stack gap="xs">
        <Row justify="end" gap="none" align="center">
          {staged ? (
            <IconButton
              icon="remove"
              size="xs"
              variant="ghost"
              label={`${text.folderUnstage} ${dir}`}
              onPress={() =>
                void applyRequest(plugin.request('git.unstageFolder', { repoRoot: root, prefix: dir }))
              }
            />
          ) : (
            <>
              <IconButton
                icon="add"
                size="xs"
                variant="ghost"
                label={`${text.folderStage} ${dir}`}
                onPress={() =>
                  void applyRequest(plugin.request('git.stageFolder', { repoRoot: root, prefix: dir }))
                }
              />
              <IconButton
                icon="delete"
                size="xs"
                variant="ghost"
                tone="danger"
                label={`${text.folderDiscard} ${dir}`}
                onPress={() =>
                  void applyRequest(
                    plugin.request('git.discardFolder', { repoRoot: root, prefix: dir })
                  )
                }
              />
            </>
          )}
        </Row>
        <Stack gap="none">{files.map((file) => fileRow(file, text, group))}</Stack>
      </Stack>
    </Collapsible>
  )
}

/** 一组文件：目录折叠 + 根目录散文件，顺序与内置一致（先目录，后文件）。 */
function fileList(files: FileChange[], text: Copy, group: 'staged' | 'changes') {
  const folders = new Map<string, FileChange[]>()
  const loose: FileChange[] = []
  for (const file of files) {
    const slash = file.path.indexOf('/')
    if (slash < 0) {
      loose.push(file)
      continue
    }
    const dir = file.path.slice(0, slash)
    const bucket = folders.get(dir) ?? []
    bucket.push(file)
    folders.set(dir, bucket)
  }
  const nodes: OrcaNode[] = []
  for (const [dir, entries] of folders) nodes.push(folderSection(dir, entries, text, group))
  if (loose.length)
    nodes.push(
      <Stack key={`loose:${group}`} gap="none">
        {loose.map((file) => fileRow(file, text, group))}
      </Stack>
    )
  return <Stack gap="xs">{nodes}</Stack>
}

export function changesTree(text: Copy, snap: GitSnapshot) {
  const staged = snap.staged
  const changes = [...snap.modified, ...snap.untracked]
  if (staged.length === 0 && changes.length === 0 && snap.submodules.length === 0) {
    return <EmptyState title={text.clean} description={text.cleanHint} icon="check" />
  }

  return (
    <Stack gap="sm">
      {staged.length ? (
        <Stack gap="xs">
          {groupHeader(
            text.stagedGroup,
            staged.length,
            <>
              <IconButton
                icon="remove"
                size="xs"
                variant="ghost"
                label={text.unstageAll}
                onPress={unstageGroup}
              />
              <IconButton
                icon="delete"
                size="xs"
                variant="ghost"
                tone="danger"
                label={text.discardAll}
                onPress={() => discardGroup('staged')}
              />
            </>
          )}
          {fileList(staged, text, 'staged')}
        </Stack>
      ) : null}

      {changes.length || snap.submodules.length ? (
        <Stack gap="xs">
          {groupHeader(
            text.changesGroup,
            changes.length,
            <>
              <IconButton
                icon="add"
                size="xs"
                variant="ghost"
                label={text.stageAll}
                onPress={() => stageGroup('changes')}
              />
              <IconButton
                icon="delete"
                size="xs"
                variant="ghost"
                tone="danger"
                label={text.discardAll}
                onPress={() => discardGroup('changes')}
              />
            </>
          )}
          {changes.length ? fileList(changes, text, 'changes') : null}
          {snap.submodules.map((entry) => (
            <Stack key={`sub:${entry.path}`} gap="none">
              {submoduleRow(entry, text, read(selected) || snap.repoRoot)}
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  )
}
