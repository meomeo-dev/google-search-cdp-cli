import puppeteer, { type HTTPResponse, type Page } from 'puppeteer-core'

export type WaitUntil = 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'

export type WithCdpPageOptions = {
  cdpUrl: string
  timeoutMs: number
}

export type CdpPageContext = {
  page: Page
  goto: (url: string, waitUntil: WaitUntil) => Promise<HTTPResponse | null>
}

export async function withCdpPage<T>(
  options: WithCdpPageOptions,
  run: (context: CdpPageContext) => Promise<T>,
): Promise<T> {
  const browser = await puppeteer.connect({
    browserURL: options.cdpUrl,
    protocolTimeout: options.timeoutMs,
    defaultViewport: {
      width: 1440,
      height: 1200,
    },
  })

  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(options.timeoutMs)
  page.setDefaultTimeout(options.timeoutMs)
  page.on('dialog', dialog => {
    void dialog.dismiss().catch(() => {})
  })

  try {
    return await run({
      page,
      goto: async (url: string, waitUntil: WaitUntil) =>
        page.goto(url, {
          waitUntil,
        }),
    })
  } finally {
    await page.close().catch(() => {})
    browser.disconnect()
  }
}
