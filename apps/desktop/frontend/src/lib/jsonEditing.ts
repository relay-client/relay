export type JsonCommentRange = {
  from: number;
  to: number;
};

type PreparedJsonSource = {
  source: string;
  removedComments: boolean;
  commentRanges: JsonCommentRange[];
  unterminatedBlockCommentAt: number | null;
};

type JsonParseSuccess = {
  ok: true;
  start: number;
  end: number;
};

export type JsonParseFailure = {
  ok: false;
  position: number;
  message: string;
};

type JsonParseResult = JsonParseSuccess | JsonParseFailure;

type JsonToken = {
  type: 'punctuation' | 'value' | 'lineComment' | 'blockComment';
  text: string;
};

function isWhitespace(ch: string) {
  return ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t';
}

function isDigit(ch: string | undefined) {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

function isNonZeroDigit(ch: string | undefined) {
  return ch !== undefined && ch >= '1' && ch <= '9';
}

function isHexDigit(ch: string | undefined) {
  return ch !== undefined && (
    (ch >= '0' && ch <= '9') ||
    (ch >= 'a' && ch <= 'f') ||
    (ch >= 'A' && ch <= 'F')
  );
}

export function prepareJsonForParse(source: string): PreparedJsonSource {
  const chars = source.split('');
  const commentRanges: JsonCommentRange[] = [];
  let removedComments = false;
  let unterminatedBlockCommentAt: number | null = null;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '/' && source[i + 1] === '/') {
      const start = i;
      removedComments = true;
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') {
        chars[i] = ' ';
        i += 1;
      }
      commentRanges.push({ from: start, to: i });
      i -= 1;
      continue;
    }

    if (ch === '/' && source[i + 1] === '*') {
      const start = i;
      removedComments = true;
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      let closed = false;

      while (i < source.length) {
        if (source[i] === '*' && source[i + 1] === '/') {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          closed = true;
          break;
        }
        if (source[i] !== '\n' && source[i] !== '\r') chars[i] = ' ';
        i += 1;
      }

      if (!closed) unterminatedBlockCommentAt = start;
      commentRanges.push({ from: start, to: i });
      i -= 1;
    }
  }

  return {
    source: chars.join(''),
    removedComments,
    commentRanges,
    unterminatedBlockCommentAt,
  };
}

export function stripJsonComments(source: string) {
  return prepareJsonForParse(source).source;
}

