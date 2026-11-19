import { describe, expect, test } from 'vitest';

import type { ExecutableQueryNode } from '../../../../src/domain/query-analyzer/public-api.js';
import {
  QueryExecutor,
  UnknownQueryNodeError,
} from '../../../../src/domain/query-executor/public-api.js';
import { buildIndex } from './fixtures.js';

describe('Domain QueryExecutor Errors', () => {
  describe(UnknownQueryNodeError.name, () => {
    test('should be an Error subclass named UnknownQueryNodeError that keeps node type in its message', () => {
      const error = new UnknownQueryNodeError('xor');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UnknownQueryNodeError);
      expect(error.name).toBe('UnknownQueryNodeError');
      expect(error.message).toContain('xor');
      expect(error.message).toMatch(/\S/);
    });

    test('should be thrown by QueryExecutor.execute for an unknown AST node type', () => {
      const executor = new QueryExecutor(buildIndex(['cat']));
      const broken = { type: 'xor' } as unknown as ExecutableQueryNode;

      expect(() => executor.execute(broken)).toThrow(UnknownQueryNodeError);
    });
  });
});
