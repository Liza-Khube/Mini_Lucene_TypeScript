import { describe, expect, test } from 'vitest';
import { ParseError, parseQuery } from '../../../../src/domain/query-parser/public-api.js';

describe('Domain QueryParser Error', () => {
  describe(ParseError.name, () => {
    test('should be an Error subclass named ParseError that keeps its message', () => {
      const error = new ParseError('unexpected token');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ParseError);
      expect(error.name).toBe('ParseError');
      expect(error.message).toBe('unexpected token');
    });

    test.each(['cat AND', '(cat', '"cat', 'AND OR NOT'])(
      'should carry a non-empty human-readable message when thrown for %j',
      (query) => {
        expect(() => parseQuery(query)).toThrow(/\S/);
      },
    );
  });
});
