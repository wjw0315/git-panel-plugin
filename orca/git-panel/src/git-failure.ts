// git 失败分类：把 stderr 归到有限几种原因，面板据此说人话，原始输出单独展开。
// 只做纯字符串判断，不碰文件系统，方便单测。

export type MergeStage = 'fetch' | 'merge'
export type MergeReason =
  | 'auth'
  | 'network'
  | 'ref-missing'
  | 'untracked-overwrite'
  | 'identity'
  | 'conflict'
  | 'other'

const PATTERNS: { reason: MergeReason; test: RegExp }[] = [
  {
    reason: 'auth',
    test: /could not read from remote repository|access rights|authentication failed|permission denied|repository not found|terminal prompts disabled|invalid username or password|403 forbidden|401 unauthorized/i,
  },
  {
    reason: 'network',
    test: /could not resolve host|connection (timed out|refused|reset)|network is unreachable|operation timed out|failed to connect|proxy|tls handshake|ssl/i,
  },
  {
    reason: 'untracked-overwrite',
    test: /would be overwritten by merge|untracked working tree files would be/i,
  },
  {
    reason: 'identity',
    test: /please tell me who you are|unable to auto-detect email address|empty ident name/i,
  },
  {
    reason: 'conflict',
    test: /CONFLICT|automatic merge failed|fix conflicts/i,
  },
  {
    reason: 'ref-missing',
    test: /not something we can merge|couldn't find remote ref|unknown revision|not a valid object name|no such remote ref/i,
  },
]

/** stderr 归因；命中不了就是 other。`stage` 缺省只影响调用方文案，不参与判断。 */
export function classifyFailure(output: string): MergeReason {
  for (const entry of PATTERNS) {
    if (entry.test.test(output)) return entry.reason
  }
  return 'other'
}
