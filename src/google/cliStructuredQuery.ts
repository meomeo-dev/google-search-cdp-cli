import { compileGoogleLogicExpression, type GoogleLogicToken } from './logic.js'
import { normalizeClause, quoteExactPhrase, quoteTerm } from './queryBuilder.js'

const STRUCTURE_FLAGS = new Set(['--group-start', '--group-end', '--and', '--or-op', '--not'])

const NON_QUERY_VALUE_OPTIONS = new Set([
  '--cdp-url',
  '--chrome-executable-path',
  '--chrome-user-data-dir',
  '--proxy',
  '--timeout',
  '--wait-until',
  '--num',
  '--start',
  '--hl',
  '--gl',
  '--safe',
  '--tbm',
])

const NON_QUERY_FLAG_OPTIONS = new Set([
  '--clone-chrome-profile',
  '--headless',
  '--keep-temp-chrome-profile',
  '--verbatim',
  '--personalize',
])

type ParsedOption = {
  name: string
  inlineValue?: string
}

function parseLongOption(argument: string): ParsedOption | null {
  if (!argument.startsWith('--')) {
    return null
  }

  const equalsIndex = argument.indexOf('=')
  if (equalsIndex === -1) {
    return { name: argument }
  }

  return {
    name: argument.slice(0, equalsIndex),
    inlineValue: argument.slice(equalsIndex + 1),
  }
}

function resolveOptionValue(
  argv: string[],
  index: number,
  option: ParsedOption,
): { value: string; nextIndex: number } {
  if (option.inlineValue !== undefined) {
    return {
      value: option.inlineValue,
      nextIndex: index,
    }
  }

  const value = argv[index + 1]
  if (value === undefined) {
    throw new Error(`Missing value for ${option.name}.`)
  }

  return {
    value,
    nextIndex: index + 1,
  }
}

function buildAtom(name: string, value: string): string {
  switch (name) {
    case '--exact':
      return quoteExactPhrase(value)
    case '--exclude':
      return `-${quoteTerm(value)}`
    case '--site':
      return `site:${normalizeClause(value)}`
    case '--exclude-site':
      return `-site:${normalizeClause(value)}`
    case '--filetype':
      return `filetype:${normalizeClause(value)}`
    case '--exclude-filetype':
      return `-filetype:${normalizeClause(value)}`
    case '--intitle':
      return `intitle:${quoteTerm(value)}`
    case '--allintitle':
      return `allintitle:${normalizeClause(value)}`
    case '--inurl':
      return `inurl:${quoteTerm(value)}`
    case '--allinurl':
      return `allinurl:${normalizeClause(value)}`
    case '--intext':
      return `intext:${quoteTerm(value)}`
    case '--allintext':
      return `allintext:${normalizeClause(value)}`
    case '--src':
      return `src:${normalizeClause(value)}`
    case '--imagesize':
      return `imagesize:${normalizeClause(value)}`
    case '--after':
      return `after:${value.trim()}`
    case '--before':
      return `before:${value.trim()}`
    case '--raw':
      return value.trim()
    case '--logic':
      return compileGoogleLogicExpression(value).clause
    default:
      return quoteTerm(value)
  }
}

export function hasStructuredQuerySyntax(argv: string[]): boolean {
  for (const argument of argv) {
    const option = parseLongOption(argument)
    if (option && STRUCTURE_FLAGS.has(option.name)) {
      return true
    }
  }

  return false
}

export function parseStructuredQueryArgv(argv: string[]): GoogleLogicToken[] {
  const tokens: GoogleLogicToken[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const option = parseLongOption(argument)

    if (!option) {
      if (argument.startsWith('-')) {
        continue
      }

      tokens.push({
        type: 'atom',
        value: quoteTerm(argument),
      })
      continue
    }

    if (NON_QUERY_FLAG_OPTIONS.has(option.name)) {
      continue
    }

    if (NON_QUERY_VALUE_OPTIONS.has(option.name)) {
      index = resolveOptionValue(argv, index, option).nextIndex
      continue
    }

    if (option.name === '--group-start') {
      tokens.push({ type: 'lparen' })
      continue
    }

    if (option.name === '--group-end') {
      tokens.push({ type: 'rparen' })
      continue
    }

    if (option.name === '--and') {
      tokens.push({ type: 'and' })
      continue
    }

    if (option.name === '--or-op') {
      tokens.push({ type: 'or' })
      continue
    }

    if (option.name === '--not') {
      tokens.push({ type: 'not' })
      continue
    }

    const { value, nextIndex } = resolveOptionValue(argv, index, option)
    index = nextIndex

    if (option.name === '--or') {
      tokens.push({ type: 'or' })
      tokens.push({
        type: 'atom',
        value: quoteTerm(value),
      })
      continue
    }

    tokens.push({
      type: 'atom',
      value: buildAtom(option.name, value),
    })
  }

  return tokens
}
