import { withCdpPage, type WaitUntil } from '../lib/cdp.js'
import { buildGoogleQuery, type GoogleQueryInput, type GoogleQueryPlan } from './queryBuilder.js'

export type SearchGoogleInput = GoogleQueryInput & {
  cdpUrl: string
  timeoutMs: number
  waitUntil: WaitUntil
  num: number
  start: number
  hl: string
  gl: string
  safe: 'off' | 'active'
  tbm?: string
  personalize: boolean
  verbatim: boolean
}

export type SearchGooglePreview = {
  request: {
    waitUntil: WaitUntil
    timeoutMs: number
    num: number
    start: number
    hl: string
    gl: string
    safe: 'off' | 'active'
    tbm: string | null
    personalize: boolean
    verbatim: boolean
  }
  query: GoogleQueryPlan
  searchUrl: string
  warnings: string[]
}

export type GoogleSearchResult = {
  position: number
  title: string
  url: string
  displayUrl: string
  snippet: string
  source: string
}

export type SearchGoogleOutput = {
  tool: 'search'
  requestedAt: string
  cdpUrl: string
  query: GoogleQueryPlan
  searchUrl: string
  finalUrl: string
  pageTitle: string
  stats: {
    durationMs: number
    resultStatsText: string
    parsedResultCount: number | null
  }
  warnings: string[]
  results: GoogleSearchResult[]
}

function parseApproximateResultCount(text: string): number | null {
  const match = text.match(/([\d,.]+)/)
  if (!match) {
    return null
  }
  const normalized = match[1].replaceAll(',', '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function buildSearchUrl(plan: GoogleQueryPlan, input: SearchGoogleInput): string {
  const url = new URL('https://www.google.com/search')
  url.searchParams.set('q', plan.query)
  url.searchParams.set('hl', input.hl)
  url.searchParams.set('gl', input.gl)
  url.searchParams.set('num', String(input.num))
  url.searchParams.set('start', String(input.start))
  url.searchParams.set('safe', input.safe)
  url.searchParams.set('pws', input.personalize ? '1' : '0')

  if (input.tbm) {
    url.searchParams.set('tbm', input.tbm)
  }
  if (input.verbatim) {
    url.searchParams.set('tbs', 'li:1')
  }

  return url.toString()
}

export function previewSearchGoogle(input: SearchGoogleInput): SearchGooglePreview {
  const query = buildGoogleQuery(input)
  const searchUrl = buildSearchUrl(query, input)
  const warnings: string[] = []

  if ((query.src.length > 0 || query.imagesize.length > 0) && input.tbm !== 'isch') {
    warnings.push('`src:` and `imagesize:` are image-search operators. Consider using `--tbm isch`.')
  }

  return {
    request: {
      waitUntil: input.waitUntil,
      timeoutMs: input.timeoutMs,
      num: input.num,
      start: input.start,
      hl: input.hl,
      gl: input.gl,
      safe: input.safe,
      tbm: input.tbm ?? null,
      personalize: input.personalize,
      verbatim: input.verbatim,
    },
    query,
    searchUrl,
    warnings,
  }
}

export async function searchGoogleViaCdp(
  input: SearchGoogleInput,
): Promise<SearchGoogleOutput> {
  const preview = previewSearchGoogle(input)
  const startedAt = Date.now()
  const warnings = [...preview.warnings]

  const pageState = await withCdpPage(
    {
      cdpUrl: input.cdpUrl,
      timeoutMs: input.timeoutMs,
    },
    async ({ page, goto }) => {
      await goto(preview.searchUrl, input.waitUntil)
      await page.waitForSelector('body')

      const evaluation = await page.evaluate((limit: number) => {
        const normalize = (value: string | null | undefined): string =>
          (value ?? '').replace(/\s+/g, ' ').trim()

        const firstText = (root: Element, selectors: string[]): string => {
          for (const selector of selectors) {
            const text = normalize(root.querySelector(selector)?.textContent)
            if (text) {
              return text
            }
          }
          return ''
        }

        const containers = Array.from(
          document.querySelectorAll('#search .MjjYud, #search .g, #rso > div, main .g'),
        )
        const results: Array<{
          title: string
          url: string
          displayUrl: string
          snippet: string
          source: string
        }> = []
        const seen = new Set<string>()

        for (const container of containers) {
          const titleNode = container.querySelector('h3')
          if (!(titleNode instanceof HTMLElement)) {
            continue
          }

          const anchor = titleNode.closest('a') ?? container.querySelector('a[href]')
          if (!(anchor instanceof HTMLAnchorElement)) {
            continue
          }

          const href = anchor.href
          if (!href || !/^https?:\/\//.test(href)) {
            continue
          }
          if (/google\.[^/]+\/(search|url|imgres)/.test(href)) {
            continue
          }
          if (seen.has(href)) {
            continue
          }

          const title = normalize(titleNode.textContent)
          if (!title) {
            continue
          }

          const displayUrl = firstText(container, [
            'cite',
            '.tjvcx',
            '.apx8Vc',
            '.iUh30',
            '.qLRx3b',
          ])
          const snippet = firstText(container, [
            '.VwiC3b',
            '.yXK7lf',
            '.s3v9rd',
            '.ITZIwc',
            '.MUxGbd',
            '[data-sncf="1"]',
          ])

          let source = displayUrl
          if (!source) {
            try {
              source = new URL(href).hostname
            } catch {
              source = ''
            }
          }

          results.push({
            title,
            url: href,
            displayUrl,
            snippet,
            source,
          })
          seen.add(href)

          if (results.length >= limit) {
            break
          }
        }

        return {
          pageTitle: document.title,
          pageUrl: window.location.href,
          resultStatsText: normalize(document.querySelector('#result-stats')?.textContent),
          bodyTextSample: normalize(document.body?.innerText).slice(0, 1500),
          results,
        }
      }, input.num)

      return {
        finalUrl: page.url(),
        ...evaluation,
      }
    },
  )

  const lowerTitle = pageState.pageTitle.toLowerCase()
  const lowerBody = pageState.bodyTextSample.toLowerCase()
  if (pageState.finalUrl.includes('consent.google.com')) {
    warnings.push('Google returned a consent page instead of results.')
  }
  if (lowerTitle.includes('unusual traffic') || lowerBody.includes('unusual traffic')) {
    warnings.push('Google may be rate-limiting this browser session.')
  }
  if (pageState.results.length === 0) {
    warnings.push('No organic results were extracted from the current page.')
  }

  return {
    tool: 'search',
    requestedAt: new Date().toISOString(),
    cdpUrl: input.cdpUrl,
    query: preview.query,
    searchUrl: preview.searchUrl,
    finalUrl: pageState.finalUrl,
    pageTitle: pageState.pageTitle,
    stats: {
      durationMs: Date.now() - startedAt,
      resultStatsText: pageState.resultStatsText,
      parsedResultCount: parseApproximateResultCount(pageState.resultStatsText),
    },
    warnings,
    results: pageState.results.map((result, index) => ({
      position: input.start + index + 1,
      ...result,
    })),
  }
}
