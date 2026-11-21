interface ICommandDefinition {
  readonly argsHint?: string;
  readonly description: string;
}

const COMMANDS = {
  index: {
    argsHint: '<path>',
    description: 'read all .txt files in the folder, index them and display statistics',
  },
  search: {
    argsHint: '<query>',
    description: 'execute the query and return the top-K results',
  },
  stats: {
    description: 'return the number of documents and terms for the current index',
  },
  help: {
    description: 'show available commands',
  },
  exit: {
    description: 'exit the app',
  },
} as const satisfies Record<string, ICommandDefinition>;

export type CommandName = keyof typeof COMMANDS;

export function isCommandName(value: string): value is CommandName {
  return Object.hasOwn(COMMANDS, value);
}

function formatUsage(name: string, command: ICommandDefinition): string {
  return command.argsHint === undefined ? name : `${name} ${command.argsHint}`;
}

export function getCommandUsage(name: CommandName): string {
  return formatUsage(name, COMMANDS[name]);
}

export function isCommandTakeArgs(name: CommandName): boolean {
  const command: ICommandDefinition = COMMANDS[name];
  return command.argsHint !== undefined;
}

export function formatHelpOutput(): string {
  const rows = Object.entries(COMMANDS).map(([name, command]) => ({
    usage: formatUsage(name, command),
    description: command.description,
  }));
  const maxLength = Math.max(...rows.map((row) => row.usage.length));
  return rows.map((row) => `${row.usage.padEnd(maxLength)}  ${row.description}`).join('\n');
}
