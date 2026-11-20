import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  DuplicateSourceError,
  IndexDirectoryError,
  IndexNotInitializedError,
  ParseError,
  SearchEngine,
} from '../../../../src/application/search-engine/public-api.js';
import { INVALID_TOP_K_CASES, README_CORPUS, createTempCorpus } from './fixtures.js';

describe('Application SearchEngine Errors', () => {
  describe(IndexNotInitializedError.name, () => {
    test('should be an Error subclass with expected name and message', () => {
      const error = new IndexNotInitializedError();

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(IndexNotInitializedError);
      expect(error.name).toBe('IndexNotInitializedError');
      expect(error.message).toMatch(/\S/);
    });

    test('should be thrown by search and stats before any indexing occurs', () => {
      const engine = new SearchEngine();

      expect(() => engine.search('people')).toThrow(IndexNotInitializedError);
      expect(() => engine.stats()).toThrow(IndexNotInitializedError);
    });
  });

  describe(IndexDirectoryError.name, () => {
    test('should be an Error subclass that stores directoryPath and optional cause', () => {
      const cause = new Error('ENOENT');
      const error = new IndexDirectoryError('./missing', 'Directory does not exist', { cause });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(IndexDirectoryError);
      expect(error.name).toBe('IndexDirectoryError');
      expect(error.directoryPath).toBe('./missing');
      expect(error.message).toBe('Directory does not exist');
      expect(error.cause).toBe(cause);
    });

    test.each(['', '   ', '\t\n'])(
      'should throw IndexDirectoryError for empty directory path %j',
      async (emptyPath) => {
        const engine = new SearchEngine();

        await expect(engine.index(emptyPath)).rejects.toThrow(IndexDirectoryError);
      },
    );

    test('should throw IndexDirectoryError when directory does not exist', async () => {
      const temp = await createTempCorpus({});
      try {
        const missingDir = join(temp.dirPath, 'does-not-exist');
        const engine = new SearchEngine();

        let caught: unknown;
        try {
          await engine.index(missingDir);
        } catch (error: unknown) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(IndexDirectoryError);
        expect((caught as IndexDirectoryError).directoryPath).toBe(missingDir);
        expect((caught as IndexDirectoryError).cause).toBeDefined();
      } finally {
        await temp.cleanup();
      }
    });

    test('should throw IndexDirectoryError when given a regular file path instead of a directory', async () => {
      const temp = await createTempCorpus({ 'doc.txt': 'hello world' });
      try {
        const filePath = join(temp.dirPath, 'doc.txt');
        const engine = new SearchEngine();

        let caught: unknown;
        try {
          await engine.index(filePath);
        } catch (error: unknown) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(IndexDirectoryError);
        expect((caught as IndexDirectoryError).directoryPath).toBe(filePath);
      } finally {
        await temp.cleanup();
      }
    });

    test('should preserve previous index atomically if directory indexing fails', async () => {
      const corpus = await createTempCorpus({ 'file.txt': 'kept document' });
      try {
        const engine = new SearchEngine();
        await engine.index(corpus.dirPath);

        await expect(engine.index(`${corpus.dirPath}-missing`)).rejects.toThrow(
          IndexDirectoryError,
        );

        expect(engine.stats()).toStrictEqual({ documentCount: 1, termCount: 2 });
        expect(engine.search('kept').hits.map((hit) => hit.source)).toStrictEqual([
          join(corpus.dirPath, 'file.txt'),
        ]);
      } finally {
        await corpus.cleanup();
      }
    });
  });

  describe(RangeError.name, () => {
    test.each(INVALID_TOP_K_CASES)(
      'should throw RangeError from constructor when defaultTopK is $name',
      ({ topK }) => {
        expect(() => new SearchEngine({ defaultTopK: topK })).toThrow(RangeError);
      },
    );

    test.each([
      { name: 'invalid k1', options: { k1: -1 } },
      { name: 'invalid b', options: { b: 2 } },
    ])('should eagerly throw RangeError from constructor when bm25 has $name', ({ options }) => {
      expect(() => new SearchEngine({ bm25: options })).toThrow(RangeError);
    });

    test('should throw RangeError from search for invalid topK even on empty or stop-word queries', () => {
      const engine = new SearchEngine();
      engine.indexDocuments(README_CORPUS);

      expect(() => engine.search('people', { topK: -1 })).toThrow(RangeError);
      expect(() => engine.search('', { topK: -1 })).toThrow(RangeError);
      expect(() => engine.search('the', { topK: -1 })).toThrow(RangeError);
    });
  });

  describe('re-exported domain and data errors', () => {
    test('should propagate ParseError on invalid search query syntax', () => {
      const engine = new SearchEngine();
      engine.indexDocuments([{ source: 'doc.txt', rawText: 'people and soup' }]);

      expect(() => engine.search('AND')).toThrow(ParseError);
    });

    test('should throw DuplicateSourceError and preserve the previous index atomically', () => {
      const engine = new SearchEngine();
      engine.indexDocuments([{ source: 'keep.txt', rawText: 'persistent knowledge' }]);

      expect(() =>
        engine.indexDocuments([
          { source: 'dup.txt', rawText: 'first' },
          { source: 'dup.txt', rawText: 'second' },
        ]),
      ).toThrow(DuplicateSourceError);

      expect(engine.stats()).toStrictEqual({ documentCount: 1, termCount: 2 });
      expect(engine.search('persistent').hits.map((hit) => hit.source)).toStrictEqual(['keep.txt']);
    });
  });
});
