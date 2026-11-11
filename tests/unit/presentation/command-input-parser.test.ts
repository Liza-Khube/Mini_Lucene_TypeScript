import { test, expect, describe } from 'vitest';
import { parseCommandInput } from '../../../src/presentation/command-input-parser.js';
import { COMMANDS } from '../../../src/presentation/commands.js';

const commandNames = COMMANDS.map((command) => command.name);

describe('Presentation CommandShell Command parser', () => {
  describe(parseCommandInput.name, () => {
    describe('empty input', () => {
      test.each([
        ['empty string', ''],
        ['spaces', '   '],
        ['tab', '\t'],
        ['mixed whitespace', ' \t \n '],
      ])('should return empty type for %s', (_description, input) => {
        expect(parseCommandInput(input)).toStrictEqual({ type: 'empty' });
      });
    });

    describe('valid commands', () => {
      test.each(commandNames)('should recognize "%s" without arguments', (name) => {
        expect(parseCommandInput(name)).toStrictEqual({ type: 'command', name, args: '' });
      });

      test('should return argument after the command name', () => {
        expect(parseCommandInput('index ./docs')).toStrictEqual({
          type: 'command',
          name: 'index',
          args: './docs',
        });
        expect(parseCommandInput('index index')).toStrictEqual({
          type: 'command',
          name: 'index',
          args: 'index',
        });
      });
    });

    describe('command name case', () => {
      test.each(commandNames)('should recognize "%s" in upper case', (name) => {
        expect(parseCommandInput(name.toUpperCase())).toStrictEqual({
          type: 'command',
          name,
          args: '',
        });
      });

      test('should recognize command in mixed case', () => {
        expect(parseCommandInput('HeLp')).toStrictEqual({
          type: 'command',
          name: 'help',
          args: '',
        });
      });

      test('should not change case of arguments', () => {
        expect(parseCommandInput('INDEX ./Docs/MyFolder')).toStrictEqual({
          type: 'command',
          name: 'index',
          args: './Docs/MyFolder',
        });
      });
    });

    describe('whitespace handling', () => {
      test('should ignore whitespace around the command', () => {
        expect(parseCommandInput('   help   ')).toStrictEqual({
          type: 'command',
          name: 'help',
          args: '',
        });
      });

      test('should ignore several spaces between command and argument', () => {
        expect(parseCommandInput('index     ./docs')).toStrictEqual({
          type: 'command',
          name: 'index',
          args: './docs',
        });
      });

      test('should accept tab as separator', () => {
        expect(parseCommandInput('index\t./docs')).toStrictEqual({
          type: 'command',
          name: 'index',
          args: './docs',
        });
      });

      test('should remove trailing whitespace of arguments', () => {
        expect(parseCommandInput('index ./docs   ')).toStrictEqual({
          type: 'command',
          name: 'index',
          args: './docs',
        });
      });
    });

    describe('arguments', () => {
      test('should keep the whole query as one argument string', () => {
        expect(parseCommandInput('search people AND NOT soup')).toStrictEqual({
          type: 'command',
          name: 'search',
          args: 'people AND NOT soup',
        });
      });

      test('should keep inner whitespace of arguments', () => {
        expect(parseCommandInput('search "brown   pillow"')).toStrictEqual({
          type: 'command',
          name: 'search',
          args: '"brown   pillow"',
        });
      });

      test('should return arguments even for commands that do not use them', () => {
        expect(parseCommandInput('stats extra')).toStrictEqual({
          type: 'command',
          name: 'stats',
          args: 'extra',
        });
      });
    });

    describe('unknown commands', () => {
      test('should return unknown type for non-existent command', () => {
        expect(parseCommandInput('test')).toStrictEqual({ type: 'unknown', name: 'test' });
      });

      test('should drop arguments of unknown command', () => {
        expect(parseCommandInput('foo bar baz')).toStrictEqual({ type: 'unknown', name: 'foo' });
      });

      test('should keep the original case of unknown command name', () => {
        expect(parseCommandInput('FOO')).toStrictEqual({ type: 'unknown', name: 'FOO' });
      });

      test.each(['helper', 'indexes', 'hel', 'exit1', 'search:'])(
        'should not treat "%s" as a known command',
        (input) => {
          expect(parseCommandInput(input)).toStrictEqual({ type: 'unknown', name: input });
        },
      );

      test('should not treat command name used as an argument as a command', () => {
        expect(parseCommandInput('foo help')).toStrictEqual({ type: 'unknown', name: 'foo' });
      });
    });
  });
});
