import type { DocId } from '../../data/inverted-index/public-api.js';
import {
  DEFAULT_B,
  DEFAULT_K1,
  computeIdf,
  computeLengthNorm,
  computeTermScore,
  validateBm25Parameters,
} from './bm25.js';
import { MissingDocumentError } from './errors.js';
import { selectTopK, validateTopK } from './top-k.js';
import type { IBm25Options, IScoredDocument, IScoringIndex } from './types.js';

interface ITermWeight {
  readonly term: string;
  readonly idf: number;
}

export class Bm25Ranker {
  private readonly k1: number;
  private readonly b: number;

  constructor(
    private readonly index: IScoringIndex,
    options: IBm25Options = {},
  ) {
    const k1 = options.k1 ?? DEFAULT_K1;
    const b = options.b ?? DEFAULT_B;

    validateBm25Parameters(k1, b);

    this.k1 = k1;
    this.b = b;
  }

  rank(
    candidates: ReadonlySet<DocId>,
    queryTerms: readonly string[],
    topK?: number,
  ): IScoredDocument[] {
    if (topK !== undefined) {
      validateTopK(topK);
    }

    if (candidates.size === 0 || topK === 0) {
      return [];
    }

    const termWeights = this.collectTermWeights(queryTerms);
    const avgDocLength = this.index.averageDocumentLength;
    const scored: IScoredDocument[] = [];

    for (const docId of candidates) {
      scored.push({
        docId,
        score: this.scoreDocument(docId, termWeights, avgDocLength),
      });
    }

    return selectTopK(scored, topK);
  }

  private collectTermWeights(queryTerms: readonly string[]): ITermWeight[] {
    const uniqueTerms = [...new Set(queryTerms)].sort();
    const termWeights: ITermWeight[] = [];

    for (const term of uniqueTerms) {
      const df = this.index.getDocumentFrequency(term);
      if (df === 0) {
        continue;
      }
      termWeights.push({
        term,
        idf: computeIdf(this.index.documentCount, df),
      });
    }

    return termWeights;
  }

  private scoreDocument(
    docId: DocId,
    termWeights: readonly ITermWeight[],
    avgDocLength: number,
  ): number {
    const document = this.index.getDocument(docId);
    if (document === undefined) {
      throw new MissingDocumentError(docId);
    }

    if (termWeights.length === 0) {
      return 0;
    }

    const lengthNorm = computeLengthNorm(document.length, avgDocLength, this.b);
    let totalScore = 0;

    for (const { term, idf } of termWeights) {
      totalScore += computeTermScore(
        this.index.getTermFrequency(term, docId),
        lengthNorm,
        idf,
        this.k1,
      );
    }

    return totalScore;
  }
}
