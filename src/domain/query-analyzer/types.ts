export interface IPhraseTerm {
  readonly value: string;
  readonly offset: number;
}

export type ExecutableQueryNode =
  | { readonly type: 'term'; readonly value: string }
  | { readonly type: 'phrase'; readonly terms: readonly IPhraseTerm[] }
  | { readonly type: 'and'; readonly left: ExecutableQueryNode; readonly right: ExecutableQueryNode }
  | { readonly type: 'or'; readonly left: ExecutableQueryNode; readonly right: ExecutableQueryNode }
  | { readonly type: 'not'; readonly operand: ExecutableQueryNode };
