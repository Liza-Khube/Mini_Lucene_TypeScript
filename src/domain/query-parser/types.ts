export type QueryNode =
  | { readonly type: 'term'; readonly value: string }
  | { readonly type: 'phrase'; readonly terms: readonly string[] }
  | { readonly type: 'and'; readonly left: QueryNode; readonly right: QueryNode }
  | { readonly type: 'or'; readonly left: QueryNode; readonly right: QueryNode }
  | { readonly type: 'not'; readonly operand: QueryNode };
