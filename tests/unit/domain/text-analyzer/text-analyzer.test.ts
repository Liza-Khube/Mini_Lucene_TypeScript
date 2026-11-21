import { describe, test, expect, beforeEach } from 'vitest';
import { TextAnalyzer, isStopWord, stem } from '../../../../src/domain/text-analyzer/public-api.js';

const terms = (a: TextAnalyzer, text: string) => a.analyze(text).map((t) => t.term);

describe('Domain TextAnalyzer', () => {
  let analyzer: TextAnalyzer;

  beforeEach(() => {
    analyzer = new TextAnalyzer();
  });

  describe('empty and degenerate inputs', () => {
    test('should return empty array for empty string', () => {
      expect(analyzer.analyze('')).toEqual([]);
    });

    test.each([' ', '   ', '\t', '\n', '\r\n', ' \t\n\r ', '   \n\t  '])(
      'should return empty array for whitespace-only input %j',
      (input) => {
        expect(analyzer.analyze(input)).toEqual([]);
      },
    );

    test('should return empty array for punctuation-only input', () => {
      expect(analyzer.analyze('?!... --- ,,,')).toEqual([]);
    });

    test('should return empty array for stop-words-only input without throwing', () => {
      expect(analyzer.analyze('the and of to be')).toEqual([]);
    });

    test('should return empty array for non-ASCII-only input', () => {
      expect(analyzer.analyze('привіт 猫 🐱')).toEqual([]);
    });
  });

  describe('case normalization', () => {
    test('should convert all terms to lowercase', () => {
      expect(terms(analyzer, 'FOX Brown')).toEqual(['fox', 'brown']);
    });

    test('should lowercase mixed case inside a word before stemming', () => {
      expect(terms(analyzer, 'CaMeLcAsE')).toEqual(['camelcas']);
    });

    test('should recognize stop words regardless of case', () => {
      expect(analyzer.analyze('THE The tHe')).toEqual([]);
    });

    test('should treat uppercase AND / OR / NOT in text as normal stop words', () => {
      expect(terms(analyzer, 'cat AND dog OR mouse NOT bird')).toEqual([
        'cat',
        'dog',
        'mous',
        'bird',
      ]);
    });
  });

  describe('stop words filtering', () => {
    test('should remove stop words from the middle of a sentence', () => {
      expect(terms(analyzer, 'the quick brown fox')).toEqual(['quick', 'brown', 'fox']);
    });

    test.each(['a', 'an', 'and', 'the', 'is', 'of', 'to', 'with', 'not', 'or'])(
      'should drop stop word "%s"',
      (word) => {
        expect(analyzer.analyze(word)).toEqual([]);
      },
    );

    test('should drop stop words before stemming ("this" does not become "thi")', () => {
      expect(analyzer.analyze('this')).toEqual([]);
      expect(analyzer.analyze('was')).toEqual([]);
    });

    test('should not drop a word that only starts with a stop word', () => {
      expect(terms(analyzer, 'theory island ant')).toEqual([
        stem('theory'),
        stem('island'),
        stem('ant'),
      ]);
    });

    test('should keep only "dilemma" in "To be, or not to be: that is the dilemma."', () => {
      expect(analyzer.analyze('To be, or not to be: that is the dilemma.')).toEqual([
        { term: 'dilemma', position: 10 },
      ]);
    });
  });

  describe('stemming', () => {
    test('should apply Porter stemming to each term', () => {
      expect(terms(analyzer, 'Cats running')).toEqual(['cat', 'run']);
    });

    test('should analyze non-stop words with Porter stemming and 1-based positions', () => {
      expect(analyzer.analyze('Searching documents quickly across indexes')).toEqual([
        { term: 'search', position: 1 },
        { term: 'document', position: 2 },
        { term: 'quickli', position: 3 },
        { term: 'across', position: 4 },
        { term: 'index', position: 5 },
      ]);
    });

    test('should reduce different word forms (plurals, -ing, -s) to the same term', () => {
      const forms = ['run', 'runs', 'running', 'RUNNING'];
      const roots = new Set(forms.map((f) => terms(analyzer, f)[0]));
      expect(roots.size).toBe(1);
    });

    test('should leave numbers unchanged', () => {
      expect(terms(analyzer, '2024 42')).toEqual(['2024', '42']);
    });
  });

  describe('positions', () => {
    test('should start positions at 1', () => {
      expect(analyzer.analyze('cat')).toEqual([{ term: 'cat', position: 1 }]);
    });

    test('should omit stop words while advancing token positions', () => {
      expect(analyzer.analyze('The cat sat on the mat')).toEqual([
        { term: 'cat', position: 2 },
        { term: 'sat', position: 3 },
        { term: 'mat', position: 6 },
      ]);
    });

    test('should leave a position gap when a phrase contains a stop word', () => {
      expect(analyzer.analyze('brown the pillow')).toEqual([
        { term: 'brown', position: 1 },
        { term: 'pillow', position: 3 },
      ]);
    });

    test('should increase position gap for multiple consecutive stop words', () => {
      expect(analyzer.analyze('cat is in the box')).toEqual([
        { term: 'cat', position: 1 },
        { term: 'box', position: 5 },
      ]);
    });

    test('should match the word index in the original text', () => {
      const text = 'People in the room were talking about soup';
      const result = analyzer.analyze(text);
      const words = text.toLowerCase().split(/\s+/);
      for (const { term, position } of result) {
        expect(stem(words[position - 1]!)).toBe(term);
      }
    });

    test('should assign strictly increasing positions', () => {
      const result = analyzer.analyze('a cat and a dog and a bird with a fish');
      const pos = result.map((t) => t.position);
      for (let i = 1; i < pos.length; i++) {
        expect(pos[i]!).toBeGreaterThan(pos[i - 1]!);
      }
    });

    test('should not create empty tokens from leading, trailing or multiple spaces', () => {
      expect(analyzer.analyze('   cat    dog   ')).toEqual([
        { term: 'cat', position: 1 },
        { term: 'dog', position: 2 },
      ]);
    });

    test('should assign distinct positions to repeated words', () => {
      expect(analyzer.analyze('Cats, CATS and cat')).toEqual([
        { term: 'cat', position: 1 },
        { term: 'cat', position: 2 },
        { term: 'cat', position: 4 },
      ]);
    });

    test('should ignore punctuation and line breaks when assigning positions', () => {
      expect(analyzer.analyze('cat,\n\n dog;   bird!')).toEqual([
        { term: 'cat', position: 1 },
        { term: 'dog', position: 2 },
        { term: 'bird', position: 3 },
      ]);
    });
  });

  describe('document length (for BM25)', () => {
    test('should return length 0 for empty document', () => {
      expect(analyzer.analyze('').length).toBe(0);
    });

    test('should return length 1 for document with single word', () => {
      expect(analyzer.analyze('hello').length).toBe(1);
    });

    test('should return length 0 for document with single stop word', () => {
      expect(analyzer.analyze('the').length).toBe(0);
    });

    test('should return length equal to count of non-stop-word tokens', () => {
      expect(analyzer.analyze('the quick brown fox').length).toBe(3);
    });

    test('should count repeated words separately', () => {
      expect(analyzer.analyze('cat cat cat').length).toBe(3);
    });
  });

  describe('symmetry between documents and queries', () => {
    test('should match different word forms and cases between query and document', () => {
      const doc = terms(analyzer, 'many people');
      const query = terms(analyzer, 'PEOPLE!');
      expect(doc).toContain(query[0]);
    });

    test('should match plural query term to singular document term', () => {
      expect(terms(analyzer, 'cats')).toEqual(terms(analyzer, 'cat'));
    });

    test('should return empty result when query term is a stop word', () => {
      expect(analyzer.analyze('the')).toEqual([]);
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
      ['user@example.com', ['user', 'exampl', 'com']],
      ['"brown pillow"', ['brown', 'pillow']],
      ['(cat)', ['cat']],
    ])('should split %j into %j', (input, expected) => {
      expect(terms(analyzer, input)).toEqual(expected);
    });
  });

  describe('numbers and mixed content', () => {
    test('should tokenize words and numbers while ignoring punctuation', () => {
      expect(analyzer.analyze('Year 2024!')).toEqual([
        { term: 'year', position: 1 },
        { term: '2024', position: 2 },
      ]);
    });

    test('should keep letters and digits in one word as a single token', () => {
      expect(terms(analyzer, 'abc123def')).toEqual(['abc123def']);
    });

    test('should preserve words starting with digits', () => {
      expect(terms(analyzer, '3d 4k')).toEqual(['3d', '4k']);
    });

    test('should split number with decimal point into two parts', () => {
      expect(terms(analyzer, '3.14')).toEqual(['3', '14']);
    });

    test('should treat non-Latin words as delimiters without producing tokens', () => {
      expect(terms(analyzer, 'привіт world')).toEqual(['world']);
    });

    test('should treat diacritic letters as delimiters that split words', () => {
      expect(terms(analyzer, 'café')).toEqual(['caf']);
      expect(terms(analyzer, 'naïve')).toEqual(['na', 've']);
      expect(terms(analyzer, 'résumé')).toEqual(['r', 'sum']);
    });

    test('should treat hieroglyphs, emojis and non-ASCII digits as delimiters', () => {
      expect(terms(analyzer, '猫 cat 犬')).toEqual(['cat']);
      expect(terms(analyzer, '🐱cat🐶dog🙂')).toEqual(['cat', 'dog']);
      expect(terms(analyzer, '٣ 3 ３')).toEqual(['3']);
    });
  });

  describe('resilience to extreme inputs', () => {
    test('should split valid words on control, zero-width and unpaired surrogate characters', () => {
      expect(terms(analyzer, '\u0000cat\u0007dog\u001F')).toEqual(['cat', 'dog']);
      expect(terms(analyzer, '\uFEFFcat\u200Bdog')).toEqual(['cat', 'dog']);
      expect(terms(analyzer, '\uD800cat\uDC00')).toEqual(['cat']);
    });

    test.each([
      ['emoji', '🐱🐶🙂'.repeat(1000)],
      ['hieroglyphs', '猫犬鳥'.repeat(1000)],
      ['control characters', '\u0000\u0001\u0007\u001F\u007F'.repeat(100)],
      ['long spaces', ' '.repeat(100_000)],
      ['zero width', '\u200B\uFEFF\u2060'.repeat(100)],
      ['unpaired surrogates', '\uD800\uDC00\uD800'],
    ])('should not throw and return an array for %s input', (_name, input) => {
      let result: unknown;
      expect(() => {
        result = analyzer.analyze(input);
      }).not.toThrow();
      expect(Array.isArray(result)).toBe(true);
    });

    test('should process very long text without exceptions', () => {
      const text = 'the quick brown fox '.repeat(50_000);
      const result = analyzer.analyze(text);
      expect(result.length).toBe(150_000);
    });

    test('should process very long single word without throwing', () => {
      const result = analyzer.analyze('a'.repeat(50_000));
      expect(result).toHaveLength(1);
    });
  });

  describe('result invariants', () => {
    const TEXT = 'The Quick, brown fox (2024) jumps over the lazy dogs! Running... 42 times.';

    test('should produce non-empty terms containing only [a-z0-9]', () => {
      for (const { term } of analyzer.analyze(TEXT)) {
        expect(term).toMatch(/^[a-z0-9]+$/);
      }
    });

    test('should exclude all stop words from the result', () => {
      for (const { term } of analyzer.analyze('the cat is in the hat')) {
        expect(isStopWord(term)).toBe(false);
      }
    });

    test('should produce integer positions ≥ 1', () => {
      for (const { position } of analyzer.analyze(TEXT)) {
        expect(Number.isInteger(position)).toBe(true);
        expect(position).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('purity and instance independence', () => {
    test('should be deterministic across repeated calls', () => {
      expect(analyzer.analyze('Searching the index')).toEqual(
        analyzer.analyze('Searching the index'),
      );
    });

    test('should not retain state between calls (positions do not leak)', () => {
      analyzer.analyze('one two three four');
      expect(analyzer.analyze('cat')).toEqual([{ term: 'cat', position: 1 }]);
    });

    test('should produce identical results across different instances', () => {
      const other = new TextAnalyzer();
      expect(other.analyze('Cats running')).toEqual(analyzer.analyze('Cats running'));
    });

    test('should return a new array on each call', () => {
      expect(analyzer.analyze('cat')).not.toBe(analyzer.analyze('cat'));
    });

    test('should not be affected by mutating a previously returned result array', () => {
      const result = analyzer.analyze('cat');
      result.push({ term: 'x', position: 99 });
      expect(analyzer.analyze('cat')).toEqual([{ term: 'cat', position: 1 }]);
    });
  });
});
