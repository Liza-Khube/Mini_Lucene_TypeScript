export interface ICommandDefinition {
  readonly name: string;
  readonly argsHint?: string;
  readonly description: string;
}

export const COMMANDS = [
  {
    name: 'index',
    argsHint: '<path>',
    description: 'read all .txt files in the folder, index them and display statistics',
  },
  {
    name: 'search',
    argsHint: '<query>',
    description: 'execute the query and return the top-K results',
  },
  {
    name: 'stats',
    description: 'return the number of documents and terms for the current index',
  },
  {
    name: 'help',
    description: 'show available commands',
  },
  {
    name: 'exit',
    description: 'exit the app',
  },
] as const satisfies readonly ICommandDefinition[];

export type CommandName = (typeof COMMANDS)[number]['name'];

export function isCommandName(value: string): value is CommandName {
  return COMMANDS.some((command) => command.name === value);
}

function findCommand(name: CommandName): ICommandDefinition {
  const command = COMMANDS.find((command) => command.name === name);
  if (command === undefined) {
    throw new Error(`Unknown command: ${name}`);
  }
  return command;
}

function formatUsage(command: ICommandDefinition): string {
  return command.argsHint === undefined ? command.name : `${command.name} ${command.argsHint}`;
}

export function getCommandUsage(name: CommandName): string {
  return formatUsage(findCommand(name));
}

export function isCommandTakeArgs(name: CommandName): boolean {
  return findCommand(name).argsHint !== undefined;
}

export function formatHelpOutput(): string {
  const rows = COMMANDS.map((command) => ({
    usage: formatUsage(command),
    description: command.description,
  }));
  const maxLength = Math.max(...rows.map((row) => row.usage.length));
  return rows.map((row) => `${row.usage.padEnd(maxLength)}  ${row.description}`).join('\n');
}
