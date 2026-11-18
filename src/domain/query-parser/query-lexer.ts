import { ParseError } from './error.js';
import type { QueryToken } from './types.js';

function isAsciiAlnum(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');
}

function toKeywordOrTermToken(rawWord: string): QueryToken {
  if (rawWord === 'AND') return { type: 'AND' };
  if (rawWord === 'OR') return { type: 'OR' };
  if (rawWord === 'NOT') return { type: 'NOT' };
  return { type: 'TERM', value: rawWord.toLowerCase() };
}

export function tokenizeQuery(query: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  let i = 0;

  while (i < query.length) {
    const ch = query.charAt(i);

    if (ch === '~') {
      throw new ParseError('Fuzzy search operator "~" is not supported in MVP');
    }

    if (ch === '(') {
      tokens.push({ type: 'LPAREN' });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'RPAREN' });
      i += 1;
      continue;
    }

    if (ch === '"') {
      const closeIndex = query.indexOf('"', i + 1);
      if (closeIndex === -1) {
        throw new ParseError('Unclosed quote in phrase query');
      }

      const rawPhrase = query.slice(i + 1, closeIndex);
      const terms = Array.from(rawPhrase.toLowerCase().matchAll(/[a-z0-9]+/g), (match) => match[0]);
      if (terms.length === 0) {
        throw new ParseError('Phrase query must contain at least one term');
      }

      tokens.push({ type: 'PHRASE', terms });
      i = closeIndex + 1;
      continue;
    }

    if (isAsciiAlnum(ch)) {
      const start = i;
      while (i < query.length && isAsciiAlnum(query.charAt(i))) {
        i += 1;
      }
      tokens.push(toKeywordOrTermToken(query.slice(start, i)));
      continue;
    }

    i += 1;
  }

  return tokens;
}
