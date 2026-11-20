import { describe, test, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { CommandShell } from '../../../src/presentation/command-shell.js';
import { parseCommandInput } from '../../../src/presentation/command-input-parser.js';
import { formatHelpOutput } from '../../../src/presentation/commands.js';
import type { ISearchEngine } from '../../../src/application/search-engine/public-api.js';

function createMockEngine(overrides: Partial<ISearchEngine> = {}): ISearchEngine {
  return {
    isIndexed: false,
    index: vi.fn(async () => ({
      documentCount: 0,
      termCount: 0,
      durationMs: 0,
      skippedFiles: [],
    })),
    indexDocuments: vi.fn(() => ({
      documentCount: 0,
      termCount: 0,
      durationMs: 0,
      skippedFiles: [],
    })),
    search: vi.fn((query: string) => ({
      query,
      status: 'ok' as const,
      totalHits: 0,
      hits: [],
      durationMs: 0,
    })),
    stats: vi.fn(() => ({
      documentCount: 0,
      termCount: 0,
    })),
    ...overrides,
  };
}

function createShell(engine: ISearchEngine = createMockEngine()) {
  const output = new PassThrough();
  const input = new PassThrough();
  let written = '';
  output.on('data', (chunk: Buffer) => (written += chunk.toString()));
  const shell = new CommandShell(engine, output, input);
  return { shell, input, engine, getOutput: () => written };
}

async function runSession(
  lines: string[],
  engine: ISearchEngine = createMockEngine(),
): Promise<string> {
  const { shell, input, getOutput } = createShell(engine);
  const session = shell.run();
  for (const line of lines) input.write(`${line}\n`);
  input.end();
  await session;
  return getOutput();
}

async function executeInput(userInput: string, engine: ISearchEngine = createMockEngine()) {
  const { shell, getOutput } = createShell(engine);
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
        const engine = createMockEngine();
        const { shouldContinue, output } = await executeInput(name, engine);
        expect(shouldContinue).toBe(true);
        expect(output).toMatch(new RegExp(`^Usage: ${name} <\\w+>\\n$`));
        expect(engine.index).not.toHaveBeenCalled();
        expect(engine.search).not.toHaveBeenCalled();
      },
    );

    test.each(['stats', 'help', 'exit'])(
      'should show usage and not execute "%s" has extra arguments',
      async (name) => {
        const engine = createMockEngine();
        const { shouldContinue, output } = await executeInput(`${name} extra`, engine);
        expect(shouldContinue).toBe(true);
        expect(output).toBe(`Usage: ${name}\n`);
        expect(engine.stats).not.toHaveBeenCalled();
      },
    );

    test('should index directory and print summary', async () => {
      const engine = createMockEngine({
        index: vi.fn(async () => ({
          documentCount: 150,
          termCount: 4250,
          durationMs: 2000,
          skippedFiles: [],
        })),
      });

      const { shouldContinue, output } = await executeInput('index ./docs', engine);
      expect(shouldContinue).toBe(true);
      expect(engine.index).toHaveBeenCalledWith('./docs');
      expect(output).toBe('Indexed 150 documents, 4250 unique terms (2000.0 ms)\n');
    });

    test('should print skipped file warnings and singular labels for index', async () => {
      const engine = createMockEngine({
        index: vi.fn(async () => ({
          documentCount: 1,
          termCount: 1,
          durationMs: 1.5,
          skippedFiles: [
            {
              path: './docs/notes.md',
              reason: 'Unsupported file format (only .txt files are supported)',
            },
          ],
        })),
      });

      const { shouldContinue, output } = await executeInput('index ./docs', engine);
      expect(shouldContinue).toBe(true);
      expect(output).toBe(
        'Warning: skipped ./docs/notes.md: Unsupported file format (only .txt files are supported)\n' +
          'Indexed 1 document, 1 unique term (1.5 ms)\n',
      );
    });

    test('should search and print ranked results with term positions', async () => {
      const engine = createMockEngine({
        search: vi.fn((query: string) => ({
          query,
          status: 'ok' as const,
          totalHits: 2,
          durationMs: 3.5,
          hits: [
            {
              rank: 1,
              docId: 0,
              source: './docs/doc003.txt',
              score: 5.834,
              matches: [{ term: 'people', indexedTerm: 'peopl', positions: [12, 87, 140] }],
            },
            {
              rank: 2,
              docId: 1,
              source: './docs/doc056.txt',
              score: 4.12,
              matches: [{ term: 'people', indexedTerm: 'peopl', positions: [33] }],
            },
          ],
        })),
      });

      const { shouldContinue, output } = await executeInput('search people AND NOT soup', engine);
      expect(shouldContinue).toBe(true);
      expect(engine.search).toHaveBeenCalledWith('people AND NOT soup');
      expect(output).toBe(
        'Found 2 documents in 3.5 ms\n' +
          '1. ./docs/doc003.txt score=5.83\n' +
          '"people" - positions 12, 87, 140\n' +
          '2. ./docs/doc056.txt score=4.12\n' +
          '"people" - position 33\n',
      );
    });

    test('should print singular document label and handle hits without term matches', async () => {
      const engine = createMockEngine({
        search: vi.fn((query: string) => ({
          query,
          status: 'ok' as const,
          totalHits: 1,
          durationMs: 0.4,
          hits: [
            {
              rank: 1,
              docId: 0,
              source: './docs/doc001.txt',
              score: 0,
              matches: [],
            },
          ],
        })),
      });

      const { shouldContinue, output } = await executeInput('search NOT cat', engine);
      expect(shouldContinue).toBe(true);
      expect(output).toBe('Found 1 document in 0.4 ms\n1. ./docs/doc001.txt score=0.00\n');
    });

    test('should print zero hits summary when no documents match', async () => {
      const engine = createMockEngine({
        search: vi.fn((query: string) => ({
          query,
          status: 'ok' as const,
          totalHits: 0,
          durationMs: 0.2,
          hits: [],
        })),
      });

      const { shouldContinue, output } = await executeInput('search missing', engine);
      expect(shouldContinue).toBe(true);
      expect(output).toBe('Found 0 documents in 0.2 ms\n');
    });

    test.each([
      ['empty-query', 'Query is empty'],
      ['stop-words-only', 'Query contains only stop words'],
    ] as const)('should print message without error for "%s" search status', async (status, message) => {
      const engine = createMockEngine({
        search: vi.fn((query: string) => ({
          query,
          status,
          message,
          totalHits: 0,
          hits: [],
          durationMs: 0.1,
        })),
      });

      const { shouldContinue, output } = await executeInput('search the', engine);
      expect(shouldContinue).toBe(true);
      expect(output).toBe(`${message}\n`);
    });

    test('should print index stats', async () => {
      const engine = createMockEngine({
        stats: vi.fn(() => ({
          documentCount: 150,
          termCount: 4250,
        })),
      });

      const { shouldContinue, output } = await executeInput('stats', engine);
      expect(shouldContinue).toBe(true);
      expect(engine.stats).toHaveBeenCalledTimes(1);
      expect(output).toBe('Documents: 150\nUnique terms: 4250\n');
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

    test('should print engine errors and keep running', async () => {
      const engine = createMockEngine({
        stats: vi.fn(() => {
          throw new Error('Index is not initialized');
        }),
        search: vi.fn(() => {
          throw 'unexpected failure';
        }),
      });

      const output = await runSession(['stats', 'search cat', 'help', 'exit'], engine);
      expect(output).toContain('Error: Index is not initialized');
      expect(output).toContain('Error: unexpected failure');
      expect(output).toContain('read all .txt files');
    });

    test('should finish queued commands after async index when input ends', async () => {
      const engine = createMockEngine({
        index: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            documentCount: 3,
            termCount: 10,
            durationMs: 2.5,
            skippedFiles: [],
          };
        }),
        stats: vi.fn(() => ({
          documentCount: 3,
          termCount: 10,
        })),
      });

      const output = await runSession(['index ./docs', 'stats', 'exit'], engine);
      expect(output).toContain('Indexed 3 documents, 10 unique terms (2.5 ms)');
      expect(output).toContain('Documents: 3\nUnique terms: 10');
      expect(output).toContain('Exiting...');
    });
  });
});
