export type { DocId } from '../../data/inverted-index/public-api.js';
export type { IBm25Options } from '../../domain/ranking/public-api.js';
export type {
  IDocumentInput,
  IEmptySearchResult,
  IExecutedSearchResult,
  IIndexResult,
  IIndexStats,
  ISearchEngine,
  ISearchEngineOptions,
  ISearchHit,
  ISearchOptions,
  ISkippedFile,
  ITermMatch,
  SearchResult,
  SearchStatus,
} from './types.js';
export { DuplicateSourceError } from '../../data/inverted-index/public-api.js';
export { ParseError } from '../../domain/query-parser/public-api.js';
export { IndexDirectoryError, IndexNotInitializedError } from './errors.js';
export { DEFAULT_TOP_K, SearchEngine } from './search-engine.js';
