import type { DocId, IPosting } from '../../data/inverted-index/public-api.js';
import { intersectDocIds } from './boolean-operators.js';
import type { IPhraseTerm } from '../query-analyzer/public-api.js';
import type { IQueryIndex } from './types.js';

interface IPhraseClause {
  readonly offset: number;
  readonly postings: readonly IPosting[];
}

function intersectPositions(
  basePositions: readonly number[],
  targetPositions: readonly number[],
  offset: number,
): number[] {
  const matches: number[] = [];
  let baseIndex = 0;
  let targetIndex = 0;

  while (baseIndex < basePositions.length && targetIndex < targetPositions.length) {
    const basePos = basePositions[baseIndex]!;
    const expectedTargetPos = basePos + offset;
    const targetPos = targetPositions[targetIndex]!;

    if (expectedTargetPos === targetPos) {
      matches.push(basePos);
      baseIndex += 1;
      targetIndex += 1;
    } else if (expectedTargetPos < targetPos) {
      baseIndex += 1;
    } else {
      targetIndex += 1;
    }
  }

  return matches;
}

function loadPhraseClauses(
  terms: readonly IPhraseTerm[],
  index: IQueryIndex,
): IPhraseClause[] | null {
  const postingsCache = new Map<string, readonly IPosting[]>();
  const clauses: IPhraseClause[] = [];

  for (const { value, offset } of terms) {
    let postings = postingsCache.get(value);
    if (postings === undefined) {
      const cursor = index.getPostings(value);
      if (!cursor.hasNext()) {
        return null;
      }
      postings = cursor.toArray();
      postingsCache.set(value, postings);
    }
    clauses.push({ offset, postings });
  }

  return clauses;
}

function intersectClauseDocIds(orderedClauses: readonly IPhraseClause[]): DocId[] {
  let candidateDocIds = orderedClauses[0]!.postings.map((posting) => posting.docId);

  for (let i = 1; i < orderedClauses.length; i += 1) {
    const nextDocIds = orderedClauses[i]!.postings.map((posting) => posting.docId);
    candidateDocIds = intersectDocIds(candidateDocIds, nextDocIds);
    if (candidateDocIds.length === 0) {
      return [];
    }
  }

  return candidateDocIds;
}

function advanceClauseToDoc(
  postings: readonly IPosting[],
  pointers: number[],
  clauseIndex: number,
  targetDocId: DocId,
): readonly number[] {
  let pointer = pointers[clauseIndex]!;
  while (postings[pointer]!.docId < targetDocId) {
    pointer += 1;
  }
  pointers[clauseIndex] = pointer;
  return postings[pointer]!.positions;
}

function matchesPhrasePositions(
  orderedClauses: readonly IPhraseClause[],
  pointers: number[],
  docId: DocId,
): boolean {
  const leadClause = orderedClauses[0]!;
  const baseOffset = leadClause.offset;
  let positions = advanceClauseToDoc(leadClause.postings, pointers, 0, docId);

  for (let i = 1; i < orderedClauses.length; i += 1) {
    const clause = orderedClauses[i]!;
    const targetPositions = advanceClauseToDoc(clause.postings, pointers, i, docId);
    positions = intersectPositions(positions, targetPositions, clause.offset - baseOffset);
    if (positions.length === 0) {
      return false;
    }
  }

  return true;
}

export function executePhraseQuery(terms: readonly IPhraseTerm[], index: IQueryIndex): DocId[] {
  if (terms.length === 0) {
    return [];
  }

  if (terms.length === 1) {
    return Array.from(index.getPostings(terms[0]!.value), (posting) => posting.docId);
  }

  const clauses = loadPhraseClauses(terms, index);
  if (clauses === null) {
    return [];
  }

  const orderedClauses = [...clauses].sort((a, b) => a.postings.length - b.postings.length);
  const candidateDocIds = intersectClauseDocIds(orderedClauses);

  const pointers = new Array<number>(orderedClauses.length).fill(0);
  const matchedDocIds: DocId[] = [];
  for (const docId of candidateDocIds) {
    if (matchesPhrasePositions(orderedClauses, pointers, docId)) {
      matchedDocIds.push(docId);
    }
  }

  return matchedDocIds;
}
