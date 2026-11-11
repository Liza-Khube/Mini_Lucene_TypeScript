import { describe, test, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { CommandShell } from '../../../src/presentation/command-shell.js';
import { parseCommandInput } from '../../../src/presentation/command-input-parser.js';
import { COMMANDS, formatHelpOutput } from '../../../src/presentation/commands.js';

function createShell() {
  const output = new PassThrough();
  const input = new PassThrough();
  let written = '';
  output.on('data', (chunk: Buffer) => (written += chunk.toString()));
  const shell = new CommandShell(output, input);
  return { shell, input, getOutput: () => written };
}

async function runSession(lines: string[]): Promise<string> {
  const { shell, input, getOutput } = createShell();
  const session = shell.run();
  for (const line of lines) input.write(`${line}\n`);
  input.end();
  await session;
  return getOutput();
}

async function executeInput(userInput: string) {
  const { shell, getOutput } = createShell();
  const shouldContinue = await shell.execute(parseCommandInput(userInput));
  return { shouldContinue, output: getOutput() };
}

describe('Presentation CommandShell', () => {
  describe('execute', () => {
    test('should do nothing for empty input', async () => {
      expect(await executeInput('   ')).toStrictEqual({ shouldContinue: true, output: '' });
    });

    test('should report unknown command', async () => {
      const { shouldContinue, output } = await executeInput('foo');
      expect(shouldContinue).toBe(true);
      expect(output).toBe('Unknown command: foo\nType "help"\n');
    });

    test('should print help', async () => {
      const { shouldContinue, output } = await executeInput('help');
      expect(shouldContinue).toBe(true);
      expect(output).toBe(`${formatHelpOutput()}\n`);
    });

    test('should return false for exit', async () => {
      expect(await executeInput('exit')).toStrictEqual({ shouldContinue: false, output: '' });
    });

    test.each(['index', 'search'])(
      'should show usage and not execute when "%s" has no arguments',
      async (name) => {
        const { shouldContinue, output } = await executeInput(name);
        expect(shouldContinue).toBe(true);
        expect(output).toMatch(new RegExp(`^Usage: ${name} <\\w+>\\n$`));
      },
    );

    test.each(['stats', 'help', 'exit'])(
      'should show usage and not execute "%s" has extra arguments',
      async (name) => {
        const { shouldContinue, output } = await executeInput(`${name} extra`);
        expect(shouldContinue).toBe(true);
        expect(output).toBe(`Usage: ${name}\n`);
      },
    );

    test('should accept commands that take arguments', async () => {
      expect(await executeInput('index ./docs')).toStrictEqual({
        shouldContinue: true,
        output: '',
      });
      expect(await executeInput('search cat AND dog')).toStrictEqual({
        shouldContinue: true,
        output: '',
      });
    });
  });

  describe('run', () => {
    test('should print greeting and exit message when input ends', async () => {
      const output = await runSession([]);
      expect(output).toContain('Mini-Lucene Search Engine');
      expect(output).toContain('Exiting...');
    });

    test('should stop on exit and ignore commands after it', async () => {
      const output = await runSession(['exit', 'help']);
      expect(output).toContain('Exiting...');
      expect(output).not.toContain('read all .txt files');
    });

    test('should not stop on "exit" with arguments', async () => {
      const output = await runSession(['exit now', 'help', 'exit']);
      expect(output).toContain('Usage: exit');
      expect(output).toContain('read all .txt files');
    });

    test('should keep running after unknown commands and usage errors', async () => {
      const output = await runSession(['foo', 'stats extra', 'help', 'exit']);
      expect(output).toContain('Unknown command: foo');
      expect(output).toContain('Usage: stats');
      expect(output).toContain('read all .txt files');
    });
  });
});
