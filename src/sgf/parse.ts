import { MOVE_PROPERTIES, ROOT_PROPERTIES, SETUP_PROPERTIES, SgfParseError } from './types';
import type { SgfCollection, SgfGameTree, SgfNode, SgfParseResult, SgfProperty } from './types';

const BACKSLASH = String.fromCharCode(92);

/** Separators allowed between SGF tokens. */
const isSeparator = (char: string | undefined): boolean =>
  char === ' ' ||
  char === '\t' ||
  char === '\r' ||
  char === '\n' ||
  char === '\v' ||
  char === '\f';

const isPropIdentChar = (char: string | undefined): boolean =>
  char !== undefined && ((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z'));

const isLineBreak = (char: string | undefined): boolean => char === '\n' || char === '\r';

const isTextWhitespace = (char: string | undefined): boolean =>
  isLineBreak(char) || char === ' ' || char === '\t' || char === '\v' || char === '\f';

/** Length of the line break sequence starting at `start`: LF, CR, LFCR or CRLF. */
const lineBreakLength = (text: string, start: number): number => {
  const first = text[start];
  const second = text[start + 1];
  if ((first === '\r' && second === '\n') || (first === '\n' && second === '\r')) return 2;
  return isLineBreak(first) ? 1 : 0;
};

const unescape = (raw: string, keepLineBreaks: boolean): string => {
  let out = '';
  let index = 0;
  while (index < raw.length) {
    const char = raw[index];
    if (char === BACKSLASH) {
      if (index + 1 >= raw.length) {
        out += char;
        index += 1;
        continue;
      }
      const next = raw[index + 1];
      const breakLength = lineBreakLength(raw, index + 1);
      if (breakLength > 0) {
        // Soft line break: removed entirely.
        index += 1 + breakLength;
        continue;
      }
      // Even an escaped whitespace still becomes a plain space.
      out += isTextWhitespace(next) ? ' ' : next;
      index += 2;
      continue;
    }
    const breakLength = lineBreakLength(raw, index);
    if (breakLength > 0) {
      out += keepLineBreaks ? '\n' : ' ';
      index += breakLength;
      continue;
    }
    out += isTextWhitespace(char) ? ' ' : char;
    index += 1;
  }
  return out;
};

/** Decodes a `text` value: hard line breaks survive, a trailing `\` joins the next line. */
export const unescapeText = (raw: string): string => unescape(raw, true);

/** Decodes a `simpletext` value: every line break collapses to a single space. */
export const unescapeSimpleText = (raw: string): string => unescape(raw, false);

const CHARSET_PATTERN = /CA\[([^\]]*)\]/;

/**
 * Decodes raw SGF bytes using the charset declared by `CA`.
 *
 * Reading bytes instead of letting the environment guess UTF-8 is what keeps GB2312, Big5
 * and Shift_JIS files readable: those encodings are not ASCII safe, so once a file has
 * been re-encoded to UTF-8 by another tool the original text is unrecoverable. `CA`
 * itself is ASCII, so it survives a UTF-8 pre-scan even when the comments do not.
 */
export const decodeSgfBytes = (bytes: Uint8Array, warn?: (message: string) => void): string => {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  const declared = utf8.match(CHARSET_PATTERN)?.[1]?.trim();
  if (!declared) return utf8;
  const normalized = declared.toUpperCase();
  if (normalized === 'UTF-8' || normalized === 'UTF8') return utf8;
  try {
    return new TextDecoder(declared).decode(bytes);
  } catch {
    warn?.(`Unsupported charset "${declared}"; falling back to UTF-8`);
    return utf8;
  }
};

export interface ParseOptions {
  /** Called for every spec violation that was repaired instead of failing. */
  onWarning?: (message: string) => void;
}

export const parseSgf = (input: string, options: ParseOptions = {}): SgfParseResult => {
  const warnings: string[] = [];
  const warn = (message: string): void => {
    warnings.push(message);
    options.onWarning?.(message);
  };

  const source = input;
  let index = 0;

  const skipSeparators = (): void => {
    while (index < source.length && isSeparator(source[index])) index += 1;
  };

  const expect = (char: string): void => {
    const found = source[index];
    if (found !== char) {
      throw new SgfParseError(
        `Expected '${char}' at offset ${index} but found ${JSON.stringify(found)}`,
      );
    }
    index += 1;
  };

  const parseValue = (): string => {
    expect('[');
    let depth = 1;
    let raw = '';
    while (index < source.length) {
      const char = source[index];
      if (char === BACKSLASH) {
        if (index + 1 >= source.length) {
          raw += char;
          index += 1;
          continue;
        }
        raw += char + source[index + 1];
        index += 2;
        continue;
      }
      if (char === '[') {
        depth += 1;
        raw += char;
        index += 1;
        continue;
      }
      if (char === ']') {
        depth -= 1;
        index += 1;
        if (depth === 0) break;
        raw += char;
        continue;
      }
      raw += char;
      index += 1;
    }
    if (depth !== 0) throw new SgfParseError(`Unterminated property value before offset ${index}`);
    return raw;
  };

  const parseProperty = (): SgfProperty => {
    const start = index;
    let id = '';
    while (index < source.length && isPropIdentChar(source[index])) {
      id += source[index];
      index += 1;
    }
    id = id.toUpperCase();
    const values: string[] = [];
    for (;;) {
      skipSeparators();
      if (source[index] !== '[') break;
      values.push(parseValue());
    }
    if (values.length === 0) warn(`Property ${id} at offset ${start} has no value`);
    return { id, values };
  };

  const parseNode = (): SgfNode => {
    expect(';');
    const properties: SgfProperty[] = [];
    for (;;) {
      skipSeparators();
      if (!isPropIdentChar(source[index])) break;
      const property = parseProperty();
      const existing = properties.find((candidate) => candidate.id === property.id);
      if (existing) {
        warn(`Property ${property.id} appears more than once in a node; values merged`);
        existing.values.push(...property.values);
      } else {
        properties.push(property);
      }
    }
    const hasSetup = properties.some((property) => SETUP_PROPERTIES.has(property.id));
    const hasMove = properties.some((property) => MOVE_PROPERTIES.has(property.id));
    if (hasSetup && hasMove) {
      warn('Node mixes setup and move properties, which SGF forbids');
    }
    return { properties };
  };

  const parseSequence = (): SgfNode[] => {
    const nodes: SgfNode[] = [];
    skipSeparators();
    if (source[index] !== ';') {
      throw new SgfParseError(`Expected a node (';') at offset ${index}`);
    }
    for (;;) {
      skipSeparators();
      if (source[index] !== ';') break;
      nodes.push(parseNode());
    }
    return nodes;
  };

  const parseGameTree = (isRoot: boolean): SgfGameTree => {
    expect('(');
    const sequence = parseSequence();
    sequence.forEach((node, position) => {
      if (isRoot && position === 0) return;
      for (const property of node.properties) {
        if (ROOT_PROPERTIES.has(property.id)) {
          warn(`Root property ${property.id} appears outside a root node`);
        }
      }
    });
    const children: SgfGameTree[] = [];
    for (;;) {
      skipSeparators();
      if (source[index] !== '(') break;
      children.push(parseGameTree(false));
    }
    skipSeparators();
    expect(')');
    return { sequence, children };
  };

  const collection: SgfCollection = [];
  skipSeparators();
  if (source[index] !== '(') {
    throw new SgfParseError(`Expected a game tree ('(') at offset ${index}`);
  }
  for (;;) {
    skipSeparators();
    if (source[index] !== '(') break;
    collection.push(parseGameTree(true));
  }
  skipSeparators();
  if (index < source.length) warn(`Ignored trailing content at offset ${index}`);

  return { collection, warnings };
};

/** Parses raw file bytes, honouring the charset declared by `CA`. */
export const parseSgfBytes = (
  bytes: Uint8Array,
  options: ParseOptions = {},
): SgfParseResult => parseSgf(decodeSgfBytes(bytes, options.onWarning), options);
