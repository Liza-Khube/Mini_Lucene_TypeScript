import { DuplicateSourceError } from './errors.js';
import type { DocId, IDocumentInfo } from './types.js';

export class DocumentTable {
  private readonly documents: IDocumentInfo[] = [];
  private readonly sources = new Map<string, DocId>();
  private totalTokens = 0;

  hasSource(source: string): boolean {
    return this.sources.has(source);
  }

  add(source: string, length: number): DocId {
    if (this.sources.has(source)) {
      throw new DuplicateSourceError(source);
    }

    const docId: DocId = this.documents.length;
    this.sources.set(source, docId);
    this.documents.push({ docId, source, length });
    this.totalTokens += length;

    return docId;
  }

  get(docId: DocId): IDocumentInfo | undefined {
    if (!Number.isInteger(docId) || docId < 0 || docId >= this.documents.length) {
      return undefined;
    }
    const doc = this.documents[docId];
    return doc === undefined ? undefined : { ...doc };
  }

  getDocIdBySource(source: string): DocId | undefined {
    return this.sources.get(source);
  }

  get count(): number {
    return this.documents.length;
  }

  get averageLength(): number {
    return this.documents.length === 0 ? 0 : this.totalTokens / this.documents.length;
  }

  getAllDocIds(): DocId[] {
    return Array.from({ length: this.documents.length }, (_, i) => i);
  }
}
