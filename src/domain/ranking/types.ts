import type { DocId, IDocumentInfo } from '../../data/inverted-index/public-api.js';

export interface IScoringIndex {
  readonly documentCount: number;
  readonly averageDocumentLength: number;
  getDocument(docId: DocId): IDocumentInfo | undefined;
  getDocumentFrequency(term: string): number;
  getTermFrequency(term: string, docId: DocId): number;
}

export interface IScoredDocument {
  readonly docId: DocId;
  readonly score: number;
}

export interface IBm25Options {
  readonly k1?: number;
  readonly b?: number;
}
