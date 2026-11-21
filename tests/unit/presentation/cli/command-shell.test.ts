import { PassThrough } from 'node:stream';
import { describe, expect, test, vi } from 'vitest';
import type { ISearchEngine } from '../../../../src/application/search-engine/public-api.js';
import { CommandShell } from '../../../../src/presentation/cli/public-api.js';

const EXPECTED_HELP_OUTPUT = [
  'index <path>    read all .txt files in the folder, index them and display statistics',
  'search <query>  execute the query and return the top-K results',
  'stats           return the number of documents and terms for the current index',
  'help            show available commands',
  'exit            exit the app',
].join('\n');

const SESSION_PREFIX = 'Mini-Lucene Search Engine\n> ';
const SESSION_SUFFIX = '> \nExiting...\n';

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
  output.on('data', (chunk: Buffer) => {
    written += chunk.toString();
  });
  const shell = new CommandShell(engine, output, input);
  return { shell, input, engine, getOutput: () => written };
}

async function runSession(
  lines: readonly string[],
  engine: ISearchEngine = createMockEngine(),
): Promise<string> {
  const { shell, input, getOutput } = createShell(engine);
  const session = shell.run();
  for (const line of lines) {
    input.write(`${line}\n`);
  }
  input.end();
  await session;
  return getOutput();
}

async function runSingleCommand(
  userInput: string,
  engine: ISearchEngine = createMockEngine(),
): Promise<string> {
  const { shell, input, getOutput } = createShell(engine);
  const session = shell.run();
  input.write(`${userInput}\nexit\n`);
  await session;

  const output = getOutput();
  expect(output.startsWith(SESSION_PREFIX)).toBe(true);
  expect(output.endsWith(SESSION_SUFFIX)).toBe(true);
  return output.slice(SESSION_PREFIX.length, output.length - SESSION_SUFFIX.length);
}