function parseSanitizedJson(source: string): JsonParseResult {
  let index = 0;

  function fail(position: number, message: string): JsonParseFailure {
    return { ok: false, position: Math.min(Math.max(position, 0), source.length), message };
  }

  function skipWhitespace() {
    while (index < source.length && isWhitespace(source[index])) index += 1;
  }

  function parseLiteral(literal: string): JsonParseFailure | null {
    if (source.slice(index, index + literal.length) !== literal) {
      return fail(index, `Expected ${literal}`);
    }
    index += literal.length;
    return null;
  }

  function parseString(): JsonParseFailure | null {
    const start = index;
    index += 1;

    while (index < source.length) {
      const ch = source[index];

      if (ch === '"') {
        index += 1;
        return null;
      }

      if (ch === '\\') {
        const escapeAt = index;
        index += 1;
        const escapedChar = source[index];
        if (escapedChar === undefined) return fail(escapeAt, 'Unterminated escape sequence');
        if (escapedChar === '"' || escapedChar === '\\' || escapedChar === '/' || escapedChar === 'b' || escapedChar === 'f' || escapedChar === 'n' || escapedChar === 'r' || escapedChar === 't') {
          index += 1;
          continue;
        }
        if (escapedChar === 'u') {
          for (let offset = 1; offset <= 4; offset += 1) {
            if (!isHexDigit(source[index + offset])) return fail(index + offset, 'Invalid unicode escape');
          }
          index += 5;
          continue;
        }
        return fail(index, 'Invalid escape character');
      }

      if (ch.charCodeAt(0) < 0x20) return fail(index, 'Unescaped control character in string');
      index += 1;
    }

    return fail(start, 'Unterminated string');
  }

  function parseNumber(): JsonParseFailure | null {
    const start = index;
    if (source[index] === '-') index += 1;

    if (source[index] === '0') {
      index += 1;
      if (isDigit(source[index])) return fail(index, 'Leading zeroes are not allowed');
    } else if (isNonZeroDigit(source[index])) {
      while (isDigit(source[index])) index += 1;
    } else {
      return fail(start, 'Expected number');
    }

    if (source[index] === '.') {
      index += 1;
      if (!isDigit(source[index])) return fail(index, 'Expected digit after decimal point');
      while (isDigit(source[index])) index += 1;
    }

    if (source[index] === 'e' || source[index] === 'E') {
      index += 1;
      if (source[index] === '+' || source[index] === '-') index += 1;
      if (!isDigit(source[index])) return fail(index, 'Expected digit in exponent');
      while (isDigit(source[index])) index += 1;
    }

    return null;
  }

  function parseValue(): JsonParseFailure | null {
    skipWhitespace();
    if (index >= source.length) return fail(index, 'Expected JSON value');

    const ch = source[index];
    if (ch === '{') return parseObject();
    if (ch === '[') return parseArray();
    if (ch === '"') return parseString();
    if (ch === 't') return parseLiteral('true');
    if (ch === 'f') return parseLiteral('false');
    if (ch === 'n') return parseLiteral('null');
    if (ch === '-' || isDigit(ch)) return parseNumber();
    return fail(index, 'Expected JSON value');
  }

  function parseObject(): JsonParseFailure | null {
    index += 1;
    skipWhitespace();
    if (source[index] === '}') {
      index += 1;
      return null;
    }

    while (index < source.length) {
      skipWhitespace();
      if (source[index] === '}') return fail(index, 'Trailing comma in object');
      if (source[index] !== '"') return fail(index, 'Expected property name');

      const stringError = parseString();
      if (stringError) return stringError;

      skipWhitespace();
      if (source[index] !== ':') return fail(index, 'Expected colon after property name');
      index += 1;

      const valueError = parseValue();
      if (valueError) return valueError;

      skipWhitespace();
      if (source[index] === ',') {
        index += 1;
        skipWhitespace();
        if (source[index] === '}') return fail(index, 'Trailing comma in object');
        continue;
      }
      if (source[index] === '}') {
        index += 1;
        return null;
      }
      return fail(index, 'Expected comma or closing brace');
    }

    return fail(source.length, 'Unterminated object');
  }

  function parseArray(): JsonParseFailure | null {
    index += 1;
    skipWhitespace();
    if (source[index] === ']') {
      index += 1;
      return null;
    }

    while (index < source.length) {
      const valueError = parseValue();
      if (valueError) return valueError;

      skipWhitespace();
      if (source[index] === ',') {
        index += 1;
        skipWhitespace();
        if (source[index] === ']') return fail(index, 'Trailing comma in array');
        continue;
      }
      if (source[index] === ']') {
        index += 1;
        return null;
      }
      return fail(index, 'Expected comma or closing bracket');
    }

    return fail(source.length, 'Unterminated array');
  }

  skipWhitespace();
  const start = index;
  const valueError = parseValue();
  if (valueError) return valueError;
  const end = index;
  skipWhitespace();
  if (index < source.length) return fail(index, 'Unexpected content after JSON value');
  return { ok: true, start, end };
}

export function validateJsonDocument(source: string): JsonParseFailure | null {
  const prepared = prepareJsonForParse(source);
  if (prepared.unterminatedBlockCommentAt !== null) {
    return { ok: false, position: prepared.unterminatedBlockCommentAt, message: 'Unterminated block comment' };
  }
  if (!prepared.source.trim()) return null;

  const result = parseSanitizedJson(prepared.source);
  return result.ok ? null : result;
}

function overlaps(a: JsonCommentRange, from: number, to: number) {
  return a.from < to && a.to > from;
}

function combineFormattedJson(prefix: string, formatted: string, suffix: string) {
  const before = prefix.trim() ? `${prefix.trimEnd()}\n` : '';
  const after = suffix.trim() ? `\n${suffix.trimStart()}` : '';
  return `${before}${formatted}${after}`;
}

