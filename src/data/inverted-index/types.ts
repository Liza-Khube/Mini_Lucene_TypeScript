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

export interface ICursor<T> extends Iterable<T> {
  hasNext(): boolean;
  next(): T | undefined;
  current(): T | undefined;
  reset(): void;
  toArray(): T[];
  [Symbol.iterator](): IterableIterator<T>;
}
