import { describe, expect, test, vi } from 'vitest';

import type { ExecutableQueryNode } from '../../../../src/domain/query-analyzer/public-api.js';
import { MAX_NESTING_DEPTH } from '../../../../src/domain/query-parser/public-api.js';
import { QueryExecutor } from '../../../../src/domain/query-executor/public-api.js';
import {
  STOP_WORD_SLOT,
  and,
  buildIndex,
  nestNot,
  not,
  or,
  phrase,
  run,
  term,
  type QueryCase,
} from './fixtures.js';

const BOOLEAN_DOCS = [
  'cat dog',
  'cat bird',
  'dog bird',
  'cat dog bird',
  'fish', // single-word document
  '', // empty document
];
const ALL = [0, 1, 2, 3, 4, 5];
const CAT = [0, 1, 3];
const DOG = [0, 2, 3];
const BIRD = [1, 2, 3];
const FISH = [4];

const PHRASE_DOCS = [
  'brown pillow', // adjacent, in order
  'pillow brown', // reversed order
  'brown soft pillow', // another word in between
  'brown fox brown pillow', // match is the second occurrence of "brown"
  'brown _ pillow', // stop-word between the words
  'brown soft', // only the first word
  'soft pillow', // only the last word
  'brown pillow brown pillow', // several matches in one document
  'cat cat', // repeated term
  'cat dog cat', // repeated term, not adjacent
  'cat',
  '_ quick brown fox', // three-word phrase, leading stop-word
  'quick brown dog',
];
const PHRASE_UNIVERSE = Array.from({ length: PHRASE_DOCS.length }, (_unused, id) => id);

