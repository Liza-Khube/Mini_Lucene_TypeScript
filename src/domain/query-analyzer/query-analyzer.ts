import type { QueryNode } from '../query-parser/public-api.js';
import { isStopWord, stem } from '../text-analyzer/public-api.js';
import type { ExecutableQueryNode, IPhraseTerm } from './types.js';

type AnalyzeFrame =
  | { readonly kind: 'visit'; readonly node: QueryNode }
  | { readonly kind: 'apply'; readonly operator: 'not' | 'and' | 'or' };

function analyzeTerm(rawTerm: string): ExecutableQueryNode | null {
  const normalized = rawTerm.toLowerCase();
  if (normalized === '' || isStopWord(normalized)) {
    return null;
  }
  return { type: 'term', value: stem(normalized) };
}

function analyzePhrase(rawTerms: readonly string[]): ExecutableQueryNode | null {
  const terms: IPhraseTerm[] = [];

  for (let offset = 0; offset < rawTerms.length; offset += 1) {
    const normalized = rawTerms[offset]!.toLowerCase();
    if (normalized !== '' && !isStopWord(normalized)) {
      terms.push({ value: stem(normalized), offset });
    }
  }

  return terms.length === 0 ? null : { type: 'phrase', terms };
}

function combineBinary(
  operator: 'and' | 'or',
  left: ExecutableQueryNode | null,
  right: ExecutableQueryNode | null,
): ExecutableQueryNode | null {
  if (left === null) return right;
  if (right === null) return left;
  return { type: operator, left, right };
}

function visitAnalyzeNode(
  node: QueryNode,
  stack: AnalyzeFrame[],
  results: Array<ExecutableQueryNode | null>,
): void {
  switch (node.type) {
    case 'term':
      results.push(analyzeTerm(node.value));
      return;
    case 'phrase':
      results.push(analyzePhrase(node.terms));
      return;
    case 'not':
      stack.push({ kind: 'apply', operator: 'not' });
      stack.push({ kind: 'visit', node: node.operand });
      return;
    case 'and':
    case 'or':
      stack.push({ kind: 'apply', operator: node.type });
      stack.push({ kind: 'visit', node: node.right });
      stack.push({ kind: 'visit', node: node.left });
      return;
    default: {
      const unexpectedNode: never = node;
      throw new Error(
        `Unknown query node type: "${String((unexpectedNode as { readonly type?: unknown }).type)}"`,
      );
    }
  }
}

export function analyzeQuery(ast: QueryNode | null): ExecutableQueryNode | null {
  if (ast === null) {
    return null;
  }

  const stack: AnalyzeFrame[] = [{ kind: 'visit', node: ast }];
  const results: Array<ExecutableQueryNode | null> = [];

  while (stack.length > 0) {
    const frame = stack.pop()!;

    if (frame.kind === 'visit') {
      visitAnalyzeNode(frame.node, stack, results);
    } else if (frame.operator === 'not') {
      const operand = results.pop()!;
      results.push(operand === null ? null : { type: 'not', operand });
    } else {
      const right = results.pop()!;
      const left = results.pop()!;
      results.push(combineBinary(frame.operator, left, right));
    }
  }

  return results.pop()!;
}
