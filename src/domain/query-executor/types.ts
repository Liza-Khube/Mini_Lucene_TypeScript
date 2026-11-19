import type { ICursor, IPosting } from '../../data/inverted-index/public-api.js';

export interface IQueryIndex {
  readonly documentCount: number;
  getPostings(term: string): ICursor<IPosting>;
}
