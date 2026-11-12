import { stem } from './porter-stemmer.js';
import { isStopWord } from './stop-words.js';
import { tokenize, type IToken } from './tokenizer.js';

export class TextAnalyzer {
  analyze(text: string): IToken[] {
    return tokenize(text)
      .filter((token) => !isStopWord(token.term))
      .map((token) => ({ term: stem(token.term), position: token.position }));
  }
}
