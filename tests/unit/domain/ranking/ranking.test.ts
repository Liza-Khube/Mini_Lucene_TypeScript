import { describe, expect, test, vi } from 'vitest';

import type { DocId } from '../../../../src/data/inverted-index/public-api.js';
import {
  Bm25Ranker,
  DEFAULT_B,
  DEFAULT_K1,
  type IScoredDocument,
} from '../../../../src/domain/ranking/public-api.js';
import {
  BASIC_DOCS,
  CORE_DOCS,
  INVALID_BM25_OPTIONS_CASES,
  INVALID_TOP_K_CASES,
  LARGE_TOP_K_DOCS,
  ORDER_SENSITIVE_DOCS,
  SAMPLE_DOCS,
  SUM_DOCS,
  TIED_DOCS,
  TOP_K_DOCS,
  allDocs,
  buildIndex,
  ids,
  repeat,
  run,
  scoreOf,
} from './fixtures.js';

describe('Domain Ranking', () => {
  describe('BM25 defaults', () => {
    test('should set default k1 to 1.2', () => {
      expect(DEFAULT_K1).toBe(1.2);
    });

    test('should set default b to 0.75', () => {
      expect(DEFAULT_B).toBe(0.75);
    });
  });

  describe(Bm25Ranker.name, () => {
    const index = buildIndex(CORE_DOCS);

    describe('result contract', () => {
      test('should return { docId, score } pairs and each candidate exactly once', () => {
        const basicIndex = buildIndex(['cat pad', 'cat cat', 'dog pad']);
        const results = run(basicIndex, allDocs(3), ['cat']);

        expect(results).toHaveLength(3);
        expect([...ids(results)].sort((a, b) => a - b)).toStrictEqual([0, 1, 2]);
        for (const result of results) {
          expect(typeof result.docId).toBe('number');
          expect(typeof result.score).toBe('number');
        }
      });

      test('should rank only candidate documents, even if other documents contain the term', () => {
        const candidateIndex = buildIndex(['cat pad', 'cat cat', 'cat pad', 'cat cat']);
        const results = run(candidateIndex, new Set([1, 2]), ['cat']);

        expect([...ids(results)].sort((a, b) => a - b)).toStrictEqual([1, 2]);
      });

      test('should be deterministic when ranking the same candidates and terms twice', () => {
        const sampleIndex = buildIndex(SAMPLE_DOCS);
        const first = run(sampleIndex, allDocs(3), ['cat', 'dog']);
        const second = run(sampleIndex, allDocs(3), ['cat', 'dog']);

        expect(second).toStrictEqual(first);
      });

      test('should not mutate the candidate set or the terms array', () => {
        const sampleIndex = buildIndex(SAMPLE_DOCS);
        const candidates = new Set([2, 0, 1]);
        const terms: readonly string[] = Object.freeze(['cat', 'dog']);

        run(sampleIndex, candidates, terms);

        expect([...candidates]).toStrictEqual([2, 0, 1]);
        expect(terms).toStrictEqual(['cat', 'dog']);
      });

      test('should read getDocument once per candidate regardless of how many query terms are scored', () => {
        const spiedIndex = buildIndex(['cat dog bird', 'cat cat dog', 'bird pad pad']);
        const getDocumentSpy = vi.spyOn(spiedIndex, 'getDocument');
        const ranker = new Bm25Ranker(spiedIndex);

        ranker.rank(new Set([0, 2]), ['cat', 'dog', 'bird']);

        expect(getDocumentSpy).toHaveBeenCalledTimes(2);
        expect(getDocumentSpy).toHaveBeenCalledWith(0);
        expect(getDocumentSpy).toHaveBeenCalledWith(2);
        expect(getDocumentSpy).not.toHaveBeenCalledWith(1);
      });

      test('should be reusable across multiple rank calls with different queries and topK values', () => {
        const ranker = new Bm25Ranker(index);

        expect(ids(ranker.rank(allDocs(3), ['cat']))).toStrictEqual([0, 1, 2]);
        expect(ids(ranker.rank(allDocs(3), ['dog', 'bird'], 2))).toStrictEqual([1, 2]);
        expect(ids(ranker.rank(allDocs(3), ['bird'], 1))).toStrictEqual([2]);
      });
    });

    describe('score values', () => {
      test('should match the hand-computed BM25 value for a single term', () => {
        const results = run(index, new Set([0]), ['cat']);

        expect(results).toHaveLength(1);
        expect(results[0]!.docId).toBe(0);
        expect(results[0]!.score).toBeCloseTo(1.34864, 4);
      });

      test('should match the hand-computed BM25 values for multiple terms', () => {
        const results = run(index, allDocs(3), ['dog', 'bird']);

        expect(scoreOf(results, 0)).toBeCloseTo(0.47, 4);
        expect(scoreOf(results, 1)).toBeCloseTo(1.08843, 4);
        expect(scoreOf(results, 2)).toBeCloseTo(0.752, 4);
      });

      test('should order multi-term results by the hand-computed scores', () => {
        expect(ids(run(index, allDocs(3), ['dog', 'bird']))).toStrictEqual([1, 2, 0]);
      });

      test('should match the hand-computed value for custom k1=2 and b=0.5 when doc length differs from average', () => {
        const results = run(index, new Set([1]), ['dog'], { k1: 2, b: 0.5 });

        expect(results[0]!.score).toBeCloseTo(0.528754, 5);
      });

      test('should match the hand-computed value for b=1 with a document twice as long as average', () => {
        const lengthIndex = buildIndex([['cat', ...repeat('pad', 19)], []]);
        const results = run(lengthIndex, new Set([0]), ['cat'], { b: 1 });

        expect(results[0]!.score).toBeCloseTo(0.448507, 5);
      });

      test('should compute document score as the sum of individual single-term scores', () => {
        const ranker = new Bm25Ranker(buildIndex(SUM_DOCS));
        const catOnly = scoreOf(ranker.rank(new Set([0]), ['cat']), 0);
        const dogOnly = scoreOf(ranker.rank(new Set([0]), ['dog']), 0);
        const combined = scoreOf(ranker.rank(new Set([0]), ['cat', 'dog']), 0);

        expect(combined).toBeCloseTo(catOnly + dogOnly, 10);
      });

      test('should use collection-wide idf independent of which other documents are candidates', () => {
        const alone = run(index, new Set([0]), ['cat']);
        const withOthers = run(index, allDocs(3), ['cat']);

        expect(scoreOf(withOthers, 0)).toBeCloseTo(scoreOf(alone, 0), 10);
      });

      test('should give the same result with omitted options as with default k1 and b', () => {
        const implicit = run(index, allDocs(3), ['dog', 'bird']);
        const explicit = run(index, allDocs(3), ['dog', 'bird'], {
          k1: DEFAULT_K1,
          b: DEFAULT_B,
        });

        expect(implicit).toStrictEqual(explicit);
      });
    });

    describe('BM25 properties', () => {
      test('should yield diminishing returns for each additional occurrence of a term', () => {
        const docs = [1, 2, 3, 4].map((count) => [
          ...repeat('cat', count),
          ...repeat('pad', 6 - count),
        ]);
        const results = run(buildIndex(docs), allDocs(4), ['cat']);
        const gain12 = scoreOf(results, 1) - scoreOf(results, 0);
        const gain23 = scoreOf(results, 2) - scoreOf(results, 1);
        const gain34 = scoreOf(results, 3) - scoreOf(results, 2);

        expect(gain12).toBeGreaterThan(gain23);
        expect(gain23).toBeGreaterThan(gain34);
      });

      test('should saturate term frequency below the upper bound idf * (k1 + 1)', () => {
        const idfForSingleDoc = Math.log(4 / 3);
        const upperBound = idfForSingleDoc * (DEFAULT_K1 + 1);
        const [result] = run(buildIndex([repeat('cat', 10_000)]), new Set([0]), ['cat']);

        expect(result).toBeDefined();
        expect(result!.score).toBeLessThan(upperBound);
        expect(result!.score).toBeGreaterThan(upperBound - 0.01);
      });

      test.each([
        { smallerN: 10, largerN: 50 },
        { smallerN: 50, largerN: 500 },
      ])(
        'should increase score when collection grows from $smallerN to $largerN documents at fixed df',
        ({ smallerN, largerN }) => {
          const buildWithSize = (totalDocs: number) =>
            buildIndex([
              ...Array.from({ length: 3 }, () => ['cat', 'pad']),
              ...Array.from({ length: totalDocs - 3 }, () => ['pad', 'pad']),
            ]);

          const [smallerScore] = run(buildWithSize(smallerN), new Set([0]), ['cat']);
          const [largerScore] = run(buildWithSize(largerN), new Set([0]), ['cat']);

          expect(largerScore!.score).toBeGreaterThan(smallerScore!.score);
        },
      );

      test('should turn k1=0 into a binary match equal to idf regardless of tf or document length', () => {
        const results = run(index, new Set([1]), ['dog'], { k1: 0 });
        expect(results[0]!.score).toBeCloseTo(0.470004, 5);

        const multiDocs = buildIndex([
          ['cat', 'pad'],
          [...repeat('cat', 5), 'pad'],
          repeat('cat', 100),
        ]);
        const binaryResults = run(multiDocs, allDocs(3), ['cat'], { k1: 0 });

        expect(ids(binaryResults)).toStrictEqual([0, 1, 2]);
        expect(binaryResults[1]!.score).toBeCloseTo(binaryResults[0]!.score, 10);
        expect(binaryResults[2]!.score).toBeCloseTo(binaryResults[0]!.score, 10);
      });

      test('should tie equal-tf documents of different lengths when b=0 and fall back to DocId order', () => {
        const lenIndex = buildIndex([['cat', ...repeat('pad', 9)], ['cat']]);

        expect(ids(run(lenIndex, allDocs(2), ['cat'], { b: 0 }))).toStrictEqual([0, 1]);
        expect(ids(run(lenIndex, allDocs(2), ['cat']))).toStrictEqual([1, 0]);
      });

      test.each([1, 3, 10])(
        'should keep scores positive when a term occurs in all %i documents',
        (docCount) => {
          const sharedIndex = buildIndex(
            Array.from({ length: docCount }, (_, i) => [...repeat('cat', i + 1), 'pad']),
          );
          const results = run(sharedIndex, allDocs(docCount), ['cat']);

          expect(results.every((r) => Number.isFinite(r.score) && r.score > 0)).toBe(true);
        },
      );
    });

    describe('ordering', () => {
      test('should rank higher term frequency first when document lengths are equal', () => {
        const tfIndex = buildIndex(['cat pad pad pad', 'cat cat pad pad', 'cat cat cat pad']);

        expect(ids(run(tfIndex, allDocs(3), ['cat']))).toStrictEqual([2, 1, 0]);
      });

      test('should rank shorter document first when term frequency is equal', () => {
        const lenIndex = buildIndex([
          ['cat', ...repeat('pad', 9)],
          ['cat', 'pad'],
          ['cat', ...repeat('pad', 4)],
        ]);

        expect(ids(run(lenIndex, allDocs(3), ['cat']))).toStrictEqual([1, 2, 0]);
      });

      test('should outweigh a common term with a rare term at equal tf and document length', () => {
        const rarityIndex = buildIndex(['common pad', 'rare pad', 'common pad', 'common pad']);
        const results = run(rarityIndex, new Set([0, 1]), ['common', 'rare']);

        expect(ids(results)).toStrictEqual([1, 0]);
        expect(scoreOf(results, 1)).toBeGreaterThan(scoreOf(results, 0));
      });

      test('should rank a document matching both query terms above documents matching only one', () => {
        const multiIndex = buildIndex(['cat pad', 'dog pad', 'cat dog', 'bird pad']);
        const results = run(multiIndex, new Set([0, 1, 2]), ['cat', 'dog']);

        expect(results[0]!.docId).toBe(2);
        expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
      });

      test('should sort results by score in descending order', () => {
        const docs = Array.from({ length: 12 }, (_, i) => [
          ...repeat('cat', (i * 7) % 5),
          ...repeat('dog', (i * 3) % 4),
          ...repeat('pad', (i * 5) % 9),
        ]);
        const results = run(buildIndex(docs), allDocs(docs.length), ['cat', 'dog']);

        for (let i = 1; i < results.length; i += 1) {
          expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
        }
      });

      test('should order equal scores by ascending DocId regardless of candidate iteration order', () => {
        const tiedIndex = buildIndex(['cat dog', 'cat dog', 'cat dog', 'cat dog']);
        const results = run(tiedIndex, new Set([3, 1, 2, 0]), ['cat']);

        expect(ids(results)).toStrictEqual([0, 1, 2, 3]);
      });

      test('should produce the same result regardless of candidate insertion order', () => {
        const sampleIndex = buildIndex(SAMPLE_DOCS);
        const ascending = run(sampleIndex, new Set([0, 1, 2]), ['cat', 'dog']);
        const descending = run(sampleIndex, new Set([2, 1, 0]), ['cat', 'dog']);

        expect(descending).toStrictEqual(ascending);
      });

      test('should produce the same ranking and exact floating-point scores regardless of query term order', () => {
        const ranker = new Bm25Ranker(buildIndex(ORDER_SENSITIVE_DOCS));
        const forward = ranker.rank(allDocs(5), ['alpha', 'beta', 'gamma']);
        const backward = ranker.rank(allDocs(5), ['gamma', 'beta', 'alpha']);

        expect(backward).toStrictEqual(forward);
      });

      test('should count a repeated query term once', () => {
        const sampleIndex = buildIndex(SAMPLE_DOCS);
        const once = run(sampleIndex, allDocs(3), ['cat']);
        const twice = run(sampleIndex, allDocs(3), ['cat', 'cat']);

        expect(twice).toStrictEqual(once);
      });
    });

    describe('Top-K', () => {
      const topKIndex = buildIndex(TOP_K_DOCS);
      const candidates = allDocs(5);
      const full = (): IScoredDocument[] => run(topKIndex, candidates, ['cat']);

      test('should return the full ranking when topK is omitted', () => {
        expect(ids(full())).toStrictEqual([4, 3, 2, 1, 0]);
      });

      test.each([1, 2, 3, 4])(
        'should return the first %i entries of the full ranking for topK=%i',
        (k) => {
          const top = run(topKIndex, candidates, ['cat'], undefined, k);

          expect(top).toHaveLength(k);
          expect(top).toStrictEqual(full().slice(0, k));
        },
      );

      test('should return the two best documents when topK=2', () => {
        expect(ids(run(topKIndex, candidates, ['cat'], undefined, 2))).toStrictEqual([4, 3]);
      });

      test.each([5, 6, 100])(
        'should return the full ranking when topK=%i (>= number of candidates)',
        (k) => {
          const top = run(topKIndex, candidates, ['cat'], undefined, k);

          expect(top).toStrictEqual(full());
        },
      );

      test('should return an empty array when topK=0', () => {
        expect(run(topKIndex, candidates, ['cat'], undefined, 0)).toStrictEqual([]);
      });

      test('should return only the candidates when topK is larger than a small candidate set', () => {
        const top = run(topKIndex, new Set([1, 3]), ['cat'], undefined, 10);

        expect(ids(top)).toStrictEqual([3, 1]);
      });

      test('should select the best document even when it is the last candidate in iteration order', () => {
        const top = run(topKIndex, new Set([0, 1, 2, 3, 4]), ['cat'], undefined, 1);

        expect(ids(top)).toStrictEqual([4]);
      });

      test('should keep DocId tie-break order under topK', () => {
        const tied = buildIndex(TIED_DOCS);
        const top = run(tied, allDocs(4), ['cat'], undefined, 2);

        expect(ids(top)).toStrictEqual([0, 1]);
      });

      test('should return an empty array for topK on an empty candidate set', () => {
        expect(run(topKIndex, new Set<DocId>(), ['cat'], undefined, 3)).toStrictEqual([]);
      });

      test.each([1, 2, 3, 5, 7, 10, 15])(
        'should match the first %i entries of full ranking on a 20-document collection with ties',
        (k) => {
          const largeIndex = buildIndex(LARGE_TOP_K_DOCS);
          const ranker = new Bm25Ranker(largeIndex);
          const all = allDocs(LARGE_TOP_K_DOCS.length);
          const reversed = new Set(Array.from({ length: LARGE_TOP_K_DOCS.length }, (_, i) => 19 - i));
          const expected = ranker.rank(all, ['cat']).slice(0, k);

          expect(ranker.rank(all, ['cat'], k)).toStrictEqual(expected);
          expect(ranker.rank(reversed, ['cat'], k)).toStrictEqual(expected);
        },
      );

      test('should select top K accurately across strictly ascending and descending score runs', () => {
        const ascendingIndex = buildIndex(
          Array.from({ length: 15 }, (_, i) => [...repeat('cat', i + 1), ...repeat('pad', 15 - i)]),
        );
        const descendingIndex = buildIndex(
          Array.from({ length: 15 }, (_, i) => [...repeat('cat', 15 - i), ...repeat('pad', i + 1)]),
        );
        const all = allDocs(15);

        expect(run(ascendingIndex, all, ['cat'], undefined, 4)).toStrictEqual(
          run(ascendingIndex, all, ['cat']).slice(0, 4),
        );
        expect(run(descendingIndex, all, ['cat'], undefined, 4)).toStrictEqual(
          run(descendingIndex, all, ['cat']).slice(0, 4),
        );
      });
    });

    describe('validation', () => {
      test.each(INVALID_BM25_OPTIONS_CASES)(
        'should throw RangeError from constructor for $name',
        ({ options }) => {
          expect(() => new Bm25Ranker(index, options)).toThrow(RangeError);
        },
      );

      test.each(INVALID_TOP_K_CASES)(
        'should throw RangeError when topK is $name even when candidates is empty',
        ({ topK }) => {
          const ranker = new Bm25Ranker(index);

          expect(() => ranker.rank(allDocs(3), ['cat'], topK)).toThrow(RangeError);
          expect(() => ranker.rank(new Set<DocId>(), ['cat'], topK)).toThrow(RangeError);
        },
      );
    });

    describe('edge cases', () => {
      test('should return an empty result for an empty candidate set', () => {
        const smallIndex = buildIndex(['cat', 'dog']);

        expect(run(smallIndex, new Set<DocId>(), ['cat'])).toStrictEqual([]);
      });

      test('should return an empty result without errors for an empty index with no candidates', () => {
        expect(run(buildIndex([]), new Set<DocId>(), ['cat'])).toStrictEqual([]);
      });

      test.each([
        { name: 'no query terms', terms: [] },
        { name: 'a term missing from the index', terms: ['missing'] },
        { name: 'several terms missing from the index', terms: ['missing', 'absent'] },
        { name: 'a term that differs only by case (terms are used as given)', terms: ['Cat'] },
      ])('should give every candidate score 0 in DocId order for $name', ({ terms }) => {
        const basicIndex = buildIndex(BASIC_DOCS);
        const results = run(basicIndex, new Set([2, 0, 1]), terms);

        expect(ids(results)).toStrictEqual([0, 1, 2]);
        expect(results.map((r) => r.score)).toStrictEqual([0, 0, 0]);
      });

      test('should ignore a term missing from the index when paired with a known term', () => {
        const basicIndex = buildIndex(BASIC_DOCS);
        const known = run(basicIndex, allDocs(3), ['cat']);
        const mixed = run(basicIndex, allDocs(3), ['cat', 'missing']);

        expect(mixed).toStrictEqual(known);
      });

      test('should score a candidate without any query term as 0 and rank it after matching candidates', () => {
        const mixedIndex = buildIndex(['cat pad', 'dog pad', 'cat cat']);
        const results = run(mixedIndex, allDocs(3), ['cat']);

        expect(ids(results)).toStrictEqual([2, 0, 1]);
        expect(scoreOf(results, 1)).toBe(0);
      });

      test('should score an empty document among candidates as 0 and rank it last', () => {
        const sparseIndex = buildIndex(['', 'cat pad', 'cat cat']);
        const results = run(sparseIndex, allDocs(3), ['cat']);

        expect(ids(results)).toStrictEqual([2, 1, 0]);
        expect(scoreOf(results, 0)).toBe(0);
      });

      test('should give score 0 (not NaN) for every candidate in a collection of only empty documents', () => {
        const emptyIndex = buildIndex(['', '', '']);
        const results = run(emptyIndex, allDocs(3), ['cat']);

        expect(ids(results)).toStrictEqual([0, 1, 2]);
        expect(results.map((r) => r.score)).toStrictEqual([0, 0, 0]);
      });

      test('should give a single-word document a finite positive score', () => {
        const singleWordIndex = buildIndex([['cat'], ['dog']]);
        const [result] = run(singleWordIndex, new Set([0]), ['cat']);

        expect(result).toBeDefined();
        expect(Number.isFinite(result!.score)).toBe(true);
        expect(result!.score).toBeGreaterThan(0);
      });

      test('should give a finite positive score for a matching term in a one-document collection', () => {
        const oneDocIndex = buildIndex(['cat dog cat']);
        const [result] = run(oneDocIndex, new Set([0]), ['cat']);

        expect(result).toBeDefined();
        expect(Number.isFinite(result!.score)).toBe(true);
        expect(result!.score).toBeGreaterThan(0);
      });

      test('should yield non-negative scores and preserve tf ordering when a term appears in every document', () => {
        const sharedIndex = buildIndex(['cat dog', 'cat cat', 'cat pad']);
        const results = run(sharedIndex, allDocs(3), ['cat']);

        expect(results.every((r) => r.score >= 0)).toBe(true);
        expect(results[0]!.docId).toBe(1);
      });
    });
  });
});
