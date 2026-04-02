import { compileGoogleLogicExpression, compileGoogleLogicTokens, type GoogleLogicToken } from './logic.js'

export type GoogleQueryInput = {
  terms: string[]
  exact: string[]
  anyOf: string[]
  exclude: string[]
  site: string[]
  excludeSite: string[]
  filetype: string[]
  excludeFiletype: string[]
  intitle: string[]
  allintitle: string[]
  inurl: string[]
  allinurl: string[]
  intext: string[]
  allintext: string[]
  src: string[]
  imagesize: string[]
  after?: string
  before?: string
  logic: string[]
  structuredTokens: GoogleLogicToken[]
  raw: string[]
}

export type GoogleQueryPlan = GoogleQueryInput & {
  query: string
  tokens: string[]
  notes: string[]
}

function normalizeList(values: string[]): string[] {
  return values.map(value => value.trim()).filter(Boolean)
}

export function normalizeClause(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function quoteTerm(value: string): string {
  const trimmed = normalizeClause(value)
  if (!trimmed) {
    return ''
  }
  if (!/\s/.test(trimmed) && !trimmed.includes('"')) {
    return trimmed
  }
  const escaped = trimmed.replaceAll('"', '\\"')
  return `"${escaped}"`
}

export function quoteExactPhrase(value: string): string {
  const trimmed = normalizeClause(value)
  const escaped = trimmed.replaceAll('"', '\\"')
  return `"${escaped}"`
}

function prefixedValues(prefix: string, values: string[]): string[] {
  return normalizeList(values).map(value => `${prefix}:${quoteTerm(value)}`)
}

function allPrefixedValues(prefix: string, values: string[]): string[] {
  return normalizeList(values).map(value => `${prefix}:${normalizeClause(value)}`)
}

function rawPrefixedValues(prefix: string, values: string[]): string[] {
  return normalizeList(values).map(value => `${prefix}:${normalizeClause(value)}`)
}

function addNote(noteSet: Set<string>, condition: boolean, note: string): void {
  if (condition) {
    noteSet.add(note)
  }
}

export function buildGoogleQuery(input: GoogleQueryInput): GoogleQueryPlan {
  const tokens: string[] = []
  const notes = new Set<string>()

  const normalized: GoogleQueryInput = {
    terms: normalizeList(input.terms),
    exact: normalizeList(input.exact),
    anyOf: normalizeList(input.anyOf),
    exclude: normalizeList(input.exclude),
    site: normalizeList(input.site),
    excludeSite: normalizeList(input.excludeSite),
    filetype: normalizeList(input.filetype),
    excludeFiletype: normalizeList(input.excludeFiletype),
    intitle: normalizeList(input.intitle),
    allintitle: normalizeList(input.allintitle),
    inurl: normalizeList(input.inurl),
    allinurl: normalizeList(input.allinurl),
    intext: normalizeList(input.intext),
    allintext: normalizeList(input.allintext),
    src: normalizeList(input.src),
    imagesize: normalizeList(input.imagesize),
    after: input.after?.trim() || undefined,
    before: input.before?.trim() || undefined,
    logic: normalizeList(input.logic),
    structuredTokens: input.structuredTokens ?? [],
    raw: normalizeList(input.raw),
  }

  if (normalized.structuredTokens.length > 0) {
    const compiled = compileGoogleLogicTokens(normalized.structuredTokens)
    tokens.push(compiled.clause)

    addNote(
      notes,
      compiled.usesGrouping,
      '`--group-start` / `--group-end` add grouped query clauses. Google commonly accepts parentheses, but grouping is outside this repo\'s stable-official operator subset.',
    )
    addNote(
      notes,
      compiled.usesOr,
      '`OR` is taken from Google developer documentation, but it is not in the current core Help/Search Central operator shortlist.',
    )
  } else {
    tokens.push(...normalized.terms.map(quoteTerm))
    tokens.push(...normalized.exact.map(quoteExactPhrase))

    if (normalized.anyOf.length > 0) {
      const orGroup = normalized.anyOf.map(quoteTerm).join(' OR ')
      tokens.push(`(${orGroup})`)
    }

    tokens.push(...normalized.exclude.map(value => `-${quoteTerm(value)}`))
    tokens.push(...normalized.site.map(value => `site:${normalizeClause(value)}`))
    tokens.push(...normalized.excludeSite.map(value => `-site:${normalizeClause(value)}`))
    tokens.push(...normalized.filetype.map(value => `filetype:${normalizeClause(value)}`))
    tokens.push(...normalized.excludeFiletype.map(value => `-filetype:${normalizeClause(value)}`))
    tokens.push(...prefixedValues('intitle', normalized.intitle))
    tokens.push(...allPrefixedValues('allintitle', normalized.allintitle))
    tokens.push(...prefixedValues('inurl', normalized.inurl))
    tokens.push(...allPrefixedValues('allinurl', normalized.allinurl))
    tokens.push(...prefixedValues('intext', normalized.intext))
    tokens.push(...allPrefixedValues('allintext', normalized.allintext))
    tokens.push(...rawPrefixedValues('src', normalized.src))
    tokens.push(...rawPrefixedValues('imagesize', normalized.imagesize))

    if (normalized.after) {
      tokens.push(`after:${normalized.after}`)
    }
    if (normalized.before) {
      tokens.push(`before:${normalized.before}`)
    }

    for (const expression of normalized.logic) {
      const compiled = compileGoogleLogicExpression(expression)
      tokens.push(compiled.clause)

      addNote(
        notes,
        compiled.usesGrouping,
        '`--logic` uses parentheses for grouping. Google commonly accepts this, but grouping is outside this repo\'s stable-official operator subset.',
      )
      addNote(
        notes,
        compiled.usesOr,
        '`OR` is taken from Google developer documentation, but it is not in the current core Help/Search Central operator shortlist.',
      )
    }

    tokens.push(...normalized.raw)
  }

  for (const expression of normalized.logic) {
    const compiled = compileGoogleLogicExpression(expression)
    addNote(
      notes,
      compiled.usesGrouping,
      '`--logic` uses parentheses for grouping. Google commonly accepts this, but grouping is outside this repo\'s stable-official operator subset.',
    )
    addNote(
      notes,
      compiled.usesOr,
      '`OR` is taken from Google developer documentation, but it is not in the current core Help/Search Central operator shortlist.',
    )
  }

  addNote(
    notes,
    normalized.structuredTokens.length === 0 && normalized.anyOf.length > 0,
    '`--or` is a legacy grouped convenience clause. It uses uppercase `OR` plus parentheses rather than only the stable-official operator subset.',
  )
  addNote(
    notes,
    normalized.intitle.length > 0 ||
      normalized.allintitle.length > 0 ||
      normalized.inurl.length > 0 ||
      normalized.allinurl.length > 0 ||
      normalized.allintext.length > 0 ||
      normalized.excludeFiletype.length > 0,
    '`intitle:` / `allintitle:` / `inurl:` / `allinurl:` / `allintext:` / `-filetype:` come from secondary official Google developer docs.',
  )
  addNote(
    notes,
    normalized.intext.length > 0,
    '`intext:` is kept as a compatibility operator. The current project doc only confirms `allintext:` as the official secondary form.',
  )
  addNote(
    notes,
    normalized.after !== undefined || normalized.before !== undefined,
    '`after:` and `before:` are treated as compatibility features rather than strong-official Google syntax in this project.',
  )
  addNote(
    notes,
    normalized.src.length > 0 || normalized.imagesize.length > 0,
    '`src:` and `imagesize:` are official Google Images operators and only apply to image search behavior.',
  )
  addNote(
    notes,
    normalized.raw.length > 0,
    '`--raw` clauses are appended without validation, so their syntax level is user-controlled.',
  )

  return {
    ...normalized,
    query: tokens.join(' ').trim(),
    tokens,
    notes: [...notes],
  }
}
