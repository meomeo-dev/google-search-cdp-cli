import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Argument, Command, Option } from 'commander'

export type CompletionSuggestion = {
  value: string
  description?: string
}

export type NativeCompletion = 'files' | 'dirs' | 'urls'

export type CompletionResponse = {
  native?: NativeCompletion
  suggestions: CompletionSuggestion[]
}

export type InstallCompletionResult = {
  shell: 'zsh'
  completionFile: string
  zshrcFile: string
  updatedZshrc: boolean
  reusedExistingCompinit: boolean
}

type StaticCompleter =
  | {
      kind: 'native'
      native: NativeCompletion
    }
  | {
      kind: 'suggestions'
      suggestions: CompletionSuggestion[]
    }

const HELP_OPTION_SUGGESTIONS: CompletionSuggestion[] = [
  {
    value: '--help',
    description: 'display help for command',
  },
  {
    value: '-h',
    description: 'display help for command',
  },
]

const OPTION_VALUE_COMPLETERS = new Map<string, StaticCompleter>([
  [
    'search::--safe',
    {
      kind: 'suggestions',
      suggestions: [
        { value: 'off', description: 'Disable SafeSearch filtering' },
        { value: 'active', description: 'Enable SafeSearch filtering' },
      ],
    },
  ],
  [
    'search::--tbm',
    {
      kind: 'suggestions',
      suggestions: [
        { value: 'nws', description: 'News vertical' },
        { value: 'isch', description: 'Image vertical' },
        { value: 'vid', description: 'Video vertical' },
      ],
    },
  ],
  [
    'search::--wait-until',
    {
      kind: 'suggestions',
      suggestions: [
        { value: 'load', description: 'Wait for the load event' },
        { value: 'domcontentloaded', description: 'Wait for DOMContentLoaded' },
        { value: 'networkidle0', description: 'Wait for zero network connections' },
        { value: 'networkidle2', description: 'Wait for two or fewer network connections' },
      ],
    },
  ],
  ['search::--cdp-url', { kind: 'native', native: 'urls' }],
  ['search::--proxy', { kind: 'native', native: 'urls' }],
  ['search::--chrome-user-data-dir', { kind: 'native', native: 'dirs' }],
  ['search::--chrome-executable-path', { kind: 'native', native: 'files' }],
  [
    'fetch::--format',
    {
      kind: 'suggestions',
      suggestions: [
        { value: 'markdown', description: 'Return Markdown content' },
        { value: 'text', description: 'Return plain text content' },
        { value: 'html', description: 'Return raw HTML content' },
        { value: 'all', description: 'Return HTML, text, and Markdown' },
      ],
    },
  ],
  [
    'fetch::--wait-until',
    {
      kind: 'suggestions',
      suggestions: [
        { value: 'load', description: 'Wait for the load event' },
        { value: 'domcontentloaded', description: 'Wait for DOMContentLoaded' },
        { value: 'networkidle0', description: 'Wait for zero network connections' },
        { value: 'networkidle2', description: 'Wait for two or fewer network connections' },
      ],
    },
  ],
  ['fetch::--cdp-url', { kind: 'native', native: 'urls' }],
  ['fetch::--proxy', { kind: 'native', native: 'urls' }],
  ['fetch::--chrome-user-data-dir', { kind: 'native', native: 'dirs' }],
  ['fetch::--chrome-executable-path', { kind: 'native', native: 'files' }],
])

const POSITIONAL_COMPLETERS = new Map<string, StaticCompleter>([
  ['fetch::url', { kind: 'native', native: 'urls' }],
  [
    'install-completion::shell',
    {
      kind: 'suggestions',
      suggestions: [{ value: 'zsh', description: 'Install zsh completion' }],
    },
  ],
])

function optionKey(commandName: string, optionLong: string): string {
  return `${commandName}::${optionLong}`
}

function argumentKey(commandName: string, argumentName: string): string {
  return `${commandName}::${argumentName}`
}

function sanitizeDescription(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, ' ').trim() || undefined
}

