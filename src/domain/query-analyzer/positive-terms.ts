import type { ExecutableQueryNode } from './types.js';

interface ITraversalFrame {
  readonly node: ExecutableQueryNode;
  readonly negated: boolean;
}

export function extractPositiveTerms(ast: ExecutableQueryNode | null): string[] {
  if (ast === null) {
    return [];
  }

  const stack: ITraversalFrame[] = [{ node: ast, negated: false }];
  const terms = new Set<string>();

  while (stack.length > 0) {
    const { node, negated } = stack.pop()!;

    switch (node.type) {
      case 'term':
        if (!negated) {
          terms.add(node.value);
        }
        break;
      case 'phrase':
        if (!negated) {
          for (const phraseTerm of node.terms) {
            terms.add(phraseTerm.value);
          }
        }
        break;
      case 'not':
        stack.push({ node: node.operand, negated: !negated });
        break;
      case 'and':
      case 'or':
        stack.push({ node: node.right, negated });
        stack.push({ node: node.left, negated });
        break;
      default: {
        const unexpectedNode: never = node;
        throw new Error(
          `Unknown query node type: "${String((unexpectedNode as { readonly type?: unknown }).type)}"`,
        );
      }
    }
  }

  return [...terms];
}
