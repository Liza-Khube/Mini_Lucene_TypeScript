import { describe, expect, test } from 'vitest';
import {
  ReadonlyArrayCursor,
  createEmptyCursor,
} from '../../../../src/data/inverted-index/public-api.js';

describe('ReadonlyArrayCursor', () => {
  describe('empty cursor', () => {
    test('should report hasNext() as false and return undefined from current() and next()', () => {
      const cursor = createEmptyCursor<number>();

      expect(cursor.hasNext()).toBe(false);
      expect(cursor.current()).toBeUndefined();
      expect(cursor.next()).toBeUndefined();
      expect(cursor.current()).toBeUndefined();
      expect(cursor.toArray()).toEqual([]);
      expect([...cursor]).toEqual([]);
    });
  });

  describe('cursor traversal', () => {
    test('should return undefined from current() before the first next() call', () => {
      const cursor = new ReadonlyArrayCursor([10, 20, 30]);

      expect(cursor.current()).toBeUndefined();
      expect(cursor.hasNext()).toBe(true);
    });

    test('should advance sequentially with next(), updating current() and hasNext()', () => {
      const cursor = new ReadonlyArrayCursor([10, 20, 30]);

      expect(cursor.hasNext()).toBe(true);
      expect(cursor.next()).toBe(10);
      expect(cursor.current()).toBe(10);

      expect(cursor.hasNext()).toBe(true);
      expect(cursor.next()).toBe(20);
      expect(cursor.current()).toBe(20);

      expect(cursor.hasNext()).toBe(true);
      expect(cursor.next()).toBe(30);
      expect(cursor.current()).toBe(30);

      expect(cursor.hasNext()).toBe(false);
      expect(cursor.next()).toBeUndefined();
      expect(cursor.current()).toBeUndefined();
    });

    test('should keep returning undefined on repeated next() calls after exhaustion', () => {
      const cursor = new ReadonlyArrayCursor(['only']);

      expect(cursor.next()).toBe('only');
      expect(cursor.next()).toBeUndefined();
      expect(cursor.next()).toBeUndefined();
      expect(cursor.hasNext()).toBe(false);
      expect(cursor.current()).toBeUndefined();
    });

    test('should restart traversal from the beginning after reset()', () => {
      const cursor = new ReadonlyArrayCursor([1, 2]);

      expect(cursor.next()).toBe(1);
      expect(cursor.next()).toBe(2);
      expect(cursor.hasNext()).toBe(false);

      cursor.reset();

      expect(cursor.current()).toBeUndefined();
      expect(cursor.hasNext()).toBe(true);
      expect(cursor.next()).toBe(1);
      expect(cursor.current()).toBe(1);
    });
  });

  describe('iterable and array materialization', () => {
    test('should support for..of and spread iteration independently of manual cursor position', () => {
      const cursor = new ReadonlyArrayCursor([10, 20, 30]);
      cursor.next();

      const collected: number[] = [];
      for (const value of cursor) {
        collected.push(value);
      }

      expect(collected).toEqual([10, 20, 30]);
      expect([...cursor]).toEqual([10, 20, 30]);
      expect(cursor.current()).toBe(10);
    });

    test('should materialize a fresh array with toArray() without changing cursor state', () => {
      const cursor = new ReadonlyArrayCursor([1, 2, 3]);
      cursor.next();

      const arr = cursor.toArray();
      expect(arr).toEqual([1, 2, 3]);
      expect(cursor.current()).toBe(1);

      arr.push(999);
      expect(cursor.toArray()).toEqual([1, 2, 3]);
    });
  });

  describe('item projection isolation', () => {
    test('should isolate underlying objects when cloneItem is provided', () => {
      const source = [{ values: [1, 2] }];
      const cursor = new ReadonlyArrayCursor(source, (item) => ({ values: [...item.values] }));

      const yielded = cursor.next();
      expect(yielded).toEqual({ values: [1, 2] });
      yielded!.values.push(99);

      cursor.reset();
      expect(cursor.next()).toEqual({ values: [1, 2] });
      expect(cursor.toArray()).toEqual([{ values: [1, 2] }]);
      expect(source[0]?.values).toEqual([1, 2]);
    });
  });
});