describe('Presentation CommandShell', () => {
  describe('empty input and whitespace', () => {
    test.each([
      ['empty string', ''],
      ['spaces', '   '],
      ['tab', '\t'],
      ['mixed horizontal whitespace', ' \t '],
    ])('should do nothing for %s without calling engine', async (_description, userInput) => {
      const engine = createMockEngine();
      const output = await runSingleCommand(userInput, engine);
      expect(output).toBe('');
      expect(engine.index).not.toHaveBeenCalled();
      expect(engine.search).not.toHaveBeenCalled();
      expect(engine.stats).not.toHaveBeenCalled();
    });

    test('should ignore whitespace around command without arguments', async () => {
      expect(await runSingleCommand('   help   ')).toBe(`${EXPECTED_HELP_OUTPUT}\n`);
    });

    test('should ignore multiple spaces between command and argument', async () => {
      const engine = createMockEngine();
      await runSingleCommand('index     ./docs', engine);
      expect(engine.index).toHaveBeenCalledWith('./docs');
    });

    test('should accept tab as separator between command and argument', async () => {
      const engine = createMockEngine();
      await runSingleCommand('index\t./docs', engine);
      expect(engine.index).toHaveBeenCalledWith('./docs');
    });

    test('should trim trailing whitespace from arguments', async () => {
      const engine = createMockEngine();
      await runSingleCommand('index ./docs   ', engine);
      expect(engine.index).toHaveBeenCalledWith('./docs');
    });
  });

  describe('command parsing, case sensitivity, and arguments', () => {
    test.each([
      ['uppercase HELP', 'HELP'],
      ['mixed-case HeLp', 'HeLp'],
    ])('should recognize %s case-insensitively', async (_description, command) => {
      expect(await runSingleCommand(command)).toBe(`${EXPECTED_HELP_OUTPUT}\n`);
    });

    test('should recognize uppercase STATS case-insensitively', async () => {
      const engine = createMockEngine({
        stats: vi.fn(() => ({ documentCount: 2, termCount: 5 })),
      });
      expect(await runSingleCommand('STATS', engine)).toBe('Documents: 2\nUnique terms: 5\n');
    });

    test('should recognize uppercase INDEX and preserve argument case', async () => {
      const engine = createMockEngine();
      await runSingleCommand('INDEX ./Docs/MyFolder', engine);
      expect(engine.index).toHaveBeenCalledWith('./Docs/MyFolder');
    });

    test('should recognize uppercase SEARCH and preserve query case', async () => {
      const engine = createMockEngine();
      await runSingleCommand('SEARCH People AND NOT Soup', engine);
      expect(engine.search).toHaveBeenCalledWith('People AND NOT Soup');
    });

    test('should accept command name used as an argument', async () => {
      const engine = createMockEngine();
      await runSingleCommand('index index', engine);
      expect(engine.index).toHaveBeenCalledWith('index');
    });

    test('should keep the whole query as one argument string', async () => {
      const engine = createMockEngine();
      await runSingleCommand('search people AND NOT soup', engine);
      expect(engine.search).toHaveBeenCalledWith('people AND NOT soup');
    });

    test('should preserve inner whitespace in arguments', async () => {
      const engine = createMockEngine();
      await runSingleCommand('search "brown   pillow"', engine);
      expect(engine.search).toHaveBeenCalledWith('"brown   pillow"');
    });

    test.each(['EXIT', '   exit   '])(
      'should terminate session cleanly for "%s"',
      async (exitCommand) => {
        const output = await runSession([exitCommand, 'help']);
        expect(output).toContain('Exiting...');
        expect(output).not.toContain('read all .txt files');
      },
    );
  });

  describe('unknown commands', () => {
    test('should report unknown command', async () => {
      expect(await runSingleCommand('foo')).toBe('Unknown command: foo\nType "help"\n');
    });

    test.each(['foo bar baz', 'foo help'])(
      'should drop arguments and report only command name for "%s"',
      async (input) => {
        expect(await runSingleCommand(input)).toBe('Unknown command: foo\nType "help"\n');
      },
    );

    test('should keep the original case of unknown command name', async () => {
      expect(await runSingleCommand('FOO')).toBe('Unknown command: FOO\nType "help"\n');
    });

    test.each(['helper', 'indexes', 'hel', 'exit1', 'search:', 'toString', 'constructor'])(
      'should treat "%s" as an unknown command',
      async (command) => {
        expect(await runSingleCommand(command)).toBe(`Unknown command: ${command}\nType "help"\n`);
      },
    );
  });

  describe('usage validation', () => {
    test.each([
      ['index', 'Usage: index <path>\n'],
      ['search', 'Usage: search <query>\n'],
    ])('should show usage and not execute when "%s" has no arguments', async (name, expected) => {
      const engine = createMockEngine();
      const output = await runSingleCommand(name, engine);
      expect(output).toBe(expected);
      expect(engine.index).not.toHaveBeenCalled();
      expect(engine.search).not.toHaveBeenCalled();
    });

    test.each(['stats', 'help', 'exit'])(
      'should show usage and not execute when "%s" has extra arguments',
      async (name) => {
        const engine = createMockEngine();
        const output = await runSingleCommand(`${name} extra`, engine);
        expect(output).toBe(`Usage: ${name}\n`);
        expect(engine.stats).not.toHaveBeenCalled();
      },
    );
  });

  describe('help command', () => {
    test('should print aligned help output for all commands in order', async () => {
      const output = await runSingleCommand('help');
      expect(output).toBe(`${EXPECTED_HELP_OUTPUT}\n`);
    });

    test('should produce deterministic output across calls', async () => {
      const first = await runSingleCommand('help');
      const second = await runSingleCommand('help');
      expect(first).toBe(second);
    });
  });

  describe('index command', () => {
    test('should index directory and print plural summary', async () => {
      const engine = createMockEngine({
        index: vi.fn(async () => ({
          documentCount: 150,
          termCount: 4250,
          durationMs: 2000,
          skippedFiles: [],
        })),
      });

      const output = await runSingleCommand('index ./docs', engine);
      expect(engine.index).toHaveBeenCalledWith('./docs');
      expect(output).toBe('Indexed 150 documents, 4250 unique terms (2000.0 ms)\n');
    });

    test('should print skipped file warnings and singular labels', async () => {
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

      const output = await runSingleCommand('index ./docs', engine);
      expect(output).toBe(
        'Warning: skipped ./docs/notes.md: Unsupported file format (only .txt files are supported)\n' +
          'Indexed 1 document, 1 unique term (1.5 ms)\n',
      );
    });
  });

  describe('search command', () => {
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

      const output = await runSingleCommand('search people AND NOT soup', engine);
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

      const output = await runSingleCommand('search NOT cat', engine);
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

      const output = await runSingleCommand('search missing', engine);
      expect(output).toBe('Found 0 documents in 0.2 ms\n');
    });

    test.each([
      ['empty-query', 'Query is empty'],
      ['stop-words-only', 'Query contains only stop words'],
    ] as const)(
      'should print message without Error prefix for "%s" search status',
      async (status, message) => {
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

        const output = await runSingleCommand('search the', engine);
        expect(output).toBe(`${message}\n`);
      },
    );
  });

  describe('stats command', () => {
    test('should print index stats', async () => {
      const engine = createMockEngine({
        stats: vi.fn(() => ({
          documentCount: 150,
          termCount: 4250,
        })),
      });

      const output = await runSingleCommand('stats', engine);
      expect(engine.stats).toHaveBeenCalledTimes(1);
      expect(output).toBe('Documents: 150\nUnique terms: 4250\n');
    });
  });

  describe('session lifecycle (run)', () => {
    test('should print greeting and exit message when input ends immediately', async () => {
      const output = await runSession([]);
      expect(output).toBe('Mini-Lucene Search Engine\n> \nExiting...\n');
    });

    test('should ignore multiple empty lines in a session', async () => {
      const output = await runSession(['', '   ', '\t', 'exit']);
      expect(output).toBe('Mini-Lucene Search Engine\n> > > > \nExiting...\n');
    });

    test('should stop on exit and ignore commands after it', async () => {
      const output = await runSession(['exit', 'help']);
      expect(output).toContain('Exiting...');
      expect(output).not.toContain('read all .txt files');
    });

    test('should not stop on "exit" with arguments and continue session', async () => {
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

    test('should print sync Error, non-Error throws, and async rejections and keep running', async () => {
      const engine = createMockEngine({
        index: vi.fn(async () => {
          throw new Error('Directory not found');
        }),
        stats: vi.fn(() => {
          throw new Error('Index is not initialized');
        }),
        search: vi.fn(() => {
          throw 'unexpected failure';
        }),
      });

      const output = await runSession(
        ['index ./missing', 'stats', 'search cat', 'help', 'exit'],
        engine,
      );
      expect(output).toContain('Error: Directory not found');
      expect(output).toContain('Error: Index is not initialized');
      expect(output).toContain('Error: unexpected failure');
      expect(output).toContain('read all .txt files');
    });

    test('should finish queued commands after async index when input ends early', async () => {
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
