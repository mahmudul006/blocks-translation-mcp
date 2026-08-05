import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { CLIENTS, binOnPath, type ClientDef, type Scope } from './clients.js';
import { npxSpecFromRepository } from './npxSpec.js';
import { upsertMcpServer } from './mergeJson.js';

const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url)); // dist/install/ -> repo root

type Action =
  | { kind: 'cli'; bin: string; args: string[] }
  | { kind: 'json'; path: string; wrapperKey: 'mcpServers' | 'servers' | 'context_servers'; entry: object }
  | { kind: 'snippet'; wrapperKey: string; entry: object; path?: string; format: 'json' | 'toml' };

function readRepoSpec(): string {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
  const url = pkg.repository?.url ?? pkg.repository;
  if (!url) throw new Error('package.json has no "repository" field — set it to your GitHub repo first.');
  return npxSpecFromRepository(String(url));
}

function serverEntry(client: ClientDef, spec: string, env: Record<string, string>): object {
  const base: Record<string, unknown> = { command: 'npx', args: ['-y', spec] };
  if (client.vscodeStyle) base.type = 'stdio';
  if (Object.keys(env).length > 0) base.env = env;
  return base;
}

function resolveAction(client: ClientDef, scope: Scope, root: string, spec: string, env: Record<string, string>): Action {
  if (client.cliBin && binOnPath(client.cliBin) && client.cliArgs) {
    return { kind: 'cli', bin: client.cliBin, args: client.cliArgs(spec, scope, root, env) };
  }
  const entry = serverEntry(client, spec, env);
  const path = client.json?.(scope, root);
  if (path) return { kind: 'json', path, wrapperKey: client.wrapperKey, entry };
  return { kind: 'snippet', wrapperKey: client.wrapperKey, entry, path, format: client.snippetFormat ?? 'json' };
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function applyJson(path: string, wrapperKey: 'mcpServers' | 'servers' | 'context_servers', entry: object): string {
  let config: Record<string, unknown> = {};
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf-8');
    try {
      config = JSON.parse(raw);
    } catch {
      throw new Error(`existing config at ${path} is not plain JSON (comments?) — skipped; paste the snippet manually.`);
    }
    copyFileSync(path, `${path}.bak-${timestamp()}`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
  }
  const next = upsertMcpServer(config, 'blocks-translation', entry, wrapperKey);
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n');
  return path;
}

function renderSnippet(wrapperKey: string, entry: object, format: 'json' | 'toml'): string {
  if (format === 'toml') {
    const e = entry as { command: string; args: string[]; env?: Record<string, string> };
    const lines = [
      '[mcp_servers.blocks-translation]',
      `command = ${JSON.stringify(e.command)}`,
      `args = [${e.args.map((a) => JSON.stringify(a)).join(', ')}]`,
    ];
    if (e.env && Object.keys(e.env).length) {
      lines.push('', '[mcp_servers.blocks-translation.env]');
      for (const [k, v] of Object.entries(e.env)) lines.push(`${k} = ${JSON.stringify(v)}`);
    }
    return lines.join('\n');
  }
  return JSON.stringify({ [wrapperKey]: { 'blocks-translation': entry } }, null, 2);
}

export async function runInstaller(args: string[]): Promise<void> {
  const dryRun = args.includes('--print') || args.includes('--dry-run');
  const auto = args.includes('--yes') || args.includes('-y');

  const spec = readRepoSpec();
  console.log(`\nBlocks Translation MCP installer`);
  console.log(`Server: npx -y ${spec}${dryRun ? '   (dry run — no changes will be written)' : ''}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string, def: string): Promise<string> => {
    if (auto) return def;
    const a = (await rl.question(`${q} [${def}] `)).trim();
    return a || def;
  };

  const scope = ((await ask('Install scope — "global" (all projects) or "project" (this repo only)?', 'project')).toLowerCase().startsWith('g')
    ? 'global'
    : 'project') as Scope;

  let root = process.cwd();
  if (scope === 'project') root = await ask('Project root', process.cwd());

  // Project scope pins the project root so clients that don't set cwd still resolve config.
  const env: Record<string, string> = scope === 'project' ? { BLOCKS_PROJECT_ROOT: root } : {};

  // Build the candidate action per client, marking likely-installed ones.
  const candidates = CLIENTS.map((c) => ({
    client: c,
    installed: c.installedHint?.() ?? false,
    action: resolveAction(c, scope, root, spec, env),
  }));

  console.log('Detected AI tools (● = looks installed):');
  candidates.forEach((c, i) => {
    const via = c.action.kind === 'cli' ? `via ${c.action.bin} CLI` : c.action.kind === 'json' ? c.action.path : 'manual snippet';
    console.log(`  ${i + 1}. ${c.installed ? '●' : '○'} ${c.client.label}  (${via})`);
  });

  const defaultPick = candidates.map((c, i) => (c.installed ? i + 1 : null)).filter(Boolean).join(',') || 'all';
  const pick = await ask('\nConfigure which? (comma numbers, or "all")', defaultPick);
  const chosen =
    pick.toLowerCase() === 'all'
      ? candidates
      : pick.split(',').map((n) => candidates[Number(n.trim()) - 1]).filter(Boolean);

  const written: string[] = [];
  const cliRan: string[] = [];
  const snippets: { label: string; path?: string; text: string }[] = [];
  const failed: string[] = [];

  for (const { client, action } of chosen) {
    try {
      if (action.kind === 'cli') {
        const cmd = `${action.bin} ${action.args.join(' ')}`;
        if (dryRun) { cliRan.push(`(would run) ${cmd}`); continue; }
        await run(action.bin, action.args);
        cliRan.push(cmd);
      } else if (action.kind === 'json') {
        if (dryRun) { written.push(`(would write) ${action.path}`); continue; }
        written.push(applyJson(action.path, action.wrapperKey, action.entry));
      } else {
        snippets.push({ label: client.label, path: action.path, text: renderSnippet(action.wrapperKey, action.entry, action.format) });
      }
    } catch (err) {
      failed.push(`${client.label}: ${(err as Error).message}`);
    }
  }

  // Offer to scaffold the per-project config from the bundled example.
  if (scope === 'project') {
    const target = join(root, '.env.blocks-translation');
    const example = join(repoRoot, '.env.blocks-translation.example');
    if (!existsSync(target) && existsSync(example)) {
      const yes = (await ask(`\nCreate ${target} from the example?`, 'y')).toLowerCase().startsWith('y');
      if (yes && !dryRun) { copyFileSync(example, target); written.push(target); }
      else if (yes) written.push(`(would create) ${target}`);
    }
  }

  rl.close();

  console.log('\n──────────── Summary ────────────');
  if (written.length) { console.log('Wrote / created:'); written.forEach((w) => console.log(`  • ${w}`)); }
  if (cliRan.length) { console.log('Ran:'); cliRan.forEach((c) => console.log(`  • ${c}`)); }
  if (snippets.length) {
    console.log('\nPaste these manually (format too fragile to auto-edit):');
    for (const s of snippets) {
      console.log(`\n# ${s.label}${s.path ? ` — ${s.path}` : ''}`);
      console.log(s.text);
    }
  }
  if (failed.length) { console.log('\nSkipped (fix and retry, or paste manually):'); failed.forEach((f) => console.log(`  • ${f}`)); }

  console.log('\nNext steps:');
  console.log(`  1. Fill in ${join(root, '.env.blocks-translation')} (BLOCKS_TENANT_ID, PORTAL_KEY, USERNAME, PASSWORD).`);
  console.log('  2. Restart your AI tool so it picks up the new server, then ask it to "sync the translation keys".');
  if (scope === 'global') {
    console.log('  Note: a global install has no fixed project root — it works in clients that set the server cwd to your project');
    console.log('        (Claude Code, project-local Pi). For others, prefer a per-project install.');
  }
  console.log('');
}
