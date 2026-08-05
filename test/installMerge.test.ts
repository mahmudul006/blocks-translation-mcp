import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upsertMcpServer } from '../src/install/mergeJson.js';

test('adds our entry, preserves existing servers and unrelated keys', () => {
  const existing = { mcpServers: { other: { command: 'x' } }, unrelated: 1 };
  const out = upsertMcpServer(existing, 'blocks-translation', { command: 'npx', args: ['-y', 'github:a/b'] }, 'mcpServers') as any;
  assert.deepEqual(out.mcpServers.other, { command: 'x' });
  assert.deepEqual(out.mcpServers['blocks-translation'], { command: 'npx', args: ['-y', 'github:a/b'] });
  assert.equal(out.unrelated, 1);
});

test('creates the wrapper when missing and is idempotent', () => {
  let out = upsertMcpServer({}, 'blocks-translation', { command: 'npx' }, 'mcpServers') as any;
  out = upsertMcpServer(out, 'blocks-translation', { command: 'npx', args: ['-y'] }, 'mcpServers') as any;
  assert.deepEqual(Object.keys(out.mcpServers), ['blocks-translation']);
  assert.deepEqual(out.mcpServers['blocks-translation'], { command: 'npx', args: ['-y'] });
});

test('vscode uses the servers wrapper; zed uses context_servers', () => {
  const vs = upsertMcpServer({}, 'blocks-translation', { type: 'stdio', command: 'npx' }, 'servers') as any;
  assert.ok(vs.servers['blocks-translation']);
  const zed = upsertMcpServer({}, 'blocks-translation', { command: 'npx' }, 'context_servers') as any;
  assert.ok(zed.context_servers['blocks-translation']);
});
