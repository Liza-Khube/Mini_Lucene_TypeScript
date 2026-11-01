import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export class CommandShell {
  private readonly readline = createInterface({ input: stdin, output: stdout });
  private readonly abortController = new AbortController();

  getInfoCard(): string {
    const commandList: [string, string][] = [
      ['index <path>', 'read all .txt files in the folder, index them and display statistics'],
      ['search <request>', 'execute the query and return the top-K results'],
      ['stats', 'return the number of documents and terms for the current index'],
      ['help', 'open this information about available commands'],
      ['exit', 'exit the app'],
    ];
    const maxLength = Math.max(...commandList.map((command) => command[0].length));
    return commandList
      .map(([command, description]) => `${command.padEnd(maxLength)} ${description}`)
      .join('\n');
  }

  execute(userInput: string): boolean {
    userInput = userInput.trim();
    if (userInput == '') {
      return true;
    }
    const userCommands: string[] = userInput.split(/\s+/);
    const mainCommand: string | undefined = userCommands[0]?.toLocaleLowerCase();

    switch (mainCommand) {
      case 'index':
      case 'search':
      case 'stats':
        return true;

      case 'help':
        console.log(this.getInfoCard());
        return true;

      case 'exit':
        return false;

      default:
        console.log(`Unknown command: ${userCommands[0]}\nType "help"`);
        return true;
    }
  }

  async ask(): Promise<string> {
    return await this.readline.question('> ', { signal: this.abortController.signal });
  }

  async run() {
    console.log('Mini-Lucene Search Engine');

    this.readline.on('close', () => {
      console.log('\nExiting...');
      this.abortController.abort();
    });

    while (true) {
      try {
        const userInput = await this.ask();

        if (!this.execute(userInput)) {
          this.readline.close();
          break;
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          break;
        } else if (error instanceof Error) {
          console.error(`Error: ${error.message}`);
        } else {
          console.error(error);
        }
      }
    }
  }
}
