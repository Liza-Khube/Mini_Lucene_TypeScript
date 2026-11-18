export interface ITermNode {
  readonly type: 'term';
  readonly value: string;
}

export interface IPhraseNode {
  readonly type: 'phrase';
  readonly terms: readonly string[];
}

export interface IAndNode {
  readonly type: 'and';
  readonly left: QueryNode;
  readonly right: QueryNode;
}

export interface IOrNode {
  readonly type: 'or';
  readonly left: QueryNode;
  readonly right: QueryNode;
}

export interface INotNode {
  readonly type: 'not';
  readonly operand: QueryNode;
}

export type QueryNode = ITermNode | IPhraseNode | IAndNode | IOrNode | INotNode;

export type QueryToken =
  | { readonly type: 'TERM'; readonly value: string }
  | { readonly type: 'PHRASE'; readonly terms: readonly string[] }
  | { readonly type: 'AND' }
  | { readonly type: 'OR' }
  | { readonly type: 'NOT' }
  | { readonly type: 'LPAREN' }
  | { readonly type: 'RPAREN' };
