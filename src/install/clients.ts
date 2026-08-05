import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type Scope = 'global' | 'project';
export type WrapperKey = 'mcpServers' | 'servers' | 'context_servers';

const home = homedir();

export interface ClientDef {
  id: string;
  label: string;
  /** Wrapper key used in this client's JSON config / printed snippet. */
  wrapperKey: WrapperKey;
  /** VS Code-style entries need an explicit `"type": "stdio"`. */
  vscodeStyle?: boolean;
  /** Format for the manual paste-in snippet when auto-edit isn't possible. Default 'json'. */
  snippetFormat?: 'json' | 'toml';
  /** Config file path for a scope, or undefined when JSON editing isn't safe → snippet fallback. */
  json?: (scope: Scope, root: string) => string | undefined;
  /** Preferred CLI (used if its bin is on PATH). */
  cliBin?: string;
  cliArgs?: (spec: string, scope: Scope, root: string, env: Record<string, string>) => string[];
  /** Heuristic: does this tool look installed? (used to pre-select). */
  installedHint?: () => boolean;
}

export const CLIENTS: ClientDef[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    wrapperKey: 'mcpServers',
    cliBin: 'claude',
    cliArgs: (spec, scope, _root, env) => [
      'mcp', 'add', 'blocks-translation', '-s', scope === 'global' ? 'user' : 'project',
      ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
      '--', 'npx', '-y', spec,
    ],
    json: (scope, root) => (scope === 'project' ? join(root, '.mcp.json') : join(home, '.claude.json')),
    installedHint: () => existsSync(join(home, '.claude.json')) || existsSync(join(home, '.claude')),
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    wrapperKey: 'mcpServers',
    cliBin: 'codex',
    cliArgs: (spec, _scope, _root, env) => [
      'mcp', 'add', 'blocks-translation',
      ...Object.entries(env).flatMap(([k, v]) => ['--env', `${k}=${v}`]),
      '--', 'npx', '-y', spec,
    ],
    json: () => undefined, // config.toml — no safe JSON edit; snippet fallback when CLI absent
    snippetFormat: 'toml',
    installedHint: () => existsSync(join(home, '.codex')),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    wrapperKey: 'mcpServers',
    json: (scope, root) => (scope === 'project' ? join(root, '.cursor', 'mcp.json') : join(home, '.cursor', 'mcp.json')),
    installedHint: () => existsSync(join(home, '.cursor')),
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    wrapperKey: 'mcpServers',
    json: (scope) => (scope === 'global' ? join(home, '.codeium', 'windsurf', 'mcp_config.json') : undefined),
    installedHint: () => existsSync(join(home, '.codeium')),
  },
  {
    id: 'antigravity',
    label: 'Google Antigravity',
    wrapperKey: 'mcpServers',
    json: (scope, root) =>
      scope === 'project' ? join(root, '.agents', 'mcp_config.json') : join(home, '.gemini', 'antigravity-cli', 'mcp_config.json'),
    installedHint: () => existsSync(join(home, '.gemini')),
  },
  {
    id: 'pi',
    label: 'Pi',
    wrapperKey: 'mcpServers',
    json: (scope, root) => (scope === 'project' ? join(root, '.mcp.json') : undefined),
    installedHint: () => existsSync(join(home, '.pi')),
  },
  {
    id: 'vscode',
    label: 'VS Code (Copilot)',
    wrapperKey: 'servers',
    vscodeStyle: true,
    json: (scope, root) => (scope === 'project' ? join(root, '.vscode', 'mcp.json') : undefined),
    installedHint: () => existsSync(join(home, '.vscode')),
  },
  {
    id: 'zed',
    label: 'Zed',
    wrapperKey: 'context_servers',
    json: () => undefined, // settings.json is JSONC — snippet only, never auto-edit
    installedHint: () => existsSync(join(home, '.config', 'zed')),
  },
  {
    id: 'cline',
    label: 'Cline (VS Code ext)',
    wrapperKey: 'mcpServers',
    json: () => undefined, // storage path varies by OS/VS Code build — snippet only
    installedHint: () => false,
  },
];

/** True if `bin` is found on PATH (no subprocess). */
export function binOnPath(bin: string): boolean {
  const dirs = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':');
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  return dirs.some((d) => d && exts.some((e) => existsSync(join(d, bin + e))));
}
