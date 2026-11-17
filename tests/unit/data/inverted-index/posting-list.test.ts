import { describe, expect, test } from 'vitest';
import { PostingList } from '../../../../src/data/inverted-index/public-api.js';
import type { IPosting } from '../../../../src/data/inverted-index/public-api.js';
import type { Mutable } from './fixtures.js';

describe('PostingList', () => {
  describe('empty posting list', () => {
    test('should report documentFrequency=0 and empty cursors', () => {
      const list = new PostingList();

      expect(list.documentFrequency).toBe(0);
      expect(list.values().toArray()).toEqual([]);
      expect(list.getPositions(0).toArray()).toEqual([]);
      expect(list.getTermFrequency(0)).toBe(0);
    });
  });

  describe('appending postings and positions', () => {
    test('should group repeated positions within the same document into one posting', () => {
      const list = new PostingList();
      list.append(0, 1);
      list.append(0, 4);
      list.append(0, 7);

      expect(list.documentFrequency).toBe(1);
      expect(list.values().toArray()).toEqual([{ docId: 0, positions: [1, 4, 7] }]);
      expect(list.getPositions(0).toArray()).toEqual([1, 4, 7]);
      expect(list.getTermFrequency(0)).toBe(3);
    });

    test('should append separate postings for multiple documents in ascending DocId order', () => {
      const list = new PostingList();
      list.append(0, 2);
      list.append(2, 1);
      list.append(2, 5);
      list.append(5, 3);

      expect(list.documentFrequency).toBe(3);
      expect(list.values().toArray()).toEqual([
        { docId: 0, positions: [2] },
        { docId: 2, positions: [1, 5] },
        { docId: 5, positions: [3] },
      ]);
    });
  });

  describe('lookup by DocId (binary search)', () => {
    test.each([
      { docId: 0, expected: [1], tf: 1 },
      { docId: 3, expected: [2, 6], tf: 2 },
      { docId: 7, expected: [4], tf: 1 },
      { docId: 1, expected: [], tf: 0 },
      { docId: 4, expected: [], tf: 0 },
      { docId: 99, expected: [], tf: 0 },
      { docId: -1, expected: [], tf: 0 },
      { docId: 1.5, expected: [], tf: 0 },
      { docId: Number.NaN, expected: [], tf: 0 },
    ])(
      'should return positions $expected and tf=$tf for DocId $docId',
      ({ docId, expected, tf }) => {
        const list = new PostingList();
        list.append(0, 1);
        list.append(3, 2);
        list.append(3, 6);
        list.append(7, 4);

        expect(list.getPositions(docId).toArray()).toEqual(expected);
        expect(list.getTermFrequency(docId)).toBe(tf);
      },
    );
  });

  describe('cursor isolation', () => {
    test('should not alter internal postings when mutating values() cursor outputs', () => {
      const list = new PostingList();
      list.append(0, 1);
      list.append(0, 3);

      const arrayCopy = list.values().toArray();
      arrayCopy.push({ docId: 99, positions: [100] });
      (arrayCopy[0]!.positions as number[]).push(999);
      (arrayCopy[0] as Mutable<IPosting>).docId = 42;

      const cursor = list.values();
      const first = cursor.next();
      expect(first).toEqual({ docId: 0, positions: [1, 3] });
      (first!.positions as number[]).push(777);

      expect(list.values().toArray()).toEqual([{ docId: 0, positions: [1, 3] }]);
    });

    test('should not alter internal positions when mutating getPositions() cursor output', () => {
      const list = new PostingList();
      list.append(0, 1);
      list.append(0, 3);

      const positions = list.getPositions(0).toArray();
      positions.push(999);
      positions[0] = -1;

      expect(list.getPositions(0).toArray()).toEqual([1, 3]);
    });
  });
});
