import type { DocId, InvertedIndex } from '../../data/inverted-index/public-api.js';
import type { QueryNode } from '../../domain/query-parser/public-api.js';
import { isStopWord, stem } from '../../domain/text-analyzer/public-api.js';
import type { ITermMatch } from './types.js';

interface ITraversalFrame {
  readonly node: QueryNode;
  readonly negated: boolean;
}

function recordDisplayTerm(rawTerm: string, displayTerms: Map<string, string>): void {
  const normalized = rawTerm.toLowerCase();
  if (normalized === '' || isStopWord(normalized)) {
    return;
  }

  const indexedTerm = stem(normalized);
  if (!displayTerms.has(indexedTerm)) {
    displayTerms.set(indexedTerm, normalized);
  }
}

export function mapPositiveDisplayTerms(ast: QueryNode): ReadonlyMap<string, string> {
  const stack: ITraversalFrame[] = [{ node: ast, negated: false }];
  const displayTerms = new Map<string, string>();

  while (stack.length > 0) {
    const { node, negated } = stack.pop()!;

    switch (node.type) {
      case 'term':
        if (!negated) {
          recordDisplayTerm(node.value, displayTerms);
        }
        break;
      case 'phrase':
        if (!negated) {
          for (const rawTerm of node.terms) {
            recordDisplayTerm(rawTerm, displayTerms);
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

  return displayTerms;
}

export function collectTermMatches(
  index: InvertedIndex,
  docId: DocId,
  positiveTerms: readonly string[],
  displayTerms: ReadonlyMap<string, string>,
): ITermMatch[] {
  const matches: ITermMatch[] = [];

  for (const indexedTerm of positiveTerms) {
    const positions = index.getPositions(indexedTerm, docId).toArray();
    if (positions.length === 0) {
      continue;
    }

    matches.push({
      term: displayTerms.get(indexedTerm) ?? indexedTerm,
      indexedTerm,
      positions,
    });
  }

  return matches;
}
