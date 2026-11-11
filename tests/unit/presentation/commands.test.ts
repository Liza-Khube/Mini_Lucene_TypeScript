import { describe, test, expect } from 'vitest';
import {
  isCommandName,
  getCommandUsage,
  isCommandTakeArgs,
  formatHelpOutput,
  COMMANDS,
  type CommandName,
} from '../../../src/presentation/commands.js';

const commandNames = COMMANDS.map((command) => command.name);

describe('Presentation CommandShell Commands', () => {
  describe(isCommandName.name, () => {
    test.each(commandNames)('should return true for "%s" command', (name) => {
      expect(isCommandName(name)).toBe(true);
    });

    test('should return false for non-existent commands', () => {
      expect(isCommandName('')).toBe(false);
      expect(isCommandName('null')).toBe(false);
      expect(isCommandName('INDEX')).toBe(false);
    });
  });

  describe(getCommandUsage.name, () => {
    test('should return usage for command with usage', () => {
      expect(getCommandUsage('index')).toContain('<path>');
      expect(getCommandUsage('search')).toContain('<query>');
    });

    test('should return name of command without usage', () => {
      expect(getCommandUsage('stats')).toBe('stats');
      expect(getCommandUsage('help')).toContain('help');
    });

    test('should throw Error of unknown command', () => {
      expect(() => getCommandUsage('unknown' as CommandName)).toThrow('Unknown command: unknown');
      expect(() => getCommandUsage('' as CommandName)).toThrow('Unknown command: ');
    });
  });

  describe(isCommandTakeArgs.name, () => {
    test('should return true for commands with an argument hint', () => {
      expect(isCommandTakeArgs('index')).toBe(true);
      expect(isCommandTakeArgs('search')).toBe(true);
    });

    test('should return false for commands without arguments', () => {
      expect(isCommandTakeArgs('stats')).toBe(false);
      expect(isCommandTakeArgs('help')).toBe(false);
      expect(isCommandTakeArgs('exit')).toBe(false);
    });

    test('should throw for unknown command', () => {
      expect(() => isCommandTakeArgs('unknown' as CommandName)).toThrow('Unknown command: unknown');
    });
  });

  describe(formatHelpOutput.name, () => {
    const lines = formatHelpOutput().split('\n');

    test('should contain exactly one line per command, in COMMANDS order', () => {
      expect(lines).toHaveLength(COMMANDS.length);
      COMMANDS.forEach((command, i) => {
        expect(lines[i]).toMatch(new RegExp(`^${command.name}(\\s|$)`));
      });
    });

    test('should include description of every command', () => {
      COMMANDS.forEach((command, i) => {
        expect(lines[i]).toContain(command.description);
      });
    });

    test('should show argument hint only for commands that have it', () => {
      expect(lines[COMMANDS.findIndex((c) => c.name === 'index')]).toContain('index <path>');
      expect(lines[COMMANDS.findIndex((c) => c.name === 'search')]).toContain('search <query>');
      expect(lines[COMMANDS.findIndex((c) => c.name === 'stats')]).not.toContain('<');
    });

    test('should align descriptions into one column', () => {
      const columns = COMMANDS.map((command, i) => lines[i]!.indexOf(command.description));
      expect(new Set(columns).size).toBe(1);
    });

    test('should have no leading or trailing whitespace and no empty lines', () => {
      const output = formatHelpOutput();
      expect(output).toBe(output.trim());
      expect(lines.every((line) => line.trim() !== '')).toBe(true);
    });

    test('should be deterministic', () => {
      expect(formatHelpOutput()).toBe(formatHelpOutput());
    });
  });
});
