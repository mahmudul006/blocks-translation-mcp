import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyJson, removeJson } from '../src/install/installer.js';

test('applyJson creates the file + parent dir when absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blocks-inst-'));
  try {
    const path = join(dir, '.cursor', 'mcp.json');
    applyJson(path, 'mcpServers', { command: 'npx', args: ['-y', 'github:a/b'] });
    const cfg = JSON.parse(readFileSync(path, 'utf-8'));
    assert.deepEqual(cfg.mcpServers['blocks-translation'], { command: 'npx', args: ['-y', 'github:a/b'] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('applyJson preserves existing entries and backs up before overwriting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blocks-inst-'));
  try {
    const path = join(dir, 'mcp.json');
    writeFileSync(path, JSON.stringify({ mcpServers: { other: { command: 'keep' } }, misc: 42 }));
    applyJson(path, 'mcpServers', { command: 'npx', args: ['-y'] });

    const cfg = JSON.parse(readFileSync(path, 'utf-8'));
    assert.deepEqual(cfg.mcpServers.other, { command: 'keep' }); // untouched
    assert.equal(cfg.misc, 42); // untouched
    assert.ok(cfg.mcpServers['blocks-translation']); // ours added
    assert.ok(readdirSync(dir).some((f) => f.startsWith('mcp.json.bak-'))); // backup made
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('removeJson removes only our entry, preserves others, backs up; reports absent/nofile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blocks-inst-'));
  try {
    const path = join(dir, 'mcp.json');
    assert.equal(removeJson(path, 'mcpServers'), 'nofile'); // not created yet

    writeFileSync(path, JSON.stringify({ mcpServers: { other: { command: 'keep' }, 'blocks-translation': { command: 'npx' } } }));
    assert.equal(removeJson(path, 'mcpServers'), 'removed');
    const cfg = JSON.parse(readFileSync(path, 'utf-8'));
    assert.deepEqual(cfg.mcpServers.other, { command: 'keep' });
    assert.ok(!cfg.mcpServers['blocks-translation']);
    assert.ok(readdirSync(dir).some((f) => f.startsWith('mcp.json.bak-')));

    assert.equal(removeJson(path, 'mcpServers'), 'absent'); // already gone
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('applyJson refuses to corrupt a non-JSON (JSONC) config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blocks-inst-'));
  try {
    const path = join(dir, 'mcp.json');
    writeFileSync(path, '{ // a comment\n "servers": {} }');
    assert.throws(() => applyJson(path, 'servers', { command: 'npx' }), /not plain JSON/);
    // original left intact
    assert.ok(readFileSync(path, 'utf-8').includes('// a comment'));
    assert.ok(!existsSync(join(dir, 'mcp.json.bak')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
