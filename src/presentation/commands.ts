export interface ICommandDefinition {
  readonly name: string;
  readonly usage: string;
  readonly description: string;
}

export const COMMANDS = [
  {
    name: 'index',
    usage: 'index <path>',
    description: 'read all .txt files in the folder, index them and display statistics',
  },
  {
    name: 'search',
    usage: 'search <query>',
    description: 'execute the query and return the top-K results',
  },
  {
    name: 'stats',
    usage: 'stats',
    description: 'return the number of documents and terms for the current index',
  },
  {
    name: 'help',
    usage: 'help',
    description: 'show available commands',
  },
  {
    name: 'exit',
    usage: 'exit',
    description: 'exit the app',
  },
] as const satisfies readonly ICommandDefinition[];

export type CommandName = (typeof COMMANDS)[number]['name'];

export function isCommanName(value: string): value is CommandName {
  return COMMANDS.some((command) => command.name === value);
}

export function getCommandUsage(name: CommandName): string {
  return COMMANDS.find((command) => command.name === name)!.usage;
}

export function formatHelpOutput(): string {
  const maxLength = Math.max(...COMMANDS.map((command) => command.usage.length));
  return COMMANDS.map(
    (command) => `${command.usage.padEnd(maxLength)}  ${command.description}`,
  ).join('\n');
}
