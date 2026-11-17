import { describe, expect, test } from 'vitest';
import {
  DocumentTable,
  DuplicateSourceError,
} from '../../../../src/data/inverted-index/public-api.js';
import type { IDocumentInfo } from '../../../../src/data/inverted-index/public-api.js';
import type { Mutable } from './fixtures.js';

describe('DocumentTable', () => {
  describe('empty table', () => {
    test('should report zero count, zero average length and empty DocId list', () => {
      const table = new DocumentTable();

      expect(table.count).toBe(0);
      expect(table.averageLength).toBe(0);
      expect(Number.isNaN(table.averageLength)).toBe(false);
      expect(table.getAllDocIds()).toEqual([]);
    });

    test('should return undefined for unknown DocIds and sources', () => {
      const table = new DocumentTable();

      expect(table.get(0)).toBeUndefined();
      expect(table.hasSource('a.txt')).toBe(false);
      expect(table.getDocIdBySource('a.txt')).toBeUndefined();
    });
  });

  describe('adding and retrieving documents', () => {
    test('should assign sequential DocIds starting from 0 in insertion order', () => {
      const table = new DocumentTable();

      expect(table.add('z.txt', 2)).toBe(0);
      expect(table.add('a.txt', 4)).toBe(1);
      expect(table.add('m.txt', 1)).toBe(2);
      expect(table.count).toBe(3);
      expect(table.getAllDocIds()).toEqual([0, 1, 2]);
    });

    test('should return the full document record and source lookup', () => {
      const table = new DocumentTable();
      const id = table.add('./docs/a.txt', 5);

      expect(table.hasSource('./docs/a.txt')).toBe(true);
      expect(table.getDocIdBySource('./docs/a.txt')).toBe(0);
      expect(table.get(id)).toEqual({ docId: 0, source: './docs/a.txt', length: 5 });
    });

    test.each([-1, 2, 99, 1.5, Number.NaN])(
      'should return undefined from get() for invalid or unknown DocId %s',
      (docId) => {
        const table = new DocumentTable();
        table.add('a.txt', 1);
        table.add('b.txt', 2);

        expect(table.get(docId)).toBeUndefined();
      },
    );
  });

  describe('duplicate sources', () => {
    test('should throw DuplicateSourceError and keep state unchanged when source already exists', () => {
      const table = new DocumentTable();
      table.add('a.txt', 3);

      expect(() => table.add('a.txt', 10)).toThrow(DuplicateSourceError);
      expect(table.count).toBe(1);
      expect(table.averageLength).toBe(3);
      expect(table.add('b.txt', 5)).toBe(1);
    });
  });

  describe('averageLength', () => {
    test.each([
      { lengths: [3], expected: 3 },
      { lengths: [2, 4], expected: 3 },
      { lengths: [1, 2, 3, 4], expected: 2.5 },
      { lengths: [0, 4], expected: 2 },
      { lengths: [0, 0], expected: 0 },
    ])('should compute averageLength=$expected for lengths $lengths', ({ lengths, expected }) => {
      const table = new DocumentTable();
      lengths.forEach((len, i) => table.add(`doc${i}.txt`, len));

      expect(table.averageLength).toBeCloseTo(expected, 10);
      expect(Number.isFinite(table.averageLength)).toBe(true);
    });
  });

  describe('output isolation', () => {
    test('should not alter internal records when mutating the object returned by get()', () => {
      const table = new DocumentTable();
      table.add('a.txt', 3);

      const doc = table.get(0);
      expect(doc).toBeDefined();
      if (doc) {
        (doc as Mutable<IDocumentInfo>).length = 999;
        (doc as Mutable<IDocumentInfo>).source = 'hacked.txt';
      }

      expect(table.get(0)).toEqual({ docId: 0, source: 'a.txt', length: 3 });
    });

    test('should not alter internal state when mutating the array returned by getAllDocIds()', () => {
      const table = new DocumentTable();
      table.add('a.txt', 1);
      table.add('b.txt', 2);

      const ids = table.getAllDocIds();
      ids.push(99);
      ids.pop();

      expect(table.getAllDocIds()).toEqual([0, 1]);
    });
  });
});