function filterSuggestions(
  suggestions: CompletionSuggestion[],
  prefix: string,
): CompletionSuggestion[] {
  const filtered = prefix
    ? suggestions.filter(suggestion => suggestion.value.startsWith(prefix))
    : suggestions

  const seen = new Set<string>()
  return filtered.filter(suggestion => {
    if (seen.has(suggestion.value)) {
      return false
    }
    seen.add(suggestion.value)
    return true
  })
}

function visibleCommands(program: Command): Command[] {
  return program.commands.filter(command => !command.name().startsWith('__'))
}

function commandSuggestions(program: Command): CompletionSuggestion[] {
  return [
    ...visibleCommands(program).map(command => ({
      value: command.name(),
      description: sanitizeDescription(command.summary() || command.description()),
    })),
    {
      value: 'help',
      description: 'display help for command',
    },
  ]
}

function findCommandOption(command: Command, token: string): Option | undefined {
  for (const option of command.options) {
    if (option.long && token === option.long) {
      return option
    }
    if (option.short && token === option.short) {
      return option
    }
    if (option.long && token.startsWith(`${option.long}=`)) {
      return option
    }
    if (option.short && token.startsWith(`${option.short}=`)) {
      return option
    }
  }

  return undefined
}

function analyzeCommandInput(
  command: Command,
  argsBeforeCurrent: string[],
): {
  pendingOption?: Option
  positionalCount: number
} {
  let pendingOption: Option | undefined
  let positionalCount = 0
  let endOfOptions = false

  for (const token of argsBeforeCurrent) {
    if (pendingOption) {
      pendingOption = undefined
      continue
    }

    if (!endOfOptions && token === '--') {
      endOfOptions = true
      continue
    }

    if (!endOfOptions) {
      const option = findCommandOption(command, token)
      if (option) {
        const usesInlineValue = token.includes('=')
        if (!usesInlineValue && (option.required || option.optional)) {
          pendingOption = option
        }
        continue
      }

      if (token.startsWith('-')) {
        continue
      }
    }

    positionalCount += 1
  }

  return {
    pendingOption,
    positionalCount,
  }
}

function nextPositionalArgument(
  command: Command,
  positionalCount: number,
): Argument | undefined {
  const args = command.registeredArguments

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument.variadic) {
      return argument
    }
    if (positionalCount === index) {
      return argument
    }
  }

  return undefined
}

function optionSuggestions(command: Command): CompletionSuggestion[] {
  return [
    ...command.options.flatMap(option => {
      const suggestions: CompletionSuggestion[] = []
      if (option.long) {
        suggestions.push({
          value: option.long,
          description: sanitizeDescription(option.description),
        })
      }
      if (option.short) {
        suggestions.push({
          value: option.short,
          description: sanitizeDescription(option.description),
        })
      }
      return suggestions
    }),
    ...HELP_OPTION_SUGGESTIONS,
  ]
}

function completerForOption(command: Command, option: Option): StaticCompleter | undefined {
  if (!option.long) {
    return undefined
  }

  return OPTION_VALUE_COMPLETERS.get(optionKey(command.name(), option.long))
}

function completerForArgument(command: Command, argument: Argument): StaticCompleter | undefined {
  if (command.name() === 'help' || argument.name() === 'command') {
    return {
      kind: 'suggestions',
      suggestions: commandSuggestions(command.parent ?? command),
    }
  }

  return POSITIONAL_COMPLETERS.get(argumentKey(command.name(), argument.name()))
}

function completeTopLevel(
  program: Command,
  current: string,
): CompletionResponse {
  if (current.startsWith('-')) {
    return {
      suggestions: filterSuggestions(HELP_OPTION_SUGGESTIONS, current),
    }
  }

  return {
    suggestions: filterSuggestions(
      [...commandSuggestions(program), ...HELP_OPTION_SUGGESTIONS],
      current,
    ),
  }
}

