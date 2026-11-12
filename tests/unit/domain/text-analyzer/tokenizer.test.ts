import { describe, test, expect } from 'vitest';
import { tokenize } from '../../../../src/domain/text-analyzer/tokenizer.js';

const terms = (text: string) => tokenize(text).map((t) => t.term);
const positions = (text: string) => tokenize(text).map((t) => t.position);

describe('Domain TextAnalyzer Tokenizer', () => {
  describe('empty and degenerate inputs', () => {
    test('empty string → empty array', () => {
      expect(tokenize('')).toEqual([]);
    });

    test.each([' ', '   ', '\t', '\n', '\r\n', ' \t\n\r '])(
      'string with only whitespace characters %j → empty array',
      (input) => {
        expect(tokenize(input)).toEqual([]);
      },
    );

    test('string with only punctuation marks → empty array', () => {
      expect(tokenize('!?.,;:-—()[]{}"\'/\\@#$%^&*_+=~`|<>')).toEqual([]);
    });
  });

  describe('basic tokenization', () => {
    test('single word → single token with position 1', () => {
      expect(tokenize('cat')).toEqual([{ term: 'cat', position: 1 }]);
    });

    test('multiple words separated by spaces', () => {
      expect(tokenize('brown fox jumps')).toEqual([
        { term: 'brown', position: 1 },
        { term: 'fox', position: 2 },
        { term: 'jumps', position: 3 },
      ]);
    });

    test('leading, trailing and multiple spaces do not create empty tokens', () => {
      expect(tokenize('   cat    dog   ')).toEqual([
        { term: 'cat', position: 1 },
        { term: 'dog', position: 2 },
      ]);
    });

    test('does not produce empty tokens under any circumstances', () => {
      for (const t of tokenize(',, a ,, b ,,')) {
        expect(t.term.length).toBeGreaterThan(0);
      }
    });
  });

  describe('case normalization', () => {
    test('converts to lowercase', () => {
      expect(terms('HELLO World')).toEqual(['hello', 'world']);
    });

    test('mixed case inside a word', () => {
      expect(terms('CaMeLcAsE')).toEqual(['camelcase']);
    });

    test('same word in different cases produces the same term', () => {
      const [a, b, c] = terms('Cat CAT cat');
      expect(a).toBe('cat');
      expect(b).toBe('cat');
      expect(c).toBe('cat');
    });
  });

  describe('delimiters', () => {
    test.each([
      ['cat,dog', ['cat', 'dog']],
      ['cat;dog', ['cat', 'dog']],
      ['cat.dog', ['cat', 'dog']],
      ['cat!dog?', ['cat', 'dog']],
      ['cat\tdog', ['cat', 'dog']],
      ['cat\ndog', ['cat', 'dog']],
      ['cat\r\ndog', ['cat', 'dog']],
      ['well-known', ['well', 'known']],
      ['snake_case', ['snake', 'case']],
      ["don't", ['don', 't']],
      ['file.name.txt', ['file', 'name', 'txt']],
      ['user@example.com', ['user', 'example', 'com']],
      ['"brown pillow"', ['brown', 'pillow']],
      ['(cat)', ['cat']],
    ])('%j → %j', (input, expected) => {
      expect(terms(input)).toEqual(expected);
    });
  });

  describe('numbers', () => {
    test('number is a separate token', () => {
      expect(tokenize('route 66')).toEqual([
        { term: 'route', position: 1 },
        { term: '66', position: 2 },
      ]);
    });

    test('letters and digits in one word constitute a single token', () => {
      expect(terms('abc123def')).toEqual(['abc123def']);
    });

    test('word starting with digits', () => {
      expect(terms('3d 4k')).toEqual(['3d', '4k']);
    });

    test('number with decimal point is split into two parts', () => {
      expect(terms('3.14')).toEqual(['3', '14']);
    });
  });

  describe('characters outside a-z0-9 are delimiters', () => {
    test('cyrillic characters do not become tokens', () => {
      expect(terms('привіт world')).toEqual(['world']);
    });

    test('diacritic letters split the word', () => {
      expect(terms('café')).toEqual(['caf']);
      expect(terms('naïve')).toEqual(['na', 've']);
      expect(terms('résumé')).toEqual(['r', 'sum']);
    });

    test('hieroglyphs do not become tokens', () => {
      expect(terms('猫 cat 犬')).toEqual(['cat']);
    });

    test('emojis are delimiters', () => {
      expect(terms('🐱cat🐶dog🙂')).toEqual(['cat', 'dog']);
    });

    test('arabic numerals only ASCII: other Unicode digits are delimiters', () => {
      expect(terms('٣ 3 ３')).toEqual(['3']);
    });
  });

  describe('positions', () => {
    test('positions start at 1', () => {
      expect(positions('a b c')).toEqual([1, 2, 3]);
    });

    test('positions are sequential without gaps', () => {
      expect(positions('one, two; three! four?')).toEqual([1, 2, 3, 4]);
    });

    test('repeated words receive their own positions', () => {
      expect(tokenize('cat dog cat')).toEqual([
        { term: 'cat', position: 1 },
        { term: 'dog', position: 2 },
        { term: 'cat', position: 3 },
      ]);
    });

    test('punctuation marks and spaces do not affect positions', () => {
      expect(positions('a    b\n\n\nc')).toEqual([1, 2, 3]);
    });

    test('stop words are NOT discarded by tokenizer and occupy a position', () => {
      expect(tokenize('the cat and the dog')).toEqual([
        { term: 'the', position: 1 },
        { term: 'cat', position: 2 },
        { term: 'and', position: 3 },
        { term: 'the', position: 4 },
        { term: 'dog', position: 5 },
      ]);
    });
  });

  describe('resilience to extreme inputs', () => {
    test('control characters are delimiters', () => {
      expect(terms('\u0000cat\u0007dog\u001F')).toEqual(['cat', 'dog']);
    });

    test('zero-width and BOM characters are delimiters', () => {
      expect(terms('\uFEFFcat\u200Bdog')).toEqual(['cat', 'dog']);
    });

    test('long sequence of spaces', () => {
      const text = ' '.repeat(100_000) + 'cat' + ' '.repeat(100_000);
      expect(tokenize(text)).toEqual([{ term: 'cat', position: 1 }]);
    });

    test('very long word is a single token', () => {
      const word = 'a'.repeat(100_000);
      expect(terms(word)).toEqual([word]);
    });

    test('unpaired surrogates do not throw an exception', () => {
      expect(() => tokenize('\uD800cat\uDC00')).not.toThrow();
      expect(terms('\uD800cat\uDC00')).toEqual(['cat']);
    });

    test('many consecutive emojis', () => {
      expect(tokenize('🙂'.repeat(10_000))).toEqual([]);
    });
  });

  describe('function purity', () => {
    test('repeated call produces the same result', () => {
      const text = 'The Quick, brown fox!';
      expect(tokenize(text)).toEqual(tokenize(text));
    });

    test('returns a new array on each call', () => {
      const a = tokenize('cat');
      const b = tokenize('cat');
      expect(a).not.toBe(b);
    });

    test('mutation of result does not affect subsequent calls', () => {
      const a = tokenize('cat');
      a.push({ term: 'x', position: 99 });
      expect(tokenize('cat')).toEqual([{ term: 'cat', position: 1 }]);
    });
  });

  describe('idempotency (example)', () => {
    test('tokenizing the result joined by spaces produces the same terms', () => {
      const first = terms('Hello, WORLD! 42 times-over');
      const second = terms(first.join(' '));
      expect(second).toEqual(first);
    });
  });
});
