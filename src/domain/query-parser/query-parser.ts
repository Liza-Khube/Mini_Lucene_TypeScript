import { ParseError } from './error.js';
import { tokenizeQuery, type QueryToken } from './query-lexer.js';
import type { QueryNode } from './types.js';

export const MAX_NESTING_DEPTH = 50;

class RecursiveDescentParser {
  private pos = 0;
  private depth = 0;

  constructor(private readonly tokens: readonly QueryToken[]) {}

  parse(): QueryNode {
    const expr = this.parseOrExpr();
    if (this.pos < this.tokens.length) {
      throw new ParseError(`Unexpected token "${this.describeToken(this.peek())}"`);
    }
    return expr;
  }

  private parseOrExpr(): QueryNode {
    let left = this.parseAndExpr();

    while (this.peek()?.type === 'OR') {
      this.advance();
      const right = this.parseAndExpr();
      left = { type: 'or', left, right };
    }

    return left;
  }

  private parseAndExpr(): QueryNode {
    let left = this.parseNotExpr();

    while (true) {
      const next = this.peek();
      if (next?.type === 'AND') {
        this.advance();
        const right = this.parseNotExpr();
        left = { type: 'and', left, right };
      } else if (this.canStartPrimaryOrNot(next)) {
        const right = this.parseNotExpr();
        left = { type: 'and', left, right };
      } else {
        break;
      }
    }

    return left;
  }

  private parseNotExpr(): QueryNode {
    let notCount = 0;
    while (this.peek()?.type === 'NOT') {
      this.advance();
      notCount += 1;
    }

    let node = this.parsePrimary();
    while (notCount > 0) {
      node = { type: 'not', operand: node };
      notCount -= 1;
    }

    return node;
  }

  private parsePrimary(): QueryNode {
    const token = this.peek();
    if (token === undefined) {
      throw new ParseError('Unexpected end of query');
    }

    if (token.type === 'TERM') {
      this.advance();
      return { type: 'term', value: token.value };
    }

    if (token.type === 'PHRASE') {
      this.advance();
      return { type: 'phrase', terms: [...token.terms] };
    }

    if (token.type === 'LPAREN') {
      this.depth += 1;
      if (this.depth > MAX_NESTING_DEPTH) {
        throw new ParseError(`Parentheses nesting depth exceeds maximum of ${MAX_NESTING_DEPTH}`);
      }
      this.advance();

      if (this.peek()?.type === 'RPAREN') {
        throw new ParseError('Empty parenthesized group "()" is not allowed');
      }

      const expr = this.parseOrExpr();
      if (this.peek()?.type !== 'RPAREN') {
        throw new ParseError('Unclosed "(" in query: expected ")"');
      }
      this.advance();
      this.depth -= 1;
      return expr;
    }

    throw new ParseError(`Unexpected token "${this.describeToken(token)}": expected operand`);
  }

  private canStartPrimaryOrNot(token: QueryToken | undefined): boolean {
    if (token === undefined) return false;
    return (
      token.type === 'NOT' ||
      token.type === 'TERM' ||
      token.type === 'PHRASE' ||
      token.type === 'LPAREN'
    );
  }

  private peek(): QueryToken | undefined {
    return this.tokens[this.pos];
  }

  private advance(): void {
    this.pos += 1;
  }

  private describeToken(token: QueryToken | undefined): string {
    if (token === undefined) return 'end of input';
    if (token.type === 'TERM') return token.value;
    if (token.type === 'PHRASE') return `"${token.terms.join(' ')}"`;
    if (token.type === 'LPAREN') return '(';
    if (token.type === 'RPAREN') return ')';
    return token.type;
  }
}

export function parseQuery(query: string): QueryNode | null {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return null;
  }
  return new RecursiveDescentParser(tokens).parse();
}
