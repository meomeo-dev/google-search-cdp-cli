import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

function runCliHelp(args: string[]): string {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli.ts', ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  )

  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

test('top-level help is task-oriented', () => {
  const output = runCliHelp(['--help'])

  assert.match(output, /Common Workflows:/)
  assert.match(output, /google-search-cdp search \.\.\./)
  assert.match(output, /Start Here:/)
})

test('search help groups options by user task', () => {
  const output = runCliHelp(['search', '--help'])

  assert.match(output, /Search Request:/)
  assert.match(output, /Query Terms:/)
  assert.match(output, /Query Logic:/)
  assert.match(output, /Query Filters:/)
  assert.match(output, /Compatibility and Shortcuts:/)
  assert.match(output, /Browser Session:/)
  assert.match(output, /--headless/)
  assert.match(output, /--proxy/)
  assert.match(output, /Recommended Model:/)
  assert.match(output, /Examples:/)
})

test('fetch help groups options and includes examples', () => {
  const output = runCliHelp(['fetch', '--help'])

  assert.match(output, /Fetch Options:/)
  assert.match(output, /Browser Session:/)
  assert.match(output, /--headless/)
  assert.match(output, /--proxy/)
  assert.match(output, /Examples:/)
})
