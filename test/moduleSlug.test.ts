import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleSlugFromPrefix } from '../src/moduleSlug.js';

test('APP_USER_MANAGEMENT -> app-user-management', () => {
  assert.equal(moduleSlugFromPrefix('APP_USER_MANAGEMENT'), 'app-user-management');
});

test('single segment lowercased', () => {
  assert.equal(moduleSlugFromPrefix('ROOT'), 'root');
});
