import type { DocId } from '../../data/inverted-index/public-api.js';
import {
  complementDocIds,
  intersectDocIds,
  subtractDocIds,
  unionDocIds,
} from './boolean-operators.js';
import type { ExecutableQueryNode } from '../query-analyzer/public-api.js';
import { UnknownQueryNodeError } from './errors.js';
import { executePhraseQuery } from './phrase-matcher.js';
import type { IQueryIndex } from './types.js';

type EvaluationFrame =
  | { readonly kind: 'visit'; readonly node: ExecutableQueryNode }
  | { readonly kind: 'and-right'; readonly right: ExecutableQueryNode }
  | { readonly kind: 'apply'; readonly operator: 'not' | 'and' | 'or' | 'subtract' };

function executeTermQuery(term: string, index: IQueryIndex): DocId[] {
  return Array.from(index.getPostings(term), (posting) => posting.docId);
}

export class QueryExecutor {
  constructor(private readonly index: IQueryIndex) {}

  execute(ast: ExecutableQueryNode): Set<DocId> {
    const stack: EvaluationFrame[] = [{ kind: 'visit', node: ast }];
    const values: DocId[][] = [];

    while (stack.length > 0) {
      const frame = stack.pop()!;

      if (frame.kind === 'visit') {
        this.visitNode(frame.node, stack, values);
      } else if (frame.kind === 'and-right') {
        this.scheduleAndRight(frame.right, stack, values);
      } else {
        this.applyOperator(frame.operator, values);
      }
    }

    return new Set<DocId>(values.pop());
  }

  private visitNode(node: ExecutableQueryNode, stack: EvaluationFrame[], values: DocId[][]): void {
    switch (node.type) {
      case 'term':
        values.push(executeTermQuery(node.value, this.index));
        return;
      case 'phrase':
        values.push(executePhraseQuery(node.terms, this.index));
        return;
      case 'not':
        stack.push({ kind: 'apply', operator: 'not' });
        stack.push({ kind: 'visit', node: node.operand });
        return;
      case 'or':
        stack.push({ kind: 'apply', operator: 'or' });
        stack.push({ kind: 'visit', node: node.right });
        stack.push({ kind: 'visit', node: node.left });
        return;
      case 'and':
        if (node.left.type === 'not' && node.right.type !== 'not') {
          stack.push({ kind: 'and-right', right: node.left });
          stack.push({ kind: 'visit', node: node.right });
        } else {
          stack.push({ kind: 'and-right', right: node.right });
          stack.push({ kind: 'visit', node: node.left });
        }
        return;
      default: {
        const unexpectedNode: never = node;
        throw new UnknownQueryNodeError((unexpectedNode as { readonly type?: unknown }).type);
      }
    }
  }

  private scheduleAndRight(
    right: ExecutableQueryNode,
    stack: EvaluationFrame[],
    values: DocId[][],
  ): void {
    const leftResult = values[values.length - 1]!;
    if (leftResult.length === 0) {
      return;
    }

    if (right.type === 'not') {
      stack.push({ kind: 'apply', operator: 'subtract' });
      stack.push({ kind: 'visit', node: right.operand });
      return;
    }

    stack.push({ kind: 'apply', operator: 'and' });
    stack.push({ kind: 'visit', node: right });
  }

  private applyOperator(operator: 'not' | 'and' | 'or' | 'subtract', values: DocId[][]): void {
    if (operator === 'not') {
      const excluded = values.pop()!;
      values.push(complementDocIds(excluded, this.index.documentCount));
      return;
    }

    const right = values.pop()!;
    const left = values.pop()!;

    if (operator === 'subtract') {
      values.push(subtractDocIds(left, right));
      return;
    }

    values.push(operator === 'and' ? intersectDocIds(left, right) : unionDocIds(left, right));
  }
}
