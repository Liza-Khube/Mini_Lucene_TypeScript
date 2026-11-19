import { describe, expect, test } from 'vitest';

import {
  analyzeQuery,
  extractPositiveTerms,
  type ExecutableQueryNode,
} from '../../../../src/domain/query-analyzer/public-api.js';
import { MAX_NESTING_DEPTH, parseQuery } from '../../../../src/domain/query-parser/public-api.js';

const fromQuery = (query: string): string[] =>
  extractPositiveTerms(analyzeQuery(parseQuery(query)));

const term = (value: string): ExecutableQueryNode => ({ type: 'term', value });

const not = (operand: ExecutableQueryNode): ExecutableQueryNode => ({
  type: 'not',
  operand,
});

const nestNot = (depth: number, inner: ExecutableQueryNode): ExecutableQueryNode =>
  Array.from({ length: depth }).reduce<ExecutableQueryNode>((node) => not(node), inner);

describe('Domain QueryAnalyzer', () => {
  describe(extractPositiveTerms.name, () => {
    describe('empty and null inputs', () => {
      test('should return [] when input AST is null', () => {
        expect(extractPositiveTerms(null)).toStrictEqual([]);
      });

      test.each([
        { name: 'blank query', query: '' },
        { name: 'stop-word-only AND query', query: 'the AND of' },
        { name: 'negated stop-word query', query: 'NOT the' },
      ])('should return [] for $name ($query)', ({ query }) => {
        expect(fromQuery(query)).toStrictEqual([]);
      });

      test('should return [] for an empty phrase node', () => {
        expect(extractPositiveTerms({ type: 'phrase', terms: [] })).toStrictEqual([]);
      });
    });

    describe('terms and phrases', () => {
      test.each([
        { name: 'single stemmed term', query: 'cats', expected: ['cat'] },
        { name: 'simple phrase', query: '"brown pillows"', expected: ['brown', 'pillow'] },
        {
          name: 'phrase with stop words',
          query: '"the brown of pillows in"',
          expected: ['brown', 'pillow'],
        },
        { name: 'repeated term inside a phrase', query: '"cat cat"', expected: ['cat'] },
      ])('should extract $expected for $name', ({ query, expected }) => {
        expect(fromQuery(query)).toStrictEqual(expected);
      });
    });

    describe('boolean operators', () => {
      test.each([
        { name: 'explicit AND', query: 'cats AND dogs', expected: ['cat', 'dog'] },
        { name: 'implicit AND', query: 'cats dogs', expected: ['cat', 'dog'] },
        { name: 'OR', query: 'cats OR dogs', expected: ['cat', 'dog'] },
        {
          name: 'combined parenthesized expression with phrase',
          query: '(cats OR "brown pillows") AND dogs',
          expected: ['cat', 'brown', 'pillow', 'dog'],
        },
        {
          name: 'repeated term across boolean branches',
          query: 'cats AND (cats OR dogs)',
          expected: ['cat', 'dog'],
        },
        {
          name: 'term shared with a phrase',
          query: 'cats AND "cats dogs"',
          expected: ['cat', 'dog'],
        },
      ])('should extract unique terms in left-to-right order for $name', ({ query, expected }) => {
        expect(fromQuery(query)).toStrictEqual(expected);
      });
    });

    describe('NOT and negation parity', () => {
      test.each([
        { query: 'NOT soup', expected: [] },
        { query: 'NOT "brown pillow"', expected: [] },
        { query: 'people AND NOT soup', expected: ['peopl'] },
        { query: 'NOT soup AND people', expected: ['peopl'] },
        { query: 'cats OR NOT dogs', expected: ['cat'] },
        { query: 'NOT NOT cats', expected: ['cat'] },
        { query: 'NOT NOT "brown pillow"', expected: ['brown', 'pillow'] },
        { query: 'NOT NOT NOT cats', expected: [] },
        { query: 'NOT (cats OR dogs)', expected: [] },
        { query: 'NOT (cats AND dogs)', expected: [] },
        { query: 'NOT (cats AND NOT dogs)', expected: ['dog'] },
        { query: 'NOT (NOT cats OR NOT dogs)', expected: ['cat', 'dog'] },
        { query: 'NOT cats OR cats', expected: ['cat'] },
        { query: '(cats AND NOT dogs) OR dogs', expected: ['cat', 'dog'] },
      ])('should return $expected for "$query"', ({ query, expected }) => {
        expect(fromQuery(query)).toStrictEqual(expected);
      });
    });

    describe('deep nesting and long chains', () => {
      test.each([0, 1, 2, MAX_NESTING_DEPTH - 1, MAX_NESTING_DEPTH, MAX_NESTING_DEPTH + 1, 1_000])(
        'should track negation parity accurately when NOT is nested %i times',
        (depth) => {
          expect(extractPositiveTerms(nestNot(depth, term('cat')))).toStrictEqual(
            depth % 2 === 0 ? ['cat'] : [],
          );
        },
      );

      test('should handle left-deep chains of 1000 AND and OR operands without stack overflow', () => {
        const leftDeepAnd = Array.from({ length: 999 }).reduce<ExecutableQueryNode>(
          (acc, _unused, i) => ({ type: 'and', left: acc, right: term(`t${i}`) }),
          term('start'),
        );
        const leftDeepOr = Array.from({ length: 999 }).reduce<ExecutableQueryNode>(
          (acc, _unused, i) => ({ type: 'or', left: acc, right: term(`t${i}`) }),
          term('start'),
        );

        const andTerms = extractPositiveTerms(leftDeepAnd);
        const orTerms = extractPositiveTerms(leftDeepOr);

        expect(andTerms).toHaveLength(1_000);
        expect(andTerms[0]).toBe('start');
        expect(andTerms[999]).toBe('t998');
        expect(orTerms).toStrictEqual(andTerms);
      });

      test('should handle right-deep chains of 1000 AND and OR operands without stack overflow', () => {
        const rightDeepAnd = Array.from({ length: 999 }).reduce<ExecutableQueryNode>(
          (acc, _unused, i) => ({ type: 'and', left: term(`t${i}`), right: acc }),
          term('end'),
        );
        const rightDeepOr = Array.from({ length: 999 }).reduce<ExecutableQueryNode>(
          (acc, _unused, i) => ({ type: 'or', left: term(`t${i}`), right: acc }),
          term('end'),
        );

        const andTerms = extractPositiveTerms(rightDeepAnd);
        const orTerms = extractPositiveTerms(rightDeepOr);

        expect(andTerms).toHaveLength(1_000);
        expect(andTerms[0]).toBe('t998');
        expect(andTerms[999]).toBe('end');
        expect(orTerms).toStrictEqual(andTerms);
      });
    });

    describe('contract and errors', () => {
      test('should be deterministic across repeated calls', () => {
        const ast = analyzeQuery(parseQuery('(cats OR "brown pillows") AND NOT dogs'));

        expect(extractPositiveTerms(ast)).toStrictEqual(extractPositiveTerms(ast));
      });

      test('should not mutate the input AST', () => {
        const frozenAst: ExecutableQueryNode = Object.freeze({
          type: 'and',
          left: Object.freeze({
            type: 'phrase',
            terms: Object.freeze([
              Object.freeze({ value: 'brown', offset: 0 }),
              Object.freeze({ value: 'pillow', offset: 1 }),
            ]),
          }),
          right: Object.freeze({
            type: 'not',
            operand: Object.freeze({ type: 'term', value: 'dog' }),
          }),
        });

        expect(extractPositiveTerms(frozenAst)).toStrictEqual(['brown', 'pillow']);
      });

      test('should throw Error for an unknown AST node type', () => {
        const broken = { type: 'xor' } as unknown as ExecutableQueryNode;

        expect(() => extractPositiveTerms(broken)).toThrow('Unknown query node type: "xor"');
      });
    });
  });
});
