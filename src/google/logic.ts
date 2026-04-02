type LogicNode =
  | { type: 'atom'; value: string }
  | { type: 'not'; child: LogicNode }
  | { type: 'and' | 'or'; children: LogicNode[] }

type NormalizedLogicNode =
  | { type: 'atom'; value: string; negated: boolean }
  | { type: 'and' | 'or'; children: NormalizedLogicNode[] }

export type GoogleLogicToken =
  | { type: 'atom'; value: string }
  | { type: 'and' | 'or' | 'not' | 'lparen' | 'rparen' }

export type CompiledGoogleLogicExpression = {
  clause: string
  usesOr: boolean
  usesGrouping: boolean
}

function tokenizeLogicExpression(expression: string): GoogleLogicToken[] {
  const tokens: GoogleLogicToken[] = []
  let index = 0

  while (index < expression.length) {
    const char = expression[index]

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (char === '"') {
      let value = '"'
      index += 1

      while (index < expression.length) {
        const current = expression[index]
        value += current
        index += 1

        if (current === '\\' && index < expression.length) {
          value += expression[index]
          index += 1
          continue
        }

        if (current === '"') {
          break
        }
      }

      if (!value.endsWith('"')) {
        throw new Error('Unterminated quoted phrase in --logic expression.')
      }

      tokens.push({ type: 'atom', value })
      continue
    }

    if (char === '(') {
      tokens.push({ type: 'lparen' })
      index += 1
      continue
    }

    if (char === ')') {
      tokens.push({ type: 'rparen' })
      index += 1
      continue
    }

    if (char === '!') {
      tokens.push({ type: 'not' })
      index += 1
      continue
    }

    if (char === '&') {
      tokens.push({ type: 'and' })
      index += expression[index + 1] === '&' ? 2 : 1
      continue
    }

    if (char === '|') {
      tokens.push({ type: 'or' })
      index += expression[index + 1] === '|' ? 2 : 1
      continue
    }

    const start = index
    while (index < expression.length && !/[\s()!&|]/.test(expression[index])) {
      index += 1
    }

    const value = expression.slice(start, index)
    const upper = value.toUpperCase()

    if (upper === 'AND') {
      tokens.push({ type: 'and' })
      continue
    }
    if (upper === 'OR') {
      tokens.push({ type: 'or' })
      continue
    }
    if (upper === 'NOT') {
      tokens.push({ type: 'not' })
      continue
    }

    tokens.push({ type: 'atom', value })
  }

  return tokens
}

function insertImplicitAndTokens(tokens: GoogleLogicToken[]): GoogleLogicToken[] {
  const nextTokens: GoogleLogicToken[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index]
    const next = tokens[index + 1]

    nextTokens.push(current)

    if (!next) {
      continue
    }

    const currentCanEndOperand = current.type === 'atom' || current.type === 'rparen'
    const nextCanStartOperand =
      next.type === 'atom' || next.type === 'lparen' || next.type === 'not'

    if (currentCanEndOperand && nextCanStartOperand) {
      nextTokens.push({ type: 'and' })
    }
  }

  return nextTokens
}

class LogicParser {
  private readonly tokens: GoogleLogicToken[]

  private index = 0

  constructor(tokens: GoogleLogicToken[]) {
    this.tokens = tokens
  }

  parse(): LogicNode {
    if (this.tokens.length === 0) {
      throw new Error('Empty --logic expression.')
    }

    const expression = this.parseOr()

    if (this.peek()) {
      throw new Error('Unexpected trailing token in --logic expression.')
    }

    return expression
  }

  private parseOr(): LogicNode {
    const children: LogicNode[] = [this.parseAnd()]

    while (this.match('or')) {
      children.push(this.parseAnd())
    }

    return children.length === 1 ? children[0] : { type: 'or', children }
  }

  private parseAnd(): LogicNode {
    const children: LogicNode[] = [this.parseUnary()]

    while (this.match('and')) {
      children.push(this.parseUnary())
    }

    return children.length === 1 ? children[0] : { type: 'and', children }
  }

