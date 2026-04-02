import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

function runCli(
  args: string[],
  options?: {
    env?: NodeJS.ProcessEnv
  },
): {
  status: number | null
  stdout: string
  stderr: string
} {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli.ts', ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: options?.env,
    },
  )

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

test('search dry-run prints compiled query output without connecting to Chrome', () => {
  const result = runCli([
    'search',
    'llm',
    'agents',
    '--site',
    'openai.com',
    '--filetype',
    'pdf',
    '--dry-run',
  ])

  assert.equal(result.status, 0, result.stderr)

  const output = JSON.parse(result.stdout) as {
    tool: string
    dryRun: boolean
    browserSession: { mode: string }
    query: { query: string }
    searchUrl: string
  }

  assert.equal(output.tool, 'search')
  assert.equal(output.dryRun, true)
  assert.equal(output.browserSession.mode, 'existing')
  assert.equal(output.query.query, 'llm agents site:openai.com filetype:pdf')
  assert.match(output.searchUrl, /https:\/\/www\.google\.com\/search\?q=llm\+agents/)
})

test('fetch dry-run normalizes the request without loading the page', () => {
  const result = runCli([
    'fetch',
    'https://example.com',
    '--format',
    'text',
    '--dry-run',
  ])

  assert.equal(result.status, 0, result.stderr)

  const output = JSON.parse(result.stdout) as {
    tool: string
    dryRun: boolean
    request: { url: string; format: string }
  }

  assert.equal(output.tool, 'fetch')
  assert.equal(output.dryRun, true)
  assert.equal(output.request.url, 'https://example.com/')
  assert.equal(output.request.format, 'text')
})

test('dry-run still validates managed Chrome-only flags', () => {
  const result = runCli(['search', 'llm', '--headless', '--dry-run'])

  assert.equal(result.status, 1)
  assert.match(result.stderr, /`--headless` requires `--clone-chrome-profile`\./)
})

test('install-completion zsh writes the script, updates zshrc, and keeps backend suggestions working', async () => {
  const homeDir = await mkdtemp(join(tmpdir(), 'google-search-cdp-cli-home-'))

  try {
    const firstRun = runCli(['install-completion', 'zsh'], {
      env: {
        ...process.env,
        HOME: homeDir,
        ZDOTDIR: '',
      },
    })
    assert.equal(firstRun.status, 0, firstRun.stderr)
    assert.match(firstRun.stdout, /Installed zsh completion:/)
    assert.match(firstRun.stdout, /Updated zsh rc: yes/)

    const completionFile = join(homeDir, '.zsh', 'completions', '_google_search_cdp_cli')
    const zshrcFile = join(homeDir, '.zshrc')

    const completionScript = await readFile(completionFile, 'utf8')
    assert.match(
      completionScript,
      /#compdef google-search-cdp-cli google-search-cdp google-cdp/,
    )
    assert.match(completionScript, /__complete/)

    const zshrc = await readFile(zshrcFile, 'utf8')
    assert.match(zshrc, /# >>> google-search-cdp-cli completion >>>/)
    assert.match(zshrc, /autoload -Uz compinit/)

    const secondRun = runCli(['install-completion', 'zsh'], {
      env: {
        ...process.env,
        HOME: homeDir,
        ZDOTDIR: '',
      },
    })
    assert.equal(secondRun.status, 0, secondRun.stderr)

    const zshrcAgain = await readFile(zshrcFile, 'utf8')
    assert.equal(
      zshrcAgain.match(/# >>> google-search-cdp-cli completion >>>/g)?.length ?? 0,
      1,
    )

    const existingCompinitDir = await mkdtemp(join(tmpdir(), 'google-search-cdp-cli-zdotdir-'))
    try {
      await writeFile(join(existingCompinitDir, '.zshrc'), 'autoload -Uz compinit\ncompinit\n', 'utf8')
      const thirdRun = runCli(['install-completion', 'zsh'], {
        env: {
          ...process.env,
          HOME: homeDir,
          ZDOTDIR: existingCompinitDir,
        },
      })
      assert.equal(thirdRun.status, 0, thirdRun.stderr)
      assert.match(thirdRun.stdout, /Existing compinit setup detected/)

      const zdotdirZshrc = await readFile(join(existingCompinitDir, '.zshrc'), 'utf8')
      assert.equal(zdotdirZshrc.match(/\bautoload -Uz compinit\b/g)?.length ?? 0, 1)
      assert.equal(zdotdirZshrc.match(/\bcompinit\b/g)?.length ?? 0, 2)
      assert.match(
        zdotdirZshrc,
        /# >>> google-search-cdp-cli completion >>>[\s\S]*autoload -Uz compinit\ncompinit\n/,
      )
    } finally {
      await rm(existingCompinitDir, { recursive: true, force: true })
    }
  } finally {
    await rm(homeDir, { recursive: true, force: true })
  }

  const commandSuggestions = runCli([
    '__complete',
    '2',
    'google-search-cdp-cli',
    'se',
  ])
  assert.equal(commandSuggestions.status, 0, commandSuggestions.stderr)
  assert.match(commandSuggestions.stdout, /^search\t/m)

  const optionValueSuggestions = runCli([
    '__complete',
    '4',
    'google-search-cdp-cli',
    'fetch',
    '--format',
    't',
  ])
  assert.equal(optionValueSuggestions.status, 0, optionValueSuggestions.stderr)
  assert.match(optionValueSuggestions.stdout, /^text\t/m)
})

test('install-completion rejects unsupported shells', () => {
  const result = runCli(['install-completion', 'bash'])

  assert.equal(result.status, 1)
  assert.match(result.stderr, /Unsupported shell: bash\. Supported shells: zsh\./)
})
