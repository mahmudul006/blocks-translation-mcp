import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const MAX_BUFFER = 20 * 1024 * 1024;

async function readFileSafe(cwd: string, file: string): Promise<string | null> {
  try {
    const buf = await readFile(join(cwd, file));
    if (buf.includes(0)) return null; // NUL byte -> binary, skip
    return buf.toString('utf-8');
  } catch {
    return null;
  }
}

/** `git diff` only shows changes to TRACKED files, so brand-new (untracked) files — a common
 *  place for new translation keys — are invisible to it. In the default (uncommitted) mode we
 *  therefore also fold in untracked files' full contents as synthetic "+" lines so the extractor
 *  sees them. Skipped when diffBase is given (that compares commits, where untracked is irrelevant). */
async function untrackedAsDiff(cwd: string): Promise<string> {
  const { stdout } = await run('git', ['ls-files', '--others', '--exclude-standard'], { cwd, maxBuffer: MAX_BUFFER });
  const files = stdout.split('\n').map((f) => f.trim()).filter(Boolean);
  const parts: string[] = [];
  for (const file of files) {
    const raw = await readFileSafe(cwd, file);
    if (raw === null) continue; // unreadable/binary — skip
    parts.push(`+++ b/${file}`);
    for (const line of raw.split('\n')) parts.push(`+${line}`);
  }
  return parts.join('\n');
}

/** Collects the project's pending changes as unified-diff-ish text for key extraction.
 *  Default mode = working-tree + staged + untracked files. With a diffBase, compares against
 *  that ref only. Throws a clear error if git is unavailable / not a repo. */
export async function collectDiff(cwd: string, diffBase?: string): Promise<string> {
  const args = diffBase ? ['diff', diffBase] : ['diff'];
  try {
    const unstaged = await run('git', args, { cwd, maxBuffer: MAX_BUFFER });
    if (diffBase) return unstaged.stdout;
    const staged = await run('git', ['diff', '--staged'], { cwd, maxBuffer: MAX_BUFFER });
    const untracked = await untrackedAsDiff(cwd);
    return [unstaged.stdout, staged.stdout, untracked].join('\n');
  } catch (err) {
    throw new Error(
      `Could not run git in ${cwd}. Make sure this project is a git repo and git is installed. (${(err as Error).message})`,
    );
  }
}
