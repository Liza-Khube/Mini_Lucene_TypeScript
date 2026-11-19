import { describe, expect, test } from 'vitest';

import {
  complementDocIds,
  intersectDocIds,
  subtractDocIds,
  unionDocIds,
} from '../../../../src/domain/query-executor/boolean-operators.js';

describe('Domain QueryExecutor Boolean Operators', () => {
  describe(intersectDocIds.name, () => {
    test.each([
      { name: 'left empty', left: [], right: [0, 2], expected: [] },
      { name: 'right empty', left: [0, 2], right: [], expected: [] },
      { name: 'disjoint sets', left: [0, 2, 4], right: [1, 3, 5], expected: [] },
      { name: 'partial overlap', left: [0, 2, 3, 5], right: [1, 2, 4, 5, 6], expected: [2, 5] },
      { name: 'left subset of right', left: [1, 3], right: [0, 1, 2, 3, 4], expected: [1, 3] },
      { name: 'right subset of left', left: [0, 1, 2, 3, 4], right: [1, 3], expected: [1, 3] },
      { name: 'identical sets', left: [0, 1, 2], right: [0, 1, 2], expected: [0, 1, 2] },
    ])('should return $expected for $name', ({ left, right, expected }) => {
      expect(intersectDocIds(left, right)).toStrictEqual(expected);
    });

    test('should not mutate input arrays', () => {
      const left = Object.freeze([0, 2, 4]);
      const right = Object.freeze([1, 2, 4]);

      expect(intersectDocIds(left, right)).toStrictEqual([2, 4]);
    });
  });

  describe(unionDocIds.name, () => {
    test.each([
      { name: 'left empty', left: [], right: [1, 3], expected: [1, 3] },
      { name: 'right empty', left: [1, 3], right: [], expected: [1, 3] },
      { name: 'disjoint sets', left: [0, 2, 4], right: [1, 3, 5], expected: [0, 1, 2, 3, 4, 5] },
      { name: 'overlapping sets', left: [0, 2, 4], right: [1, 2, 3], expected: [0, 1, 2, 3, 4] },
      { name: 'identical sets', left: [0, 1, 2], right: [0, 1, 2], expected: [0, 1, 2] },
      { name: 'trailing elements in left', left: [0, 5, 6], right: [1, 2], expected: [0, 1, 2, 5, 6] },
      { name: 'trailing elements in right', left: [1, 2], right: [0, 5, 6], expected: [0, 1, 2, 5, 6] },
    ])('should return $expected for $name', ({ left, right, expected }) => {
      expect(unionDocIds(left, right)).toStrictEqual(expected);
    });

    test('should not mutate input arrays', () => {
      const left = Object.freeze([0, 2]);
      const right = Object.freeze([1, 2, 3]);

      expect(unionDocIds(left, right)).toStrictEqual([0, 1, 2, 3]);
    });
  });

  describe(subtractDocIds.name, () => {
    test.each([
      { name: 'included empty', included: [], excluded: [0, 2], expected: [] },
      { name: 'excluded empty', included: [0, 2, 4], excluded: [], expected: [0, 2, 4] },
      { name: 'disjoint sets', included: [0, 2, 4], excluded: [1, 3, 5], expected: [0, 2, 4] },
      { name: 'partial overlap', included: [0, 1, 3, 5, 6], excluded: [1, 2, 5], expected: [0, 3, 6] },
      { name: 'all excluded', included: [1, 3], excluded: [0, 1, 2, 3, 4], expected: [] },
      { name: 'identical sets', included: [0, 1, 2], excluded: [0, 1, 2], expected: [] },
      { name: 'trailing included elements', included: [0, 4, 5], excluded: [1, 2], expected: [0, 4, 5] },
      { name: 'trailing excluded elements', included: [1, 2], excluded: [0, 4, 5], expected: [1, 2] },
    ])('should return $expected for $name', ({ included, excluded, expected }) => {
      expect(subtractDocIds(included, excluded)).toStrictEqual(expected);
    });

    test('should not mutate input arrays', () => {
      const included = Object.freeze([0, 1, 2, 3]);
      const excluded = Object.freeze([1, 3]);

      expect(subtractDocIds(included, excluded)).toStrictEqual([0, 2]);
    });
  });

  describe(complementDocIds.name, () => {
    test.each([
      { name: 'empty excluded list', excluded: [], documentCount: 4, expected: [0, 1, 2, 3] },
      { name: 'all documents excluded', excluded: [0, 1, 2], documentCount: 3, expected: [] },
      { name: 'partial exclusion', excluded: [1, 3], documentCount: 5, expected: [0, 2, 4] },
      { name: 'zero documents in index', excluded: [], documentCount: 0, expected: [] },
    ])('should return $expected for $name', ({ excluded, documentCount, expected }) => {
      expect(complementDocIds(excluded, documentCount)).toStrictEqual(expected);
    });

    test('should not mutate excluded array', () => {
      const excluded = Object.freeze([1, 2]);

      expect(complementDocIds(excluded, 4)).toStrictEqual([0, 3]);
    });
  });
});
