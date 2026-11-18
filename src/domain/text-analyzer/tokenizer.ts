import type { IToken } from '../../data/inverted-index/public-api.js';
export type { IToken };

export function tokenize(text: string): IToken[] {
  const normalizedText = text.toLowerCase();

  const tokeniezedList: IToken[] = Array.from(normalizedText.matchAll(/[a-z0-9]+/g)).map(
    (word, i) =>
      ({
        term: word[0],
        position: i + 1,
      }) as IToken,
  );

  return tokeniezedList;
}
