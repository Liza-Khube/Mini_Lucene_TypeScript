import { CommandShell } from './presentation/command-shell.js';

try {
  await new CommandShell().run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
