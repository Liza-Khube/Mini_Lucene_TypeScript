import { describe, expect, test } from 'vitest';

import {
  analyzeQuery,
  type ExecutableQueryNode,
} from '../../../../src/domain/query-analyzer/public-api.js';
import { parseQuery, type QueryNode } from '../../../../src/domain/query-parser/public-api.js';

describe('Domain QueryAnalyzer', () => {
  describe(analyzeQuery.name, () => {
    test('should return null when input AST is null', () => {
      expect(analyzeQuery(null)).toBeNull();
    });

    describe('terms', () => {
      test.each([
        { raw: 'pillows', expected: 'pillow' },
        { raw: 'People', expected: 'peopl' },
        { raw: 'running', expected: 'run' },
        { raw: 'cats', expected: 'cat' },
      ])('should normalize and stem "$raw" to "$expected"', ({ raw, expected }) => {
        expect(analyzeQuery({ type: 'term', value: raw })).toStrictEqual({
          type: 'term',
          value: expected,
        });
      });

      test.each(['the', 'and', 'or', 'not', 'of', 'in', 'THE', ''])(
        'should drop stop-word or empty term %j by returning null',
        (raw) => {
          expect(analyzeQuery({ type: 'term', value: raw })).toBeNull();
        },
      );
    });

    describe('phrases', () => {
      test('should stem terms and assign zero-based offsets when no stop words are present', () => {
        expect(analyzeQuery(parseQuery('"brown pillows"'))).toStrictEqual({
          type: 'phrase',
          terms: [
            { value: 'brown', offset: 0 },
            { value: 'pillow', offset: 1 },
          ],
        });
      });

      test('should omit leading, middle, and trailing stop words while preserving offsets', () => {
        expect(analyzeQuery(parseQuery('"the brown of pillows in"'))).toStrictEqual({
          type: 'phrase',
          terms: [
            { value: 'brown', offset: 1 },
            { value: 'pillow', offset: 3 },
          ],
        });
      });

      test('should return null for a phrase containing only stop words', () => {
        expect(analyzeQuery(parseQuery('"the and of"'))).toBeNull();
      });

      test('should drop empty strings inside manual phrase node while keeping offsets', () => {
        expect(analyzeQuery({ type: 'phrase', terms: ['', 'cats'] })).toStrictEqual({
          type: 'phrase',
          terms: [{ value: 'cat', offset: 1 }],
        });
      });
    });

    describe('boolean pruning', () => {
      test('should drop stop-word operands from implicit and explicit AND', () => {
        expect(analyzeQuery(parseQuery('people and soup'))).toStrictEqual({
          type: 'and',
          left: { type: 'term', value: 'peopl' },
          right: { type: 'term', value: 'soup' },
        });
        expect(analyzeQuery(parseQuery('the AND cats'))).toStrictEqual({
          type: 'term',
          value: 'cat',
        });
        expect(analyzeQuery(parseQuery('cats AND of'))).toStrictEqual({
          type: 'term',
          value: 'cat',
        });
      });

      test('should drop stop-word operands from OR', () => {
        expect(analyzeQuery(parseQuery('the OR dogs'))).toStrictEqual({
          type: 'term',
          value: 'dog',
        });
        expect(analyzeQuery(parseQuery('dogs OR in'))).toStrictEqual({
          type: 'term',
          value: 'dog',
        });
      });

      test('should return null when all operands in AND or OR are stop words', () => {
        expect(analyzeQuery(parseQuery('the AND of'))).toBeNull();
        expect(analyzeQuery(parseQuery('the OR of'))).toBeNull();
      });

      test('should return null for NOT when its operand reduces to null, and preserve NOT otherwise', () => {
        expect(analyzeQuery(parseQuery('NOT the'))).toBeNull();
        expect(analyzeQuery(parseQuery('NOT "the and of"'))).toBeNull();
        expect(analyzeQuery(parseQuery('NOT cats'))).toStrictEqual({
          type: 'not',
          operand: { type: 'term', value: 'cat' },
        });
      });

      test('should collapse nested expressions where entire subtrees are stop words', () => {
        expect(analyzeQuery(parseQuery('(the AND of) OR (cats AND NOT in)'))).toStrictEqual({
          type: 'term',
          value: 'cat',
        });
      });
    });
  });
});
