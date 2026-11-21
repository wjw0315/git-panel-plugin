// 面板组装（v4.1）：顶部两行 → 冲突条 → 顶部页签（提交 / 更改 / 基准 / 历史 / 贮藏 / 分支 / 更多）→ 当前页内容。
// 页签用宿主 Tabs；选中页持久化记忆，切到需要网络的页时顺带刷新。

import {
  Button,
  Text,
  Callout,
  EmptyState,
  env,
  on,
  plugin,
  read,
  Select,
  set,
  Spinner,
  Stack,
  Tab,
  Tabs,
  type PanelContext,
} from 'orca'
import { baseCard } from './base-card'
import { changesTree } from './changes-tree'
import { commitCard } from './commit-card'
import { conflictBanner } from './conflict-banner'
import { copy } from './strings'
import { panelHeader } from './panel-header'
import { historyTab } from './tabs-history'
import { stashTab } from './tabs-stash'
import { branchCard, remoteMenu } from './views'
import {
  activeTab,
  busy,
  error,
  forceConfirm,
  guard,
  loadBranches,
  loadHistory,
  loadPullRequestStatus,
  loadSnapshot,
  loadStashes,
  loadWorkspace,
  local,
  repos,
  selectRepo,
  selectTab,
  selected,
  snapshot,
  type TabId,
} from './state'

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(
    on('workspace.changed', () => {
      void loadWorkspace()
    })
  )
  ctx.subscriptions.push(
    plugin.on('git.changed', (payload) => {
      if (payload.repoRoot === read(selected)) set(snapshot, payload.snapshot)
    })
  )
  void loadWorkspace()
  void loadBranches()
}

/** 兜底：任何渲染期异常都变成一行红字，而不是让宿主把整个面板判为「停止响应」。 */
export function App() {
  try {
    return <PanelBody />
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return <Text tone="danger">{`Git 面板渲染失败：${message}`}</Text>
  }
}

function PanelBody() {
  const text = copy(env.locale)
  const snap = read(snapshot)
  const repoList = read(repos)
  const current = read(selected)
  const tab = read(activeTab)
  const stagedCount = snap?.staged.length ?? 0
  const changeCount = (snap?.modified.length ?? 0) + (snap?.untracked.length ?? 0)

  return (
    <Stack gap="sm">
      {repoList.length > 1 ? (
        <Select
          label={text.repo}
          labelHidden
          value={current}
          options={repoList.map((repo) => ({
            value: repo.root,
            label: `${repo.kind === 'root' ? text.kindRoot : repo.kind === 'submodule' ? text.kindSubmodule : text.kindNested} · ${repo.name}${repo.branch ? ` (${repo.branch})` : ''}${repo.dirty ? ' ●' : ''}`,
          }))}
          onChange={(value) => {
            void selectRepo(value)
          }}
        />
      ) : null}

      {panelHeader(text)}

      {read(error) ? (
        <Callout tone="danger" title={text.failed}>
          {read(error)}
        </Callout>
      ) : null}

      {!read(local) ? (
        <Callout tone="warning" title={text.remoteHost}>
          {text.remoteHost}
        </Callout>
      ) : null}

      {read(local) && !repoList.length ? (
        <EmptyState title={text.emptyRepo} description={text.emptyRepoHint} icon="folder" />
      ) : null}

      {snap ? (
        <>
          {read(busy) ? <Spinner label={text.loading} labelHidden /> : null}
          {conflictBanner(text)}

          <Tabs label={text.title} value={tab} onChange={(value) => selectTab(value as TabId)}>
            <Tab value="commit" label={stagedCount ? `${text.commit} ${stagedCount}` : text.commit}>
              {commitCard(text)}
            </Tab>
            <Tab
              value="changes"
              label={changeCount ? `${text.changesGroup} ${changeCount}` : text.changesGroup}
            >
              {changesTree(text, snap)}
            </Tab>
            <Tab value="base" label={text.baseShort}>
              {baseCard(text)}
            </Tab>
            <Tab value="history" label={text.tabHistory}>
              {historyTab(text)}
            </Tab>
            <Tab value="stash" label={text.stashes}>
              {stashTab(text)}
            </Tab>
            <Tab value="branch" label={text.viewBranches}>
              {branchCard(text)}
            </Tab>
            <Tab value="remote" label={text.moreShort}>
              {remoteMenu(text)}
            </Tab>
          </Tabs>

          <Button
            variant="ghost"
            size="xs"
            icon="open-external"
            onPress={() => {
              set(forceConfirm, false)
              void guard(() => plugin.request('git.openBuiltIn', {}))
              void Promise.all([
                loadSnapshot(true),
                loadStashes(),
                loadHistory(true),
                loadPullRequestStatus(),
              ])
            }}
          >
            {text.openBuiltIn}
          </Button>
        </>
      ) : read(local) && current ? (
        <Spinner label={text.loading} />
      ) : null}
    </Stack>
  )
}