describe('Domain QueryExecutor', () => {
  const index = buildIndex(BOOLEAN_DOCS);

  describe(QueryExecutor.name, () => {
    describe('result contract', () => {
      test('should return a Set of document ids', () => {
        expect(new QueryExecutor(index).execute(term('cat'))).toBeInstanceOf(Set);
      });

      test('should return a new Set on every call so callers cannot corrupt later results', () => {
        const executor = new QueryExecutor(index);
        const first = executor.execute(term('cat'));
        first.add(99);
        first.delete(0);

        expect(run(term('cat'), index)).toStrictEqual(CAT);
      });

      test('should be deterministic when executing the same AST twice', () => {
        const ast = and(or(term('cat'), term('dog')), not(term('bird')));

        expect(run(ast, index)).toStrictEqual(run(ast, index));
      });

      test('should not modify the postings stored in the index', () => {
        const fresh = buildIndex(BOOLEAN_DOCS);
        const snapshot = () =>
          JSON.stringify(
            ['cat', 'dog', 'bird', 'fish'].map((value) => fresh.getPostings(value).toArray()),
          );
        const before = snapshot();

        run(or(and(term('cat'), not(term('dog'))), phrase('dog', 'bird')), fresh);

        expect(snapshot()).toBe(before);
      });

      test('should look up each term in the index exactly as written in the AST', () => {
        const spied = buildIndex(BOOLEAN_DOCS);
        const getPostings = vi.spyOn(spied, 'getPostings');

        run(and(term('cat'), term('dog')), spied);

        expect(getPostings).toHaveBeenCalledWith('cat');
        expect(getPostings).toHaveBeenCalledWith('dog');
        expect(getPostings).not.toHaveBeenCalledWith('bird');
      });
    });

    describe('terms', () => {
      test.each([
        { value: 'cat', expected: CAT },
        { value: 'dog', expected: DOG },
        { value: 'bird', expected: BIRD },
        { value: 'fish', expected: FISH },
      ])('should return every document containing "$value": $expected', ({ value, expected }) => {
        expect(run(term(value), index)).toStrictEqual(expected);
      });

      test('should return an empty result (not an error) for a term absent from the index', () => {
        expect(run(term('ghost'), index)).toStrictEqual([]);
      });
    });

    describe('AND', () => {
      test.each<QueryCase>([
        { query: 'cat AND dog', ast: and(term('cat'), term('dog')), expected: [0, 3] },
        { query: 'cat AND bird', ast: and(term('cat'), term('bird')), expected: [1, 3] },
        { query: 'dog AND bird', ast: and(term('dog'), term('bird')), expected: [2, 3] },
        {
          query: 'cat AND dog AND bird',
          ast: and(term('cat'), term('dog'), term('bird')),
          expected: [3],
        },
        { query: 'cat AND fish', ast: and(term('cat'), term('fish')), expected: [] },
        { query: 'cat AND ghost', ast: and(term('cat'), term('ghost')), expected: [] },
        { query: 'ghost AND cat', ast: and(term('ghost'), term('cat')), expected: [] },
      ])('should return the documents $expected for $query', ({ ast, expected }) => {
        expect(run(ast, index)).toStrictEqual(expected);
      });

      test('should short-circuit AND when the left operand evaluates to empty', () => {
        const spied = buildIndex(BOOLEAN_DOCS);
        const getPostings = vi.spyOn(spied, 'getPostings');

        expect(run(and(term('ghost'), term('cat')), spied)).toStrictEqual([]);
        expect(getPostings).toHaveBeenCalledWith('ghost');
        expect(getPostings).not.toHaveBeenCalledWith('cat');
      });
    });

    describe('OR', () => {
      test.each<QueryCase>([
        { query: 'cat OR dog', ast: or(term('cat'), term('dog')), expected: [0, 1, 2, 3] },
        { query: 'cat OR fish', ast: or(term('cat'), term('fish')), expected: [0, 1, 3, 4] },
        {
          query: 'cat OR dog OR bird',
          ast: or(term('cat'), term('dog'), term('bird')),
          expected: [0, 1, 2, 3],
        },
        { query: 'cat OR ghost', ast: or(term('cat'), term('ghost')), expected: CAT },
        { query: 'ghost OR cat', ast: or(term('ghost'), term('cat')), expected: CAT },
        { query: 'ghost OR phantom', ast: or(term('ghost'), term('phantom')), expected: [] },
      ])('should return the documents $expected for $query', ({ ast, expected }) => {
        expect(run(ast, index)).toStrictEqual(expected);
      });
    });

    describe('NOT', () => {
      test.each<QueryCase>([
        { query: 'NOT cat', ast: not(term('cat')), expected: [2, 4, 5] },
        { query: 'NOT fish', ast: not(term('fish')), expected: [0, 1, 2, 3, 5] },
        { query: 'NOT ghost', ast: not(term('ghost')), expected: ALL },
        { query: 'NOT NOT cat', ast: not(not(term('cat'))), expected: CAT },
        { query: 'NOT (cat OR dog)', ast: not(or(term('cat'), term('dog'))), expected: [4, 5] },
        {
          query: 'NOT (cat AND dog)',
          ast: not(and(term('cat'), term('dog'))),
          expected: [1, 2, 4, 5],
        },
      ])('should return the documents $expected for $query', ({ ast, expected }) => {
        expect(run(ast, index)).toStrictEqual(expected);
      });

      test('should evaluate AND NOT via set subtraction without reading universe documentCount', () => {
        const spied = buildIndex(BOOLEAN_DOCS);
        const docCountSpy = vi.spyOn(spied, 'documentCount', 'get');

        expect(run(and(term('cat'), not(term('dog'))), spied)).toStrictEqual([1]);
        expect(run(and(not(term('cat')), term('dog')), spied)).toStrictEqual([2]);
        expect(docCountSpy).not.toHaveBeenCalled();
      });

      test('should short-circuit NOT A AND B when B is empty without looking up A', () => {
        const spied = buildIndex(BOOLEAN_DOCS);
        const getPostings = vi.spyOn(spied, 'getPostings');

        expect(run(and(not(term('cat')), term('ghost')), spied)).toStrictEqual([]);
        expect(getPostings).toHaveBeenCalledWith('ghost');
        expect(getPostings).not.toHaveBeenCalledWith('cat');
      });
    });

    describe('combined queries and tree structure', () => {
      test.each<QueryCase>([
        { query: 'cat AND NOT dog', ast: and(term('cat'), not(term('dog'))), expected: [1] },
        { query: 'NOT cat AND dog', ast: and(not(term('cat')), term('dog')), expected: [2] },
        {
          query: 'NOT cat AND NOT dog',
          ast: and(not(term('cat')), not(term('dog'))),
          expected: [4, 5],
        },
        {
          query: '(cat OR dog) AND bird',
          ast: and(or(term('cat'), term('dog')), term('bird')),
          expected: [1, 2, 3],
        },
        {
          query: 'cat OR (dog AND bird)',
          ast: or(term('cat'), and(term('dog'), term('bird'))),
          expected: [0, 1, 2, 3],
        },
        {
          query: 'NOT cat AND (dog OR bird)',
          ast: and(not(term('cat')), or(term('dog'), term('bird'))),
          expected: [2],
        },
        {
          query: '(cat OR fish) AND NOT (dog AND bird)',
          ast: and(or(term('cat'), term('fish')), not(and(term('dog'), term('bird')))),
          expected: [0, 1, 4],
        },
        {
          query: 'cat AND NOT ghost',
          ast: and(term('cat'), not(term('ghost'))),
          expected: CAT,
        },
      ])('should return the documents $expected for $query', ({ ast, expected }) => {
        expect(run(ast, index)).toStrictEqual(expected);
      });

      test('should evaluate the tree as built: (cat OR dog) AND bird differs from cat OR (dog AND bird)', () => {
        const grouped = run(and(or(term('cat'), term('dog')), term('bird')), index);
        const regrouped = run(or(term('cat'), and(term('dog'), term('bird'))), index);

        expect(grouped).not.toStrictEqual(regrouped);
      });
    });

    describe('nesting and long chains', () => {
      test.each([0, 1, 2, MAX_NESTING_DEPTH - 1, MAX_NESTING_DEPTH, MAX_NESTING_DEPTH + 1])(
        'should give the term or its complement depending on parity when NOT is applied %i times',
        (depth) => {
          expect(run(nestNot(depth, term('cat')), index)).toStrictEqual(
            depth % 2 === 0 ? CAT : [2, 4, 5],
          );
        },
      );

      test.each([50, 1_000])('should handle a left-deep chain of %i AND operands', (length) => {
        const operands = Array.from({ length }, () => term('cat'));

        expect(run(and(operands[0]!, ...operands.slice(1)), index)).toStrictEqual(CAT);
      });

      test.each([50, 1_000])('should handle a left-deep chain of %i OR operands', (length) => {
        const operands = Array.from({ length }, () => term('cat'));

        expect(run(or(operands[0]!, ...operands.slice(1)), index)).toStrictEqual(CAT);
      });

      test('should handle a right-deep chain of 1000 AND and OR operands without stack overflow', () => {
        const rightDeepAnd = Array.from({ length: 999 }).reduce<ExecutableQueryNode>(
          (acc) => ({ type: 'and', left: term('cat'), right: acc }),
          term('dog'),
        );
        const rightDeepOr = Array.from({ length: 999 }).reduce<ExecutableQueryNode>(
          (acc) => ({ type: 'or', left: term('cat'), right: acc }),
          term('fish'),
        );

        expect(run(rightDeepAnd, index)).toStrictEqual([0, 3]);
        expect(run(rightDeepOr, index)).toStrictEqual([0, 1, 3, 4]);
      });
    });

    describe('phrases', () => {
      const phraseIndex = buildIndex(PHRASE_DOCS);

      test.each<QueryCase>([
        { query: '"brown pillow"', ast: phrase('brown', 'pillow'), expected: [0, 3, 7] },
        { query: '"pillow brown"', ast: phrase('pillow', 'brown'), expected: [1, 7] },
        { query: '"brown fox"', ast: phrase('brown', 'fox'), expected: [3, 11] },
        { query: '"quick brown fox"', ast: phrase('quick', 'brown', 'fox'), expected: [11] },
        { query: '"cat cat"', ast: phrase('cat', 'cat'), expected: [8] },
        { query: '"brown ghost"', ast: phrase('brown', 'ghost'), expected: [] },
        { query: '"ghost pillow"', ast: phrase('ghost', 'pillow'), expected: [] },
        { query: '"cat pillow"', ast: phrase('cat', 'pillow'), expected: [] },
      ])('should return the documents $expected for $query', ({ ast, expected }) => {
        expect(run(ast, phraseIndex)).toStrictEqual(expected);
      });

      test('should return an empty result for an empty phrase', () => {
        expect(run(phrase(), phraseIndex)).toStrictEqual([]);
      });

      test('should match a single-term phrase even with a non-zero leading offset', () => {
        expect(run(phrase(null, null, 'fox'), phraseIndex)).toStrictEqual([3, 11]);
      });

      test('should stop querying later phrase terms as soon as an earlier term is absent from the index', () => {
        const spied = buildIndex(['brown pillow', 'quick fox']);
        const getPostings = vi.spyOn(spied, 'getPostings');

        expect(run(phrase('ghost', 'brown', 'pillow'), spied)).toStrictEqual([]);
        expect(getPostings).toHaveBeenCalledTimes(1);
        expect(getPostings).toHaveBeenCalledWith('ghost');
        expect(getPostings).not.toHaveBeenCalledWith('brown');
      });

      test('should query the index only once for a repeated term inside a phrase', () => {
        const spied = buildIndex(['cat cat', 'cat dog cat']);
        const getPostings = vi.spyOn(spied, 'getPostings');

        expect(run(phrase('cat', 'cat'), spied)).toStrictEqual([0]);
        expect(getPostings).toHaveBeenCalledTimes(1);
        expect(getPostings).toHaveBeenCalledWith('cat');
      });

      test('should match accurately when the rarest term is in the middle of the phrase', () => {
        const rarestMidIndex = buildIndex([
          'alpha beta gamma',
          'alpha rare gamma',
          'alpha beta',
          'alpha beta rare',
          'alpha beta gamma rare',
          'other alpha rare gamma',
        ]);

        expect(run(phrase('alpha', 'rare', 'gamma'), rarestMidIndex)).toStrictEqual([1, 5]);
      });

      describe('with stop-words inside the phrase', () => {
        test.each<QueryCase>([
          {
            query: '"brown <stop> pillow"',
            ast: phrase('brown', null, 'pillow'),
            expected: [2, 4],
          },
          { query: '"cat <stop> cat"', ast: phrase('cat', null, 'cat'), expected: [9] },
          { query: '"quick <stop> fox"', ast: phrase('quick', null, 'fox'), expected: [11] },
          {
            query: '"<stop> quick brown fox"',
            ast: phrase(null, 'quick', 'brown', 'fox'),
            expected: [11],
          },
          {
            query: '"brown <stop> <stop> pillow"',
            ast: phrase('brown', null, null, 'pillow'),
            expected: [3, 7],
          },
        ])('should return the documents $expected for $query', ({ ast, expected }) => {
          expect(run(ast, phraseIndex)).toStrictEqual(expected);
        });
      });

      describe('combined with boolean operators', () => {
        test.each<QueryCase>([
          {
            query: '"brown pillow" AND brown',
            ast: and(phrase('brown', 'pillow'), term('brown')),
            expected: [0, 3, 7],
          },
          {
            query: '"brown pillow" OR "cat cat"',
            ast: or(phrase('brown', 'pillow'), phrase('cat', 'cat')),
            expected: [0, 3, 7, 8],
          },
          {
            query: '"brown fox" AND NOT "quick brown fox"',
            ast: and(phrase('brown', 'fox'), not(phrase('quick', 'brown', 'fox'))),
            expected: [3],
          },
          {
            query: 'NOT "brown pillow"',
            ast: not(phrase('brown', 'pillow')),
            expected: PHRASE_UNIVERSE.filter((id) => ![0, 3, 7].includes(id)),
          },
          {
            query: 'NOT "brown ghost"',
            ast: not(phrase('brown', 'ghost')),
            expected: PHRASE_UNIVERSE,
          },
        ])('should return the documents $expected for $query', ({ ast, expected }) => {
          expect(run(ast, phraseIndex)).toStrictEqual(expected);
        });
      });
    });

    describe('edge cases', () => {
      test('should return an empty result for a term in an index without documents', () => {
        expect(run(term('cat'), buildIndex([]))).toStrictEqual([]);
      });

      test('should return an empty result for NOT in an index without documents because the universe is empty', () => {
        expect(run(not(term('cat')), buildIndex([]))).toStrictEqual([]);
      });

      test('should return an empty result for a phrase in an index without documents', () => {
        expect(run(phrase('brown', 'pillow'), buildIndex([]))).toStrictEqual([]);
      });

      test('should find nothing for a term but the document for NOT in an index with one empty document', () => {
        const emptyOnly = buildIndex(['']);

        expect(run(term('cat'), emptyOnly)).toStrictEqual([]);
        expect(run(not(term('cat')), emptyOnly)).toStrictEqual([0]);
      });

      test('should find a single-word document by its only word', () => {
        const single = buildIndex(['cat']);

        expect(run(term('cat'), single)).toStrictEqual([0]);
        expect(run(not(term('cat')), single)).toStrictEqual([]);
        expect(run(not(term('ghost')), single)).toStrictEqual([0]);
      });

      test('should keep a document made only of stop-word slots in the universe without matching any term', () => {
        const onlyStopWords = buildIndex(['cat', `${STOP_WORD_SLOT} ${STOP_WORD_SLOT}`]);

        expect(run(term('cat'), onlyStopWords)).toStrictEqual([0]);
        expect(run(not(term('cat')), onlyStopWords)).toStrictEqual([1]);
      });

      test('should return every document for a query that matches all of them', () => {
        expect(run(or(term('cat'), not(term('cat'))), index)).toStrictEqual(ALL);
      });

      test('should return an empty result (not an error) for a query that matches nothing', () => {
        expect(run(and(term('cat'), not(term('cat'))), index)).toStrictEqual([]);
      });
    });
  });
});
