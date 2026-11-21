import type { IToken } from '../../data/inverted-index/public-api.js';
import { stem } from './porter-stemmer.js';
import { isStopWord } from './stop-words.js';
import { tokenize } from './tokenizer.js';

export class TextAnalyzer {
  analyze(text: string): IToken[] {
    return tokenize(text)
      .filter((token) => !isStopWord(token.term))
      .map((token) => ({
        term: stem(token.term),
        position: token.position,
      }));
  }
}
