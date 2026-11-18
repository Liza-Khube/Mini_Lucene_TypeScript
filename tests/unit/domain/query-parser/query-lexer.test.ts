import { describe, expect, test } from 'vitest';
import {
  ParseError,
  tokenizeQuery,
  type QueryToken,
} from '../../../../src/domain/query-parser/public-api.js';

const termToken = (value: string): QueryToken => ({ type: 'TERM', value });
const phraseToken = (...terms: string[]): QueryToken => ({ type: 'PHRASE', terms });

describe('Domain QueryParser Lexer', () => {
  describe(tokenizeQuery.name, () => {
    describe('empty and separator-only inputs', () => {
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
      ])('should return [] for %s (%j)', (_description, query) => {
        expect(tokenizeQuery(query)).toStrictEqual([]);
      });
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
      ])('should tokenize $query as TERM "$expected"', ({ query, expected }) => {
        expect(tokenizeQuery(query)).toStrictEqual([termToken(expected)]);
      });

      test.each([
        { query: 'catt', expected: 'catt' },
        { query: 'running', expected: 'running' },
        { query: 'People', expected: 'people' },
      ])('should not stem the term $query', ({ query, expected }) => {
        expect(tokenizeQuery(query)).toStrictEqual([termToken(expected)]);
      });

      test.each(['the', 'THE', 'a', 'is', 'with'])(
        'should keep stop-word %j as a TERM token',
        (query) => {
          expect(tokenizeQuery(query)).toStrictEqual([termToken(query.toLowerCase())]);
        },
      );

      test.each([
        { query: 'cat-dog', expected: [termToken('cat'), termToken('dog')] },
        { query: 'cat,dog', expected: [termToken('cat'), termToken('dog')] },
        { query: 'cat.dog', expected: [termToken('cat'), termToken('dog')] },
        { query: 'cat_dog', expected: [termToken('cat'), termToken('dog')] },
        { query: 'cat/dog', expected: [termToken('cat'), termToken('dog')] },
        { query: "don't", expected: [termToken('don'), termToken('t')] },
        { query: 'café', expected: [termToken('caf')] },
        { query: 'naïve', expected: [termToken('na'), termToken('ve')] },
        { query: '🐱 cat', expected: [termToken('cat')] },
        { query: 'кіт cat', expected: [termToken('cat')] },
      ])(
        'should treat characters outside [a-z0-9] as separators in $query',
        ({ query, expected }) => {
          expect(tokenizeQuery(query)).toStrictEqual(expected);
        },
      );
    });

    describe('operators and parentheses', () => {
      test('should emit operator tokens only for exact uppercase AND, OR, NOT', () => {
        expect(tokenizeQuery('cat AND dog OR NOT bird')).toStrictEqual([
          termToken('cat'),
          { type: 'AND' },
          termToken('dog'),
          { type: 'OR' },
          { type: 'NOT' },
          termToken('bird'),
        ]);
      });

      test.each(['and', 'or', 'not', 'And', 'Or', 'Not', 'aNd', 'oR', 'nOt'])(
        'should tokenize non-uppercase %j as an ordinary TERM token',
        (word) => {
          expect(tokenizeQuery(word)).toStrictEqual([termToken(word.toLowerCase())]);
        },
      );

      test.each([
        'ANDROID',
        'ORANGE',
        'NOTE',
        'NOTHING',
        'ORDER',
        'BAND',
        'CANDY',
        'AND1',
        'OR2',
        'NOT3',
      ])('should not mistake %j for an operator', (word) => {
        expect(tokenizeQuery(word)).toStrictEqual([termToken(word.toLowerCase())]);
      });

      test('should emit LPAREN and RPAREN tokens even without spaces', () => {
        expect(tokenizeQuery('(cat)AND(dog OR NOT(bird))')).toStrictEqual([
          { type: 'LPAREN' },
          termToken('cat'),
          { type: 'RPAREN' },
          { type: 'AND' },
          { type: 'LPAREN' },
          termToken('dog'),
          { type: 'OR' },
          { type: 'NOT' },
          { type: 'LPAREN' },
          termToken('bird'),
          { type: 'RPAREN' },
          { type: 'RPAREN' },
        ]);
      });
    });

    describe('phrases', () => {
      test.each([
        { query: '"brown pillow"', terms: ['brown', 'pillow'] },
        { query: '"Brown PILLOW"', terms: ['brown', 'pillow'] },
        { query: '"  brown    pillow  "', terms: ['brown', 'pillow'] },
        { query: '"brown-pillow"', terms: ['brown', 'pillow'] },
        { query: '"cat"', terms: ['cat'] },
        { query: '"the brown pillow"', terms: ['the', 'brown', 'pillow'] },
      ])('should tokenize $query into PHRASE $terms', ({ query, terms }) => {
        expect(tokenizeQuery(query)).toStrictEqual([phraseToken(...terms)]);
      });

      test.each([
        { query: '"cat AND dog"', terms: ['cat', 'and', 'dog'] },
        { query: '"cat OR dog"', terms: ['cat', 'or', 'dog'] },
        { query: '"NOT cat"', terms: ['not', 'cat'] },
        { query: '"(cat)"', terms: ['cat'] },
      ])(
        'should treat operators and parentheses inside quotes in $query as plain words/separators',
        ({ query, terms }) => {
          expect(tokenizeQuery(query)).toStrictEqual([phraseToken(...terms)]);
        },
      );

      test('should tokenize adjacent phrases and terms without spaces', () => {
        expect(tokenizeQuery('"brown pillow""red cat"dog')).toStrictEqual([
          phraseToken('brown', 'pillow'),
          phraseToken('red', 'cat'),
          termToken('dog'),
        ]);
      });
    });

    describe('lexical errors', () => {
      test.each([
        '"cat',
        'cat"',
        '"',
        'cat "',
        '"cat" "',
        '"cat" "dog',
        '"a" "b" "c',
        'cat AND "dog',
      ])('should throw ParseError for unbalanced quotes in %j', (query) => {
        expect(() => tokenizeQuery(query)).toThrow(ParseError);
      });

      test.each(['""', '"   "', '"!!!"', '"" cat', 'cat AND ""', '"кіт"'])(
        'should throw ParseError for a tokenless phrase in %j',
        (query) => {
          expect(() => tokenizeQuery(query)).toThrow(ParseError);
        },
      );

      test.each(['catt~', 'cat AND dog~', '~'])(
        'should throw ParseError for %j because ~ is not supported in MVP',
        (query) => {
          expect(() => tokenizeQuery(query)).toThrow(ParseError);
        },
      );
    });
  });
});
