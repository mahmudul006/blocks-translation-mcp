import { test } from 'node:test';
import assert from 'node:assert/strict';
import { npxSpecFromRepository } from '../src/install/npxSpec.js';

test('derives github:owner/repo from git+https url', () => {
  assert.equal(
    npxSpecFromRepository('git+https://github.com/acme/blocks-translation-mcp.git'),
    'github:acme/blocks-translation-mcp',
  );
});

test('derives from plain https url', () => {
  assert.equal(npxSpecFromRepository('https://github.com/acme/repo'), 'github:acme/repo');
});

test('derives from git@ ssh url', () => {
  assert.equal(npxSpecFromRepository('git@github.com:acme/repo.git'), 'github:acme/repo');
});

test('accepts github: shorthand', () => {
  assert.equal(npxSpecFromRepository('github:acme/repo'), 'github:acme/repo');
});

test('throws on a non-github url', () => {
  assert.throws(() => npxSpecFromRepository('https://gitlab.com/a/b.git'), /Cannot derive/);
});
