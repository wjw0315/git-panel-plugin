// 两张卡：「更多远端操作」把内置溢出菜单的 13 项收进来；「分支」负责切换/新建/删除。
// 面板没有页签，它们都是可折叠卡，默认收起。

import { Box, Button, IconButton, Input, read, Row, Separator, set, Stack, Text } from 'orca'
import { filterBranches, groupBranches, type BranchRow } from './branch-view'
import { actionRow } from './rows'
import type { Copy } from './strings'
import {
  amend,
  branchCreating,
  branchDraft,
  branchFilter,
  branches,
  commitWith,
  createBranch,
  createPullRequest,
  deleteBranch,
  deleteConfirm,
  derived,
  forceConfirm,
  forcePushPress,
  runRemote,
  snapshot,
  switchBranch,
} from './state'

export function remoteMenu(text: Copy) {
  const d = derived(text)
  const snap = read(snapshot)
  if (!snap) return null
  const confirmForce = read(forceConfirm)

  return (
    <Stack gap="xs">
        {actionRow({
          key: 'm-commit',
          title: read(amend) ? text.amendCommit : text.commit,
          description: text.stagedCount(snap.staged.length),
          label: read(amend) ? text.amendCommit : text.commit,
          disabled: !d.canCommit,
          primary: true,
          onPress: () => commitWith('commit'),
        })}
        {actionRow({
          key: 'm-commit-push',
          title: text.commitPush,
          description: d.aheadBehind,
          label: text.commitPush,
          disabled: !d.canCommit,
          onPress: () => commitWith('push'),
        })}
        {actionRow({
          key: 'm-commit-sync',
          title: text.commitSync,
          description: d.canSync ? d.aheadBehind : text.dirtyBlock,
          label: text.commitSync,
          disabled: !d.canCommit || !d.canSync,
          onPress: () => commitWith('sync'),
        })}
        {actionRow({
          key: 'm-commit-force',
          title: text.commitForce,
          description: text.forceLeaseHint,
          label: text.commitForce,
          disabled: !d.canCommit || !snap.hasUpstream,
          danger: true,
          onPress: () => commitWith('force'),
        })}

        <Separator />

        {actionRow({
          key: 'm-push',
          title: text.push,
          description: snap.hasUpstream ? d.aheadBehind : text.noUpstream,
          label: text.push,
          disabled: !snap.hasUpstream,
          primary: snap.hasUpstream && snap.ahead > 0,
          onPress: () => runRemote('git.push'),
        })}
        {actionRow({
          key: 'm-publish',
          title: text.publishBranch,
          description: 'push -u origin HEAD',
          label: text.publishBranch,
          disabled: snap.hasUpstream,
          onPress: () => runRemote('git.publish'),
        })}
        {actionRow({
          key: 'm-force',
          title: confirmForce ? text.confirmForce : text.pushForce,
          description: text.forceLeaseHint,
          label: confirmForce ? text.confirmForce : text.pushForce,
          disabled: !snap.hasUpstream,
          danger: true,
          onPress: forcePushPress,
        })}
        {actionRow({
          key: 'm-pr',
          title: text.createPullRequest,
          description: d.remote?.cli
            ? text.prViaCli
            : d.remote?.compareUrl
              ? text.prViaBrowser
              : text.noRemote,
          label: text.createPullRequest,
          disabled: !d.canPullRequest,
          onPress: () => createPullRequest(false),
        })}
        {actionRow({
          key: 'm-push-pr',
          title: text.pushThenPullRequest,
          description: `${text.push} → ${text.createPullRequest}`,
          label: text.pushThenPullRequest,
          disabled: !d.canPullRequest,
          onPress: () => createPullRequest(true),
        })}

        <Separator />

        {actionRow({
          key: 'm-fetch',
          title: text.fetch,
          description: d.remote?.name ?? text.noRemote,
          label: text.fetch,
          disabled: !d.remote?.name,
          onPress: () => runRemote('git.fetch'),
        })}
        {actionRow({
          key: 'm-pull',
          title: text.pull,
          description: d.canSync
            ? snap.behind > 0
              ? `↓${snap.behind}`
              : text.upToDate
            : text.dirtyBlock,
          label: text.pull,
          disabled: !d.canSync,
          onPress: () => runRemote('git.pull'),
        })}
        {actionRow({
          key: 'm-ff',
          title: text.fastForward,
          description: '--ff-only',
          label: text.fastForward,
          disabled: !d.canSync,
          onPress: () => runRemote('git.fastForward'),
        })}
        {actionRow({
          key: 'm-sync',
          title: text.sync,
          description: `${text.pull} + ${text.push}`,
          label: text.sync,
          disabled: !d.canSync,
          primary: d.canSync && snap.behind > 0 && snap.ahead > 0,
          onPress: () => runRemote('git.sync'),
        })}
        {actionRow({
          key: 'm-rebase',
          title: d.rebaseTarget ? text.rebaseTo(d.rebaseTarget) : text.rebaseTo('—'),
          description: d.canRebase ? (d.rebaseTarget ?? '') : text.dirtyBlock,
          label: text.rebaseTo(d.rebaseTarget ?? '…'),
          disabled: !d.canRebase,
          onPress: () => runRemote('git.rebase'),
        })}
    </Stack>
  )
}

