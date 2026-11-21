import type { IToken } from '../../data/inverted-index/public-api.js';

const TOKEN_PATTERN = /[a-z0-9]+/g;

export function tokenize(text: string): IToken[] {
  const normalizedText = text.toLowerCase();

  return Array.from(normalizedText.matchAll(TOKEN_PATTERN), (match, index) => ({
    term: match[0],
    position: index + 1,
  }));
}
