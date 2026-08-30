/**
 * A small YAML-subset frontmatter parser, sized for `SKILL.md` files.
 *
 * Derived from the parser on leoncheng.dev (src/utils/frontmatter.ts) with four
 * fixes that matter here:
 *
 *  1. Block scalars. `description: >-` followed by indented lines is the normal
 *     way to write a long command description. The original parser stored
 *     the literal two-character string `>-` and dropped the text entirely.
 *     Literal (`|`, `|-`, `|+`) and folded (`>`, `>-`, `>+`) forms are both
 *     handled here, including chomping.
 *  2. Quote stripping. The original stripped the outer characters whenever a
 *     value both started and ended with a quote, so `"a" and "b"` became
 *     `a" and "b`. A value is only unquoted when it is genuinely a single
 *     quoted scalar.
 *  3. CRLF. `startsWith('---\n')` is false for a CRLF file, so those files were
 *     treated as having no frontmatter at all. Line endings are normalised
 *     (and a UTF-8 BOM stripped) before anything else happens.
 *  4. Nested maps. Imported Markdown may include a `metadata:` block
 *     of string→string pairs; the original parser flattened it into an empty
 *     array. One level of nesting is supported.
 *
 * Anything beyond that subset (anchors, flow collections, multi-level nesting,
 * tags) is deliberately unsupported — reach for a real YAML library rather than
 * growing this one.
 */

/** One level of nesting for string-to-string metadata. */
export type FrontmatterMap = Record<string, string>

export type FrontmatterValue =
  | string
  | number
  | boolean
  | string[]
  | FrontmatterMap

export interface ParsedFrontmatter<TData> {
  data: TData
  content: string
}

/** `|`, `>`, and their chomping variants, optionally with an indent indicator. */
const BLOCK_SCALAR_PATTERN = /^([|>])([+-]?)(\d*)([+-]?)$/

const KEY_PATTERN = /^(\s*)([A-Za-z0-9_.-]+)\s*:\s?(.*)$/

const SEQUENCE_ITEM_PATTERN = /^(\s*)-\s+(.*)$/

type Chomping = 'clip' | 'strip' | 'keep'

function indentWidth(line: string): number {
  return line.length - line.trimStart().length
}

/**
 * True when `value` is one complete quoted scalar — as opposed to a bare value
 * that merely happens to begin and end with a quote character.
 */
function isQuotedScalar(value: string, quote: '"' | "'"): boolean {
  if (value.length < 2 || !value.startsWith(quote) || !value.endsWith(quote)) {
    return false
  }

  const inner = value.slice(1, -1)

  if (quote === "'") {
    // YAML escapes a single quote inside single quotes by doubling it, so a
    // lone quote would have terminated the scalar early.
    for (let index = 0; index < inner.length; index += 1) {
      if (inner[index] !== "'") {
        continue
      }
      if (inner[index + 1] === "'") {
        index += 1
        continue
      }
      return false
    }
    return true
  }

  // Inside double quotes a quote must be backslash-escaped.
  for (let index = 0; index < inner.length; index += 1) {
    if (inner[index] === '\\') {
      index += 1
      continue
    }
    if (inner[index] === '"') {
      return false
    }
  }
  return true
}

function unquote(value: string): string {
  if (isQuotedScalar(value, '"')) {
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1')
  }
  if (isQuotedScalar(value, "'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  return value
}

/** Trailing `# comment` on an unquoted scalar is not part of the value. */
function stripInlineComment(value: string): string {
  if (value.startsWith('"') || value.startsWith("'")) {
    return value
  }
  const commentIndex = value.search(/(^|\s)#/)
  return commentIndex === -1 ? value : value.slice(0, commentIndex)
}

/** Scalars keep their string form here; typing happens in {@link parseScalar}. */
export function parseStringScalar(rawValue: string): string {
  const trimmed = stripInlineComment(rawValue.trim()).trim()
  return unquote(trimmed)
}

export function parseScalar(rawValue: string): string | number | boolean {
  const trimmed = stripInlineComment(rawValue.trim()).trim()

  if (isQuotedScalar(trimmed, '"') || isQuotedScalar(trimmed, "'")) {
    return unquote(trimmed)
  }

  if (trimmed === 'true') return true
  if (trimmed === 'false') return false

  if (trimmed !== '') {
    const numeric = Number(trimmed)
    if (!Number.isNaN(numeric)) {
      return numeric
    }
  }

  return trimmed
}

/**
 * Folds a block scalar the way YAML does: a single line break between two
 * non-empty lines becomes a space, and each blank line becomes a newline.
 */
function foldBlockLines(lines: string[]): string {
  let folded = ''
  let pendingBreaks = 0

  for (const line of lines) {
    if (line === '') {
      pendingBreaks += 1
      continue
    }
    if (folded === '') {
      folded = line
    } else {
      folded += pendingBreaks > 0 ? '\n'.repeat(pendingBreaks) : ' '
      folded += line
    }
    pendingBreaks = 0
  }

  return folded
}

function applyChomping(body: string, trailingBlankLines: number, chomping: Chomping): string {
  if (chomping === 'strip') {
    return body
  }
  if (chomping === 'keep') {
    return body + '\n'.repeat(trailingBlankLines + 1)
  }
  // clip: exactly one trailing newline, and only when there was content.
  return body === '' ? '' : `${body}\n`
}

interface BlockScalarResult {
  value: string
  /** Index of the last line consumed by the block. */
  endIndex: number
}

function readBlockScalar(
  lines: string[],
  startIndex: number,
  parentIndent: number,
  style: '|' | '>',
  chomping: Chomping
): BlockScalarResult {
  const collected: string[] = []
  let index = startIndex

  while (index + 1 < lines.length) {
    const next = lines[index + 1]
    if (next.trim() === '') {
      collected.push('')
      index += 1
      continue
    }
    if (indentWidth(next) <= parentIndent) {
      break
    }
    collected.push(next)
    index += 1
  }

  // Blank lines after the final content line belong to the chomping decision,
  // not to the block, and must not be re-read as frontmatter keys either.
  let lastContent = collected.length - 1
  while (lastContent >= 0 && collected[lastContent] === '') {
    lastContent -= 1
  }
  const trailingBlankLines = collected.length - 1 - lastContent
  const contentLines = collected.slice(0, lastContent + 1)

  const baseIndent = contentLines.reduce(
    (smallest, line) => (line === '' ? smallest : Math.min(smallest, indentWidth(line))),
    Number.MAX_SAFE_INTEGER
  )
  const dedented = contentLines.map((line) =>
    line === '' ? '' : line.slice(Math.min(baseIndent, indentWidth(line)))
  )

  const body = style === '|' ? dedented.join('\n') : foldBlockLines(dedented)

  return {
    value: applyChomping(body, trailingBlankLines, chomping),
    endIndex: index,
  }
}

function chompingOf(match: RegExpMatchArray): Chomping {
  const indicator = match[2] || match[4]
  if (indicator === '-') return 'strip'
  if (indicator === '+') return 'keep'
  return 'clip'
}

/** The next meaningful line after `index`, skipping blanks and comments. */
function nextSignificantLine(lines: string[], index: number): string | undefined {
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor]
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      continue
    }
    return line
  }
  return undefined
}

