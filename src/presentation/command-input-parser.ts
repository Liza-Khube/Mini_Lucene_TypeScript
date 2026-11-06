import { isCommanName, type CommandName } from './commands.js';

export type ParsedCommandInput =
  | { type: 'command'; name: CommandName; args: string }
  | { type: 'unknown'; name: string }
  | { type: 'empty' };

export function parseCommandInput(userInput: string): ParsedCommandInput {
  const input = userInput.trim();

  if (input === '') return { type: 'empty' };

  const splitedInput = /^(\S+)\s*([\s\S]*)$/.exec(input);
  const name = splitedInput?.[1] ?? input;
  const args = splitedInput?.[2] ?? '';

  name.toLowerCase();
  return isCommanName(name) ? { type: 'command', name, args } : { type: 'unknown', name };
}
