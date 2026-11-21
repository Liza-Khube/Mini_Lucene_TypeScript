import type { DocId } from '../../data/inverted-index/public-api.js';
import type { IBm25Options } from '../../domain/ranking/public-api.js';

export interface IDocumentInput {
  readonly source: string;
  readonly rawText: string;
}

export interface ISkippedFile {
  readonly path: string;
  readonly reason: string;
}

export interface IIndexStats {
  readonly documentCount: number;
  readonly termCount: number;
}

export interface IIndexResult extends IIndexStats {
  readonly durationMs: number;
  readonly skippedFiles: readonly ISkippedFile[];
}

export interface ITermMatch {
  readonly term: string;
  readonly indexedTerm: string;
  readonly positions: readonly number[];
}

export interface ISearchHit {
  readonly rank: number;
  readonly docId: DocId;
  readonly source: string;
  readonly score: number;
  readonly matches: readonly ITermMatch[];
}

export type SearchResult = {
  readonly query: string;
  readonly totalHits: number;
  readonly hits: readonly ISearchHit[];
  readonly durationMs: number;
} & (
  | { readonly status: 'ok' }
  | { readonly status: 'empty-query' | 'stop-words-only'; readonly message: string }
);

export interface ISearchOptions {
  readonly topK?: number;
}

export interface ISearchEngineOptions {
  readonly defaultTopK?: number;
  readonly bm25?: IBm25Options;
}

export interface ISearchEngine {
  readonly isIndexed: boolean;
  index(directoryPath: string): Promise<IIndexResult>;
  indexDocuments(documents: readonly IDocumentInput[]): IIndexResult;
  search(query: string, options?: ISearchOptions): SearchResult;
  stats(): IIndexStats;
}
