// 面板组装（对齐内置 Source Control）：顶部工具条 → 分支两行 → 提交区 → 单一主体视图。
// 「…」里是 13 个远端/提交动作 + 历史 / 贮藏 / 分支入口；仓库切换器（本插件的净增值）在最上方。

import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Heading,
  IconButton,
  Select,
  Spinner,
  Stack,
  env,
  on,
  plugin,
  read,
  set,
  type PanelContext,
} from 'orca'
import { copy } from './strings'
import {
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
  selected,
  selectRepo,
  snapshot,
  view,
} from './state'
import { panelHeader } from './panel-header'
import { commitCard } from './commit-card'
import { changesTree } from './changes-tree'
import { conflictBanner } from './conflict-banner'
import { historyTab } from './tabs-history'
import { stashTab } from './tabs-stash'
import { actionsView, branchesView } from './views'

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

export function App() {
  const text = copy(env.locale)
  const snap = read(snapshot)
  const repoList = read(repos)
  const current = read(selected)
  const currentView = read(view)

  return (
    <Stack gap="sm">
      {repoList.length > 1 ? (
        <Select
          label={text.repo}
          labelHidden
          value={current}
          options={repoList.map((repo) => ({
            value: repo.root,
            label: `${
              repo.kind === 'root' ? text.kindRoot : repo.kind === 'submodule' ? text.kindSubmodule : text.kindNested
            } · ${repo.name}${repo.branch ? ` (${repo.branch})` : ''}${repo.dirty ? ' ●' : ''}`,
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
          {commitCard(text)}
          {conflictBanner(text)}
          {currentView === 'changes' ? changesTree(text, snap) : null}
          {currentView === 'history' ? historyTab(text) : null}
          {currentView === 'stashes' ? stashTab(text) : null}
          {currentView === 'actions' ? actionsView(text) : null}
          {currentView === 'branches' ? branchesView(text) : null}

          <Button
            variant="ghost"
            size="xs"
            icon="open-external"
            onPress={() => {
              set(forceConfirm, false)
              void guard(() => plugin.request('git.openBuiltIn', {}))
              void Promise.all([loadSnapshot(true), loadStashes(), loadHistory(true), loadPullRequestStatus()])
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
