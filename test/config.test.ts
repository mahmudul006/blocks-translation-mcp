import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENV_KEYS = [
  'BLOCKS_TENANT_ID', 'BLOCKS_PORTAL_KEY', 'BLOCKS_USERNAME', 'BLOCKS_PASSWORD',
  'BLOCKS_BASE_URL', 'BLOCKS_FRAMEWORK', 'BLOCKS_KEY_REGEX', 'BLOCKS_OUTPUT_PATH_PATTERN',
  'BLOCKS_DEDUP_MODULES', 'BLOCKS_PROJECT_ROOT',
];
let saved: Record<string, string | undefined>;
let dir: string;
let originalCwd: string;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  dir = mkdtempSync(join(tmpdir(), 'blocks-cfg-'));
  originalCwd = process.cwd();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
});

test('loads config from $BLOCKS_PROJECT_ROOT/.env.blocks-translation', async () => {
  writeFileSync(join(dir, '.env.blocks-translation'), 'BLOCKS_TENANT_ID=from-file\nBLOCKS_FRAMEWORK=react-i18next\n');
  process.env.BLOCKS_PROJECT_ROOT = dir;
  const { getConfig, resetConfigForTest } = await import('../src/config.js');
  resetConfigForTest();
  const cfg = getConfig();
  assert.equal(cfg.tenantId, 'from-file');
  assert.equal(cfg.framework, 'react-i18next');
  assert.deepEqual(cfg.defaultDedupModules, ['root', 'generic-app']);
});

test('explicit env var overrides the file, per key', async () => {
  writeFileSync(join(dir, '.env.blocks-translation'), 'BLOCKS_TENANT_ID=from-file\n');
  process.env.BLOCKS_PROJECT_ROOT = dir;
  process.env.BLOCKS_TENANT_ID = 'from-env';
  const { getConfig, resetConfigForTest } = await import('../src/config.js');
  resetConfigForTest();
  assert.equal(getConfig().tenantId, 'from-env');
});

test('throws a friendly error when tenant id is missing', async () => {
  process.env.BLOCKS_PROJECT_ROOT = dir; // no file, no env
  const { getConfig, resetConfigForTest } = await import('../src/config.js');
  resetConfigForTest();
  assert.throws(() => getConfig(), /\.env\.blocks-translation/);
});
