import type { ICursor } from './types.js';

export class ReadonlyArrayCursor<T> implements ICursor<T> {
  private index = -1;

  constructor(
    private readonly items: readonly T[],
    private readonly cloneItem?: (item: T) => T,
  ) {}

  hasNext(): boolean {
    return this.index + 1 < this.items.length;
  }

  next(): T | undefined {
    if (!this.hasNext()) {
      this.index = this.items.length;
      return undefined;
    }

    this.index += 1;
    return this.project(this.items[this.index]!);
  }

  current(): T | undefined {
    if (this.index < 0 || this.index >= this.items.length) {
      return undefined;
    }
    return this.project(this.items[this.index]!);
  }

  reset(): void {
    this.index = -1;
  }

  toArray(): T[] {
    return this.items.map((item) => this.project(item));
  }

  *[Symbol.iterator](): IterableIterator<T> {
    for (const item of this.items) {
      yield this.project(item);
    }
  }

  private project(item: T): T {
    return this.cloneItem ? this.cloneItem(item) : item;
  }
}

export function createEmptyCursor<T>(): ICursor<T> {
  return new ReadonlyArrayCursor<T>([]);
}
