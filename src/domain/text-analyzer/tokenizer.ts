export interface IToken {
  readonly term: string;
  readonly position: number;
}

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