function completeHelp(
  program: Command,
  words: string[],
  currentIndex: number,
): CompletionResponse {
  const current = words[currentIndex - 1] ?? ''
  const positionalCount = Math.max(currentIndex - 3, 0)

  if (current.startsWith('-')) {
    return {
      suggestions: filterSuggestions(HELP_OPTION_SUGGESTIONS, current),
    }
  }

  if (positionalCount === 0) {
    return {
      suggestions: filterSuggestions(commandSuggestions(program), current),
    }
  }

  return {
    suggestions: [],
  }
}

function completeSubcommand(
  command: Command,
  words: string[],
  currentIndex: number,
): CompletionResponse {
  const current = words[currentIndex - 1] ?? ''
  const argsBeforeCurrent = words.slice(2, Math.max(2, currentIndex - 1))
  const analyzed = analyzeCommandInput(command, argsBeforeCurrent)

  if (analyzed.pendingOption) {
    const completer = completerForOption(command, analyzed.pendingOption)
    if (!completer) {
      return { suggestions: [] }
    }
    if (completer.kind === 'native') {
      return {
        native: completer.native,
        suggestions: [],
      }
    }
    return {
      suggestions: filterSuggestions(completer.suggestions, current),
    }
  }

  if (current.startsWith('-')) {
    return {
      suggestions: filterSuggestions(optionSuggestions(command), current),
    }
  }

  const argument = nextPositionalArgument(command, analyzed.positionalCount)
  const completer = argument ? completerForArgument(command, argument) : undefined
  if (completer) {
    if (completer.kind === 'native') {
      return {
        native: completer.native,
        suggestions: [],
      }
    }
    return {
      suggestions: filterSuggestions(completer.suggestions, current),
    }
  }

  if (!current) {
    return {
      suggestions: optionSuggestions(command),
    }
  }

  return {
    suggestions: [],
  }
}

export function resolveCompletion(
  program: Command,
  currentIndex: number,
  words: string[],
): CompletionResponse {
  if (currentIndex <= 2 || words.length < 2) {
    const current = words[currentIndex - 1] ?? ''
    return completeTopLevel(program, current)
  }

  const subcommandName = words[1]
  if (subcommandName === 'help') {
    return completeHelp(program, words, currentIndex)
  }

  const command = visibleCommands(program).find(item => item.name() === subcommandName)
  if (!command) {
    const current = words[currentIndex - 1] ?? ''
    return completeTopLevel(program, current)
  }

  return completeSubcommand(command, words, currentIndex)
}

export function formatCompletionResponse(response: CompletionResponse): string {
  if (response.native) {
    return `__native_completion\t${response.native}\n`
  }

  if (response.suggestions.length === 0) {
    return ''
  }

  return `${response.suggestions
    .map(suggestion =>
      suggestion.description
        ? `${suggestion.value}\t${suggestion.description}`
        : suggestion.value,
    )
    .join('\n')}\n`
}

export function renderZshCompletion(commandNames: string[]): string {
  const primaryCommand = commandNames[0] ?? 'google-search-cdp-cli'
  const functionName = '_google_search_cdp_cli'

  return [
    `#compdef ${commandNames.join(' ')}`,
    '#',
    `# Generated by \`${primaryCommand} install-completion zsh\``,
    '',
    `${functionName}() {`,
    '  local -a response described',
    '  local line value desc',
    '  response=("${(@f)$(${words[1]} __complete "${CURRENT}" "${words[@]}" 2>/dev/null)}")',
    '  if (( ${#response[@]} == 0 )); then',
    '    return 1',
    '  fi',
    '',
    '  case "${response[1]}" in',
    "    $'__native_completion\\tfiles')",
    '      _files',
    '      return',
    '      ;;',
    "    $'__native_completion\\tdirs')",
    '      _files -/',
    '      return',
    '      ;;',
    "    $'__native_completion\\turls')",
    '      _urls',
    '      return',
    '      ;;',
    '  esac',
    '',
    '  for line in "${response[@]}"; do',
    "    value=${line%%$'\\t'*}",
    "    if [[ \"${line}\" == *$'\\t'* ]]; then",
    "      desc=${line#*$'\\t'}",
    '      described+=("${value}:${desc}")',
    '    else',
    '      described+=("${value}")',
    '    fi',
    '  done',
    '',
    "  _describe 'values' described",
    '}',
    '',
    `compdef ${functionName} ${commandNames.join(' ')}`,
    '',
  ].join('\n')
}

