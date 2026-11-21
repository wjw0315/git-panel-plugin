// 失败归因：只测纯字符串判断，不碰 git。
import { assert, test } from 'orca/testing'
import { classifyFailure } from './git-failure'

test('v5: git stderr maps to the reason the panel shows', () => {
  const cases: [string, string][] = [
    [
      "fatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights and the repository exists.",
      'auth',
    ],
    ['ssh: connect to host github.com port 22: Connection timed out', 'network'],
    ['merge: origin/nope - not something we can merge', 'ref-missing'],
    [
      'error: The following untracked working tree files would be overwritten by merge:\n\tb.txt',
      'untracked-overwrite',
    ],
    ['*** Please tell me who you are.', 'identity'],
    ['CONFLICT (content): Merge conflict in a.txt', 'conflict'],
    ['something nobody predicted', 'other'],
  ]
  for (const [stderr, reason] of cases) {
    assert.equal(classifyFailure(stderr), reason, stderr.split('\n')[0])
  }
})
