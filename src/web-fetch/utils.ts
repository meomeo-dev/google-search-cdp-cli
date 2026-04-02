import TurndownService from 'turndown'

export type FetchPageFormat = 'markdown' | 'text' | 'html' | 'all'

export type ExtractedLink = {
  text: string
  href: string
  hostname: string
}

const VALID_FETCH_FORMATS = new Set<FetchPageFormat>([
  'markdown',
  'text',
  'html',
  'all',
])

const turndownService = new TurndownService({
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
})

turndownService.remove(['script', 'style', 'noscript', 'template'])

export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeFetchPageFormat(value: string): FetchPageFormat {
  if (VALID_FETCH_FORMATS.has(value as FetchPageFormat)) {
    return value as FetchPageFormat
  }

  throw new Error(
    `Invalid format: ${value}. Expected one of markdown, text, html, all.`,
  )
}

export function normalizeHttpUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Invalid URL: ${value}`)
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(
      `Unsupported URL protocol: ${url.protocol}. Expected http or https.`,
    )
  }

  return url.toString()
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim()) {
    return ''
  }

  return normalizeWhitespace(turndownService.turndown(html))
}

export function computeBytes(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

export function limitLinks<T>(links: T[], maxLinks: number): T[] {
  if (maxLinks <= 0) {
    return []
  }

  return links.slice(0, maxLinks)
}
