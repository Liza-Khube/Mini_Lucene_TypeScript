export type DocId = number;

export interface IToken {
  readonly term: string;
  readonly position: number;
}

export interface IDocumentInfo {
  readonly docId: DocId;
  readonly source: string;
  readonly length: number;
}

export interface IPosting {
  readonly docId: DocId;
  readonly positions: readonly number[];
}

interface IMutablePosting {
  readonly docId: DocId;
  readonly positions: number[];
}

export class InvertedIndex {
  private readonly documents: IDocumentInfo[] = [];
  private readonly sources = new Set<string>();
  private readonly postings = new Map<string, IMutablePosting[]>();
  private totalTokens = 0;

  addDocument(source: string, tokens: readonly IToken[]): DocId {
    if (this.sources.has(source)) {
      throw new DuplicateSourceError(source);
    }

    const docId: DocId = this.documents.length;

    this.sources.add(source);
    this.documents.push({ docId, source, length: tokens.length });
    this.totalTokens += tokens.length;

    this.indexTokens(docId, tokens);

    return docId;
  }

  private indexTokens(docId: DocId, tokens: readonly IToken[]): void {
    for (const { term, position } of tokens) {
      let list = this.postings.get(term);
      if (list === undefined) {
        list = [];
        this.postings.set(term, list);
      }

      const lastPosting = list[list.length - 1];
      if (lastPosting?.docId === docId) {
        lastPosting.positions.push(position);
      } else {
        list.push({ docId, positions: [position] });
      }
    }
  }

  get documentCount(): number {
    return this.documents.length;
  }

  get termCount(): number {
    return this.postings.size;
  }

  get averageDocumentLength(): number {
    return this.documents.length === 0 ? 0 : this.totalTokens / this.documents.length;
  }

  getAllDocIds(): DocId[] {
    return Array.from({ length: this.documents.length }, (_, i) => i);
  }

  getDocument(docId: DocId): IDocumentInfo | undefined {
    if (!Number.isInteger(docId) || docId < 0 || docId >= this.documents.length) {
      return undefined;
    }
    return { ...this.documents[docId]! };
  }

  hasTerm(term: string): boolean {
    return this.postings.has(term);
  }

  getPostings(term: string): readonly IPosting[] {
    const list = this.postings.get(term);
    if (!list) return [];
    return list.map((postings) => ({
      docId: postings.docId,
      positions: [...postings.positions],
    }));
  }

  getPositions(term: string, docId: DocId): readonly number[] {
    const list = this.postings.get(term);
    if (list === undefined || !Number.isInteger(docId) || docId < 0) {
      return [];
    }

    let low = 0;
    let high = list.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const posting = list[mid]!;
      if (posting.docId === docId) {
        return [...posting.positions];
      }
      if (posting.docId < docId) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return [];
  }

  getTermFrequency(term: string, docId: DocId): number {
    return this.getPositions(term, docId).length;
  }

  getDocumentFrequency(term: string): number {
    return this.postings.get(term)?.length ?? 0;
  }
}

export class DuplicateSourceError extends Error {
  constructor(source: string) {
    super(`Document source "${source}" is already indexed`);
    this.name = 'DuplicateSourceError';
  }
}
