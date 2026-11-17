import { describe, expect, test } from 'vitest';
import {
  DuplicateSourceError,
  InvalidTokenPositionError,
  InvertedIndex,
} from '../../../../src/data/inverted-index/public-api.js';
import type {
  DocId,
  IDocumentInfo,
  IPosting,
  IToken,
} from '../../../../src/data/inverted-index/public-api.js';
import {
  SAMPLE_DOCS,
  SAMPLE_TERMS,
  buildIndex,
  toTokens,
  wordsOfLength,
  type DocSpec,
  type Mutable,
} from './fixtures.js';

describe('InvertedIndex', () => {
  describe('empty index', () => {
    test('should report zero documents, zero terms and zero average document length', () => {
      const index = new InvertedIndex();

      expect(index.documentCount).toBe(0);
      expect(index.termCount).toBe(0);
      expect(index.averageDocumentLength).toBe(0);
      expect(Number.isNaN(index.averageDocumentLength)).toBe(false);
    });

    test('should have no DocIds', () => {
      const index = new InvertedIndex();

      expect(index.getAllDocIds()).toEqual([]);
    });

    test.each(['cat', '', 'two words', 'ünïcödé', '42'])(
      'should return empty results for the unknown term %j',
      (term) => {
        const index = new InvertedIndex();

        expect(index.hasTerm(term)).toBe(false);
        expect(index.getPostings(term).toArray()).toEqual([]);
        expect(index.getPostings(term).hasNext()).toBe(false);
        expect(index.getPositions(term, 0).toArray()).toEqual([]);
        expect(index.getPositions(term, 0).hasNext()).toBe(false);
        expect(index.getTermFrequency(term, 0)).toBe(0);
        expect(index.getDocumentFrequency(term)).toBe(0);
      },
    );
  });

  describe('DocId assignment', () => {
    test('should assign DocId 0 to the first added document', () => {
      const index = new InvertedIndex();

      expect(index.addDocument('a.txt', toTokens('cat'))).toBe(0);
    });

    test.each([1, 2, 5, 50])(
      'should assign sequential DocIds starting from 0 for %i documents',
      (count) => {
        const index = new InvertedIndex();

        const ids: DocId[] = Array.from({ length: count }, (_, i) =>
          index.addDocument(`doc${i}.txt`, toTokens('cat')),
        );

        const expected = Array.from({ length: count }, (_, i) => i);
        expect(ids).toEqual(expected);
        expect(index.getAllDocIds()).toEqual(expected);
      },
    );

    test('should assign DocIds in insertion order regardless of source name ordering', () => {
      const index = new InvertedIndex();

      expect(index.addDocument('z.txt', toTokens('cat'))).toBe(0);
      expect(index.addDocument('a.txt', toTokens('cat'))).toBe(1);
      expect(index.addDocument('m.txt', toTokens('cat'))).toBe(2);
    });

    test.each([0, 1, 2, 10])(
      'should have documentCount equal to %i after adding that many documents',
      (count) => {
        const index = new InvertedIndex();

        for (let i = 0; i < count; i++) {
          index.addDocument(`doc${i}.txt`, toTokens('cat'));
        }

        expect(index.documentCount).toBe(count);
      },
    );

    test('should yield identical DocIds, postings and documents when built twice from the same input', () => {
      const first = buildIndex(SAMPLE_DOCS);
      const second = buildIndex(SAMPLE_DOCS);

      expect(second.getAllDocIds()).toEqual(first.getAllDocIds());
      expect(second.termCount).toBe(first.termCount);
      for (const term of SAMPLE_TERMS) {
        expect(second.getPostings(term).toArray()).toEqual(first.getPostings(term).toArray());
      }
      for (const docId of first.getAllDocIds()) {
        expect(second.getDocument(docId)).toEqual(first.getDocument(docId));
      }
    });
  });

  describe('document table (DocId -> source, length)', () => {
    test('should map a DocId back to the source it was added with', () => {
      const index = new InvertedIndex();
      const idA = index.addDocument('./docs/a.txt', toTokens('cat'));
      const idB = index.addDocument('./docs/b.txt', toTokens('dog bird'));

      expect(index.getDocument(idA)?.source).toBe('./docs/a.txt');
      expect(index.getDocument(idB)?.source).toBe('./docs/b.txt');
    });

    test('should return the full document record with docId, source and length', () => {
      const index = new InvertedIndex();
      const id = index.addDocument('a.txt', toTokens('cat dog cat'));

      expect(index.getDocument(id)).toEqual({ docId: 0, source: 'a.txt', length: 3 });
    });

    test.each([-1, 2, 99, 1.5, Number.NaN])(
      'should return undefined for the unknown DocId %s',
      (unknownId) => {
        const index = buildIndex([
          ['a.txt', 'cat'],
          ['b.txt', 'dog'],
        ]);

        expect(index.getDocument(unknownId)).toBeUndefined();
      },
    );

    test('should not index the source string as a term', () => {
      const index = new InvertedIndex();
      index.addDocument('people.txt', toTokens('cat'));

      expect(index.hasTerm('people.txt')).toBe(false);
      expect(index.hasTerm('people')).toBe(false);
      expect(index.termCount).toBe(1);
    });
  });

  describe('source uniqueness', () => {
    test('should throw DuplicateSourceError when the same source is added twice', () => {
      const index = new InvertedIndex();
      index.addDocument('a.txt', toTokens('cat'));

      expect(() => index.addDocument('a.txt', toTokens('dog'))).toThrow(DuplicateSourceError);
    });

    test('should leave the index unchanged after a rejected duplicate', () => {
      const index = new InvertedIndex();
      index.addDocument('a.txt', toTokens('cat'));

      expect(() => index.addDocument('a.txt', toTokens('dog fish'))).toThrow();

      expect(index.documentCount).toBe(1);
      expect(index.termCount).toBe(1);
      expect(index.hasTerm('dog')).toBe(false);
      expect(index.getPostings('dog').toArray()).toEqual([]);
      expect(index.getDocumentFrequency('cat')).toBe(1);
      expect(index.averageDocumentLength).toBe(1);
    });

    test('should not consume a DocId when a duplicate is rejected', () => {
      const index = new InvertedIndex();
      index.addDocument('a.txt', toTokens('cat'));
      expect(() => index.addDocument('a.txt', toTokens('dog'))).toThrow();

      expect(index.addDocument('b.txt', toTokens('dog'))).toBe(1);
      expect(index.getAllDocIds()).toEqual([0, 1]);
    });

    test.each([
      { first: 'a.txt', second: 'A.txt' },
      { first: './docs/a.txt', second: 'docs/a.txt' },
      { first: 'docs/a.txt', second: 'docs/a.txt ' },
    ])(
      'should treat sources "$first" and "$second" as different (source is an opaque identifier)',
      ({ first, second }) => {
        const index = new InvertedIndex();
        index.addDocument(first, toTokens('cat'));

        expect(() => index.addDocument(second, toTokens('cat'))).not.toThrow();
        expect(index.documentCount).toBe(2);
      },
    );
  });

  describe('token position validation', () => {
    test.each([
      { name: 'zero position', tokens: [{ term: 'cat', position: 0 }] },
      { name: 'negative position', tokens: [{ term: 'cat', position: -1 }] },
      { name: 'non-integer position', tokens: [{ term: 'cat', position: 1.5 }] },
      { name: 'NaN position', tokens: [{ term: 'cat', position: Number.NaN }] },
      {
        name: 'duplicate positions',
        tokens: [
          { term: 'cat', position: 1 },
          { term: 'dog', position: 1 },
        ],
      },
      {
        name: 'unsorted descending positions',
        tokens: [
          { term: 'cat', position: 3 },
          { term: 'dog', position: 2 },
        ],
      },
    ])('should throw InvalidTokenPositionError on $name', ({ tokens }) => {
      const index = new InvertedIndex();

      expect(() => index.addDocument('a.txt', tokens)).toThrow(InvalidTokenPositionError);
    });

    test('should leave the index unchanged after rejecting invalid token positions', () => {
      const index = new InvertedIndex();
      index.addDocument('a.txt', toTokens('cat'));

      expect(() =>
        index.addDocument('b.txt', [
          { term: 'dog', position: 2 },
          { term: 'fish', position: 1 },
        ]),
      ).toThrow(InvalidTokenPositionError);

      expect(index.documentCount).toBe(1);
      expect(index.termCount).toBe(1);
      expect(index.hasTerm('dog')).toBe(false);
      expect(index.hasTerm('fish')).toBe(false);
      expect(index.averageDocumentLength).toBe(1);
      expect(index.addDocument('b.txt', toTokens('bird'))).toBe(1);
    });
  });

  describe('document length', () => {
    test.each([
      { name: 'an empty document', text: '', expected: 0 },
      { name: 'a single-word document', text: 'cat', expected: 1 },
      { name: 'distinct words', text: 'cat dog bird', expected: 3 },
      { name: 'repeated words (every occurrence counts)', text: 'cat cat cat dog', expected: 4 },
    ])('should have length $expected for $name', ({ text, expected }) => {
      const index = new InvertedIndex();
      const id = index.addDocument('a.txt', toTokens(text));

      expect(index.getDocument(id)?.length).toBe(expected);
    });

    test('should count indexed tokens, not the highest position, when stop-words leave gaps', () => {
      const tokens: IToken[] = [
        { term: 'quick', position: 2 },
        { term: 'brown', position: 3 },
        { term: 'fox', position: 4 },
        { term: 'hound', position: 7 },
      ];
      const index = new InvertedIndex();
      const id = index.addDocument('a.txt', tokens);

      expect(index.getDocument(id)?.length).toBe(4);
    });

    test.each([
      { lengths: [3], expected: 3 },
      { lengths: [2, 4], expected: 3 },
      { lengths: [1, 2, 3, 4], expected: 2.5 },
      { lengths: [0, 4], expected: 2 },
      { lengths: [0, 0], expected: 0 },
    ])(
      'should compute averageDocumentLength as $expected for document lengths $lengths',
      ({ lengths, expected }) => {
        const index = new InvertedIndex();
        lengths.forEach((len, i) => index.addDocument(`doc${i}.txt`, toTokens(wordsOfLength(len))));

        expect(index.averageDocumentLength).toBeCloseTo(expected, 10);
        expect(Number.isFinite(index.averageDocumentLength)).toBe(true);
      },
    );
  });

  describe('edge cases: empty and single-word documents', () => {
    test('should index an empty document without error', () => {
      const index = new InvertedIndex();

      expect(() => index.addDocument('empty.txt', [])).not.toThrow();
      expect(index.documentCount).toBe(1);
      expect(index.termCount).toBe(0);
      expect(index.getDocument(0)).toEqual({ docId: 0, source: 'empty.txt', length: 0 });
    });

    test('should not include an empty document in postings and should not break later DocIds', () => {
      const index = new InvertedIndex();
      index.addDocument('a.txt', toTokens('cat'));
      index.addDocument('empty.txt', []);
      const lastId = index.addDocument('c.txt', toTokens('cat'));

      expect(lastId).toBe(2);
      expect(
        index
          .getPostings('cat')
          .toArray()
          .map((p) => p.docId),
      ).toEqual([0, 2]);
      expect(index.getAllDocIds()).toEqual([0, 1, 2]);
    });

    test('should index a single-word document', () => {
      const index = new InvertedIndex();
      const id = index.addDocument('one.txt', toTokens('cat'));

      expect(index.getDocument(id)?.length).toBe(1);
      expect(index.getPostings('cat').toArray()).toEqual([{ docId: 0, positions: [1] }]);
      expect(index.termCount).toBe(1);
    });
  });

  describe('postings and positions', () => {
    test('should store a posting with the DocId and all positions of the term', () => {
      const index = buildIndex([['a.txt', 'cat dog cat']]);

      expect(index.getPostings('cat').toArray()).toEqual([{ docId: 0, positions: [1, 3] }]);
      expect(index.getPostings('dog').toArray()).toEqual([{ docId: 0, positions: [2] }]);
    });

    test('should iterate postings and positions via cursor methods and for..of', () => {
      const index = buildIndex(SAMPLE_DOCS);

      const postingsCursor = index.getPostings('cat');
      expect(postingsCursor.hasNext()).toBe(true);
      expect(postingsCursor.next()).toEqual({ docId: 0, positions: [1, 3, 4] });
      expect(postingsCursor.current()).toEqual({ docId: 0, positions: [1, 3, 4] });
      expect(postingsCursor.next()).toEqual({ docId: 1, positions: [1] });
      expect(postingsCursor.hasNext()).toBe(false);
      expect(postingsCursor.next()).toBeUndefined();

      expect([...index.getPositions('cat', 0)]).toEqual([1, 3, 4]);
    });

    test('should keep positions within a document 1-based and strictly ascending', () => {
      const index = buildIndex([['a.txt', 'cat dog cat bird cat']]);
      const positions = index.getPositions('cat', 0).toArray();

      expect(positions).toEqual([1, 3, 5]);
      expect(Math.min(...positions)).toBeGreaterThanOrEqual(1);
      positions.slice(1).forEach((p, i) => expect(p).toBeGreaterThan(positions[i] as number));
    });

    test('should keep original positions when stop-words leave gaps', () => {
      const tokens: IToken[] = [
        { term: 'fox', position: 1 },
        { term: 'hound', position: 4 },
        { term: 'jumps', position: 5 },
      ];
      const index = new InvertedIndex();
      index.addDocument('a.txt', tokens);

      expect(index.getPositions('fox', 0).toArray()).toEqual([1]);
      expect(index.getPositions('hound', 0).toArray()).toEqual([4]);
      expect(index.getPositions('jumps', 0).toArray()).toEqual([5]);
    });

    test('should list postings ordered by DocId ascending', () => {
      const index = buildIndex([
        ['d0.txt', 'cat'],
        ['d1.txt', 'dog'],
        ['d2.txt', 'cat dog'],
        ['d3.txt', 'cat'],
      ]);

      expect(
        index
          .getPostings('cat')
          .toArray()
          .map((p) => p.docId),
      ).toEqual([0, 2, 3]);
      expect(
        index
          .getPostings('dog')
          .toArray()
          .map((p) => p.docId),
      ).toEqual([1, 2]);
    });

    test('should contain only documents that include the term', () => {
      const index = buildIndex([
        ['d0.txt', 'cat'],
        ['d1.txt', 'dog'],
      ]);

      expect(
        index
          .getPostings('cat')
          .toArray()
          .map((p) => p.docId),
      ).toEqual([0]);
      expect(
        index
          .getPostings('dog')
          .toArray()
          .map((p) => p.docId),
      ).toEqual([1]);
    });

    test('should keep positions of the same term independent per document', () => {
      const index = buildIndex([
        ['d0.txt', 'cat dog'],
        ['d1.txt', 'dog cat cat'],
      ]);

      expect(index.getPostings('cat').toArray()).toEqual([
        { docId: 0, positions: [1] },
        { docId: 1, positions: [2, 3] },
      ]);
    });

    test('should create a dictionary entry for a term that first appears in a later document', () => {
      const index = buildIndex([
        ['d0.txt', 'cat'],
        ['d1.txt', 'cat'],
        ['d2.txt', 'dog'],
      ]);

      expect(index.hasTerm('dog')).toBe(true);
      expect(index.getPostings('dog').toArray()).toEqual([{ docId: 2, positions: [1] }]);
    });

    test.each([
      { term: 'cat', docId: 0, expected: [1, 3, 4] },
      { term: 'cat', docId: 1, expected: [1] },
      { term: 'dog', docId: 1, expected: [] },
      { term: 'fish', docId: 0, expected: [] },
      { term: 'cat', docId: 42, expected: [] },
      { term: 'cat', docId: -1, expected: [] },
      { term: 'cat', docId: 1.5, expected: [] },
      { term: 'cat', docId: Number.NaN, expected: [] },
    ])(
      'should return $expected from getPositions("$term", $docId)',
      ({ term, docId, expected }) => {
        const index = buildIndex([
          ['d0.txt', 'cat dog cat cat'],
          ['d1.txt', 'cat bird'],
        ]);

        expect(index.getPositions(term, docId).toArray()).toEqual(expected);
      },
    );

    test('should return an empty postings cursor (not undefined, not an error) for an unknown term', () => {
      const index = buildIndex(SAMPLE_DOCS);

      expect(() => index.getPostings('fish')).not.toThrow();
      expect(index.getPostings('fish').toArray()).toEqual([]);
      expect(index.getPostings('fish').hasNext()).toBe(false);
    });
  });

  describe('term frequency and document frequency (BM25 inputs)', () => {
    test.each([
      { term: 'cat', docId: 0, tf: 3 },
      { term: 'cat', docId: 1, tf: 1 },
      { term: 'cat', docId: 2, tf: 0 },
      { term: 'dog', docId: 0, tf: 1 },
      { term: 'dog', docId: 1, tf: 0 },
      { term: 'bird', docId: 0, tf: 0 },
      { term: 'fish', docId: 0, tf: 0 },
      { term: 'cat', docId: 99, tf: 0 },
      { term: 'cat', docId: -1, tf: 0 },
      { term: 'cat', docId: 1.5, tf: 0 },
      { term: 'cat', docId: Number.NaN, tf: 0 },
    ])('should return tf=$tf for "$term" in doc $docId', ({ term, docId, tf }) => {
      const index = buildIndex(SAMPLE_DOCS);

      expect(index.getTermFrequency(term, docId)).toBe(tf);
    });

    test.each([
      { term: 'cat', df: 2 },
      { term: 'dog', df: 2 },
      { term: 'bird', df: 1 },
      { term: 'fish', df: 0 },
    ])('should return df=$df for "$term"', ({ term, df }) => {
      const index = buildIndex(SAMPLE_DOCS);

      expect(index.getDocumentFrequency(term)).toBe(df);
    });

    test('should count documents, not occurrences, in df', () => {
      const index = buildIndex([['a.txt', 'cat cat cat cat cat']]);

      expect(index.getDocumentFrequency('cat')).toBe(1);
      expect(index.getTermFrequency('cat', 0)).toBe(5);
    });

    test('should keep tf equal to the number of stored positions and df equal to the number of postings', () => {
      const index = buildIndex(SAMPLE_DOCS);

      for (const term of SAMPLE_TERMS) {
        const postings = index.getPostings(term).toArray();
        expect(index.getDocumentFrequency(term)).toBe(postings.length);
        for (const posting of postings) {
          expect(index.getTermFrequency(term, posting.docId)).toBe(posting.positions.length);
        }
      }
    });

    test('should have the sum of all document lengths equal to the sum of tf over all terms and documents', () => {
      const index = buildIndex(SAMPLE_DOCS);

      const lengthSum = index
        .getAllDocIds()
        .reduce((acc, docId) => acc + (index.getDocument(docId)?.length ?? 0), 0);
      const tfSum = SAMPLE_TERMS.reduce(
        (acc, term) =>
          acc +
          index
            .getAllDocIds()
            .reduce((inner, docId) => inner + index.getTermFrequency(term, docId), 0),
        0,
      );

      expect(tfSum).toBe(lengthSum);
    });
  });

  describe('dictionary', () => {
    test.each([
      { name: 'no documents', docs: [] as DocSpec[], expected: 0 },
      {
        name: 'one document with a repeated term',
        docs: [['a.txt', 'cat cat cat']] as DocSpec[],
        expected: 1,
      },
      {
        name: 'two documents sharing all terms',
        docs: [
          ['a.txt', 'cat dog'],
          ['b.txt', 'dog cat'],
        ] as DocSpec[],
        expected: 2,
      },
      {
        name: 'two documents with disjoint terms',
        docs: [
          ['a.txt', 'cat dog'],
          ['b.txt', 'bird fish'],
        ] as DocSpec[],
        expected: 4,
      },
      {
        name: 'partially overlapping documents',
        docs: [
          ['a.txt', 'cat dog'],
          ['b.txt', 'dog bird'],
        ] as DocSpec[],
        expected: 3,
      },
    ])('should report termCount=$expected for $name', ({ docs, expected }) => {
      expect(buildIndex(docs).termCount).toBe(expected);
    });

    test('should return true from hasTerm for indexed terms and false for others', () => {
      const index = buildIndex(SAMPLE_DOCS);

      expect(index.hasTerm('cat')).toBe(true);
      expect(index.hasTerm('bird')).toBe(true);
      expect(index.hasTerm('fish')).toBe(false);
      expect(index.hasTerm('')).toBe(false);
    });

    test('should store terms verbatim without case folding (normalization is the Text Analyzer job)', () => {
      const index = new InvertedIndex();
      index.addDocument('a.txt', [
        { term: 'Cat', position: 1 },
        { term: 'cat', position: 2 },
      ]);

      expect(index.termCount).toBe(2);
      expect(index.getPositions('Cat', 0).toArray()).toEqual([1]);
      expect(index.getPositions('cat', 0).toArray()).toEqual([2]);
    });

    test.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
      'should handle the term "%s" that collides with an Object.prototype member',
      (term) => {
        const fresh = new InvertedIndex();
        expect(fresh.hasTerm(term)).toBe(false);
        expect(fresh.getPostings(term).toArray()).toEqual([]);

        const index = new InvertedIndex();
        index.addDocument('a.txt', [{ term, position: 1 }]);

        expect(index.hasTerm(term)).toBe(true);
        expect(index.termCount).toBe(1);
        expect(index.getPostings(term).toArray()).toEqual([{ docId: 0, positions: [1] }]);
        expect(index.getDocumentFrequency(term)).toBe(1);
      },
    );
  });

  describe('input isolation', () => {
    test('should not be affected by later mutation of the token array passed to addDocument', () => {
      const tokens = toTokens('cat dog');
      const index = new InvertedIndex();
      const id = index.addDocument('a.txt', tokens);

      tokens.splice(0, tokens.length);
      tokens.push({ term: 'bird', position: 1 });

      expect(index.hasTerm('bird')).toBe(false);
      expect(index.getPositions('cat', id).toArray()).toEqual([1]);
      expect(index.getDocument(id)?.length).toBe(2);
    });
  });

  describe('output isolation', () => {
    test('should not alter the internal index when mutating postings materialized from getPostings()', () => {
      const index = new InvertedIndex();
      index.addDocument('a.txt', toTokens('cat dog'));

      const postings = index.getPostings('cat').toArray();
      postings.push({ docId: 99, positions: [100] });
      if (postings[0]) {
        (postings[0].positions as number[]).push(999);
        (postings[0] as Mutable<IPosting>).docId = 42;
      }

      const yielded = index.getPostings('cat').next();
      if (yielded) {
        (yielded.positions as number[]).push(888);
      }

      const freshPostings = index.getPostings('cat').toArray();
      expect(freshPostings).toHaveLength(1);
      expect(freshPostings[0]?.docId).toBe(0);
      expect(freshPostings[0]?.positions).toEqual([1]);
    });

    test('should not alter the internal index when mutating the array materialized from getPositions()', () => {
      const index = new InvertedIndex();
      index.addDocument('a.txt', toTokens('cat dog cat'));

      const positions = index.getPositions('cat', 0).toArray();
      positions.push(999);
      positions[0] = -1;

      const freshPositions = index.getPositions('cat', 0).toArray();
      expect(freshPositions).toEqual([1, 3]);
    });

    test('should not alter the internal index when mutating the object returned by getDocument()', () => {
      const index = new InvertedIndex();
      index.addDocument('a.txt', toTokens('cat dog'));

      const doc = index.getDocument(0);
      expect(doc).toBeDefined();

      if (doc) {
        (doc as Mutable<IDocumentInfo>).length = 999;
        (doc as Mutable<IDocumentInfo>).source = 'hacked.txt';
      }

      const freshDoc = index.getDocument(0);
      expect(freshDoc?.length).toBe(2);
      expect(freshDoc?.source).toBe('a.txt');
    });

    test('should not alter the internal index when mutating the array returned by getAllDocIds()', () => {
      const index = new InvertedIndex();
      index.addDocument('a.txt', toTokens('cat'));
      index.addDocument('b.txt', toTokens('dog'));

      const ids = index.getAllDocIds();
      ids.push(99);
      ids.pop();

      const freshIds = index.getAllDocIds();
      expect(freshIds).toEqual([0, 1]);
    });

    test('should keep previously materialized postings snapshot intact after subsequent addDocument() calls', () => {
      const index = new InvertedIndex();
      index.addDocument('a.txt', toTokens('cat'));

      const snapshot = index.getPostings('cat').toArray();
      index.addDocument('b.txt', toTokens('cat'));

      expect(snapshot).toEqual([{ docId: 0, positions: [1] }]);
      expect(index.getPostings('cat').toArray()).toEqual([
        { docId: 0, positions: [1] },
        { docId: 1, positions: [1] },
      ]);
    });
  });

  describe('larger collections', () => {
    const DOC_COUNT = 300;

    const buildLargeIndex = (): InvertedIndex => {
      const index = new InvertedIndex();
      for (let i = 0; i < DOC_COUNT; i++) {
        const words = ['all'];
        if (i % 3 === 0) words.push('three');
        if (i % 7 === 0) words.push('seven');
        index.addDocument(`doc${String(i).padStart(4, '0')}.txt`, toTokens(words.join(' ')));
      }
      return index;
    };

    test.each([
      { term: 'all', divisor: 1 },
      { term: 'three', divisor: 3 },
      { term: 'seven', divisor: 7 },
    ])(
      'should compute df and ascending postings for "$term" (present in every $divisor-th document)',
      ({ term, divisor }) => {
        const index = buildLargeIndex();
        const docIds = index
          .getPostings(term)
          .toArray()
          .map((p) => p.docId);

        expect(index.getDocumentFrequency(term)).toBe(Math.ceil(DOC_COUNT / divisor));
        expect(docIds).toEqual([...docIds].sort((a, b) => a - b));
        expect(new Set(docIds).size).toBe(docIds.length);
        expect(docIds.every((id) => id % divisor === 0)).toBe(true);
      },
    );

    test('should keep documentCount, DocIds and average length consistent', () => {
      const index = buildLargeIndex();
      const totalLength = index
        .getAllDocIds()
        .reduce((acc, id) => acc + (index.getDocument(id)?.length ?? 0), 0);

      expect(index.documentCount).toBe(DOC_COUNT);
      expect(index.getAllDocIds()).toEqual(Array.from({ length: DOC_COUNT }, (_, i) => i));
      expect(index.averageDocumentLength).toBeCloseTo(totalLength / DOC_COUNT, 10);
    });
  });
});
