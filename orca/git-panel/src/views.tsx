// 两张卡：「更多远端操作」把内置溢出菜单的 13 项收进来；「分支」负责切换/新建/删除。
// 面板没有页签，它们都是可折叠卡，默认收起。

import { Button, Input, read, Row, Separator, set, Stack, Text } from 'orca'
import { actionRow } from './rows'
import type { Copy } from './strings'
import {
  amend,
  branchCreating,
  branchDraft,
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
  const list = read(branches)
  return (
    <Stack gap="xs">
      <Row justify="between" align="center">
        <Text size="xs" muted>
          {text.filesCount(list.length)}
        </Text>
        {branchCreating ? null : (
          <Button size="xs" variant="ghost" icon="add" onPress={() => set(branchCreating, true)}>
            {text.newBranch}
          </Button>
        )}
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

        {list.map((branch) => {
          const confirming = read(deleteConfirm) === branch.name
          return (
            <Row key={branch.name} justify="between" align="center" gap="xs">
              <Text size="sm" truncate>
                {`${branch.name}${branch.remote ? ` · ${text.remoteBranchTag}` : ''}${
                  branch.current ? ` · ${text.currentBranchLabel}` : ''
                }`}
              </Text>
              <Row gap="xs" align="center">
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
                    {`${text.forceDeleteBranch} ${branch.name}`}
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    variant="ghost"
                    tone="danger"
                    onPress={() => set(deleteConfirm, branch.name)}
                  >
                    {`${text.deleteBranch} ${branch.name}`}
                  </Button>
                )}
              </Row>
            </Row>
          )
        })}
    </Stack>
  )
}