function tokenizeJsonLike(source: string) {
  const tokens: JsonToken[] = [];

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (isWhitespace(ch)) continue;

    if (ch === '/' && source[i + 1] === '/') {
      const start = i;
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i += 1;
      tokens.push({ type: 'lineComment', text: source.slice(start, i).trimEnd() });
      i -= 1;
      continue;
    }

    if (ch === '/' && source[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i = Math.min(i + 2, source.length);
      tokens.push({ type: 'blockComment', text: source.slice(start, i).trimEnd() });
      i -= 1;
      continue;
    }

    if (ch === '"') {
      const start = i;
      let escaped = false;
      i += 1;
      while (i < source.length) {
        const stringChar = source[i];
        if (escaped) {
          escaped = false;
        } else if (stringChar === '\\') {
          escaped = true;
        } else if (stringChar === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      tokens.push({ type: 'value', text: source.slice(start, i) });
      i -= 1;
      continue;
    }

    if ('{}[]:,'.includes(ch)) {
      tokens.push({ type: 'punctuation', text: ch });
      continue;
    }

    const start = i;
    while (
      i < source.length &&
      !isWhitespace(source[i]) &&
      !'{}[]:,'.includes(source[i]) &&
      !(source[i] === '/' && (source[i + 1] === '/' || source[i + 1] === '*'))
    ) {
      i += 1;
    }
    tokens.push({ type: 'value', text: source.slice(start, i) });
    i -= 1;
  }

  return tokens;
}

function closingFor(open: string) {
  return open === '{' ? '}' : ']';
}

function formatBlockComment(text: string, indent: string) {
  return text
    .split(/\r?\n/)
    .map(line => `${indent}${line.trimEnd()}`)
    .join('\n');
}

function formatJsonWithComments(source: string) {
  const tokens = tokenizeJsonLike(source);
  const lines: string[] = [];
  let current = '';
  let indent = 0;

  function pad() {
    return '  '.repeat(Math.max(indent, 0));
  }

  function write(text: string) {
    if (!current) current = pad();
    current += text;
  }

  function newline() {
    lines.push(current.trimEnd());
    current = '';
  }

  function nextToken(offset: number) {
    return tokens[offset + 1];
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.type === 'lineComment') {
      write(token.text.trim());
      newline();
      continue;
    }

    if (token.type === 'blockComment') {
      if (current.trim()) newline();
      lines.push(formatBlockComment(token.text, pad()));
      continue;
    }

    if (token.type === 'value') {
      write(token.text);
      continue;
    }

    if (token.text === '{' || token.text === '[') {
      const next = nextToken(i);
      if (next?.type === 'punctuation' && next.text === closingFor(token.text)) {
        write(`${token.text}${next.text}`);
        i += 1;
        continue;
      }
      write(token.text);
      indent += 1;
      newline();
      continue;
    }

    if (token.text === '}' || token.text === ']') {
      indent -= 1;
      if (current.trim()) newline();
      write(token.text);
      continue;
    }

    if (token.text === ',') {
      write(',');
      newline();
      continue;
    }

    if (token.text === ':') {
      write(': ');
    }
  }

  if (current.trim()) newline();
  return lines.join('\n').trimEnd();
}

export function formatJsonDocument(source: string) {
  const prepared = prepareJsonForParse(source);
  if (prepared.unterminatedBlockCommentAt !== null || !prepared.source.trim()) return null;

  const result = parseSanitizedJson(prepared.source);
  if (!result.ok) return null;

  try {
    const formatted = JSON.stringify(JSON.parse(prepared.source), null, 2);
    if (!prepared.removedComments) return formatted;

    const hasCommentInsideValue = prepared.commentRanges.some(range => overlaps(range, result.start, result.end));
    if (hasCommentInsideValue) {
      return combineFormattedJson(
        source.slice(0, result.start),
        formatJsonWithComments(source.slice(result.start, result.end)),
        source.slice(result.end)
      );
    }

    return combineFormattedJson(
      source.slice(0, result.start),
      formatted,
      source.slice(result.end)
    );
  } catch {
    return null;
  }
}
