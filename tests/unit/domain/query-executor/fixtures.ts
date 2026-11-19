import {
  ReadonlyArrayCursor,
  createEmptyCursor,
  type DocId,
  type ICursor,
  type IPosting,
} from '../../../../src/data/inverted-index/public-api.js';
import type { ExecutableQueryNode } from '../../../../src/domain/query-analyzer/public-api.js';
import {
  QueryExecutor,
  type IQueryIndex,
} from '../../../../src/domain/query-executor/public-api.js';

export interface QueryCase {
  query: string;
  ast: ExecutableQueryNode;
  expected: DocId[];
}

export const STOP_WORD_SLOT = '_';

export const term = (value: string): ExecutableQueryNode => ({ type: 'term', value });

export const phrase = (...slots: Array<string | null>): ExecutableQueryNode => ({
  type: 'phrase',
  terms: slots.flatMap((value, offset) => (value === null ? [] : [{ value, offset }])),
});

export const and = (
  first: ExecutableQueryNode,
  ...rest: ExecutableQueryNode[]
): ExecutableQueryNode =>
  rest.reduce<ExecutableQueryNode>((left, right) => ({ type: 'and', left, right }), first);

export const or = (
  first: ExecutableQueryNode,
  ...rest: ExecutableQueryNode[]
): ExecutableQueryNode =>
  rest.reduce<ExecutableQueryNode>((left, right) => ({ type: 'or', left, right }), first);

export const not = (operand: ExecutableQueryNode): ExecutableQueryNode => ({
  type: 'not',
  operand,
});

export const nestNot = (depth: number, inner: ExecutableQueryNode): ExecutableQueryNode =>
  Array.from({ length: depth }).reduce<ExecutableQueryNode>((node) => not(node), inner);

export const buildIndex = (docs: readonly string[]): IQueryIndex => {
  const postings = new Map<string, IPosting[]>();

  docs.forEach((text, docId) => {
    const slots = text.trim() === '' ? [] : text.trim().split(/\s+/);
    const positionsByTerm = new Map<string, number[]>();

    slots.forEach((slot, slotIndex) => {
      if (slot === STOP_WORD_SLOT) return;
      const positions = positionsByTerm.get(slot) ?? [];
      positions.push(slotIndex + 1);
      positionsByTerm.set(slot, positions);
    });

    for (const [value, positions] of positionsByTerm) {
      const list = postings.get(value) ?? [];
      list.push(Object.freeze({ docId, positions: Object.freeze(positions) }));
      postings.set(value, list);
    }
  });

  for (const list of postings.values()) Object.freeze(list);

  return {
    documentCount: docs.length,
    getPostings: (value): ICursor<IPosting> => {
      const list = postings.get(value);
      return list === undefined ? createEmptyCursor<IPosting>() : new ReadonlyArrayCursor(list);
    },
  };
};

export const run = (ast: ExecutableQueryNode, index: IQueryIndex): DocId[] =>
  [...new QueryExecutor(index).execute(ast)].sort((a, b) => a - b);
