import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { Readable, Writable } from 'node:stream';

import { isCommandTakeArgs, formatHelpOutput, getCommandUsage } from './commands.js';
import { parseCommandInput, type ParsedCommandInput } from './command-input-parser.js';

export class CommandShell {
  // TODO  private readonly engine: SearchEngineApi;
  private readonly readline;
  private readonly output: Writable;

  constructor(
    // TODO engine: SearchEngineApi,
    output: Writable = stdout,
    input: Readable = stdin,
  ) {
    // TODO this.engine = engine,
    this.output = output;
    this.readline = createInterface({ input, output });
  }

  async run(): Promise<void> {
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
      this.readline.prompt();
    }

    this.readline.close();
    this.print('\nExiting...');
  }

  async execute(parsedInput: ParsedCommandInput): Promise<boolean> {
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
        // TODO: await this.engine.index(args)
        break;
      case 'search':
        // TODO: await this.engine.search(args)
        break;
      case 'stats':
        //TODO: await this.engine.stats()
        break;
      case 'help':
        this.print(formatHelpOutput());
        break;
      case 'exit':
        return false;
    }
    return true;
  }

  private print(text: string): void {
    this.output.write(`${text}\n`);
  }
}
