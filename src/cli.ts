#!/usr/bin/env node

import { Command, Option } from 'commander'
import { searchGoogleViaCdp } from './google/search.js'
import { hasStructuredQuerySyntax, parseStructuredQueryArgv } from './google/cliStructuredQuery.js'
import type { GoogleQueryInput } from './google/queryBuilder.js'
import { withManagedChromeIfNeeded } from './lib/managedChrome.js'
import { WEB_FETCH_TOOL_DESCRIPTION } from './web-fetch/prompt.js'
import { fetchPageViaCdp, type FetchPageFormat } from './web-fetch/WebFetchTool.js'

function collect(value: string, previous: string[]): string[] {
  previous.push(value)
  return previous
}

function parseInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
  return parsed
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function addManagedChromeOptions(command: Command): Command {
  return command
    .optionsGroup('Browser Session:')
    .option(
      '--cdp-url <url>',
      'Connect to an existing local Chrome CDP endpoint',
      'http://127.0.0.1:9222',
    )
    .option(
      '--timeout <ms>',
      'Timeout for CDP connect, navigation, and waits',
      '30000',
    )
    .option('--wait-until <event>', 'Navigation lifecycle event', 'networkidle2')
    .option(
      '--clone-chrome-profile',
      'Clone your current Chrome profile into a temp dir and launch a managed local CDP Chrome',
    )
    .option(
      '--headless',
      'Managed Chrome only: launch the cloned-profile browser in headless mode',
    )
    .option(
      '--proxy <server>',
      'Managed Chrome only: proxy server for the cloned-profile browser, e.g. http://127.0.0.1:7890 or socks5://127.0.0.1:1080',
    )
    .option(
      '--chrome-user-data-dir <dir>',
      'Source Chrome user-data-dir to clone when using --clone-chrome-profile',
    )
    .option(
      '--chrome-executable-path <path>',
      'Chrome executable to launch when using --clone-chrome-profile',
    )
    .option(
      '--keep-temp-chrome-profile',
      'Keep the cloned temp Chrome profile after the command exits',
    )
}

function getSubcommandArgv(command: Command): string[] {
  const rawArgs = process.argv
  const commandIndex = rawArgs.indexOf(command.name())
  return commandIndex === -1 ? rawArgs.slice(2) : rawArgs.slice(commandIndex + 1)
}

function buildQueryInput(
  commandOptions: Record<string, unknown>,
  terms: string[],
  rawQueryArgv: string[],
): GoogleQueryInput {
  const structuredTokens = hasStructuredQuerySyntax(rawQueryArgv)
    ? parseStructuredQueryArgv(rawQueryArgv)
    : []

  return {
    terms,
    exact: (commandOptions.exact as string[]) ?? [],
    anyOf: (commandOptions.or as string[]) ?? [],
    exclude: (commandOptions.exclude as string[]) ?? [],
    site: (commandOptions.site as string[]) ?? [],
    excludeSite: (commandOptions.excludeSite as string[]) ?? [],
    filetype: (commandOptions.filetype as string[]) ?? [],
    excludeFiletype: (commandOptions.excludeFiletype as string[]) ?? [],
    intitle: (commandOptions.intitle as string[]) ?? [],
    allintitle: (commandOptions.allintitle as string[]) ?? [],
    inurl: (commandOptions.inurl as string[]) ?? [],
    allinurl: (commandOptions.allinurl as string[]) ?? [],
    intext: (commandOptions.intext as string[]) ?? [],
    allintext: (commandOptions.allintext as string[]) ?? [],
    src: (commandOptions.src as string[]) ?? [],
    imagesize: (commandOptions.imagesize as string[]) ?? [],
    after: commandOptions.after as string | undefined,
    before: commandOptions.before as string | undefined,
    logic: (commandOptions.logic as string[]) ?? [],
    structuredTokens,
    raw: (commandOptions.raw as string[]) ?? [],
  }
}

const program = new Command()

program
  .name('google-search-cdp')
  .description('Google advanced search and page fetch through a local Chrome CDP session.')
  .summary('Search Google or fetch pages through Chrome CDP')
  .showSuggestionAfterError()
  .showHelpAfterError()
  .addHelpText(
    'after',
    `
Common Workflows:
  google-search-cdp search ...        Build a Google query and run it through Chrome CDP
  google-search-cdp fetch <url>       Load a page through Chrome CDP and extract content

Start Here:
  google-search-cdp search --help
  google-search-cdp fetch --help
`,
  )