  private parseUnary(): LogicNode {
    if (this.match('not')) {
      return {
        type: 'not',
        child: this.parseUnary(),
      }
    }

    return this.parsePrimary()
  }

  private parsePrimary(): LogicNode {
    const token = this.peek()

    if (!token) {
      throw new Error('Incomplete --logic expression.')
    }

    if (token.type === 'atom') {
      this.index += 1
      return { type: 'atom', value: token.value }
    }

    if (token.type === 'lparen') {
      this.index += 1
      const expression = this.parseOr()

      if (!this.match('rparen')) {
        throw new Error('Missing closing parenthesis in --logic expression.')
      }

      return expression
    }

    throw new Error(`Unexpected token "${this.describeToken(token)}" in --logic expression.`)
  }

  private peek(): GoogleLogicToken | undefined {
    return this.tokens[this.index]
  }

  private match(type: GoogleLogicToken['type']): boolean {
    if (this.tokens[this.index]?.type === type) {
      this.index += 1
      return true
    }

    return false
  }

  private describeToken(token: GoogleLogicToken): string {
    if (token.type === 'atom') {
      return token.value
    }

    if (token.type === 'lparen') {
      return '('
    }

    if (token.type === 'rparen') {
      return ')'
    }

    if (token.type === 'and') {
      return 'AND'
    }

    if (token.type === 'or') {
      return 'OR'
    }

    return 'NOT'
  }
}

function normalizeLogicNode(node: LogicNode, negated = false): NormalizedLogicNode {
  if (node.type === 'atom') {
    return {
      type: 'atom',
      value: node.value,
      negated,
    }
  }

  if (node.type === 'not') {
    return normalizeLogicNode(node.child, !negated)
  }

  const nextType = negated ? (node.type === 'and' ? 'or' : 'and') : node.type
  const children = node.children.map(child => normalizeLogicNode(child, negated))

  return flattenLogicNode({
    type: nextType,
    children,
  })
}

function flattenLogicNode(node: Extract<NormalizedLogicNode, { type: 'and' | 'or' }>): NormalizedLogicNode {
  const children: NormalizedLogicNode[] = []

  for (const child of node.children) {
    if (child.type === node.type) {
      children.push(...child.children)
      continue
    }

    children.push(child)
  }

  if (children.length === 1) {
    return children[0]
  }

  return {
    type: node.type,
    children,
  }
}

function compileLogicNode(node: NormalizedLogicNode): CompiledGoogleLogicExpression {
  if (node.type === 'atom') {
    return {
      clause: node.negated ? `-${node.value}` : node.value,
      usesOr: false,
      usesGrouping: false,
    }
  }

  const compiledChildren = node.children.map(child => ({
    node: child,
    compiled: compileLogicNode(child),
  }))

  const clause = compiledChildren
    .map(({ node: child, compiled }) => {
      if (child.type === 'atom' || child.type === node.type) {
        return compiled.clause
      }

      return `(${compiled.clause})`
    })
    .join(node.type === 'or' ? ' OR ' : ' ')

  return {
    clause,
    usesOr: node.type === 'or' || compiledChildren.some(({ compiled }) => compiled.usesOr),
    usesGrouping:
      compiledChildren.some(({ node: child }) => child.type !== 'atom' && child.type !== node.type) ||
      compiledChildren.some(({ compiled }) => compiled.usesGrouping),
  }
}

export function compileGoogleLogicTokens(tokens: GoogleLogicToken[]): CompiledGoogleLogicExpression {
  const parser = new LogicParser(insertImplicitAndTokens(tokens))
  const ast = parser.parse()
  return compileLogicNode(normalizeLogicNode(ast))
}

export function compileGoogleLogicExpression(expression: string): CompiledGoogleLogicExpression {
  return compileGoogleLogicTokens(tokenizeLogicExpression(expression.trim()))
}
