import type { DocId } from '../../data/inverted-index/public-api.js';

export function intersectDocIds(left: readonly DocId[], right: readonly DocId[]): DocId[] {
  const result: DocId[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    const leftId = left[leftIndex]!;
    const rightId = right[rightIndex]!;

    if (leftId === rightId) {
      result.push(leftId);
      leftIndex += 1;
      rightIndex += 1;
    } else if (leftId < rightId) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }

  return result;
}

export function unionDocIds(left: readonly DocId[], right: readonly DocId[]): DocId[] {
  const result: DocId[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    const leftId = left[leftIndex]!;
    const rightId = right[rightIndex]!;

    if (leftId === rightId) {
      result.push(leftId);
      leftIndex += 1;
      rightIndex += 1;
    } else if (leftId < rightId) {
      result.push(leftId);
      leftIndex += 1;
    } else {
      result.push(rightId);
      rightIndex += 1;
    }
  }

  while (leftIndex < left.length) {
    result.push(left[leftIndex]!);
    leftIndex += 1;
  }

  while (rightIndex < right.length) {
    result.push(right[rightIndex]!);
    rightIndex += 1;
  }

  return result;
}

export function subtractDocIds(included: readonly DocId[], excluded: readonly DocId[]): DocId[] {
  const result: DocId[] = [];
  let includedIndex = 0;
  let excludedIndex = 0;

  while (includedIndex < included.length && excludedIndex < excluded.length) {
    const includedId = included[includedIndex]!;
    const excludedId = excluded[excludedIndex]!;

    if (includedId === excludedId) {
      includedIndex += 1;
      excludedIndex += 1;
    } else if (includedId < excludedId) {
      result.push(includedId);
      includedIndex += 1;
    } else {
      excludedIndex += 1;
    }
  }

  while (includedIndex < included.length) {
    result.push(included[includedIndex]!);
    includedIndex += 1;
  }

  return result;
}

export function complementDocIds(excluded: readonly DocId[], documentCount: number): DocId[] {
  const result: DocId[] = [];
  let excludedIndex = 0;

  for (let docId = 0; docId < documentCount; docId += 1) {
    if (excluded[excludedIndex] === docId) {
      excludedIndex += 1;
    } else {
      result.push(docId);
    }
  }

  return result;
}
