import { describe, test, expect } from 'vitest';
import { isStopWord } from '../../../../src/domain/text-analyzer/public-api.js';

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
  describe('isStopWord', () => {
    test.each(EXPECTED)('should recognize "%s" as a stop word', (word) => {
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
    ])('should not treat "%s" as a stop word', (word) => {
      expect(isStopWord(word)).toBe(false);
    });

    test('should match whole words only, not prefixes or suffixes', () => {
      expect(isStopWord('theory')).toBe(false);
      expect(isStopWord('ant')).toBe(false);
      expect(isStopWord('island')).toBe(false);
      expect(isStopWord('data')).toBe(false);
      expect(isStopWord('wither')).toBe(false);
    });
  });
});
