import type { DocId } from '../../data/inverted-index/public-api.js';

export class MissingDocumentError extends Error {
  constructor(docId: DocId) {
    super(`Document with DocId ${docId} was not found in the index`);
    this.name = 'MissingDocumentError';
  }
}
