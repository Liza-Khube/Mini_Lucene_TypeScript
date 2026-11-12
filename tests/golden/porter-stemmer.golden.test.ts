import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test, expect } from 'vitest';
import { stem } from '../../src/domain/text-analyzer/porter-stemmer.js';

describe('Domain TextAnalyzer PorterStemmer GoldenTest', () => {
  test('correctly processes all words from the official dictionary', () => {
    const vocPath = join(__dirname, 'voc.txt');
    const outputPath = join(__dirname, 'output.txt');

    const vocLines = readFileSync(vocPath, 'utf-8').split(/\r?\n/);
    const expectedLines = readFileSync(outputPath, 'utf-8').split(/\r?\n/);

    expect(vocLines.length).toBeGreaterThan(0);
    expect(vocLines.length).toBe(expectedLines.length);

    for (let i = 0; i < vocLines.length; i++) {
      const word = vocLines[i]!.trim();
      const expectedWord = expectedLines[i]?.trim();

      if (!word) continue;

      const actualWord = stem(word);
      expect(actualWord).toBe(expectedWord);
    }
  });
});
