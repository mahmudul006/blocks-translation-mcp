import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupKeysByModule } from '../src/tools/prepareSync.js';

const KEYS = [
  { keyName: 'APP_USER_MANAGEMENT.EXPORT_USER_DATA', prefix: 'APP_USER_MANAGEMENT' },
  { keyName: 'APP_USER_MANAGEMENT.MODIFY', prefix: 'APP_USER_MANAGEMENT' },
  { keyName: 'APP_SURVEY.PARTICIPANT_STATUS', prefix: 'APP_SURVEY' },
];

test('groups keys by their own module — no cross-prefix leakage', () => {
  const groups = groupKeysByModule(KEYS);
  assert.equal(groups.length, 2);
  const um = groups.find((g) => g.module === 'app-user-management')!;
  const survey = groups.find((g) => g.module === 'app-survey')!;
  assert.deepEqual(um.keys.sort(), ['APP_USER_MANAGEMENT.EXPORT_USER_DATA', 'APP_USER_MANAGEMENT.MODIFY']);
  assert.deepEqual(survey.keys, ['APP_SURVEY.PARTICIPANT_STATUS']);
});

test('moduleName scopes to a single module', () => {
  const groups = groupKeysByModule(KEYS, 'app-survey');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].module, 'app-survey');
  assert.deepEqual(groups[0].keys, ['APP_SURVEY.PARTICIPANT_STATUS']);
});
