import { describe, expect, test } from 'vitest';
import {
  formatDocumentSource,
  isSupportedTextFile,
} from '../../../../src/application/search-engine/document-loader.js';

describe('Application SearchEngine DocumentLoader', () => {
  describe(isSupportedTextFile.name, () => {
    test.each([
      { fileName: 'doc.txt', expected: true },
      { fileName: 'DOC.TXT', expected: true },
      { fileName: 'Report.Txt', expected: true },
      { fileName: 'archive.tar.txt', expected: true },
      { fileName: 'notes.md', expected: false },
      { fileName: 'config.json', expected: false },
      { fileName: 'doc.txt.bak', expected: false },
      { fileName: 'README', expected: false },
      { fileName: '.txt', expected: false },
    ])('isSupportedTextFile($fileName) should be $expected', ({ fileName, expected }) => {
      expect(isSupportedTextFile(fileName)).toBe(expected);
    });
  });

  describe(formatDocumentSource.name, () => {
    test.each([
      { root: './docs', segments: ['doc003.txt'], expected: './docs/doc003.txt' },
      { root: './docs/', segments: ['sub', 'a.txt'], expected: './docs/sub/a.txt' },
      { root: './docs///', segments: ['a.txt'], expected: './docs/a.txt' },
      { root: '.', segments: ['a.txt'], expected: './a.txt' },
      { root: './', segments: ['a.txt'], expected: './a.txt' },
      { root: '/', segments: ['a.txt'], expected: '/a.txt' },
      { root: 'C:\\tmp\\docs', segments: ['a.txt'], expected: 'C:\\tmp\\docs\\a.txt' },
      { root: 'C:\\tmp\\docs\\', segments: ['sub', 'a.txt'], expected: 'C:\\tmp\\docs\\sub\\a.txt' },
      { root: 'C:\\', segments: ['a.txt'], expected: 'C:\\a.txt' },
      { root: 'C:\\\\\\', segments: ['a.txt'], expected: 'C:\\a.txt' },
      { root: '', segments: ['a.txt'], expected: 'a.txt' },
      { root: './docs', segments: [], expected: './docs' },
    ])('should format ($root, $segments) as $expected', ({ root, segments, expected }) => {
      expect(formatDocumentSource(root, segments)).toBe(expected);
    });
  });
});
