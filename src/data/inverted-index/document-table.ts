import type { DocId, IDocumentInfo } from './types.js';

export class DocumentTable {
  private readonly documents: IDocumentInfo[] = [];
  private readonly sources = new Set<string>();
  private totalTokens = 0;

  hasSource(source: string): boolean {
    return this.sources.has(source);
  }

  add(source: string, length: number): DocId {
    const docId: DocId = this.documents.length;
    this.sources.add(source);
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
