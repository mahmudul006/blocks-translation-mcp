import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LANG_RESPONSE = [
  { itemId: '1', languageName: 'English', languageCode: 'en-US', isDefault: true, projectKey: null },
  { itemId: '2', languageName: 'German', languageCode: 'de-DE', isDefault: false, projectKey: null },
];

let dir: string;
let originalFetch: typeof fetch;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'blocks-client-'));
  process.env.BLOCKS_PROJECT_ROOT = dir;
  process.env.BLOCKS_TENANT_ID = 'tenant-x';
  process.env.BLOCKS_PORTAL_KEY = 'portal-x';
  process.env.BLOCKS_USERNAME = 'u';
  process.env.BLOCKS_PASSWORD = 'p';
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const k of ['BLOCKS_PROJECT_ROOT', 'BLOCKS_TENANT_ID', 'BLOCKS_PORTAL_KEY', 'BLOCKS_USERNAME', 'BLOCKS_PASSWORD']) delete process.env[k];
  rmSync(dir, { recursive: true, force: true });
});

test('getLanguages fetches, parses, and caches to the project root', async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    if (String(url).includes('Authentication/Token')) {
      return new Response(JSON.stringify({ access_token: 't', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r' }), { status: 200 });
    }
    return new Response(JSON.stringify(LANG_RESPONSE), { status: 200 });
  }) as typeof fetch;

  const { getConfig, resetConfigForTest } = await import('../src/config.js');
  resetConfigForTest(); getConfig();
  const { BlocksClient } = await import('../src/blocksClient.js');
  const client = new BlocksClient();

  const langs = await client.getLanguages();
  assert.deepEqual(langs.map((l) => l.code), ['en-US', 'de-DE']);
  assert.equal(await client.getDefaultLanguageCode(), 'en-US');

  assert.ok(existsSync(join(dir, '.blocks-translation-cache.json')));
  const cache = JSON.parse(readFileSync(join(dir, '.blocks-translation-cache.json'), 'utf-8'));
  assert.equal(cache.languages.length, 2);
});

test('checkKeysExist: exact + text dedup, and a missing module does not abort the batch', async () => {
  // moduleA has SUBMIT (exact) and OTHER_KEY="Save"; moduleB (a dedup module) 404s and must be tolerated.
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('ModuleName=moduleA')) {
      return new Response(JSON.stringify({ 'APP.SUBMIT': 'Submit', 'APP.OTHER_KEY': 'Save' }), { status: 200 });
    }
    if (u.includes('ModuleName=moduleB')) {
      return new Response('not found', { status: 404 }); // module absent in this tenant
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  const { getConfig, resetConfigForTest } = await import('../src/config.js');
  resetConfigForTest(); getConfig();
  const { BlocksClient } = await import('../src/blocksClient.js');
  const client = new BlocksClient();

  const results = await client.checkKeysExist(
    ['moduleA', 'moduleB'],
    [
      { keyName: 'APP.SUBMIT', englishText: 'Submit' }, // exact match in moduleA
      { keyName: 'APP.SAVE_ACTION', englishText: 'Save' }, // text dup of APP.OTHER_KEY
      { keyName: 'APP.BRAND_NEW', englishText: 'Totally new' }, // neither
    ],
  );
  const byKey = new Map(results.map((r) => [r.keyName, r]));

  assert.deepEqual(byKey.get('APP.SUBMIT')!.existsInModules, ['moduleA']);
  assert.equal(byKey.get('APP.SAVE_ACTION')!.existsInModules.length, 0);
  assert.deepEqual(
    byKey.get('APP.SAVE_ACTION')!.duplicateTextIn.map((d) => d.keyName),
    ['APP.OTHER_KEY'],
  );
  assert.equal(byKey.get('APP.BRAND_NEW')!.existsInModules.length, 0);
  assert.equal(byKey.get('APP.BRAND_NEW')!.duplicateTextIn.length, 0);
});
