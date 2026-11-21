// 分支页的纯逻辑：过滤与分组。抽出来是为了能直接单测，不依赖宿主组件。

export type BranchRow = { name: string; remote: boolean; current: boolean }

export type BranchGroups = {
  /** 当前分支（过滤后仍存在时才给），永远排在列表第一行。 */
  current: BranchRow | null
  local: BranchRow[]
  remote: BranchRow[]
}

/** 按分支名子串过滤，大小写不敏感；空白查询返回全部。 */
export function filterBranches(list: BranchRow[], query: string): BranchRow[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return list
  return list.filter((branch) => branch.name.toLowerCase().includes(needle))
}

/** 分出当前分支与本地/远端两组，组内按名字排序。 */
export function groupBranches(list: BranchRow[]): BranchGroups {
  const current = list.find((branch) => branch.current && !branch.remote) ?? null
  const rest = list.filter((branch) => branch !== current)
  const byName = (a: BranchRow, b: BranchRow) => a.name.localeCompare(b.name)
  return {
    current,
    local: rest.filter((branch) => !branch.remote).sort(byName),
    remote: rest.filter((branch) => branch.remote).sort(byName),
  }
}
