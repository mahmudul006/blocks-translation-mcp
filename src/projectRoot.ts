import { join } from 'node:path';

/** The consumer project's root. cwd is reliably the project root in Claude Code;
 *  BLOCKS_PROJECT_ROOT is an escape hatch for clients that don't set cwd. */
export function getProjectRoot(): string {
  return process.env.BLOCKS_PROJECT_ROOT || process.cwd();
}

export function projectCachePath(): string {
  return join(getProjectRoot(), '.blocks-translation-cache.json');
}