export function branchCard(text: Copy) {
  const query = read(branchFilter)
  const matched = filterBranches(read(branches), query)
  const { current, local, remote } = groupBranches(matched)

  const row = (branch: BranchRow) => {
    const confirming = read(deleteConfirm) === branch.name
    return (
      <Row key={branch.name} justify="between" align="center" gap="xs">
        <Box grow direction="column" gap="none">
          <Text size="sm" truncate>
            {branch.name}
          </Text>
          <Text size="xs" muted>
            {[branch.remote ? text.remoteBranchTag : null, branch.current ? text.currentBranchLabel : null]
              .filter(Boolean)
              .join(' · ') || ' '}
          </Text>
        </Box>
        <Row gap="none" align="center">
          {branch.current ? null : (
            <Button
              size="xs"
              variant="outline"
              onPress={() => switchBranch(branch.name, branch.remote)}
            >
              {text.switchTo}
            </Button>
          )}
          {branch.remote || branch.current ? null : confirming ? (
            <Button
              size="xs"
              variant="ghost"
              tone="danger"
              onPress={() => deleteBranch(branch.name, true)}
            >
              {text.forceDeleteBranch}
            </Button>
          ) : (
            <IconButton
              icon="delete"
              size="xs"
              variant="ghost"
              tone="danger"
              label={`${text.deleteBranch} ${branch.name}`}
              onPress={() => set(deleteConfirm, branch.name)}
            />
          )}
        </Row>
      </Row>
    )
  }

  return (
    <Stack gap="xs">
      <Row justify="between" align="center">
        <Text size="xs" muted>
          {text.filesCount(matched.length)}
        </Text>
        {branchCreating ? null : (
          <Button size="xs" variant="ghost" icon="add" onPress={() => set(branchCreating, true)}>
            {text.newBranch}
          </Button>
        )}
      </Row>

      <Row gap="xs" align="center">
        <Box grow>
          <Input
            label={text.searchBranches}
            labelHidden
            value={query}
            placeholder={text.searchBranches}
            onChange={(value) => set(branchFilter, value)}
          />
        </Box>
        {query ? (
          <IconButton
            icon="close"
            size="xs"
            variant="ghost"
            label={text.clearSearch}
            onPress={() => set(branchFilter, '')}
          />
        ) : null}
      </Row>

      {branchCreating ? (
        <Row gap="xs" align="center">
          <Input
            label={text.branchNamePlaceholder}
            labelHidden
            value={read(branchDraft)}
            placeholder={text.branchNamePlaceholder}
            onChange={(value) => set(branchDraft, value)}
            onSubmit={createBranch}
          />
          <Button size="xs" variant="solid" onPress={createBranch}>
            {text.createBranch}
          </Button>
          <Button size="xs" variant="ghost" onPress={() => set(branchCreating, false)}>
            {text.cancelBranch}
          </Button>
        </Row>
      ) : null}

      {current ? row(current) : null}

      {local.length ? (
        <Stack gap="none">
          <Text size="xs" muted>
            {`${text.localBranches} ${local.length}`}
          </Text>
          {local.map(row)}
        </Stack>
      ) : null}

      {remote.length ? (
        <Stack gap="none">
          <Text size="xs" muted>
            {`${text.remoteBranches} ${remote.length}`}
          </Text>
          {remote.map(row)}
        </Stack>
      ) : null}

      {matched.length === 0 ? (
        <Text size="xs" muted>
          {text.noBranchMatch}
        </Text>
      ) : null}
    </Stack>
  )
}