const COMPLETION_BLOCK_START = '# >>> google-search-cdp-cli completion >>>'
const COMPLETION_BLOCK_END = '# <<< google-search-cdp-cli completion <<<'

function resolveZshInstallPaths(env: NodeJS.ProcessEnv): {
  completionFile: string
  zshrcFile: string
} {
  const home = env['HOME']
  const zshDir = env['ZDOTDIR']

  if (!home && !zshDir) {
    throw new Error('Could not resolve HOME or ZDOTDIR for zsh completion installation.')
  }

  if (zshDir) {
    return {
      completionFile: join(zshDir, 'completions', '_google_search_cdp_cli'),
      zshrcFile: join(zshDir, '.zshrc'),
    }
  }

  return {
    completionFile: join(home!, '.zsh', 'completions', '_google_search_cdp_cli'),
    zshrcFile: join(home!, '.zshrc'),
  }
}

function buildZshrcCompletionBlock(
  completionDir: string,
  includeCompinit: boolean,
): string {
  const lines = [
    COMPLETION_BLOCK_START,
    `fpath=(${JSON.stringify(completionDir)} $fpath)`,
  ]

  if (includeCompinit) {
    lines.push('autoload -Uz compinit', 'compinit')
  }

  lines.push(COMPLETION_BLOCK_END)
  return `${lines.join('\n')}\n`
}

function upsertManagedCompletionBlock(existing: string, block: string): {
  content: string
  changed: boolean
} {
  const pattern = new RegExp(
    `${COMPLETION_BLOCK_START}[\\s\\S]*?${COMPLETION_BLOCK_END}\\n?`,
    'g',
  )

  const withoutManagedBlock = existing.replace(pattern, '')
  const removedExistingBlock = withoutManagedBlock !== existing
  const compinitMatch = withoutManagedBlock.match(
    /^(?:autoload\b[^\n]*\bcompinit\b.*|compinit(?:\s|$).*)$/m,
  )

  if (compinitMatch && compinitMatch.index !== undefined) {
    const before = withoutManagedBlock.slice(0, compinitMatch.index)
    const after = withoutManagedBlock.slice(compinitMatch.index)
    const content = `${before}${block}${after}`
    return {
      content,
      changed: removedExistingBlock || content !== existing,
    }
  }

  const separator =
    withoutManagedBlock.length === 0
      ? ''
      : withoutManagedBlock.endsWith('\n')
        ? '\n'
        : '\n\n'
  const content = `${withoutManagedBlock}${separator}${block}`
  return {
    content,
    changed: removedExistingBlock || content !== existing,
  }
}

export async function installZshCompletion(
  commandNames: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<InstallCompletionResult> {
  const { completionFile, zshrcFile } = resolveZshInstallPaths(env)
  const completionDir = dirname(completionFile)

  await mkdir(completionDir, {
    recursive: true,
  })
  await writeFile(completionFile, renderZshCompletion(commandNames), 'utf8')

  let existingZshrc = ''
  try {
    existingZshrc = await readFile(zshrcFile, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      throw error
    }
  }

  const reusedExistingCompinit = /\bcompinit\b/.test(existingZshrc)
  const block = buildZshrcCompletionBlock(completionDir, !reusedExistingCompinit)
  const upserted = upsertManagedCompletionBlock(existingZshrc, block)

  if (upserted.changed) {
    await writeFile(zshrcFile, upserted.content, 'utf8')
  }

  return {
    shell: 'zsh',
    completionFile,
    zshrcFile,
    updatedZshrc: upserted.changed,
    reusedExistingCompinit,
  }
}
