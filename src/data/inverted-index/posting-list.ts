import { ReadonlyArrayCursor, createEmptyCursor } from './cursor.js';
import type { DocId, ICursor, IPosting } from './types.js';

interface IMutablePosting {
  readonly docId: DocId;
  readonly positions: number[];
}

export class PostingList {
  private readonly postings: IMutablePosting[] = [];

  append(docId: DocId, position: number): void {
    const lastPosting = this.postings[this.postings.length - 1];
    if (lastPosting?.docId === docId) {
      lastPosting.positions.push(position);
    } else {
      this.postings.push({ docId, positions: [position] });
    }
  }

  getPositions(docId: DocId): ICursor<number> {
    const posting = this.findPosting(docId);
    return posting === undefined
      ? createEmptyCursor<number>()
      : new ReadonlyArrayCursor<number>(posting.positions);
  }

  getTermFrequency(docId: DocId): number {
    return this.findPosting(docId)?.positions.length ?? 0;
  }

  get documentFrequency(): number {
    return this.postings.length;
  }

  values(): ICursor<IPosting> {
    return new ReadonlyArrayCursor<IPosting>(this.postings, (posting) => ({
      docId: posting.docId,
      positions: [...posting.positions],
    }));
  }

  private findPosting(docId: DocId): IMutablePosting | undefined {
    if (!Number.isInteger(docId) || docId < 0) {
      return undefined;
    }

    let low = 0;
    let high = this.postings.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const posting = this.postings[mid];
      if (posting === undefined) {
        return undefined;
      }
      if (posting.docId === docId) {
        return posting;
      }
      if (posting.docId < docId) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return undefined;
  }
}