addManagedChromeOptions(
  program
    .command('search')
  .argument('[terms...]', 'base search terms')
  .description('Build a Google advanced-search query from CLI flags and return JSON results.')
  .summary('Run a Google search with structured query flags')
  .optionsGroup('Search Request:')
  .option('--num <count>', 'Number of results to request (1-100)', '10')
  .option('--start <offset>', 'Result offset', '0')
  .option('--hl <lang>', 'Google interface language', 'en')
  .option('--gl <country>', 'Google country code', 'us')
  .option('--safe <mode>', 'Google SafeSearch mode: off|active', 'off')
  .option('--tbm <vertical>', 'Google search vertical, e.g. nws, isch, vid')
  .option('--verbatim', 'Use Google verbatim mode')
  .option('--personalize', 'Enable personalized search (pws=1)')
  .optionsGroup('Query Terms:')
  .option('--exact <phrase>', 'Exact-match phrase', collect, [])
  .optionsGroup('Query Logic:')
  .option('--or-op', 'Boolean OR operator for structured query mode')
  .option('--and', 'Boolean AND operator for structured query mode')
  .option('--not', 'Boolean NOT operator for structured query mode')
  .option('--group-start', 'Open a grouped sub-expression for structured query mode')
  .option('--group-end', 'Close a grouped sub-expression for structured query mode')
  .optionsGroup('Query Filters:')
  .option('--exclude <term>', 'Exclude a term with leading -', collect, [])
  .option('--site <domain>', 'Restrict to a site or domain', collect, [])
  .option('--exclude-site <domain>', 'Exclude a site or domain', collect, [])
  .option('--filetype <ext>', 'Restrict by filetype, e.g. pdf', collect, [])
  .option('--exclude-filetype <ext>', 'Exclude a filetype via -filetype:', collect, [])
  .option('--intitle <term>', 'Require a word or phrase in the title', collect, [])
  .option('--allintitle <clause>', 'Require all terms in the clause to appear in the title', collect, [])
  .option('--inurl <term>', 'Require a word or phrase in the URL', collect, [])
  .option('--allinurl <clause>', 'Require all terms in the clause to appear in the URL', collect, [])
  .option('--intext <term>', 'Compatibility alias; prefer --allintext for documented official syntax', collect, [])
  .option('--allintext <clause>', 'Require all terms in the clause to appear in body text', collect, [])
  .option('--src <url>', 'Google Images only: find pages that reference an image URL', collect, [])
  .option('--imagesize <size>', 'Google Images only: constrain image size, e.g. 1200x800', collect, [])
  .addOption(
    new Option('--or <term>', 'Legacy shortcut: alternative term compiled into one grouped OR clause')
      .argParser(collect)
      .default([])
      .helpGroup('Compatibility and Shortcuts:'),
  )
  .addOption(
    new Option('--logic <expr>', 'Shortcut boolean clause using the same compiler as structured query mode')
      .argParser(collect)
      .default([])
      .helpGroup('Compatibility and Shortcuts:'),
  )
  .addOption(
    new Option('--after <date>', 'Compatibility operator after:, YYYY-MM-DD').helpGroup(
      'Compatibility and Shortcuts:',
    ),
  )
  .addOption(
    new Option('--before <date>', 'Compatibility operator before:, YYYY-MM-DD').helpGroup(
      'Compatibility and Shortcuts:',
    ),
  )
  .addOption(
    new Option('--raw <clause>', 'Append raw Google query syntax without validation')
      .argParser(collect)
      .default([])
      .helpGroup('Compatibility and Shortcuts:'),
  )
  .addHelpText(
    'after',
    `
Recommended Model:
  1. Put plain search words in positional terms.
  2. Add filters with flags like --site, --filetype, --exact, --exclude.
  3. For grouped boolean logic, use --group-start / --group-end with --or-op and --not.
  4. Use --logic only as a shortcut, not as the primary query-building path.

Examples:
  Basic:
    google-search-cdp search agent memory --site openai.com --filetype pdf

  Grouped OR across sites:
    google-search-cdp search --group-start --site bain.com --or-op --site bcg.com --group-end --filetype pdf

  Reuse your current Chrome login/cookies safely:
    google-search-cdp search llm agents --clone-chrome-profile --cdp-url http://127.0.0.1:9333 --site openai.com
`,
  )
  .action(async (terms: string[], options: Record<string, unknown>, command: Command) => {
    const timeoutMs = parseInteger(String(options.timeout), 'timeout')
    const cdpUrl = String(options.cdpUrl)

    const result = await withManagedChromeIfNeeded(
      {
        cdpUrl,
        timeoutMs,
        cloneChromeProfile: Boolean(options.cloneChromeProfile),
        headless: Boolean(options.headless),
        proxyServer: options.proxy ? String(options.proxy) : undefined,
        chromeExecutablePath: options.chromeExecutablePath
          ? String(options.chromeExecutablePath)
          : undefined,
        chromeUserDataDir: options.chromeUserDataDir ? String(options.chromeUserDataDir) : undefined,
        keepTempChromeProfile: Boolean(options.keepTempChromeProfile),
      },
      nextCdpUrl =>
        searchGoogleViaCdp({
          ...buildQueryInput(options, terms, getSubcommandArgv(command)),
          cdpUrl: nextCdpUrl,
          timeoutMs,
          waitUntil: String(options.waitUntil) as
            | 'load'
            | 'domcontentloaded'
            | 'networkidle0'
            | 'networkidle2',
          num: clamp(parseInteger(String(options.num), 'num'), 1, 100),
          start: Math.max(parseInteger(String(options.start), 'start'), 0),
          hl: String(options.hl),
          gl: String(options.gl),
          safe: String(options.safe) === 'active' ? 'active' : 'off',
          tbm: options.tbm ? String(options.tbm) : undefined,
          personalize: Boolean(options.personalize),
          verbatim: Boolean(options.verbatim),
        }),
    )
    printJson(result)
  }),
)

