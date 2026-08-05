import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleUploadEntries } from '../src/entryBuilder.js';

test('IsPartiallyTranslated is false only when all tenant cultures are present', () => {
  const cultures = ['en-US', 'de-DE'];
  const [full] = assembleUploadEntries('mod', 'ten', [
    { keyName: 'K.FULL', resources: [ { culture: 'en-US', value: 'a' }, { culture: 'de-DE', value: 'b' } ] },
  ], cultures);
  assert.equal(full.IsPartiallyTranslated, false);
  assert.equal(full.ModuleId, 'mod');
  assert.equal(full.TenantId, 'ten');
  assert.equal(full._id, ''); // portal assigns the id on import

  const [partial] = assembleUploadEntries('mod', 'ten', [
    { keyName: 'K.PART', resources: [ { culture: 'en-US', value: 'a' } ] },
  ], cultures);
  assert.equal(partial.IsPartiallyTranslated, true);
});
