// 更改页（顶部 tab「更改」）：顶部一行是文件数 + 展示方式 + 全部暂存/全部丢弃。
// 两种展示方式：树形（逐层目录，可折叠，目录行带目录级动作）与平铺（一列文件，路径写在副行）。

import { Box, Collapsible, IconButton, plugin, read, Row, Select, set, Stack, Text, type OrcaNode } from 'orca'
import type { FileChange, GitSnapshot } from './protocol'
import type { Copy } from './strings'
import { fileRow, submoduleRow } from './rows'
import {
  applyRequest,
  dirOpen,
  discardGroup,
  fileView,
  selected,
  stageGroup,
  toggleDir,
  type FileView,
} from './state'

type DirNode = {
  name: string
  path: string
  dirs: DirNode[]
  files: FileChange[]
}

/** 把路径折叠成真正的树（多层），排序按名字。 */
export function buildTree(files: FileChange[]): DirNode {
  const root: DirNode = { name: '', path: '', dirs: [], files: [] }
  for (const file of files) {
    const segments = file.path.split('/')
    const name = segments.pop() ?? file.path
    let level = root
    let path = ''
    for (const segment of segments) {
      path = path ? `${path}/${segment}` : segment
      let next = level.dirs.find((dir) => dir.name === segment)
      if (!next) {
        next = { name: segment, path, dirs: [], files: [] }
        level.dirs.push(next)
      }
      level = next
    }
    level.files.push({ ...file, path: file.path })
    void name
  }
  const sort = (node: DirNode) => {
    node.dirs.sort((a, b) => a.name.localeCompare(b.name))
    node.files.sort((a, b) => a.path.localeCompare(b.path))
    node.dirs.forEach(sort)
  }
  sort(root)
  return root
}

function countFiles(node: DirNode): number {
  return node.files.length + node.dirs.reduce((sum, dir) => sum + countFiles(dir), 0)
}

/** 目录行：一行内完成「展开 + 名字 + 数量 + 目录级动作」，下面是缩进过的子项。 */
function dirRow(node: DirNode, text: Copy, depth: number): OrcaNode {
  const root = read(selected)
  const fallback = depth === 0
  const open = dirOpen(node.path, fallback)

  return (
    <Stack key={node.path} gap="none">
      <Row justify="between" align="center">
        <Row gap="xs" align="center">
          <IconButton
            icon={open ? 'collapse' : 'expand'}
            size="xs"
            variant="ghost"
            label={`${open ? text.collapseCard : text.expandCard} ${node.name}`}
            onPress={() => toggleDir(node.path, fallback)}
          />
          <Text size="sm" weight="medium" truncate>
            {node.name}
          </Text>
          <Text size="xs" muted>
            {countFiles(node)}
          </Text>
        </Row>
        <Row gap="none" align="center">
          <IconButton
            icon="add"
            size="xs"
            variant="ghost"
            label={`${text.folderStage} ${node.path}`}
            onPress={() =>
              void applyRequest(
                plugin.request('git.stageFolder', { repoRoot: root, prefix: node.path })
              )
            }
          />
          <IconButton
            icon="delete"
            size="xs"
            variant="ghost"
            tone="danger"
            label={`${text.folderDiscard} ${node.path}`}
            onPress={() =>
              void applyRequest(
                plugin.request('git.discardFolder', { repoRoot: root, prefix: node.path })
              )
            }
          />
        </Row>
      </Row>
      {open ? (
        <Box paddingX="sm">
          <Stack gap="none">
            {node.dirs.map((dir) => dirRow(dir, text, depth + 1))}
            {node.files.map((file) => fileRow(file, text, 'changes', false))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  )
}

/** 树形：多层目录；根目录的文件直接列出来。 */
function treeView(files: FileChange[], text: Copy) {
  const tree = buildTree(files)
  return (
    <Stack gap="xs">
      {tree.dirs.map((dir) => dirRow(dir, text, 0))}
      {tree.files.map((file) => fileRow(file, text, 'changes'))}
    </Stack>
  )
}

export function changesTree(text: Copy, snap: GitSnapshot) {
  const changes = [...snap.modified, ...snap.untracked]
  const empty = changes.length === 0 && snap.submodules.length === 0
  const mode = read(fileView) as FileView

  return (
    <Stack gap="xs">
      <Row justify="between" align="center" gap="xs">
        <Text size="xs" muted>
          {empty ? text.cleanHint : text.filesCount(changes.length)}
        </Text>
        <Row gap="xs" align="center">
          {changes.length ? (
            <Select
              label={text.fileView}
              labelHidden
              value={mode}
              options={[
                { value: 'tree', label: text.viewTree },
                { value: 'flat', label: text.viewFlat },
              ]}
              onChange={(value) => set(fileView, value as FileView)}
            />
          ) : null}
          {changes.length ? (
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
          ) : null}
        </Row>
      </Row>

      {empty ? null : (
        <>
          {changes.length ? (
            mode === 'flat' ? (
              <Stack gap="none">{changes.map((file) => fileRow(file, text, 'changes'))}</Stack>
            ) : (
              treeView(changes, text)
            )
          ) : null}
          {snap.submodules.map((entry) => (
            <Stack key={`sub:${entry.path}`} gap="none">
              {submoduleRow(entry, text, read(selected) || snap.repoRoot)}
            </Stack>
          ))}
        </>
      )}
    </Stack>
  )
}