addManagedChromeOptions(
  program
    .command('fetch')
  .argument('<url>', 'page URL to fetch through Chrome CDP')
  .description(WEB_FETCH_TOOL_DESCRIPTION)
  .summary('Fetch and extract a page through Chrome CDP')
  .optionsGroup('Fetch Options:')
  .option('--selector <css>', 'Optional CSS selector to scope extracted content')
  .option('--format <format>', 'markdown|text|html|all', 'markdown')
  .option('--max-links <count>', 'Maximum number of extracted links', '25')
  .addHelpText(
    'after',
    `
Examples:
  google-search-cdp fetch https://example.com --format text
  google-search-cdp fetch https://developer.chrome.com/docs/devtools/ --selector main --format markdown
  google-search-cdp fetch https://example.com --clone-chrome-profile --cdp-url http://127.0.0.1:9333
`,
  )
  .action(async (url: string, options: Record<string, unknown>) => {
    const timeoutMs = parseInteger(String(options.timeout), 'timeout')
    const cdpUrl = String(options.cdpUrl)

    const result = await withManagedChromeIfNeeded(
      {
        cdpUrl,
        timeoutMs,
        cloneChromeProfile: Boolean(options.cloneChromeProfile),
        headless: Boolean(options.headless),
        proxyServer: options.proxy ? String(options.proxy) : undefined,
        chromeExecutablePath: options.chromeExecutablePath
          ? String(options.chromeExecutablePath)
          : undefined,
        chromeUserDataDir: options.chromeUserDataDir ? String(options.chromeUserDataDir) : undefined,
        keepTempChromeProfile: Boolean(options.keepTempChromeProfile),
      },
      nextCdpUrl =>
        fetchPageViaCdp({
          url,
          cdpUrl: nextCdpUrl,
          timeoutMs,
          waitUntil: String(options.waitUntil) as
            | 'load'
            | 'domcontentloaded'
            | 'networkidle0'
            | 'networkidle2',
          selector: options.selector ? String(options.selector) : undefined,
          format: String(options.format) as FetchPageFormat,
          maxLinks: clamp(parseInteger(String(options.maxLinks), 'max-links'), 0, 200),
        }),
    )
    printJson(result)
  }),
)

program.parseAsync(process.argv).catch(error => {
  process.stderr.write(
    `${JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  )
  process.exitCode = 1
})
