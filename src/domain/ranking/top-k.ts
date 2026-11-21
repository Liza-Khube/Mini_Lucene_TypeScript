import type { IScoredDocument } from './types.js';

export function validateTopK(topK: number): void {
  if (!Number.isInteger(topK) || topK < 0) {
    throw new RangeError(`topK must be a non-negative integer, got ${topK}`);
  }
}

function compareScoredDocuments(a: IScoredDocument, b: IScoredDocument): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  return a.docId - b.docId;
}

function siftUp(heap: IScoredDocument[], startIndex: number): void {
  let index = startIndex;

  while (index > 0) {
    const parentIndex = (index - 1) >>> 1;
    const current = heap[index]!;
    const parent = heap[parentIndex]!;

    if (compareScoredDocuments(current, parent) <= 0) {
      break;
    }

    heap[index] = parent;
    heap[parentIndex] = current;
    index = parentIndex;
  }
}

function siftDown(heap: IScoredDocument[], startIndex: number): void {
  let index = startIndex;
  const length = heap.length;

  while (true) {
    const leftIndex = index * 2 + 1;
    if (leftIndex >= length) {
      break;
    }

    const rightIndex = leftIndex + 1;
    let worstIndex = index;

    if (compareScoredDocuments(heap[leftIndex]!, heap[worstIndex]!) > 0) {
      worstIndex = leftIndex;
    }

    if (rightIndex < length && compareScoredDocuments(heap[rightIndex]!, heap[worstIndex]!) > 0) {
      worstIndex = rightIndex;
    }

    if (worstIndex === index) {
      break;
    }

    const current = heap[index]!;
    heap[index] = heap[worstIndex]!;
    heap[worstIndex] = current;
    index = worstIndex;
  }
}

export function selectTopK(scored: readonly IScoredDocument[], topK?: number): IScoredDocument[] {
  if (topK === undefined || topK >= scored.length) {
    return [...scored].sort(compareScoredDocuments);
  }

  const heap: IScoredDocument[] = [];
  for (const candidate of scored) {
    if (heap.length < topK) {
      heap.push(candidate);
      siftUp(heap, heap.length - 1);
    } else if (compareScoredDocuments(candidate, heap[0]!) < 0) {
      heap[0] = candidate;
      siftDown(heap, 0);
    }
  }

  return heap.sort(compareScoredDocuments);
}
