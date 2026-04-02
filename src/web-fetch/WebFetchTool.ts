import { withCdpPage, type WaitUntil } from '../lib/cdp.js'
import {
  computeBytes,
  htmlToMarkdown,
  limitLinks,
  normalizeFetchPageFormat,
  normalizeHttpUrl,
  normalizeWhitespace,
  type ExtractedLink,
  type FetchPageFormat,
} from './utils.js'

export type { FetchPageFormat } from './utils.js'

export type FetchPageInput = {
  url: string
  cdpUrl: string
  timeoutMs: number
  waitUntil: WaitUntil
  selector?: string
  format: FetchPageFormat
  maxLinks: number
}

export type FetchPagePreview = {
  request: {
    url: string
    selector: string | null
    format: FetchPageFormat
    waitUntil: WaitUntil
    timeoutMs: number
    maxLinks: number
  }
  warnings: string[]
}

export type FetchPageOutput = {
  tool: 'fetch'
  requestedAt: string
  cdpUrl: string
  request: {
    url: string
    selector: string | null
    format: FetchPageFormat
    waitUntil: WaitUntil
    timeoutMs: number
    maxLinks: number
  }
  response: {
    status: number | null
    statusText: string
    headers: Record<string, string>
    contentType: string | null
    finalUrl: string
    durationMs: number
    bytes: number
  }
  page: {
    title: string
    selector: string | null
    html?: string
    text?: string
    markdown?: string
    links: ExtractedLink[]
  }
  warnings: string[]
}

type EvaluatedPageState = {
  pageTitle: string
  selectedHtml: string
  selectedText: string
  links: ExtractedLink[]
  selectorMatched: boolean
}

function pickContentType(headers: Record<string, string>): string | null {
  const contentType = headers['content-type']
  if (!contentType) {
    return null
  }

  return contentType.split(';', 1)[0]?.trim() || null
}

function buildPagePayload(
  format: FetchPageFormat,
  html: string,
  text: string,
  markdown: string,
  links: ExtractedLink[],
  title: string,
  selector: string | undefined,
): FetchPageOutput['page'] {
  const page: FetchPageOutput['page'] = {
    title,
    selector: selector ?? null,
    links,
  }

  if (format === 'html' || format === 'all') {
    page.html = html
  }
  if (format === 'text' || format === 'all') {
    page.text = text
  }
  if (format === 'markdown' || format === 'all') {
    page.markdown = markdown
  }

  return page
}

export function previewFetchPage(
  input: FetchPageInput,
): FetchPagePreview {
  const url = normalizeHttpUrl(input.url)
  const format = normalizeFetchPageFormat(input.format)

  return {
    request: {
      url,
      selector: input.selector ?? null,
      format,
      waitUntil: input.waitUntil,
      timeoutMs: input.timeoutMs,
      maxLinks: input.maxLinks,
    },
    warnings: [],
  }
}

export async function fetchPageViaCdp(
  input: FetchPageInput,
): Promise<FetchPageOutput> {
  const startedAt = Date.now()
  const preview = previewFetchPage(input)
  const format = preview.request.format
  const warnings: string[] = []

  const pageState = await withCdpPage(
    {
      cdpUrl: input.cdpUrl,
      timeoutMs: input.timeoutMs,
    },
    async ({ page, goto }) => {
      const response = await goto(preview.request.url, input.waitUntil)
      await page.waitForSelector('body')

      const evaluated = await page.evaluate(
        ({ selector, maxLinks }: { selector?: string; maxLinks: number }) => {
          const normalize = (value: string | null | undefined): string =>
            (value ?? '').replace(/\s+/g, ' ').trim()

          const sanitizeHtml = (node: Element): string => {
            const clone = node.cloneNode(true)
            if (!(clone instanceof Element)) {
              return ''
            }

            clone
              .querySelectorAll('script, style, noscript, template')
              .forEach(element => {
                element.remove()
              })

            return clone.outerHTML
          }

          const target = selector
            ? document.querySelector(selector)
            : document.body ?? document.documentElement

          if (!(target instanceof Element)) {
            return {
              pageTitle: document.title,
              selectedHtml: '',
              selectedText: '',
              links: [],
              selectorMatched: false,
            }
          }

          const seen = new Set<string>()
          const links: ExtractedLink[] = []

          for (const anchor of Array.from(target.querySelectorAll('a[href]'))) {
            if (!(anchor instanceof HTMLAnchorElement)) {
              continue
            }

            const href = anchor.href
            if (!href || seen.has(href)) {
              continue
            }
            seen.add(href)

            let hostname = ''
            try {
              hostname = new URL(href).hostname
            } catch {
              hostname = ''
            }

            links.push({
              text: normalize(anchor.textContent),
              href,
              hostname,
            })

            if (links.length >= maxLinks) {
              break
            }
          }

          return {
            pageTitle: document.title,
            selectedHtml: sanitizeHtml(target),
            selectedText:
              target instanceof HTMLElement
                ? normalize(target.innerText)
                : normalize(target.textContent),
            links,
            selectorMatched: true,
          }
        },
        {
          selector: input.selector,
          maxLinks: input.maxLinks,
        },
      )

      return {
        response,
        evaluated,
        finalUrl: page.url(),
      }
    },
  )

  if (input.selector && !pageState.evaluated.selectorMatched) {
    warnings.push(`Selector not found: ${input.selector}`)
  }

  const html = normalizeWhitespace(pageState.evaluated.selectedHtml)
  const text = normalizeWhitespace(pageState.evaluated.selectedText)
  const markdown = htmlToMarkdown(html)
  const links = limitLinks(pageState.evaluated.links, input.maxLinks)
  const headers = pageState.response?.headers() ?? {}
  const contentType = pickContentType(headers)

  if (!html) {
    warnings.push('Fetched page produced empty HTML content for the selected scope.')
  }
  if (!text) {
    warnings.push('Fetched page produced empty text content for the selected scope.')
  }

  const pagePayload = buildPagePayload(
    format,
    html,
    text,
    markdown,
    links,
    pageState.evaluated.pageTitle,
    input.selector,
  )

  const bytes = computeBytes(
    JSON.stringify({
      html: pagePayload.html ?? '',
      text: pagePayload.text ?? '',
      markdown: pagePayload.markdown ?? '',
    }),
  )

  return {
    tool: 'fetch',
    requestedAt: new Date().toISOString(),
    cdpUrl: input.cdpUrl,
    request: preview.request,
    response: {
      status: pageState.response?.status() ?? null,
      statusText: pageState.response?.statusText() ?? '',
      headers,
      contentType,
      finalUrl: pageState.finalUrl,
      durationMs: Date.now() - startedAt,
      bytes,
    },
    page: pagePayload,
    warnings,
  }
}
