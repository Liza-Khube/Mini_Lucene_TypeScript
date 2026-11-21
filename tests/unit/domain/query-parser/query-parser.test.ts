import { describe, expect, test } from 'vitest';
import {
  MAX_NESTING_DEPTH,
  ParseError,
  parseQuery,
} from '../../../../src/domain/query-parser/public-api.js';
import { and, nest, not, or, phrase, term } from './fixtures.js';

describe('Domain QueryParser', () => {
  describe(parseQuery.name, () => {
    describe('empty queries', () => {
      test.each([
        ['empty string', ''],
        ['single space', ' '],
        ['multiple spaces', '    '],
        ['tab', '\t'],
        ['newline', '\n'],
        ['mixed whitespace', ' \t\r\n '],
        ['exclamation marks', '!!!'],
        ['punctuation', ',.;:'],
        ['hyphens', '---'],
        ['emoji', '🐱'],
        ['non-latin letters', 'кіт'],
      ])(
        'should return null (not an error) for %s (%j) because it contains no tokens',
        (_description, query) => {
          expect(parseQuery(query)).toBeNull();
        },
      );
    });

    describe('terms', () => {
      test.each([
        { query: 'cat', expected: 'cat' },
        { query: 'Cat', expected: 'cat' },
        { query: 'CAT', expected: 'cat' },
        { query: '  cat  ', expected: 'cat' },
        { query: '\tcat\n', expected: 'cat' },
        { query: 'cat2', expected: 'cat2' },
        { query: '2024', expected: '2024' },
        { query: 'c4t', expected: 'c4t' },
      ])('should parse $query into a term node with value "$expected"', ({ query, expected }) => {
        expect(parseQuery(query)).toStrictEqual(term(expected));
      });

      test.each([
        { query: 'cat-dog', expected: and(term('cat'), term('dog')) },
        { query: 'cat,dog', expected: and(term('cat'), term('dog')) },
        { query: 'cat.dog', expected: and(term('cat'), term('dog')) },
        { query: 'cat_dog', expected: and(term('cat'), term('dog')) },
        { query: 'cat/dog', expected: and(term('cat'), term('dog')) },
        { query: "don't", expected: and(term('don'), term('t')) },
        { query: 'café', expected: term('caf') },
        { query: 'naïve', expected: and(term('na'), term('ve')) },
        { query: '🐱 cat', expected: term('cat') },
        { query: 'кіт cat', expected: term('cat') },
      ])(
        'should treat every character outside a-z0-9 as a separator in $query',
        ({ query, expected }) => {
          expect(parseQuery(query)).toStrictEqual(expected);
        },
      );

      test.each([
        { query: 'catt', expected: 'catt' },
        { query: 'running', expected: 'running' },
        { query: 'People', expected: 'people' },
      ])('should not stem the term $query', ({ query, expected }) => {
        expect(parseQuery(query)).toStrictEqual(term(expected));
      });

      test.each(['the', 'THE', 'a', 'is', 'with'])(
        'should keep the stop-word %j as a regular term',
        (query) => {
          expect(parseQuery(query)).toStrictEqual(term(query.toLowerCase()));
        },
      );
    });

    describe('operator recognition', () => {
      test.each([
        { query: 'and', expected: 'and' },
        { query: 'or', expected: 'or' },
        { query: 'not', expected: 'not' },
        { query: 'And', expected: 'and' },
        { query: 'Or', expected: 'or' },
        { query: 'Not', expected: 'not' },
        { query: 'aNd', expected: 'and' },
        { query: 'oR', expected: 'or' },
        { query: 'nOt', expected: 'not' },
      ])(
        'should treat $query as an ordinary term "$expected" because operators are uppercase only',
        ({ query, expected }) => {
          expect(parseQuery(query)).toStrictEqual(term(expected));
        },
      );

      test.each([
        { query: 'cat and dog', expected: and(and(term('cat'), term('and')), term('dog')) },
        { query: 'cat or dog', expected: and(and(term('cat'), term('or')), term('dog')) },
        { query: 'not cat', expected: and(term('not'), term('cat')) },
        { query: 'cat And dog', expected: and(and(term('cat'), term('and')), term('dog')) },
      ])(
        'should parse lowercase / mixed-case operators in $query as plain terms joined by implicit AND',
        ({ query, expected }) => {
          expect(parseQuery(query)).toStrictEqual(expected);
        },
      );

      test.each([
        { query: 'ANDROID', expected: 'android' },
        { query: 'ORANGE', expected: 'orange' },
        { query: 'NOTE', expected: 'note' },
        { query: 'NOTHING', expected: 'nothing' },
        { query: 'ORDER', expected: 'order' },
        { query: 'BAND', expected: 'band' },
        { query: 'CANDY', expected: 'candy' },
        { query: 'AND1', expected: 'and1' },
        { query: 'OR2', expected: 'or2' },
        { query: 'NOT3', expected: 'not3' },
      ])('should not mistake the word $query for an operator', ({ query, expected }) => {
        expect(parseQuery(query)).toStrictEqual(term(expected));
      });

      test.each([
        { query: 'cat AND dog', expected: and(term('cat'), term('dog')) },
        { query: 'cat OR dog', expected: or(term('cat'), term('dog')) },
        { query: 'NOT cat', expected: not(term('cat')) },
        { query: 'cat AND NOT dog', expected: and(term('cat'), not(term('dog'))) },
        { query: 'cat OR NOT dog', expected: or(term('cat'), not(term('dog'))) },
        { query: 'NOT cat AND NOT dog', expected: and(not(term('cat')), not(term('dog'))) },
        { query: 'NOT NOT cat', expected: not(not(term('cat'))) },
        {
          query: 'cat AND dog OR NOT bird',
          expected: or(and(term('cat'), term('dog')), not(term('bird'))),
        },
      ])(
        'should parse the uppercase operator query $query into the expected AST',
        ({ query, expected }) => {
          expect(parseQuery(query)).toStrictEqual(expected);
        },
      );
    });

    describe('whitespace handling', () => {
      test.each([
        { messy: '  cat \t AND \n dog  ', clean: 'cat AND dog' },
        { messy: 'cat      OR      dog', clean: 'cat OR dog' },
        { messy: '(cat)AND(dog)', clean: '(cat) AND (dog)' },
        { messy: 'cat AND(dog OR bird)', clean: 'cat AND (dog OR bird)' },
        { messy: 'NOT(cat)', clean: 'NOT cat' },
        { messy: '(  cat  )', clean: '(cat)' },
        { messy: '(cat)AND(dog OR NOT(bird))', clean: '(cat) AND (dog OR NOT (bird))' },
      ])('should parse $messy the same way as the normalized $clean', ({ messy, clean }) => {
        expect(parseQuery(messy)).toStrictEqual(parseQuery(clean));
      });
    });

    describe('implicit AND', () => {
      test.each([
        { query: 'people soup', expected: and(term('people'), term('soup')) },
        { query: 'cat dog bird', expected: and(and(term('cat'), term('dog')), term('bird')) },
        { query: 'cat NOT dog', expected: and(term('cat'), not(term('dog'))) },
        { query: 'cat (dog OR bird)', expected: and(term('cat'), or(term('dog'), term('bird'))) },
        { query: '(cat) (dog)', expected: and(term('cat'), term('dog')) },
        { query: 'cat "brown pillow"', expected: and(term('cat'), phrase('brown', 'pillow')) },
        { query: '"brown pillow" cat', expected: and(phrase('brown', 'pillow'), term('cat')) },
        { query: '"brown pillow"cat', expected: and(phrase('brown', 'pillow'), term('cat')) },
        {
          query: '"brown pillow""red cat"',
          expected: and(phrase('brown', 'pillow'), phrase('red', 'cat')),
        },
        {
          query: '"brown pillow""red cat"dog',
          expected: and(and(phrase('brown', 'pillow'), phrase('red', 'cat')), term('dog')),
        },
      ])('should join adjacent operands of $query with AND', ({ query, expected }) => {
        expect(parseQuery(query)).toStrictEqual(expected);
      });

      test.each([
        { implicit: 'people soup', explicit: 'people AND soup' },
        { implicit: 'cat dog bird', explicit: 'cat AND dog AND bird' },
        { implicit: 'cat NOT dog', explicit: 'cat AND NOT dog' },
        { implicit: 'cat (dog OR bird)', explicit: 'cat AND (dog OR bird)' },
        { implicit: '(cat) (dog)', explicit: '(cat) AND (dog)' },
        { implicit: 'cat "brown pillow"', explicit: 'cat AND "brown pillow"' },
      ])(
        'should produce the same AST for $implicit as for the explicit $explicit',
        ({ implicit, explicit }) => {
          expect(parseQuery(implicit)).toStrictEqual(parseQuery(explicit));
        },
      );

      test.each([
        { query: 'cat dog AND bird', expected: and(and(term('cat'), term('dog')), term('bird')) },
        { query: 'cat AND dog bird', expected: and(and(term('cat'), term('dog')), term('bird')) },
      ])(
        'should mix implicit and explicit AND in $query with left associativity',
        ({ query, expected }) => {
          expect(parseQuery(query)).toStrictEqual(expected);
        },
      );

      test.each([
        { query: 'cat dog OR bird', expected: or(and(term('cat'), term('dog')), term('bird')) },
        { query: 'cat OR dog bird', expected: or(term('cat'), and(term('dog'), term('bird'))) },
      ])(
        'should give implicit AND the same precedence as explicit AND in $query',
        ({ query, expected }) => {
          expect(parseQuery(query)).toStrictEqual(expected);
        },
      );

      test('should apply NOT only to the operand directly after it, not to the following implicit AND operand', () => {
        expect(parseQuery('NOT cat dog')).toStrictEqual(and(not(term('cat')), term('dog')));
      });
    });

    describe('operator precedence and associativity', () => {
      test.each([
        { query: 'cat OR dog AND bird', expected: or(term('cat'), and(term('dog'), term('bird'))) },
        { query: 'cat AND dog OR bird', expected: or(and(term('cat'), term('dog')), term('bird')) },
        { query: 'NOT cat AND dog', expected: and(not(term('cat')), term('dog')) },
        { query: 'cat AND NOT dog', expected: and(term('cat'), not(term('dog'))) },
        { query: 'NOT cat OR dog', expected: or(not(term('cat')), term('dog')) },
        { query: 'cat OR NOT dog', expected: or(term('cat'), not(term('dog'))) },
        {
          query: 'cat OR dog AND bird OR fish',
          expected: or(or(term('cat'), and(term('dog'), term('bird'))), term('fish')),
        },
      ])('should apply the precedence NOT > AND > OR in $query', ({ query, expected }) => {
        expect(parseQuery(query)).toStrictEqual(expected);
      });

      test.each([
        {
          query: 'cat AND dog AND bird',
          expected: and(and(term('cat'), term('dog')), term('bird')),
        },
        { query: 'cat OR dog OR bird', expected: or(or(term('cat'), term('dog')), term('bird')) },
      ])('should group repeated operators in $query from the left', ({ query, expected }) => {
        expect(parseQuery(query)).toStrictEqual(expected);
      });

      test.each([
        {
          query: '(cat OR dog) AND bird',
          expected: and(or(term('cat'), term('dog')), term('bird')),
        },
        {
          query: 'cat AND (dog OR bird)',
          expected: and(term('cat'), or(term('dog'), term('bird'))),
        },
        {
          query: '(cat OR dog) AND (bird OR fish)',
          expected: and(or(term('cat'), term('dog')), or(term('bird'), term('fish'))),
        },
        { query: 'NOT (cat OR dog)', expected: not(or(term('cat'), term('dog'))) },
        { query: 'NOT (cat AND NOT dog)', expected: not(and(term('cat'), not(term('dog')))) },
        {
          query: 'cat AND (dog AND bird)',
          expected: and(term('cat'), and(term('dog'), term('bird'))),
        },
      ])('should let parentheses override the default order in $query', ({ query, expected }) => {
        expect(parseQuery(query)).toStrictEqual(expected);
      });
    });

    describe('parentheses', () => {
      test.each(['(cat)', '((cat))', '((((cat))))', '( ( cat ) )'])(
        'should unwrap redundant parentheses in %j so the result equals the plain term',
        (query) => {
          expect(parseQuery(query)).toStrictEqual(term('cat'));
        },
      );

      test('should keep redundant parentheses around a sub-expression transparent', () => {
        expect(parseQuery('cat AND ((dog))')).toStrictEqual(and(term('cat'), term('dog')));
      });

      test(`should accept parentheses nested exactly ${MAX_NESTING_DEPTH} levels deep`, () => {
        expect(parseQuery(nest(MAX_NESTING_DEPTH, 'cat'))).toStrictEqual(term('cat'));
      });

      test(`should accept a boolean expression nested exactly ${MAX_NESTING_DEPTH} levels deep`, () => {
        expect(parseQuery(nest(MAX_NESTING_DEPTH, 'cat OR dog'))).toStrictEqual(
          or(term('cat'), term('dog')),
        );
      });

      test.each([MAX_NESTING_DEPTH + 1, 1_000, 100_000])(
        'should throw ParseError (not a stack overflow) for parentheses nested %i levels deep',
        (depth) => {
          expect(() => parseQuery(nest(depth, 'cat'))).toThrow(ParseError);
        },
      );

      test('should throw ParseError (not a stack overflow) for 100000 unclosed opening parentheses', () => {
        expect(() => parseQuery('('.repeat(100_000))).toThrow(ParseError);
      });

      test('should not count sequential (non-nested) groups towards the depth limit', () => {
        const count = MAX_NESTING_DEPTH * 2;
        const query = Array.from({ length: count }, () => '(cat)').join(' AND ');

        expect(() => parseQuery(query)).not.toThrow();
        expect(parseQuery(query)?.type).toBe('and');
      });
    });

    describe('phrases', () => {
      test.each([
        { query: '"brown pillow"', terms: ['brown', 'pillow'] },
        { query: '"Brown PILLOW"', terms: ['brown', 'pillow'] },
        { query: '"  brown    pillow  "', terms: ['brown', 'pillow'] },
        { query: '"brown-pillow"', terms: ['brown', 'pillow'] },
        { query: '"cat"', terms: ['cat'] },
        { query: '"one two three four five"', terms: ['one', 'two', 'three', 'four', 'five'] },
      ])('should parse $query into a phrase node with the terms $terms', ({ query, terms }) => {
        expect(parseQuery(query)).toStrictEqual(phrase(...terms));
      });

      test('should keep stop-words inside a phrase so the executor can account for their positions', () => {
        expect(parseQuery('"the brown pillow"')).toStrictEqual(phrase('the', 'brown', 'pillow'));
      });

      test.each([
        { query: '"cat AND dog"', terms: ['cat', 'and', 'dog'] },
        { query: '"cat OR dog"', terms: ['cat', 'or', 'dog'] },
        { query: '"NOT cat"', terms: ['not', 'cat'] },
        { query: '"(cat)"', terms: ['cat'] },
      ])(
        'should treat operators and parentheses inside quotes in $query as plain separators / words',
        ({ query, terms }) => {
          expect(parseQuery(query)).toStrictEqual(phrase(...terms));
        },
      );

      test.each([
        { query: '"brown pillow" AND cat', expected: and(phrase('brown', 'pillow'), term('cat')) },
        { query: 'cat OR "brown pillow"', expected: or(term('cat'), phrase('brown', 'pillow')) },
        { query: 'NOT "brown pillow"', expected: not(phrase('brown', 'pillow')) },
        {
          query: 'cat AND NOT "brown pillow"',
          expected: and(term('cat'), not(phrase('brown', 'pillow'))),
        },
        {
          query: 'cat OR "brown pillow" AND dog',
          expected: or(term('cat'), and(phrase('brown', 'pillow'), term('dog'))),
        },
        {
          query: '("brown pillow" OR cat) AND dog',
          expected: and(or(phrase('brown', 'pillow'), term('cat')), term('dog')),
        },
        { query: '("brown pillow")', expected: phrase('brown', 'pillow') },
      ])('should combine a phrase with other operators in $query', ({ query, expected }) => {
        expect(parseQuery(query)).toStrictEqual(expected);
      });
    });

    describe('syntax errors', () => {
      test.each([
        'AND',
        'OR',
        'NOT',
        'cat AND',
        'cat OR',
        'cat NOT',
        'AND cat',
        'OR cat',
        'cat AND NOT',
        '(cat AND)',
        '(AND cat)',
        '(NOT)',
      ])('should throw ParseError for the operator without an operand in %j', (query) => {
        expect(() => parseQuery(query)).toThrow(ParseError);
      });

      test.each([
        'AND OR NOT',
        'cat AND OR dog',
        'cat AND AND dog',
        'cat OR OR dog',
        'cat OR AND dog',
        'NOT AND cat',
        'NOT OR cat',
        'cat AND NOT AND dog',
      ])('should throw ParseError for the consecutive operators in %j', (query) => {
        expect(() => parseQuery(query)).toThrow(ParseError);
      });

      test.each([
        '(cat',
        'cat)',
        '((cat)',
        '(cat))',
        '(',
        ')',
        ')cat(',
        '(cat))(dog',
        'cat AND (dog OR bird',
        'cat AND dog) OR bird',
      ])('should throw ParseError for the unbalanced parentheses in %j', (query) => {
        expect(() => parseQuery(query)).toThrow(ParseError);
      });

      test.each(['()', '( )', '(())', 'cat AND ()', '() AND cat', 'NOT ()', 'cat ()'])(
        'should throw ParseError for the empty group in %j',
        (query) => {
          expect(() => parseQuery(query)).toThrow(ParseError);
        },
      );

      test.each([
        '"cat',
        'cat"',
        '"',
        'cat "',
        '"cat" "',
        '"cat" "dog',
        '"a" "b" "c',
        'cat AND "dog',
      ])('should throw ParseError for the unbalanced quotes in %j', (query) => {
        expect(() => parseQuery(query)).toThrow(ParseError);
      });

      test.each(['""', '"   "', '"!!!"', '"" cat', 'cat AND ""', '"кіт"'])(
        'should throw ParseError for the phrase without any tokens in %j',
        (query) => {
          expect(() => parseQuery(query)).toThrow(ParseError);
        },
      );
    });

    describe('fuzzy terms in MVP grammar', () => {
      test.each(['catt~', 'cat AND dog~', '~'])(
        'should throw ParseError for %j because ~ is not supported in MVP',
        (query) => {
          expect(() => parseQuery(query)).toThrow(ParseError);
        },
      );
    });

    describe('robustness', () => {
      test('should be deterministic when parsing the same query twice', () => {
        const query = '(people OR soup) AND NOT "brown pillow" cat';

        expect(parseQuery(query)).toStrictEqual(parseQuery(query));
      });

      test('should return a plain AST that survives a JSON round trip unchanged', () => {
        const ast = parseQuery('(people OR soup) AND NOT "brown pillow" cat');

        expect(JSON.parse(JSON.stringify(ast))).toStrictEqual(ast);
      });

      test.each([
        '(((',
        ')))',
        '"""',
        'AND AND AND',
        'NOT NOT NOT',
        '~~~',
        '\0',
        '(("',
        'cat AND (',
        '"cat AND (dog',
        '((cat) AND',
        '🐱 AND 🐶',
        'AND '.repeat(500),
      ])('should throw nothing but ParseError for the malformed or unusual input %j', (query) => {
        let thrown: unknown;
        try {
          parseQuery(query);
        } catch (error) {
          thrown = error;
        }

        if (thrown !== undefined) {
          expect(thrown).toBeInstanceOf(ParseError);
        }
      });
    });
  });
});
