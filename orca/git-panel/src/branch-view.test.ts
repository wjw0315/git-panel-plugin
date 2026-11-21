// 分支页纯逻辑：过滤与分组。
import { assert, test } from 'orca/testing'
import { filterBranches, groupBranches, type BranchRow } from './branch-view'

const rows: BranchRow[] = [
  { name: 'main', remote: false, current: true },
  { name: 'prototype/conflict-resolution', remote: false, current: false },
  { name: 'prototype/update-branch', remote: false, current: false },
  { name: 'origin/main', remote: true, current: false },
  { name: 'origin/release', remote: true, current: false },
]

test('v6: filterBranches matches names case-insensitively and keeps remote prefixes', () => {
  assert.deepEqual(filterBranches(rows, '').length, 5)
  assert.deepEqual(
    filterBranches(rows, 'proto').map((b) => b.name),
    ['prototype/conflict-resolution', 'prototype/update-branch']
  )
  assert.deepEqual(filterBranches(rows, 'ORIGIN').map((b) => b.name), ['origin/main', 'origin/release'])
  assert.deepEqual(filterBranches(rows, 'nope'), [])
})

test('v6: groupBranches pins the current branch, sorts each group, and counts them', () => {
  const grouped = groupBranches(rows)
  assert.equal(grouped.current?.name, 'main')
  assert.deepEqual(grouped.local.map((b) => b.name), [
    'prototype/conflict-resolution',
    'prototype/update-branch',
  ])
  assert.deepEqual(grouped.remote.map((b) => b.name), ['origin/main', 'origin/release'])

  const localOnly = groupBranches([{ name: 'main', remote: false, current: true }])
  assert.deepEqual(localOnly, { current: localOnly.current, local: [], remote: [] })

  const remoteOnly = groupBranches([{ name: 'origin/main', remote: true, current: false }])
  assert.equal(remoteOnly.current, null)
  assert.equal(remoteOnly.local.length, 0)
  assert.equal(remoteOnly.remote.length, 1)
})
