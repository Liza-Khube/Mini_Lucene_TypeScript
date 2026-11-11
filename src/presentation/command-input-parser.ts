import { isCommandName, type CommandName } from './commands.js';

export type ParsedCommandInput =
  | { type: 'command'; name: CommandName; args: string }
  | { type: 'unknown'; name: string }
  | { type: 'empty' };

export function parseCommandInput(userInput: string): ParsedCommandInput {
  const input: string = userInput.trim();

  if (input === '') return { type: 'empty' };

  const separatorIndex: number = input.search(/\s/);
  const hasArgs: boolean = separatorIndex !== -1;
  const rawName: string = hasArgs ? input.slice(0, separatorIndex) : input;
  const args: string = hasArgs ? input.slice(separatorIndex).trimStart() : '';

  const name: string = rawName.toLowerCase();
  return isCommandName(name) ? { type: 'command', name, args } : { type: 'unknown', name: rawName };
}
