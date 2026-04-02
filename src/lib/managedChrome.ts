import { spawn, type ChildProcess } from 'node:child_process'
import { access, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export type ManagedChromeOptions = {
  cdpUrl: string
  timeoutMs: number
  cloneChromeProfile: boolean
  headless: boolean
  proxyServer?: string
  chromeExecutablePath?: string
  chromeUserDataDir?: string
  keepTempChromeProfile: boolean
}

type LocalCdpTarget = {
  host: string
  port: number
  browserUrl: string
}

const EXCLUDED_CHROME_PROFILE_NAMES = new Set([
  'BrowserMetrics',
  'Cache',
  'Code Cache',
  'component_crx_cache',
  'Crashpad',
  'DawnGraphiteCache',
  'GPUCache',
  'GrShaderCache',
  'GraphiteDawnCache',
  'ShaderCache',
  'SingletonCookie',
  'SingletonLock',
  'SingletonSocket',
])

export function parseLocalCdpUrl(cdpUrl: string): LocalCdpTarget {
  const url = new URL(cdpUrl)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Managed Chrome requires an http(s) --cdp-url. Received: ${cdpUrl}`)
  }

  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`Managed Chrome only supports a local --cdp-url. Received: ${cdpUrl}`)
  }

  const port = Number(url.port)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Managed Chrome requires an explicit local CDP port. Received: ${cdpUrl}`)
  }

  return {
    host: url.hostname,
    port,
    browserUrl: `${url.protocol}//${url.host}`,
  }
}

export function resolveDefaultChromeExecutablePath(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  }

  if (platform === 'win32') {
    const programFiles = env['PROGRAMFILES'] ?? 'C:\\Program Files'
    return `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`
  }

  if (platform === 'linux') {
    return 'google-chrome'
  }

  return undefined
}

export function resolveDefaultChromeUserDataDir(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const home = env['HOME']

  if (platform === 'darwin') {
    return home ? join(home, 'Library', 'Application Support', 'Google', 'Chrome') : undefined
  }

  if (platform === 'win32') {
    const localAppData = env['LOCALAPPDATA']
    return localAppData ? join(localAppData, 'Google', 'Chrome', 'User Data') : undefined
  }

  if (platform === 'linux') {
    return home ? join(home, '.config', 'google-chrome') : undefined
  }

  return undefined
}

function shouldCopyChromeProfilePath(pathname: string): boolean {
  return !EXCLUDED_CHROME_PROFILE_NAMES.has(basename(pathname))
}

async function waitForBrowserUrl(browserUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${browserUrl}/json/version`)
      if (response.ok) {
        return
      }
      lastError = new Error(`Chrome CDP responded with ${response.status}.`)
    } catch (error) {
      lastError = error
    }

    await delay(250)
  }

  throw new Error(
    `Timed out waiting for managed Chrome CDP at ${browserUrl}. ${
      lastError instanceof Error ? lastError.message : ''
    }`.trim(),
  )
}

async function terminateChromeProcess(process: ChildProcess): Promise<void> {
  if (process.exitCode !== null) {
    return
  }

  process.kill('SIGTERM')
  const exited = await Promise.race([
    new Promise<boolean>(resolve => {
      process.once('exit', () => resolve(true))
      process.once('close', () => resolve(true))
    }),
    delay(2000).then(() => false),
  ])

  if (!exited && process.exitCode === null) {
    process.kill('SIGKILL')
    await Promise.race([
      new Promise<void>(resolve => {
        process.once('exit', () => resolve())
        process.once('close', () => resolve())
      }),
      delay(2000),
    ])
  }
}

export function buildManagedChromeLaunchArgs(options: {
  port: number
  userDataDir: string
  headless: boolean
  proxyServer?: string
}): string[] {
  const args = [
    `--remote-debugging-port=${options.port}`,
    `--user-data-dir=${options.userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ]

  if (options.headless) {
    args.push('--headless=new')
  }

  if (options.proxyServer) {
    args.push(`--proxy-server=${options.proxyServer}`)
  }

  args.push('about:blank')

  return args
}

export async function withManagedChromeIfNeeded<T>(
  options: ManagedChromeOptions,
  run: (cdpUrl: string) => Promise<T>,
): Promise<T> {
  if (options.headless && !options.cloneChromeProfile) {
    throw new Error('`--headless` requires `--clone-chrome-profile`.')
  }
  if (options.proxyServer && !options.cloneChromeProfile) {
    throw new Error('`--proxy` requires `--clone-chrome-profile`.')
  }

  if (!options.cloneChromeProfile) {
    return run(options.cdpUrl)
  }

  const sourceUserDataDir =
    options.chromeUserDataDir ?? resolveDefaultChromeUserDataDir()
  if (!sourceUserDataDir) {
    throw new Error('Could not resolve the default Chrome user-data-dir. Pass --chrome-user-data-dir.')
  }

  await access(sourceUserDataDir)

  const chromeExecutablePath =
    options.chromeExecutablePath ?? resolveDefaultChromeExecutablePath()
  if (!chromeExecutablePath) {
    throw new Error(
      'Could not resolve the default Chrome executable. Pass --chrome-executable-path.',
    )
  }

  const cdpTarget = parseLocalCdpUrl(options.cdpUrl)
  const tempRootDir = await mkdtemp(join(tmpdir(), 'google-cdp-cli-profile-'))
  const clonedUserDataDir = join(tempRootDir, 'User Data')

  await cp(sourceUserDataDir, clonedUserDataDir, {
    recursive: true,
    filter: source => shouldCopyChromeProfilePath(source),
  })

  const chromeProcess = spawn(
    chromeExecutablePath,
    buildManagedChromeLaunchArgs({
      port: cdpTarget.port,
      userDataDir: clonedUserDataDir,
      headless: options.headless,
      proxyServer: options.proxyServer?.trim() || undefined,
    }),
    {
      stdio: 'ignore',
    },
  )

  try {
    await waitForBrowserUrl(cdpTarget.browserUrl, options.timeoutMs)
    return await run(options.cdpUrl)
  } finally {
    await terminateChromeProcess(chromeProcess).catch(() => {})

    if (!options.keepTempChromeProfile) {
      await rm(tempRootDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 250,
      }).catch(() => {})
    }
  }
}