function normaliseSource(rawContent: string): string {
  return rawContent.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

/**
 * Splits a document into its frontmatter object and its markdown body.
 * Documents without frontmatter are returned unchanged with empty data.
 */
export function parseFrontmatter<TData>(rawContent: string): ParsedFrontmatter<TData> {
  const source = normaliseSource(rawContent)

  if (!/^---[ \t]*(\n|$)/.test(source)) {
    return { data: {} as TData, content: source }
  }

  const lines = source.split('\n')
  let closingIndex = -1
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === '---' || line === '...' || /^(---|\.\.\.)[ \t]+$/.test(line)) {
      closingIndex = index
      break
    }
  }

  if (closingIndex === -1) {
    return { data: {} as TData, content: source }
  }

  const blockLines = lines.slice(1, closingIndex)
  const content = lines.slice(closingIndex + 1).join('\n')
  const data: Record<string, FrontmatterValue> = {}

  let currentSequenceKey: string | null = null
  let currentMapKey: string | null = null

  for (let index = 0; index < blockLines.length; index += 1) {
    const line = blockLines[index]

    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      continue
    }

    const sequenceMatch = line.match(SEQUENCE_ITEM_PATTERN)
    if (sequenceMatch && currentSequenceKey) {
      const target = data[currentSequenceKey]
      if (Array.isArray(target)) {
        target.push(parseStringScalar(sequenceMatch[2]))
      }
      continue
    }

    const keyMatch = line.match(KEY_PATTERN)
    if (!keyMatch) {
      currentSequenceKey = null
      currentMapKey = null
      continue
    }

    const [, indent, key, rawValue] = keyMatch
    const isNested = indent.length > 0

    if (isNested && !currentMapKey) {
      // Indented content with no open map — nothing sensible to attach it to.
      continue
    }
    if (!isNested) {
      currentMapKey = null
      currentSequenceKey = null
    }

    const trimmedValue = rawValue.trim()
    const blockMatch = trimmedValue.match(BLOCK_SCALAR_PATTERN)

    if (blockMatch) {
      const { value, endIndex } = readBlockScalar(
        blockLines,
        index,
        indent.length,
        blockMatch[1] as '|' | '>',
        chompingOf(blockMatch)
      )
      index = endIndex
      if (isNested && currentMapKey) {
        ;(data[currentMapKey] as FrontmatterMap)[key] = value
      } else {
        data[key] = value
      }
      continue
    }

    if (trimmedValue === '') {
      const nextLine = nextSignificantLine(blockLines, index)

      if (nextLine && SEQUENCE_ITEM_PATTERN.test(nextLine) && indentWidth(nextLine) >= indent.length) {
        data[key] = []
        currentSequenceKey = key
        currentMapKey = null
        continue
      }

      if (nextLine && indentWidth(nextLine) > indent.length && KEY_PATTERN.test(nextLine)) {
        data[key] = {}
        currentMapKey = key
        currentSequenceKey = null
        continue
      }

      if (isNested && currentMapKey) {
        ;(data[currentMapKey] as FrontmatterMap)[key] = ''
      } else {
        data[key] = ''
      }
      continue
    }

    if (isNested && currentMapKey) {
      // Spec says metadata is string→string, so nested values stay strings
      // rather than being coerced to numbers or booleans.
      ;(data[currentMapKey] as FrontmatterMap)[key] = parseStringScalar(rawValue)
      continue
    }

    data[key] = parseScalar(rawValue)
    currentSequenceKey = null
  }

  return { data: data as TData, content }
}

/**
 * Removes a leading H1 from a markdown body: the page header already renders
 * the skill title, so keeping it would show the same words twice.
 */
export function stripLeadingHeading(content: string): string {
  return content.replace(/^\s*#\s+.+?(\n+|$)/, '')
}
