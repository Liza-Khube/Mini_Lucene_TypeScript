import { describe, test, expect, beforeEach } from 'vitest';
import { TextAnalyzer } from '../../../../src/domain/text-analyzer/text-analyzer.js';
import { STOP_WORDS } from '../../../../src/domain/text-analyzer/stop-words.js';
import { tokenize } from '../../../../src/domain/text-analyzer/tokenizer.js';
import { stem } from '../../../../src/domain/text-analyzer/porter-stemmer.js';

const terms = (a: TextAnalyzer, text: string) => a.analyze(text).map((t) => t.term);

describe('Domain TextAnalyzer', () => {
  let analyzer: TextAnalyzer;

  beforeEach(() => {
    analyzer = new TextAnalyzer();
  });

  describe('empty and degenerate inputs', () => {
    test('empty string → []', () => {
      expect(analyzer.analyze('')).toEqual([]);
    });

    test('spaces only → []', () => {
      expect(analyzer.analyze('   \n\t  ')).toEqual([]);
    });

    test('punctuation only → []', () => {
      expect(analyzer.analyze('?!... --- ,,,')).toEqual([]);
    });

    test('stop words only → [] (not an error)', () => {
      expect(analyzer.analyze('the and of to be')).toEqual([]);
    });

    test('non-ASCII characters only → []', () => {
      expect(analyzer.analyze('привіт 猫 🐱')).toEqual([]);
    });
  });

  describe('case normalization', () => {
    test('lower case is applied to all terms', () => {
      expect(terms(analyzer, 'FOX Brown')).toEqual(['fox', 'brown']);
    });

    test('stop words are recognized regardless of case', () => {
      expect(analyzer.analyze('THE The tHe')).toEqual([]);
    });

    test('uppercase AND / OR / NOT in text are treated as normal stop words', () => {
      expect(terms(analyzer, 'cat AND dog OR mouse NOT bird')).toEqual([
        'cat',
        'dog',
        'mous',
        'bird',
      ]);
    });
  });

  describe('stop words filtering', () => {
    test('removes stop words from the middle of a sentence', () => {
      expect(terms(analyzer, 'the quick brown fox')).toEqual(['quick', 'brown', 'fox']);
    });

    test.each([...STOP_WORDS])('stop word "%s" is dropped', (word) => {
      expect(analyzer.analyze(word)).toEqual([]);
    });

    test('stop word is dropped before stemming ("this" does not become "thi")', () => {
      expect(analyzer.analyze('this')).toEqual([]);
      expect(analyzer.analyze('was')).toEqual([]);
    });

    test('word that only starts with a stop word is not dropped', () => {
      expect(terms(analyzer, 'theory island ant')).toEqual([
        stem('theory'),
        stem('island'),
        stem('ant'),
      ]);
    });

    test('"To be, or not to be: that is the dilemma." → dilemma only', () => {
      expect(analyzer.analyze('To be, or not to be: that is the dilemma.')).toEqual([
        { term: 'dilemma', position: 10 },
      ]);
    });
  });

  describe('stemming', () => {
    test('applies Porter stemming to each term', () => {
      expect(terms(analyzer, 'Cats running')).toEqual(['cat', 'run']);
    });

    test('result matches stem(tokenize) for non-stop words', () => {
      const text = 'Searching documents quickly across indexes';
      const expected = tokenize(text)
        .filter((t) => !STOP_WORDS.has(t.term))
        .map((t) => ({ term: stem(t.term), position: t.position }));
      expect(analyzer.analyze(text)).toEqual(expected);
    });

    test('different word forms yield the same term (plurals, -ing, -s)', () => {
      const forms = ['run', 'runs', 'running', 'RUNNING'];
      const roots = new Set(forms.map((f) => terms(analyzer, f)[0]));
      expect(roots.size).toBe(1);
    });

    test('numbers remain unchanged', () => {
      expect(terms(analyzer, '2024 42')).toEqual(['2024', '42']);
    });
  });

  describe('positions', () => {
    test('positions start at 1', () => {
      expect(analyzer.analyze('cat')).toEqual([{ term: 'cat', position: 1 }]);
    });

    test('stop words are not indexed but occupy a position', () => {
      expect(analyzer.analyze('The cat sat on the mat')).toEqual([
        { term: 'cat', position: 2 },
        { term: 'sat', position: 3 },
        { term: 'mat', position: 6 },
      ]);
    });

    test('phrase with stop word inside leaves gap in positions', () => {
      expect(analyzer.analyze('brown the pillow')).toEqual([
        { term: 'brown', position: 1 },
        { term: 'pillow', position: 3 },
      ]);
    });

    test('multiple consecutive stop words increase position gap', () => {
      expect(analyzer.analyze('cat is in the box')).toEqual([
        { term: 'cat', position: 1 },
        { term: 'box', position: 5 },
      ]);
    });

    test('position matches the word index in original text', () => {
      const text = 'People in the room were talking about soup';
      const result = analyzer.analyze(text);
      const words = text.toLowerCase().split(/\s+/);
      for (const { term, position } of result) {
        expect(stem(words[position - 1]!)).toBe(term);
      }
    });

    test('positions strictly increase', () => {
      const result = analyzer.analyze('a cat and a dog and a bird with a fish');
      const pos = result.map((t) => t.position);
      for (let i = 1; i < pos.length; i++) {
        expect(pos[i]!).toBeGreaterThan(pos[i - 1]!);
      }
    });

    test('positions are consistent with tokenize()', () => {
      const text = 'The Quick brown fox jumps over the lazy dog';
      const allowed = new Map(tokenize(text).map((t) => [t.position, t.term]));
      for (const { position, term } of analyzer.analyze(text)) {
        expect(stem(allowed.get(position)!)).toBe(term);
      }
    });

    test('repeated words receive distinct positions', () => {
      expect(analyzer.analyze('Cats, CATS and cat')).toEqual([
        { term: 'cat', position: 1 },
        { term: 'cat', position: 2 },
        { term: 'cat', position: 4 },
      ]);
    });

    test('punctuation and line breaks do not affect positions', () => {
      expect(analyzer.analyze('cat,\n\n dog;   bird!')).toEqual([
        { term: 'cat', position: 1 },
        { term: 'dog', position: 2 },
        { term: 'bird', position: 3 },
      ]);
    });
  });

  describe('document length (for BM25)', () => {
    test('empty document → 0', () => {
      expect(analyzer.analyze('').length).toBe(0);
    });

    test('document with single word → 1', () => {
      expect(analyzer.analyze('hello').length).toBe(1);
    });

    test('document with single stop word → 0', () => {
      expect(analyzer.analyze('the').length).toBe(0);
    });

    test('length = count of non-stop-word tokens', () => {
      expect(analyzer.analyze('the quick brown fox').length).toBe(3);
    });

    test('repeated words are counted separately', () => {
      expect(analyzer.analyze('cat cat cat').length).toBe(3);
    });
  });

  describe('symmetry between documents and queries', () => {
    test('different word forms and cases in query match document', () => {
      const doc = terms(analyzer, 'many people');
      const query = terms(analyzer, 'PEOPLE!');
      expect(doc).toContain(query[0]);
    });

    test('query term in plural matches singular in document', () => {
      expect(terms(analyzer, 'cats')).toEqual(terms(analyzer, 'cat'));
    });

    test('query term that is a stop word yields empty result', () => {
      expect(analyzer.analyze('the')).toEqual([]);
    });
  });

  describe('numbers and mixed content', () => {
    test('words, numbers, and punctuation', () => {
      expect(analyzer.analyze('Year 2024!')).toEqual([
        { term: 'year', position: 1 },
        { term: '2024', position: 2 },
      ]);
    });

    test('non-Latin words are delimiters and do not produce tokens', () => {
      expect(terms(analyzer, 'привіт world')).toEqual(['world']);
    });
  });

  describe('resilience to extreme inputs', () => {
    test.each([
      ['emoji', '🐱🐶🙂'.repeat(1000)],
      ['hieroglyphs', '猫犬鳥'.repeat(1000)],
      ['control characters', '\u0000\u0001\u0007\u001F\u007F'.repeat(100)],
      ['long spaces', ' '.repeat(100_000)],
      ['zero width', '\u200B\uFEFF\u2060'.repeat(100)],
      ['unpaired surrogates', '\uD800\uDC00\uD800'],
    ])('%s → does not throw and returns an array', (_name, input) => {
      let result: unknown;
      expect(() => {
        result = analyzer.analyze(input);
      }).not.toThrow();
      expect(Array.isArray(result)).toBe(true);
    });

    test('very long text is processed without exceptions', () => {
      const text = 'the quick brown fox '.repeat(50_000);
      const result = analyzer.analyze(text);
      expect(result.length).toBe(150_000);
    });

    test('very long single word', () => {
      const result = analyzer.analyze('a'.repeat(50_000));
      expect(result).toHaveLength(1);
    });
  });

  describe('result invariants', () => {
    const TEXT = 'The Quick, brown fox (2024) jumps over the lazy dogs! Running... 42 times.';

    test('each term is non-empty and contains only [a-z0-9]', () => {
      for (const { term } of analyzer.analyze(TEXT)) {
        expect(term).toMatch(/^[a-z0-9]+$/);
      }
    });

    test('no stop words are included in the result', () => {
      for (const { term } of analyzer.analyze('the cat is in the hat')) {
        expect(STOP_WORDS.has(term)).toBe(false);
      }
    });

    test('positions are integers ≥ 1', () => {
      for (const { position } of analyzer.analyze(TEXT)) {
        expect(Number.isInteger(position)).toBe(true);
        expect(position).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('purity and instance independence', () => {
    test('deterministic', () => {
      expect(analyzer.analyze('Searching the index')).toEqual(
        analyzer.analyze('Searching the index'),
      );
    });

    test('does not retain state between calls (positions do not leak)', () => {
      analyzer.analyze('one two three four');
      expect(analyzer.analyze('cat')).toEqual([{ term: 'cat', position: 1 }]);
    });

    test('different instances produce identical results', () => {
      const other = new TextAnalyzer();
      expect(other.analyze('Cats running')).toEqual(analyzer.analyze('Cats running'));
    });

    test('returns a new array on each call', () => {
      expect(analyzer.analyze('cat')).not.toBe(analyzer.analyze('cat'));
    });
  });
});
