import { describe, test, expect } from 'vitest';
import { stem } from '../../../../src/domain/text-analyzer/porter-stemmer.js';

type Case = [input: string, expected: string];

describe('Domain TextAnalyzer PorterStemmer', () => {
  describe('step 1a: plurals (sses, ies, ss, s)', () => {
    test.each<Case>([
      ['caresses', 'caress'],
      ['ponies', 'poni'],
      ['ties', 'ti'],
      ['caress', 'caress'],
      ['cats', 'cat'],
    ])('%s → %s', (input, expected) => {
      expect(stem(input)).toBe(expected);
    });
  });

  describe('step 1b: -eed, -ed, -ing', () => {
    test.each<Case>([
      ['feed', 'feed'],
      ['agreed', 'agre'],
      ['plastered', 'plaster'],
      ['bled', 'bled'],
      ['motoring', 'motor'],
      ['sing', 'sing'],
    ])('suffix removal: %s → %s', (input, expected) => {
      expect(stem(input)).toBe(expected);
    });

    test.each<Case>([
      ['conflated', 'conflat'],
      ['troubled', 'troubl'],
      ['sized', 'size'],
      ['filing', 'file'],
    ])('restoring terminal e: %s → %s', (input, expected) => {
      expect(stem(input)).toBe(expected);
    });

    test.each<Case>([
      ['hopping', 'hop'],
      ['tanned', 'tan'],
      ['running', 'run'],
      ['falling', 'fall'],
      ['hissing', 'hiss'],
      ['fizzed', 'fizz'],
      ['failing', 'fail'],
    ])('double consonant: %s → %s', (input, expected) => {
      expect(stem(input)).toBe(expected);
    });
  });

  describe('step 1c: y → i', () => {
    test.each<Case>([
      ['happy', 'happi'],
      ['sky', 'sky'],
    ])('%s → %s', (input, expected) => {
      expect(stem(input)).toBe(expected);
    });
  });

  describe('step 2: double suffixes', () => {
    test.each<Case>([
      ['relational', 'relat'],
      ['conditional', 'condit'],
      ['rational', 'ration'],
      ['valenci', 'valenc'],
      ['hesitanci', 'hesit'],
      ['digitizer', 'digit'],
      ['conformabli', 'conform'],
      ['radicalli', 'radic'],
      ['differentli', 'differ'],
      ['vileli', 'vile'],
      ['analogousli', 'analog'],
      ['vietnamization', 'vietnam'],
      ['predication', 'predic'],
      ['operator', 'oper'],
      ['feudalism', 'feudal'],
      ['decisiveness', 'decis'],
      ['hopefulness', 'hope'],
      ['callousness', 'callous'],
      ['formaliti', 'formal'],
      ['sensitiviti', 'sensit'],
      ['sensibiliti', 'sensibl'],
    ])('%s → %s', (input, expected) => {
      expect(stem(input)).toBe(expected);
    });
  });

  describe('step 3: -icate, -ative, -alize, -iciti, -ical, -ful, -ness', () => {
    test.each<Case>([
      ['triplicate', 'triplic'],
      ['formative', 'form'],
      ['formalize', 'formal'],
      ['electriciti', 'electr'],
      ['electrical', 'electr'],
      ['hopeful', 'hope'],
      ['goodness', 'good'],
    ])('%s → %s', (input, expected) => {
      expect(stem(input)).toBe(expected);
    });
  });

  describe('step 4: suffix removal when m > 1', () => {
    test.each<Case>([
      ['revival', 'reviv'],
      ['allowance', 'allow'],
      ['inference', 'infer'],
      ['airliner', 'airlin'],
      ['gyroscopic', 'gyroscop'],
      ['adjustable', 'adjust'],
      ['defensible', 'defens'],
      ['irritant', 'irrit'],
      ['replacement', 'replac'],
      ['adjustment', 'adjust'],
      ['dependent', 'depend'],
      ['adoption', 'adopt'],
      ['homologou', 'homolog'],
      ['communism', 'commun'],
      ['activate', 'activ'],
      ['effective', 'effect'],
      ['bowdlerize', 'bowdler'],
    ])('%s → %s', (input, expected) => {
      expect(stem(input)).toBe(expected);
    });

    test('suffix is not removed if stem m ≤ 1', () => {
      expect(stem('feudalism')).toBe('feudal');
      expect(stem('callousness')).toBe('callous');
    });
  });

  describe('step 5: terminal e and double l', () => {
    test.each<Case>([
      ['probate', 'probat'],
      ['rate', 'rate'],
      ['cease', 'ceas'],
      ['controll', 'control'],
      ['roll', 'roll'],
    ])('%s → %s', (input, expected) => {
      expect(stem(input)).toBe(expected);
    });
  });

  describe('words that do not change', () => {
    test.each(['cat', 'fox', 'brown', 'pillow', 'soup', 'year', 'dilemma', 'caress'])(
      '"%s" unchanged',
      (word) => {
        expect(stem(word)).toBe(word);
      },
    );
  });

  describe('short words and edge cases', () => {
    test('empty string → empty string', () => {
      expect(stem('')).toBe('');
    });

    test.each(['a', 'i', 'is', 'be', 'at', 'to', 'by'])(
      'word with length ≤ 2 ("%s") remains unchanged',
      (word) => {
        expect(stem(word)).toBe(word);
      },
    );

    test.each(['2024', '42', '007', '1'])('purely numeric token "%s" remains unchanged', (word) => {
      expect(stem(word)).toBe(word);
    });

    test('token with digits does not throw', () => {
      expect(() => stem('abc123')).not.toThrow();
      expect(() => stem('3d')).not.toThrow();
    });

    test('very long word does not throw and does not lengthen', () => {
      const word = 'a'.repeat(10_000);
      expect(stem(word).length).toBeLessThanOrEqual(word.length);
    });

    test('word consisting only of vowels / consonants', () => {
      expect(() => stem('aeiou')).not.toThrow();
      expect(() => stem('bcdfg')).not.toThrow();
      expect(stem('aeiou').length).toBeLessThanOrEqual(5);
      expect(stem('bcdfg').length).toBeLessThanOrEqual(5);
    });
  });

  describe('properties (on sample words)', () => {
    const SAMPLE = [
      'caresses',
      'ponies',
      'agreed',
      'motoring',
      'happy',
      'relational',
      'electrical',
      'adjustment',
      'controll',
      'generalizations',
      'running',
      'people',
      'searching',
      'indexes',
      'documents',
      'quickly',
      'a',
      'is',
      '2024',
    ];

    test('deterministic: same input → same output', () => {
      for (const w of SAMPLE) {
        expect(stem(w)).toBe(stem(w));
      }
    });

    test('never lengthens the word', () => {
      for (const w of SAMPLE) {
        expect(stem(w).length).toBeLessThanOrEqual(w.length);
      }
    });

    test('result is non-empty for non-empty input', () => {
      for (const w of SAMPLE) {
        expect(stem(w).length).toBeGreaterThan(0);
      }
    });
  });

  describe('same root for different word forms', () => {
    test.each([
      [['run', 'runs', 'running']],
      [['cat', 'cats']],
      [['connect', 'connected', 'connecting', 'connection', 'connections']],
      [['generalize', 'generalization', 'generalizations']],
    ])('%j reduce to the same stem', (forms) => {
      const roots = new Set(forms.map(stem));
      expect(roots.size).toBe(1);
    });
  });
});
