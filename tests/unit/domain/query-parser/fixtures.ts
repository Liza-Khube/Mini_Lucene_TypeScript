import type { QueryNode } from '../../../../src/domain/query-parser/public-api.js';

export const term = (value: string): QueryNode => ({ type: 'term', value });
export const phrase = (...terms: string[]): QueryNode => ({ type: 'phrase', terms });
export const and = (left: QueryNode, right: QueryNode): QueryNode => ({ type: 'and', left, right });
export const or = (left: QueryNode, right: QueryNode): QueryNode => ({ type: 'or', left, right });
export const not = (operand: QueryNode): QueryNode => ({ type: 'not', operand });

export const nest = (depth: number, inner: string): string =>
  '('.repeat(depth) + inner + ')'.repeat(depth);
