import { describe, expect, test, vi } from 'vitest';

import {
  executePhraseQuery,
  intersectPositions,
} from '../../../../src/domain/query-executor/phrase-matcher.js';
import { buildIndex } from './fixtures.js';

describe('Domain QueryExecutor Phrase Matcher', () => {
  describe(intersectPositions.name, () => {
    test.each([
      { name: 'base empty', base: [], target: [1, 2], offset: 1, expected: [] },
      { name: 'target empty', base: [1, 2], target: [], offset: 1, expected: [] },
      { name: 'adjacent positions', base: [1, 5], target: [2, 4, 6], offset: 1, expected: [1, 5] },
      { name: 'gap offset (stop-word)', base: [1, 3], target: [3, 6], offset: 2, expected: [1] },
      { name: 'zero offset', base: [1, 3, 5], target: [2, 3, 4], offset: 0, expected: [3] },
      { name: 'negative offset', base: [2, 4], target: [1, 5], offset: -1, expected: [2] },
      { name: 'repeated adjacent word', base: [1, 2], target: [1, 2], offset: 1, expected: [1] },
      { name: 'no matching positions', base: [1, 3], target: [5, 7], offset: 1, expected: [] },
    ])('should return $expected for $name', ({ base, target, offset, expected }) => {
      expect(intersectPositions(base, target, offset)).toStrictEqual(expected);
    });

    test('should not mutate input position arrays', () => {
      const base = Object.freeze([1, 4]);
      const target = Object.freeze([2, 5]);

      expect(intersectPositions(base, target, 1)).toStrictEqual([1, 4]);
    });
  });

  describe(executePhraseQuery.name, () => {
    const index = buildIndex([
      '_ quick brown fox',
      'quick brown dog',
      'brown _ pillow',
      'brown pillow',
      'cat dog cat',
      'cat cat',
      'fox brown quick',
    ]);

    test('should return [] for an empty phrase', () => {
      expect(executePhraseQuery([], index)).toStrictEqual([]);
    });

    test('should match single-term phrase without offset normalization errors', () => {
      expect(executePhraseQuery([{ value: 'fox', offset: 2 }], index)).toStrictEqual([0, 6]);
    });

    test('should match phrase terms with leading non-zero offset', () => {
      expect(
        executePhraseQuery(
          [
            { value: 'quick', offset: 1 },
            { value: 'brown', offset: 2 },
            { value: 'fox', offset: 3 },
          ],
          index,
        ),
      ).toStrictEqual([0]);
    });

    test('should match phrases with stop-word gaps', () => {
      expect(
        executePhraseQuery(
          [
            { value: 'brown', offset: 0 },
            { value: 'pillow', offset: 2 },
          ],
          index,
        ),
      ).toStrictEqual([2]);
    });

    test('should stop querying later terms as soon as an earlier term is absent from the index', () => {
      const spied = buildIndex(['brown pillow', 'quick fox']);
      const getPostings = vi.spyOn(spied, 'getPostings');

      const result = executePhraseQuery(
        [
          { value: 'ghost', offset: 0 },
          { value: 'brown', offset: 1 },
          { value: 'pillow', offset: 2 },
        ],
        spied,
      );

      expect(result).toStrictEqual([]);
      expect(getPostings).toHaveBeenCalledTimes(1);
      expect(getPostings).toHaveBeenCalledWith('ghost');
      expect(getPostings).not.toHaveBeenCalledWith('brown');
    });

    test('should return [] when candidate documents have no common docId', () => {
      expect(
        executePhraseQuery(
          [
            { value: 'pillow', offset: 0 },
            { value: 'fox', offset: 1 },
          ],
          index,
        ),
      ).toStrictEqual([]);
    });

    test('should cache postings for repeated terms inside a phrase', () => {
      const spied = buildIndex(['cat cat', 'cat dog cat']);
      const getPostings = vi.spyOn(spied, 'getPostings');

      const result = executePhraseQuery(
        [
          { value: 'cat', offset: 0 },
          { value: 'cat', offset: 1 },
        ],
        spied,
      );

      expect(result).toStrictEqual([0]);
      expect(getPostings).toHaveBeenCalledTimes(1);
      expect(getPostings).toHaveBeenCalledWith('cat');
    });

    test('should match accurately when rarest term is in the middle of the phrase', () => {
      const rarestMidIndex = buildIndex([
        'alpha beta gamma',
        'alpha rare gamma',
        'alpha beta',
        'alpha beta rare',
        'alpha beta gamma rare',
        'other alpha rare gamma',
      ]);

      expect(
        executePhraseQuery(
          [
            { value: 'alpha', offset: 0 },
            { value: 'rare', offset: 1 },
            { value: 'gamma', offset: 2 },
          ],
          rarestMidIndex,
        ),
      ).toStrictEqual([1, 5]);
    });
  });
});
