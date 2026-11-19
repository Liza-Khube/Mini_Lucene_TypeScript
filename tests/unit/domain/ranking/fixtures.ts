import type { DocId } from '../../../../src/data/inverted-index/public-api.js';
import {
  Bm25Ranker,
  type IBm25Options,
  type IScoredDocument,
  type IScoringIndex,
} from '../../../../src/domain/ranking/public-api.js';

export interface InvalidBm25OptionsCase {
  readonly name: string;
  readonly options: IBm25Options;
}

export interface InvalidTopKCase {
  readonly name: string;
  readonly topK: number;
}

export const INVALID_BM25_OPTIONS_CASES: readonly InvalidBm25OptionsCase[] = [
  { name: 'negative k1', options: { k1: -1 } },
  { name: 'NaN k1', options: { k1: Number.NaN } },
  { name: 'Infinity k1', options: { k1: Number.POSITIVE_INFINITY } },
  { name: 'b below 0', options: { b: -0.5 } },
  { name: 'b above 1', options: { b: 2 } },
  { name: 'NaN b', options: { b: Number.NaN } },
  { name: 'Infinity b', options: { b: Number.POSITIVE_INFINITY } },
];

export const INVALID_TOP_K_CASES: readonly InvalidTopKCase[] = [
  { name: 'negative', topK: -1 },
  { name: 'fractional', topK: 1.5 },
  { name: 'NaN', topK: Number.NaN },
  { name: 'positive Infinity', topK: Number.POSITIVE_INFINITY },
  { name: 'negative Infinity', topK: Number.NEGATIVE_INFINITY },
];

export const CORE_DOCS: readonly string[] = ['cat cat dog', 'dog bird', 'bird bird bird bird'];

export const SUM_DOCS: readonly string[] = [
  'cat cat dog pad',
  'cat pad pad pad',
  'dog dog dog pad',
  'bird pad pad pad',
];

export const SAMPLE_DOCS: readonly string[] = ['cat dog', 'cat cat pad', 'dog'];

export const BASIC_DOCS: readonly string[] = ['cat dog', 'cat cat', 'dog'];

export const ORDER_SENSITIVE_DOCS: readonly string[] = [
  'alpha beta gamma',
  'beta gamma pad',
  'gamma pad pad',
  'gamma pad pad',
  'gamma pad pad',
];

export const TOP_K_DOCS: readonly string[] = [
  'cat pad pad pad pad',
  'cat cat pad pad pad',
  'cat cat cat pad pad',
  'cat cat cat cat pad',
  'cat cat cat cat cat',
];

export const TIED_DOCS: readonly string[] = ['cat pad', 'cat pad', 'cat pad', 'cat pad'];

export const words = (text: string): string[] => {
  const trimmed = text.trim();
  return trimmed === '' ? [] : trimmed.split(/\s+/);
};

export const repeat = (term: string, times: number): string[] => Array<string>(times).fill(term);

const docWithTf = (catCount: number, totalLength = 8): readonly string[] => [
  ...repeat('cat', catCount),
  ...repeat('pad', totalLength - catCount),
];

export const LARGE_TOP_K_DOCS: readonly (readonly string[])[] = [
  docWithTf(5),
  docWithTf(4),
  docWithTf(1),
  docWithTf(4),
  docWithTf(5),
  docWithTf(0),
  docWithTf(3),
  docWithTf(2),
  docWithTf(6),
  docWithTf(2),
  docWithTf(6),
  docWithTf(3),
  docWithTf(1),
  docWithTf(5),
  docWithTf(0),
  docWithTf(3),
  docWithTf(2),
  docWithTf(4),
  docWithTf(1),
  docWithTf(7),
];

export function buildIndex(docs: readonly (string | readonly string[])[]): IScoringIndex {
  const tokenized = docs.map((doc) => (typeof doc === 'string' ? words(doc) : doc));
  const totalLength = tokenized.reduce((sum, doc) => sum + doc.length, 0);

  return {
    documentCount: tokenized.length,
    averageDocumentLength: tokenized.length === 0 ? 0 : totalLength / tokenized.length,
    getDocument: (docId: DocId) => {
      const doc = tokenized[docId];
      return doc === undefined
        ? undefined
        : { docId, source: `doc${docId}.txt`, length: doc.length };
    },
    getDocumentFrequency: (term: string) => tokenized.filter((doc) => doc.includes(term)).length,
    getTermFrequency: (term: string, docId: DocId) =>
      tokenized[docId]?.filter((token) => token === term).length ?? 0,
  };
}

export const allDocs = (count: number): Set<DocId> =>
  new Set(Array.from({ length: count }, (_, i) => i));

export const ids = (results: readonly IScoredDocument[]): DocId[] => results.map((r) => r.docId);

export function scoreOf(results: readonly IScoredDocument[], docId: DocId): number {
  const hit = results.find((r) => r.docId === docId);
  if (hit === undefined) {
    throw new Error(`document ${docId} is missing from the results`);
  }
  return hit.score;
}

export const run = (
  index: IScoringIndex,
  candidates: ReadonlySet<DocId>,
  terms: readonly string[],
  options?: IBm25Options,
  topK?: number,
): IScoredDocument[] => new Bm25Ranker(index, options).rank(candidates, terms, topK);
