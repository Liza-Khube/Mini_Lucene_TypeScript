import { describe, expect, test } from 'vitest';

import { Bm25Ranker, MissingDocumentError } from '../../../../src/domain/ranking/public-api.js';
import { buildIndex } from './fixtures.js';

describe('Domain Ranking Errors', () => {
  describe(MissingDocumentError.name, () => {
    test('should be an Error subclass named MissingDocumentError that keeps docId in its message', () => {
      const error = new MissingDocumentError(42);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MissingDocumentError);
      expect(error.name).toBe('MissingDocumentError');
      expect(error.message).toContain('42');
      expect(error.message).toMatch(/\S/);
    });

    test.each([
      { name: 'matching query terms', queryTerms: ['cat'] },
      { name: 'empty query terms', queryTerms: [] },
      { name: 'terms absent from the index', queryTerms: ['missing'] },
    ])(
      'should be thrown by Bm25Ranker.rank for a missing candidate DocId with $name',
      ({ queryTerms }) => {
        const ranker = new Bm25Ranker(buildIndex(['cat dog']));

        expect(() => ranker.rank(new Set([0, 99]), queryTerms)).toThrow(MissingDocumentError);
      },
    );
  });
});
