// 工作区里的仓库发现：根仓库(root) + 子模块(submodule) + 嵌套独立仓库(nested)。

import { existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseStatus, runGit, listSubmodules } from './git'
import type { RepoSummary } from './protocol'

const SKIP: Record<string, true> = {
  node_modules: true,
  dist: true,
  build: true,
  out: true,
  target: true,
  vendor: true,
  '.venv': true,
  venv: true,
  __pycache__: true,
  Pods: true,
  '.cache': true,
}
const MAX_DEPTH = 3
const MAX_REPOS = 50
const BUDGET_MS = 6_000

/** 工作区根下的 git 仓库（含根自身），广度优先；仓库里仍继续向下找独立仓库。 */
export function findRepoRoots(cwd: string): string[] {
  const roots: string[] = []
  const queue: { dir: string; depth: number }[] = [{ dir: cwd, depth: 0 }]
  while (queue.length && roots.length < MAX_REPOS) {
    const next = queue.shift()
    if (!next) break
    if (existsSync(join(next.dir, '.git'))) roots.push(next.dir)
    if (next.depth >= MAX_DEPTH) continue
    let entries
    try {
      entries = readdirSync(next.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP[entry.name]) continue
      queue.push({ dir: join(next.dir, entry.name), depth: next.depth + 1 })
    }
  }
  return roots
}

/** 仓库清单：root 在前、子模块次之、嵌套仓库最后；预算耗尽后剩余仓库只给路径。 */
export async function scanRepos(cwd: string): Promise<RepoSummary[]> {
  const deadline = Date.now() + BUDGET_MS
  const repos: RepoSummary[] = []

  const summarize = async (root: string, kind: RepoSummary['kind'], initialized: boolean) => {
    let branch: string | null = null
    let dirty: boolean | null = null
    if (initialized && Date.now() < deadline) {
      const status = await runGit(root, ['status', '--porcelain=v2', '--branch', '-z', '-uno'], {
        timeoutMs: 4_000,
      })
      if (status.code === 0) {
        const parsed = parseStatus(status.stdout)
        branch = parsed.branch
        dirty = parsed.staged.length + parsed.modified.length > 0
      }
    }
    repos.push({ root, name: basename(root), kind, branch, dirty, initialized })
  }

  const nested = findRepoRoots(cwd)
  const rootRepo = nested[0] === cwd ? nested[0] : null

  if (rootRepo) {
    await summarize(rootRepo, 'root', true)
    // 子模块在根仓库里登记，嵌套扫描会跳过它们（有 .git 文件也算仓库），这里按 kind 区分。
    const submoduleRoots = new Set<string>()
    for (const entry of await listSubmodules(rootRepo)) {
      const absolute = join(rootRepo, entry.path)
      submoduleRoots.add(absolute)
      if (entry.state === 'uninitialized') {
        repos.push({
          root: absolute,
          name: entry.path,
          kind: 'submodule',
          branch: null,
          dirty: null,
          initialized: false,
        })
      } else {
        await summarize(absolute, 'submodule', true)
      }
    }
    for (const root of nested.slice(1)) {
      if (submoduleRoots.has(root)) continue
      await summarize(root, 'nested', true)
    }
    return repos
  }

  for (const root of nested) await summarize(root, 'nested', true)
  return repos
}
