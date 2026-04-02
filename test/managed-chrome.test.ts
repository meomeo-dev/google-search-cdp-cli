import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildManagedChromeLaunchArgs,
  parseLocalCdpUrl,
  resolveDefaultChromeExecutablePath,
  resolveDefaultChromeUserDataDir,
  withManagedChromeIfNeeded,
} from '../src/lib/managedChrome.ts'

test('parses a local CDP url for managed Chrome launch', () => {
  assert.deepEqual(parseLocalCdpUrl('http://127.0.0.1:9222'), {
    host: '127.0.0.1',
    port: 9222,
    browserUrl: 'http://127.0.0.1:9222',
  })
})

test('rejects a non-local CDP url for managed Chrome launch', () => {
  assert.throws(
    () => parseLocalCdpUrl('http://example.com:9222'),
    /Managed Chrome only supports a local --cdp-url/,
  )
})

test('resolves default Chrome paths for darwin', () => {
  assert.equal(
    resolveDefaultChromeExecutablePath('darwin', {}),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  )

  assert.equal(
    resolveDefaultChromeUserDataDir('darwin', { HOME: '/Users/jin' }),
    '/Users/jin/Library/Application Support/Google/Chrome',
  )
})

test('builds headless launch args for managed Chrome when requested', () => {
  assert.deepEqual(
    buildManagedChromeLaunchArgs({
      port: 9333,
      userDataDir: '/tmp/google-cdp-cli-profile/User Data',
      headless: true,
      proxyServer: undefined,
    }),
    [
      '--remote-debugging-port=9333',
      '--user-data-dir=/tmp/google-cdp-cli-profile/User Data',
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      'about:blank',
    ],
  )
})

test('builds proxy launch args for managed Chrome when requested', () => {
  assert.deepEqual(
    buildManagedChromeLaunchArgs({
      port: 9333,
      userDataDir: '/tmp/google-cdp-cli-profile/User Data',
      headless: false,
      proxyServer: 'socks5://127.0.0.1:1080',
    }),
    [
      '--remote-debugging-port=9333',
      '--user-data-dir=/tmp/google-cdp-cli-profile/User Data',
      '--no-first-run',
      '--no-default-browser-check',
      '--proxy-server=socks5://127.0.0.1:1080',
      'about:blank',
    ],
  )
})

test('rejects headless without managed Chrome profile cloning', async () => {
  await assert.rejects(
    () =>
      withManagedChromeIfNeeded(
        {
          cdpUrl: 'http://127.0.0.1:9222',
          timeoutMs: 1000,
          cloneChromeProfile: false,
          headless: true,
          keepTempChromeProfile: false,
        },
        async () => 'ok',
      ),
    /`--headless` requires `--clone-chrome-profile`\./,
  )
})

test('rejects proxy without managed Chrome profile cloning', async () => {
  await assert.rejects(
    () =>
      withManagedChromeIfNeeded(
        {
          cdpUrl: 'http://127.0.0.1:9222',
          timeoutMs: 1000,
          cloneChromeProfile: false,
          headless: false,
          proxyServer: 'http://127.0.0.1:7890',
          keepTempChromeProfile: false,
        },
        async () => 'ok',
      ),
    /`--proxy` requires `--clone-chrome-profile`\./,
  )
})
