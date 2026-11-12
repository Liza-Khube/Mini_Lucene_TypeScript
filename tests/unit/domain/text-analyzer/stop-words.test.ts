import { describe, test, expect } from 'vitest';
import { STOP_WORDS, isStopWord } from '../../../../src/domain/text-analyzer/stop-words.js';

const STOP_WORDS_SET = new Set(STOP_WORDS);
const EXPECTED = [
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'if',
  'in',
  'into',
  'is',
  'it',
  'no',
  'not',
  'of',
  'on',
  'or',
  'such',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'was',
  'will',
  'with',
];

describe('Domain TextAnalyzer StopWords', () => {
  describe('STOP_WORDS', () => {
    test('contains exactly 33 words of the reference Lucene list', () => {
      expect(STOP_WORDS_SET.size).toBe(33);
      expect(EXPECTED).toHaveLength(33);
    });

    test.each(EXPECTED)('contains "%s"', (word) => {
      expect(STOP_WORDS_SET.has(word)).toBe(true);
    });

    test('all stop words are lowercase and consist only of a-z', () => {
      for (const w of STOP_WORDS_SET) {
        expect(w).toMatch(/^[a-z]+$/);
      }
    });
  });

  describe('isStopWord', () => {
    test.each(EXPECTED)('"%s" is a stop word', (word) => {
      expect(isStopWord(word)).toBe(true);
    });

    test.each([
      'cat',
      'people',
      'he',
      'she',
      'we',
      'you',
      'i',
      'have',
      'has',
      'do',
      'from',
      'which',
    ])('"%s" is not a stop word', (word) => {
      expect(isStopWord(word)).toBe(false);
    });

    test('matches whole word only, not prefix or suffix', () => {
      expect(isStopWord('theory')).toBe(false);
      expect(isStopWord('ant')).toBe(false);
      expect(isStopWord('island')).toBe(false);
      expect(isStopWord('data')).toBe(false);
      expect(isStopWord('wither')).toBe(false);
    });
  });
});
