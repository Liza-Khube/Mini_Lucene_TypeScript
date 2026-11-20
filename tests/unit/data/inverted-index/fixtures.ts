import { InvertedIndex, type IToken } from '../../../../src/data/inverted-index/public-api.js';

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type DocSpec = readonly [source: string, text: string];

export const toTokens = (text: string): IToken[] => {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  return trimmed.split(/\s+/).map((term, i) => ({ term, position: i + 1 }));
};

export const buildIndex = (docs: readonly DocSpec[]): InvertedIndex => {
  const index = new InvertedIndex();
  for (const [source, text] of docs) {
    index.addDocument(source, toTokens(text));
  }
  return index;
};

export const wordsOfLength = (n: number): string =>
  Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

export const SAMPLE_DOCS: readonly DocSpec[] = [
  ['doc0.txt', 'cat dog cat cat'],
  ['doc1.txt', 'cat bird'],
  ['doc2.txt', 'dog'],
];

export const SAMPLE_TERMS = ['cat', 'dog', 'bird', 'fish'] as const;
