import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { Readable, Writable } from 'node:stream';

import type {
  IIndexResult,
  IIndexStats,
  ISearchEngine,
  SearchResult,
} from '../../application/search-engine/public-api.js';
import { isCommandTakeArgs, formatHelpOutput, getCommandUsage } from './commands.js';
import { parseCommandInput, type ParsedCommandInput } from './command-input-parser.js';

export class CommandShell {
  private readonly engine: ISearchEngine;
  private readonly readline;
  private readonly output: Writable;

  constructor(engine: ISearchEngine, output: Writable = stdout, input: Readable = stdin) {
    this.engine = engine;
    this.output = output;
    this.readline = createInterface({ input, output });
  }

  async run(): Promise<void> {
    let isClosed = false;
    this.readline.once('close', () => {
      isClosed = true;
    });

    this.print('Mini-Lucene Search Engine');
    this.readline.setPrompt('> ');
    this.readline.prompt();

    for await (const userInput of this.readline) {
      try {
        const shouldContinue = await this.execute(parseCommandInput(userInput));
        if (!shouldContinue) break;
      } catch (error: unknown) {
        this.print(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!isClosed) {
        this.readline.prompt();
      }
    }

    this.readline.close();
    this.print('\nExiting...');
  }

  private async execute(parsedInput: ParsedCommandInput): Promise<boolean> {
    if (parsedInput.type === 'empty') return true;

    if (parsedInput.type === 'unknown') {
      this.print(`Unknown command: ${parsedInput.name}\nType "help"`);
      return true;
    }

    const { name, args } = parsedInput;
    if (isCommandTakeArgs(name) !== (args !== '')) {
      this.print(`Usage: ${getCommandUsage(name)}`);
      return true;
    }

    switch (name) {
      case 'index':
        this.print(this.formatIndexResult(await this.engine.index(args)));
        break;
      case 'search':
        this.print(this.formatSearchResult(this.engine.search(args)));
        break;
      case 'stats':
        this.print(this.formatStats(this.engine.stats()));
        break;
      case 'help':
        this.print(formatHelpOutput());
        break;
      case 'exit':
        return false;
    }
    return true;
  }

  private formatIndexResult(result: IIndexResult): string {
    const lines: string[] = result.skippedFiles.map(
      (file) => `Warning: skipped ${file.path}: ${file.reason}`,
    );
    const docLabel = result.documentCount === 1 ? 'document' : 'documents';
    const termLabel = result.termCount === 1 ? 'term' : 'terms';
    lines.push(
      `Indexed ${result.documentCount} ${docLabel}, ${result.termCount} unique ${termLabel} (${result.durationMs.toFixed(1)} ms)`,
    );
    return lines.join('\n');
  }

  private formatSearchResult(result: SearchResult): string {
    if (result.status !== 'ok') {
      return result.message;
    }

    const docLabel = result.totalHits === 1 ? 'document' : 'documents';
    const lines: string[] = [
      `Found ${result.totalHits} ${docLabel} in ${result.durationMs.toFixed(1)} ms`,
    ];

    for (const hit of result.hits) {
      lines.push(`${hit.rank}. ${hit.source} score=${hit.score.toFixed(2)}`);
      for (const match of hit.matches) {
        const positionLabel = match.positions.length === 1 ? 'position' : 'positions';
        lines.push(`"${match.term}" - ${positionLabel} ${match.positions.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  private formatStats(stats: IIndexStats): string {
    return `Documents: ${stats.documentCount}\nUnique terms: ${stats.termCount}`;
  }

  private print(text: string): void {
    this.output.write(`${text}\n`);
  }
}
