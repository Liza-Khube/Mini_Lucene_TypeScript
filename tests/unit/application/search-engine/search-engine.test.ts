import { mkdir, rm, symlink } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_TOP_K,
  SearchEngine,
  type IDocumentInput,
} from '../../../../src/application/search-engine/public-api.js';
import { RANKING_CORPUS, README_CORPUS, createTempCorpus } from './fixtures.js';

describe('Application SearchEngine', () => {
  describe('defaults and constructor options', () => {
    test('should set DEFAULT_TOP_K to 10', () => {
      expect(DEFAULT_TOP_K).toBe(10);
    });

    test('should snapshot bm25 options defensively so later caller mutations have no effect', () => {
      const bm25Options = { k1: 1.5, b: 0.5 };
      const engine = new SearchEngine({ bm25: bm25Options });
      bm25Options.k1 = 99;
      bm25Options.b = 0;

      const snapshotEngine = new SearchEngine({ bm25: { k1: 1.5, b: 0.5 } });
      engine.indexDocuments(README_CORPUS);
      snapshotEngine.indexDocuments(README_CORPUS);

      expect(engine.search('people').hits).toStrictEqual(snapshotEngine.search('people').hits);
    });
  });

  describe('lifecycle and stats', () => {
    test('should start unindexed and become indexed after indexDocuments', () => {
      const engine = new SearchEngine();

      expect(engine.isIndexed).toBe(false);

      const indexResult = engine.indexDocuments(README_CORPUS);

      expect(engine.isIndexed).toBe(true);
      expect(indexResult.documentCount).toBe(4);
      expect(indexResult.termCount).toBeGreaterThan(0);
      expect(indexResult.durationMs).toBeGreaterThanOrEqual(0);
      expect(indexResult.skippedFiles).toStrictEqual([]);
      expect(engine.stats()).toStrictEqual({
        documentCount: indexResult.documentCount,
        termCount: indexResult.termCount,
      });
    });

    test('should replace the previous index completely when re-indexed', () => {
      const engine = new SearchEngine();
      engine.indexDocuments([{ source: 'old.txt', rawText: 'ancient mammoth fossil' }]);
      expect(engine.search('mammoth').totalHits).toBe(1);

      engine.indexDocuments([{ source: 'new.txt', rawText: 'modern rocket science' }]);

      expect(engine.stats().documentCount).toBe(1);
      expect(engine.search('mammoth').totalHits).toBe(0);
      expect(engine.search('rocket').hits.map((hit) => hit.source)).toStrictEqual(['new.txt']);
    });

    test('should assign deterministic DocIds sorted by source without mutating caller input', () => {
      const input: IDocumentInput[] = [
        { source: 'c.txt', rawText: 'alpha' },
        { source: 'a.txt', rawText: 'alpha' },
        { source: 'b.txt', rawText: 'alpha' },
      ];
      const frozenInput = Object.freeze([...input]);

      const engineA = new SearchEngine();
      engineA.indexDocuments(frozenInput);

      const engineB = new SearchEngine();
      engineB.indexDocuments([...input].reverse());

      expect(input.map((doc) => doc.source)).toStrictEqual(['c.txt', 'a.txt', 'b.txt']);
      expect(
        engineA.search('alpha').hits.map((h) => ({ docId: h.docId, source: h.source })),
      ).toStrictEqual([
        { docId: 0, source: 'a.txt' },
        { docId: 1, source: 'b.txt' },
        { docId: 2, source: 'c.txt' },
      ]);
      expect(engineB.search('alpha').hits).toStrictEqual(
        engineA.search('alpha').hits.map((hit) => ({ ...hit })),
      );
    });

    test('should allow indexing an empty document collection', () => {
      const emptyEngine = new SearchEngine();
      const emptyStats = emptyEngine.indexDocuments([]);

      expect(emptyEngine.isIndexed).toBe(true);
      expect(emptyStats.documentCount).toBe(0);
      expect(emptyStats.termCount).toBe(0);
      expect(emptyEngine.search('cat').totalHits).toBe(0);
    });
  });

  describe('directory indexing', () => {
    test('should index .txt files recursively, skip non-.txt files, and search them accurately', async () => {
      const corpus = await createTempCorpus({
        'doc003.txt': 'many people gather and people share stories people love',
        'nested/doc001.txt': 'soup and people eat warm soup',
        'nested/doc004.TXT': 'kind people live here',
        'ignore.md': 'people ignore markdown',
        'nested/meta.json': '{"people": true}',
      });

      try {
        const engine = new SearchEngine();
        const result = await engine.index(corpus.dirPath);

        expect(engine.isIndexed).toBe(true);
        expect(result.documentCount).toBe(3);
        expect(result.skippedFiles).toHaveLength(2);
        expect(result.skippedFiles.map((file) => file.reason)).toStrictEqual([
          'Unsupported file format (only .txt files are supported)',
          'Unsupported file format (only .txt files are supported)',
        ]);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);

        const searchResult = engine.search('people AND NOT soup');
        expect(searchResult.status).toBe('ok');
        expect(searchResult.totalHits).toBe(2);
        expect(searchResult.hits.map((hit) => hit.rank)).toStrictEqual([1, 2]);
        expect(searchResult.hits[0]!.matches).toStrictEqual([
          { term: 'people', indexedTerm: 'peopl', positions: [2, 5, 8] },
        ]);
      } finally {
        await corpus.cleanup();
      }
    });

    test('should support relative directory paths when indexing on the same drive', async () => {
      const corpus = await createTempCorpus({
        'a.txt': 'people enjoy search',
      });

      try {
        const relativeDir = relative(process.cwd(), corpus.dirPath);
        if (relativeDir !== '' && !relativeDir.includes(':')) {
          const normalizedRelative = relativeDir.replaceAll('\\', '/');
          const engine = new SearchEngine();
          const result = await engine.index(normalizedRelative);

          expect(result.documentCount).toBe(1);
          const searchResult = engine.search('people');
          expect(searchResult.hits[0]!.source).toBe(`${normalizedRelative}/a.txt`);
        }
      } finally {
        await corpus.cleanup();
      }
    });

    test('should produce valid empty index for directory with no .txt files', async () => {
      const corpus = await createTempCorpus({
        'notes.md': 'not indexed',
      });

      try {
        const engine = new SearchEngine();
        const result = await engine.index(corpus.dirPath);

        expect(engine.isIndexed).toBe(true);
        expect(result.documentCount).toBe(0);
        expect(result.termCount).toBe(0);
        expect(result.skippedFiles).toHaveLength(1);
      } finally {
        await corpus.cleanup();
      }
    });

    test('should filter .txt extension case-insensitively and skip edge-case non-.txt filenames', async () => {
      const corpus = await createTempCorpus({
        'Report.Txt': 'valid report content',
        'archive.tar.txt': 'valid archive content',
        'doc.txt.bak': 'backup should be skipped',
        README: 'readme should be skipped',
        '.txt': 'dotfile should be skipped',
      });

      try {
        const engine = new SearchEngine();
        const result = await engine.index(corpus.dirPath);

        expect(result.documentCount).toBe(2);
        expect(engine.search('valid').hits.map((hit) => hit.source).sort()).toStrictEqual(
          [join(corpus.dirPath, 'Report.Txt'), join(corpus.dirPath, 'archive.tar.txt')].sort(),
        );
        expect(result.skippedFiles).toStrictEqual([
          {
            path: join(corpus.dirPath, '.txt'),
            reason: 'Unsupported file format (only .txt files are supported)',
          },
          {
            path: join(corpus.dirPath, 'README'),
            reason: 'Unsupported file format (only .txt files are supported)',
          },
          {
            path: join(corpus.dirPath, 'doc.txt.bak'),
            reason: 'Unsupported file format (only .txt files are supported)',
          },
        ]);
      } finally {
        await corpus.cleanup();
      }
    });

    test('should normalize trailing path separators when formatting indexed document sources', async () => {
      const corpus = await createTempCorpus({
        'sub/a.txt': 'alpha',
      });

      try {
        const engine = new SearchEngine();

        await engine.index(`${corpus.dirPath}${sep}${sep}`);
        expect(engine.search('alpha').hits.map((hit) => hit.source)).toStrictEqual([
          join(corpus.dirPath, 'sub', 'a.txt'),
        ]);

        const slashRoot = corpus.dirPath.replaceAll('\\', '/');
        await engine.index(`${slashRoot}///`);
        expect(engine.search('alpha').hits.map((hit) => hit.source)).toStrictEqual([
          `${slashRoot}/sub/a.txt`,
        ]);
      } finally {
        await corpus.cleanup();
      }
    });

    test('should follow directory symlinks, break cycles, and skip broken symlinks', async () => {
      const corpus = await createTempCorpus({
        'root.txt': 'signal root',
        'sub/nested.txt': 'signal nested',
      });
      const external = await createTempCorpus({
        'linked.txt': 'signal external',
      });

      try {
        await symlink(external.dirPath, join(corpus.dirPath, 'linked-dir'), 'junction');
        await symlink(corpus.dirPath, join(corpus.dirPath, 'sub', 'loop'), 'junction');

        const doomedDir = join(corpus.dirPath, 'doomed');
        await mkdir(doomedDir);
        const brokenLinkPath = join(corpus.dirPath, 'broken-link');
        await symlink(doomedDir, brokenLinkPath, 'junction');
        await rm(doomedDir, { recursive: true, force: true });

        const engine = new SearchEngine();
        const result = await engine.index(corpus.dirPath);

        expect(result.documentCount).toBe(3);
        expect(engine.search('external').hits.map((hit) => hit.source)).toStrictEqual([
          join(corpus.dirPath, 'linked-dir', 'linked.txt'),
        ]);
        expect(result.skippedFiles).toStrictEqual([
          { path: brokenLinkPath, reason: 'Broken symbolic link' },
        ]);
      } finally {
        await corpus.cleanup();
        await external.cleanup();
      }
    });
  });

  describe('search behavior', () => {
    test('should match readme.md people AND NOT soup scenario with ranks, scores, and positions', () => {
      const engine = new SearchEngine();
      engine.indexDocuments(README_CORPUS);

      const result = engine.search('people AND NOT soup');
      expect(result.status).toBe('ok');

      expect(result.query).toBe('people AND NOT soup');
      expect(result.totalHits).toBe(2);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.hits).toHaveLength(2);

      const [first, second] = result.hits;
      expect(first!.rank).toBe(1);
      expect(first!.source).toBe('./docs/doc003.txt');
      expect(first!.score).toBeGreaterThan(second!.score);
      expect(first!.matches).toStrictEqual([
        { term: 'people', indexedTerm: 'peopl', positions: [2, 5, 8] },
      ]);

      expect(second!.rank).toBe(2);
      expect(second!.source).toBe('./docs/doc004.txt');
      expect(second!.matches).toStrictEqual([
        { term: 'people', indexedTerm: 'peopl', positions: [2] },
      ]);
    });

    test('should execute phrase queries and return matches for phrase terms', () => {
      const engine = new SearchEngine();
      engine.indexDocuments([
        { source: 'match.txt', rawText: 'a brown pillow' },
        { source: 'other.txt', rawText: 'a brown table' },
      ]);

      const result = engine.search('"brown pillows"');
      expect(result.status).toBe('ok');
      expect(result.hits.map((h) => h.source)).toStrictEqual(['match.txt']);
      expect(result.hits[0]!.matches).toStrictEqual([
        { term: 'brown', indexedTerm: 'brown', positions: [2] },
        { term: 'pillows', indexedTerm: 'pillow', positions: [3] },
      ]);
    });

    test('should include only positive matched terms present in each hit document', () => {
      const engine = new SearchEngine();
      engine.indexDocuments([
        { source: 'only-cat.txt', rawText: 'cat alone' },
        { source: 'only-dog.txt', rawText: 'dog alone' },
        { source: 'both.txt', rawText: 'cat dog' },
      ]);

      const orResult = engine.search('cats OR dogs');
      const bySource = new Map(orResult.hits.map((hit) => [hit.source, hit]));

      expect(bySource.get('only-cat.txt')!.matches).toStrictEqual([
        { term: 'cats', indexedTerm: 'cat', positions: [1] },
      ]);
      expect(bySource.get('only-dog.txt')!.matches).toStrictEqual([
        { term: 'dogs', indexedTerm: 'dog', positions: [1] },
      ]);
      expect(bySource.get('both.txt')!.matches).toStrictEqual([
        { term: 'cats', indexedTerm: 'cat', positions: [1] },
        { term: 'dogs', indexedTerm: 'dog', positions: [2] },
      ]);
    });

    test('should handle pure NOT, double negation, and duplicate stemmed query terms cleanly', () => {
      const engine = new SearchEngine();
      engine.indexDocuments([
        { source: 'a.txt', rawText: 'cat' },
        { source: 'b.txt', rawText: 'dog' },
      ]);

      const pureNot = engine.search('NOT cat');
      expect(pureNot.hits).toStrictEqual([
        { rank: 1, docId: 1, source: 'b.txt', score: 0, matches: [] },
      ]);

      const doubleNot = engine.search('NOT (cats AND NOT dogs)');
      expect(doubleNot.hits.map((h) => ({ source: h.source, matches: h.matches }))).toStrictEqual([
        {
          source: 'b.txt',
          matches: [{ term: 'dogs', indexedTerm: 'dog', positions: [1] }],
        },
      ]);

      const repeatedStem = engine.search('cats AND cat');
      expect(repeatedStem.hits[0]!.matches).toStrictEqual([
        { term: 'cats', indexedTerm: 'cat', positions: [1] },
      ]);
    });

    test('should respect defaultTopK, per-search topK, topK=0, and topK > totalHits', () => {
      const engine = new SearchEngine();
      engine.indexDocuments(RANKING_CORPUS);

      const defaultResult = engine.search('cat');
      expect(defaultResult.totalHits).toBe(15);
      expect(defaultResult.hits).toHaveLength(DEFAULT_TOP_K);
      expect(defaultResult.hits.map((h) => h.rank)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const customDefaultEngine = new SearchEngine({ defaultTopK: 3 });
      customDefaultEngine.indexDocuments(RANKING_CORPUS);
      expect(customDefaultEngine.search('cat').hits).toHaveLength(3);
      expect(customDefaultEngine.search('cat', { topK: 5 }).hits).toHaveLength(5);
      expect(customDefaultEngine.search('cat', { topK: 100 }).hits).toHaveLength(15);

      const zeroTopK = engine.search('cat', { topK: 0 });
      expect(zeroTopK.totalHits).toBe(15);
      expect(zeroTopK.hits).toStrictEqual([]);
    });

    test('should apply configured BM25 options when scoring hits', () => {
      const defaultEngine = new SearchEngine();
      const binaryTfEngine = new SearchEngine({ bm25: { k1: 0, b: 0 } });
      const docs: readonly IDocumentInput[] = [
        { source: 'one.txt', rawText: 'cat pad pad pad' },
        { source: 'many.txt', rawText: 'cat cat cat cat' },
      ];

      defaultEngine.indexDocuments(docs);
      binaryTfEngine.indexDocuments(docs);

      const defaultHits = defaultEngine.search('cat').hits;
      const binaryHits = binaryTfEngine.search('cat').hits;

      expect(defaultHits[0]!.score).toBeGreaterThan(defaultHits[1]!.score);
      expect(binaryHits[0]!.score).toBeCloseTo(binaryHits[1]!.score, 10);
      expect(binaryHits.map((h) => h.source)).toStrictEqual(['many.txt', 'one.txt']);
    });

    test('should return empty-query and stop-words-only statuses instead of throwing', () => {
      const engine = new SearchEngine();
      engine.indexDocuments(README_CORPUS);

      for (const emptyQuery of ['', '   ', '!!!']) {
        const result = engine.search(emptyQuery);
        expect(result.status).toBe('empty-query');
        expect(result.totalHits).toBe(0);
        expect(result.hits).toStrictEqual([]);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        if (result.status !== 'ok') {
          expect(result.message).toMatch(/\S/);
        }
      }

      for (const stopQuery of ['the', 'the AND of', 'NOT in']) {
        const result = engine.search(stopQuery);
        expect(result.status).toBe('stop-words-only');
        expect(result.totalHits).toBe(0);
        expect(result.hits).toStrictEqual([]);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        if (result.status !== 'ok') {
          expect(result.message).toMatch(/\S/);
        }
      }
    });

    test('should ignore stop words mixed with positive terms and skip negated phrases in matches', () => {
      const readmeEngine = new SearchEngine();
      readmeEngine.indexDocuments(README_CORPUS);

      const mixedStopResult = readmeEngine.search('the AND people');
      expect(mixedStopResult.status).toBe('ok');
      expect(mixedStopResult.totalHits).toBe(3);
      expect(mixedStopResult.hits[0]!.matches).toStrictEqual([
        { term: 'people', indexedTerm: 'peopl', positions: [2, 5, 8] },
      ]);

      const negatedPhraseResult = readmeEngine.search('people AND NOT "warm soup"');
      expect(negatedPhraseResult.status).toBe('ok');
      expect(negatedPhraseResult.hits.map((h) => h.source)).toStrictEqual([
        './docs/doc003.txt',
        './docs/doc004.txt',
      ]);
      expect(negatedPhraseResult.hits[0]!.matches).toStrictEqual([
        { term: 'people', indexedTerm: 'peopl', positions: [2, 5, 8] },
      ]);

      const phraseEngine = new SearchEngine();
      phraseEngine.indexDocuments([{ source: 'match.txt', rawText: 'a brown pillow' }]);
      const stopPhraseResult = phraseEngine.search('"a brown pillow"');
      expect(stopPhraseResult.status).toBe('ok');
      expect(stopPhraseResult.hits[0]!.matches).toStrictEqual([
        { term: 'brown', indexedTerm: 'brown', positions: [2] },
        { term: 'pillow', indexedTerm: 'pillow', positions: [3] },
      ]);
    });

    test('should return empty hits for missing terms without throwing', () => {
      const engine = new SearchEngine();
      engine.indexDocuments(README_CORPUS);

      const result = engine.search('nonexistentterm');
      expect(result.status).toBe('ok');
      expect(result.totalHits).toBe(0);
      expect(result.hits).toStrictEqual([]);
    });
  });
});
