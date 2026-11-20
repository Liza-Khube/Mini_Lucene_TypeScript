import { performance } from 'node:perf_hooks';
import { InvertedIndex } from '../../data/inverted-index/public-api.js';
import { analyzeQuery, extractPositiveTerms } from '../../domain/query-analyzer/public-api.js';
import { QueryExecutor } from '../../domain/query-executor/public-api.js';
import { parseQuery, type QueryNode } from '../../domain/query-parser/public-api.js';
import {
  Bm25Ranker,
  MissingDocumentError,
  type IBm25Options,
  type IScoredDocument,
} from '../../domain/ranking/public-api.js';
import { TextAnalyzer } from '../../domain/text-analyzer/public-api.js';
import { compareCodePoints, loadDocumentsFromDirectory } from './document-loader.js';
import { IndexNotInitializedError } from './errors.js';
import { collectTermMatches, mapPositiveDisplayTerms } from './term-matches.js';
import type {
  IDocumentInput,
  IIndexResult,
  IIndexStats,
  ISearchEngine,
  ISearchEngineOptions,
  ISearchHit,
  ISearchOptions,
  SearchResult,
} from './types.js';

export const DEFAULT_TOP_K = 10;

const EMPTY_QUERY_MESSAGE = 'Query is empty';
const STOP_WORDS_ONLY_MESSAGE = 'Query contains only stop words';

interface IEngineState {
  readonly index: InvertedIndex;
  readonly executor: QueryExecutor;
  readonly ranker: Bm25Ranker;
}

function validateTopK(topK: number): void {
  if (!Number.isInteger(topK) || topK < 0) {
    throw new RangeError(`topK must be a non-negative integer, got ${topK}`);
  }
}

function snapshotBm25Options(options?: IBm25Options): IBm25Options {
  const snapshot: { k1?: number; b?: number } = {};
  if (options?.k1 !== undefined) {
    snapshot.k1 = options.k1;
  }
  if (options?.b !== undefined) {
    snapshot.b = options.b;
  }

  new Bm25Ranker(new InvertedIndex(), snapshot);
  return snapshot;
}

function elapsedMs(startTime: number): number {
  return Math.max(0, performance.now() - startTime);
}

export class SearchEngine implements ISearchEngine {
  private readonly textAnalyzer = new TextAnalyzer();
  private readonly defaultTopK: number;
  private readonly bm25Options: IBm25Options;
  private state: IEngineState | null = null;

  constructor(options: ISearchEngineOptions = {}) {
    const defaultTopK = options.defaultTopK ?? DEFAULT_TOP_K;
    validateTopK(defaultTopK);

    this.defaultTopK = defaultTopK;
    this.bm25Options = snapshotBm25Options(options.bm25);
  }

  get isIndexed(): boolean {
    return this.state !== null;
  }

  async index(directoryPath: string): Promise<IIndexResult> {
    const startTime = performance.now();
    const { documents, skippedFiles } = await loadDocumentsFromDirectory(directoryPath);
    const nextState = this.buildState(documents);
    this.state = nextState;

    return {
      documentCount: nextState.index.documentCount,
      termCount: nextState.index.termCount,
      durationMs: elapsedMs(startTime),
      skippedFiles,
    };
  }

  indexDocuments(documents: readonly IDocumentInput[]): IIndexResult {
    const startTime = performance.now();
    const sortedDocuments = [...documents].sort((a, b) => compareCodePoints(a.source, b.source));
    const nextState = this.buildState(sortedDocuments);
    this.state = nextState;

    return {
      documentCount: nextState.index.documentCount,
      termCount: nextState.index.termCount,
      durationMs: elapsedMs(startTime),
      skippedFiles: [],
    };
  }

  search(query: string, options: ISearchOptions = {}): SearchResult {
    const state = this.requireState();
    const topK = options.topK ?? this.defaultTopK;
    validateTopK(topK);

    const startTime = performance.now();
    const rawAst = parseQuery(query);
    if (rawAst === null) {
      return {
        query,
        status: 'empty-query',
        message: EMPTY_QUERY_MESSAGE,
        totalHits: 0,
        hits: [],
        durationMs: elapsedMs(startTime),
      };
    }

    const executableAst = analyzeQuery(rawAst);
    if (executableAst === null) {
      return {
        query,
        status: 'stop-words-only',
        message: STOP_WORDS_ONLY_MESSAGE,
        totalHits: 0,
        hits: [],
        durationMs: elapsedMs(startTime),
      };
    }

    const candidates = state.executor.execute(executableAst);
    const positiveTerms = extractPositiveTerms(executableAst);
    const scored = state.ranker.rank(candidates, positiveTerms, topK);
    const hits = this.buildHits(state.index, scored, rawAst, positiveTerms);

    return {
      query,
      status: 'ok',
      totalHits: candidates.size,
      hits,
      durationMs: elapsedMs(startTime),
    };
  }

  stats(): IIndexStats {
    const { index } = this.requireState();
    return {
      documentCount: index.documentCount,
      termCount: index.termCount,
    };
  }

  private requireState(): IEngineState {
    if (this.state === null) {
      throw new IndexNotInitializedError();
    }
    return this.state;
  }

  private buildState(documents: readonly IDocumentInput[]): IEngineState {
    const index = new InvertedIndex();
    for (const doc of documents) {
      const tokens = this.textAnalyzer.analyze(doc.rawText);
      index.addDocument(doc.source, tokens);
    }

    return {
      index,
      executor: new QueryExecutor(index),
      ranker: new Bm25Ranker(index, this.bm25Options),
    };
  }

  private buildHits(
    index: InvertedIndex,
    scored: readonly IScoredDocument[],
    rawAst: QueryNode,
    positiveTerms: readonly string[],
  ): ISearchHit[] {
    const displayTerms =
      scored.length > 0 ? mapPositiveDisplayTerms(rawAst) : new Map<string, string>();
    const hits: ISearchHit[] = [];

    for (let i = 0; i < scored.length; i += 1) {
      const scoredDoc = scored[i]!;
      const document = index.getDocument(scoredDoc.docId);
      if (document === undefined) {
        throw new MissingDocumentError(scoredDoc.docId);
      }

      hits.push({
        rank: i + 1,
        docId: scoredDoc.docId,
        source: document.source,
        score: scoredDoc.score,
        matches: collectTermMatches(index, scoredDoc.docId, positiveTerms, displayTerms),
      });
    }

    return hits;
  }
}
