// Writes the Android release notes the app reads (src/data/appUpdate.ts): the Android code
// hash, and a running "What's new" list of phone changes, one line per merged PR, tagged
// with the build that brought it. The app shows the lines newer than its own build.
// Run by .github/workflows/android.yml with BUILD, NATIVE, SHA and PREV_BODY (last notes).
import { execFileSync } from 'node:child_process'

const { BUILD, NATIVE, SHA, PREV_BODY = '' } = process.env
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })

// Everything on main since the last release, or just this commit when that is unknown.
let range = ['-1', SHA]
const prev = /Built from ([0-9a-f]{7,40})/.exec(PREV_BODY)?.[1]
if (prev) {
  try {
    git('cat-file', '-e', `${prev}^{commit}`)
    range = [`${prev}..${SHA}`]
  } catch {
    // History rewritten or shallow: fall back to this commit alone.
  }
}

const titles = git('log', '--first-parent', '--format=%s%x1f%b%x1e', ...range)
  .split('\x1e')
  .map((e) => e.trim())
  .filter(Boolean)
  .map((e) => {
    const [subject, body = ''] = e.split('\x1f')
    // GitHub's merge commits carry the PR title as the first line of the body.
    return /^Merge pull request/.test(subject) ? body.trim().split('\n')[0] : subject
  })
  // Watch-only changes ship with the watch app, not this one.
  .filter((t) => t && !/^Merge /.test(t) && !/^Watch\b/i.test(t))

const older = [...PREV_BODY.matchAll(/^- \d+\|.+$/gm)].map((m) => m[0])
const lines = [...titles.map((t) => `- ${BUILD}|${t.replace(/\|/g, '/')}`), ...older].slice(0, 40)

process.stdout.write(
  `Built from ${SHA}. Install on your phone: open this page on Android and tap monthly-budget.apk.\n\n` +
    `native: ${NATIVE}\n\nWhat's new (build|change):\n${lines.join('\n')}\n`,
)
