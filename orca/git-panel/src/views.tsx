// 「…」溢出：13 个远端/提交动作 + 历史 / 贮藏 / 分支 三个入口（对齐内置的溢出菜单与页签）。

import { Button, Card, read, Row, Separator, set, Stack, Text } from 'orca'
import type { Copy } from './strings'
import {
  amend,
  branches,
  commitWith,
  createPullRequest,
  deleteBranch,
  deleteConfirm,
  derived,
  forceConfirm,
  forcePushPress,
  runRemote,
  showView,
  snapshot,
  switchBranch,
} from './state'
import { actionRow, navRow } from './rows'

export function actionsView(text: Copy) {
  const d = derived(text)
  const snap = read(snapshot)
  if (!snap) return null
  const confirmForce = read(forceConfirm)

  return (
    <Stack gap="sm">
      {navRow(text, 'actions')}

      <Card title={text.commit}>
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
        </Stack>
      </Card>

      <Card title={text.push}>
        <Stack gap="xs">
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
            description: d.remote?.cli ? text.prViaCli : d.remote?.compareUrl ? text.prViaBrowser : text.noRemote,
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
        </Stack>
      </Card>

      <Card title={text.groupPull}>
        <Stack gap="xs">
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
            description: d.canSync ? (snap.behind > 0 ? `↓${snap.behind}` : text.upToDate) : text.dirtyBlock,
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
            description: d.canRebase ? d.rebaseTarget ?? '' : text.dirtyBlock,
            label: text.rebaseTo(d.rebaseTarget ?? '…'),
            disabled: !d.canRebase,
            onPress: () => runRemote('git.rebase'),
          })}
        </Stack>
      </Card>
    </Stack>
  )
}

/** 分支视图：切换 / 删除本地分支。 */
export function branchesView(text: Copy) {
  return (
    <Stack gap="sm">
      {navRow(text, 'branches')}
      <Card title={text.branchCard}>
        <Stack gap="xs">
          {read(branches).map((branch) => (
            <Row key={branch.name} justify="between" align="center" gap="xs">
              <Text size="sm">
                {`${branch.name}${branch.remote ? ` · ${text.remoteBranchTag}` : ''}${
                  branch.current ? ` · ${text.currentBranchLabel}` : ''
                }`}
              </Text>
              <Row gap="xs" align="center">
                {branch.current ? null : (
                  <Button size="xs" variant="outline" onPress={() => switchBranch(branch.name, branch.remote)}>
                    {text.switchTo}
                  </Button>
                )}
                {branch.remote ? null : (
                  <Button
                    size="xs"
                    variant="ghost"
                    tone="danger"
                    disabled={branch.current}
                    onPress={() => {
                      if (read(deleteConfirm) === branch.name) {
                        deleteBranch(branch.name, true)
                        return
                      }
                      set(deleteConfirm, branch.name)
                    }}
                  >
                    {read(deleteConfirm) === branch.name
                      ? `${text.forceDeleteBranch} ${branch.name}`
                      : `${text.deleteBranch} ${branch.name}`}
                  </Button>
                )}
              </Row>
            </Row>
          ))}
        </Stack>
      </Card>
    </Stack>
  )
}
