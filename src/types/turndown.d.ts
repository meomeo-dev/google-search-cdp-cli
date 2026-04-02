declare module 'turndown' {
  export type TurndownOptions = {
    codeBlockStyle?: 'indented' | 'fenced'
    headingStyle?: 'setext' | 'atx'
  }

  export default class TurndownService {
    constructor(options?: TurndownOptions)
    remove(filter: string | string[]): this
    turndown(input: string): string
  }
}
