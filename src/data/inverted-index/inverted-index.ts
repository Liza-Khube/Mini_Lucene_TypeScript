import { createEmptyCursor } from './cursor.js';
import { DocumentTable } from './document-table.js';
import { DuplicateSourceError, InvalidTokenPositionError } from './errors.js';
import { PostingList } from './posting-list.js';
import type { DocId, ICursor, IDocumentInfo, IPosting, IToken } from './types.js';

export class InvertedIndex {
  private readonly documentTable = new DocumentTable();
  private readonly termDictionary = new Map<string, PostingList>();

  addDocument(source: string, tokens: readonly IToken[]): DocId {
    if (this.documentTable.hasSource(source)) {
      throw new DuplicateSourceError(source);
    }

    this.validatePositions(tokens);

    const docId = this.documentTable.add(source, tokens.length);
    this.indexTokens(docId, tokens);

    return docId;
  }

  get documentCount(): number {
    return this.documentTable.count;
  }

  get termCount(): number {
    return this.termDictionary.size;
  }

  get averageDocumentLength(): number {
    return this.documentTable.averageLength;
  }

  getAllDocIds(): DocId[] {
    return this.documentTable.getAllDocIds();
  }

  getDocument(docId: DocId): IDocumentInfo | undefined {
    return this.documentTable.get(docId);
  }

  hasTerm(term: string): boolean {
    return this.termDictionary.has(term);
  }

  getPostings(term: string): ICursor<IPosting> {
    return this.termDictionary.get(term)?.values() ?? createEmptyCursor<IPosting>();
  }

  getPositions(term: string, docId: DocId): ICursor<number> {
    return this.termDictionary.get(term)?.getPositions(docId) ?? createEmptyCursor<number>();
  }

  getTermFrequency(term: string, docId: DocId): number {
    return this.termDictionary.get(term)?.getTermFrequency(docId) ?? 0;
  }

  getDocumentFrequency(term: string): number {
    return this.termDictionary.get(term)?.documentFrequency ?? 0;
  }

  private validatePositions(tokens: readonly IToken[]): void {
    let prevPosition = 0;
    for (const { position } of tokens) {
      if (!Number.isInteger(position) || position < 1 || position <= prevPosition) {
        throw new InvalidTokenPositionError(position, prevPosition);
      }
      prevPosition = position;
    }
  }

  private indexTokens(docId: DocId, tokens: readonly IToken[]): void {
    for (const { term, position } of tokens) {
      let postingList = this.termDictionary.get(term);
      if (postingList === undefined) {
        postingList = new PostingList();
        this.termDictionary.set(term, postingList);
      }
      postingList.append(docId, position);
    }
  }
}
