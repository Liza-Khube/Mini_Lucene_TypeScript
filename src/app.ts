import { SearchEngine } from './application/search-engine/public-api.js';
import { CommandShell } from './presentation/command-shell.js';

try {
  await new CommandShell(new SearchEngine()).run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
