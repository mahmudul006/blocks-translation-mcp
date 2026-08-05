import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractKeys } from '../src/keyExtractors.js';

const NGX_DIFF = [
  '+++ b/x.html',
  '+  <h2>{{ "APP_SURVEY.TITLE" | translate }}</h2>', // double-quoted interpolation
  "+  <span>{{ 'APP_SURVEY.SUBMIT' | translate }}</span>", // single-quoted interpolation
  "+  <button [attr.aria-label]=\"'APP_SURVEY.CANCEL' | translate\">", // binding, inner single quotes
  "-  old removed 'APP_SURVEY.GONE' | translate",
].join('\n');

test('ngx-translate extracts both quote styles, ignores removed/header lines', () => {
  const keys = extractKeys(NGX_DIFF, 'ngx-translate');
  assert.deepEqual(keys.map((k) => k.keyName).sort(), ['APP_SURVEY.CANCEL', 'APP_SURVEY.SUBMIT', 'APP_SURVEY.TITLE']);
  assert.equal(keys.find((k) => k.keyName === 'APP_SURVEY.SUBMIT')!.prefix, 'APP_SURVEY');
});

test('ngx-translate extracts .ts service calls (instant/get/stream), not plain .get', () => {
  const diff = [
    '+++ b/x.ts',
    "+    this.toastr.success(this.translateService.instant('APP_USER_MANAGEMENT.SEAT_LIMIT_REACHED'));",
    "+    this.translate.get('APP_USER_MANAGEMENT.PROVISIONING_IN_PROGRESS').subscribe();",
    "+    this._translate.stream('APP_USER_MANAGEMENT.INVITE_SENT');",
    "+    const v = someMap.get('not.a.key');", // plain .get on non-translate receiver — must NOT match
  ].join('\n');
  const keys = extractKeys(diff, 'ngx-translate');
  assert.deepEqual(
    keys.map((k) => k.keyName).sort(),
    ['APP_USER_MANAGEMENT.INVITE_SENT', 'APP_USER_MANAGEMENT.PROVISIONING_IN_PROGRESS', 'APP_USER_MANAGEMENT.SEAT_LIMIT_REACHED'],
  );
});

test('ngx-translate extracts property-binding pipe (e.g. [matTooltip])', () => {
  const diff = [
    '+++ b/x.html',
    "+  <button [matTooltip]=\"'APP_USER_MANAGEMENT.COPY_INVITE_LINK' | translate\">",
    "+  <input [placeholder]=\"'APP_USER_MANAGEMENT.SEARCH' | translate\" />",
  ].join('\n');
  const keys = extractKeys(diff, 'ngx-translate');
  assert.deepEqual(keys.map((k) => k.keyName).sort(), ['APP_USER_MANAGEMENT.COPY_INVITE_LINK', 'APP_USER_MANAGEMENT.SEARCH']);
});

test('react-i18next extracts t() and Trans keys', () => {
  const diff = [
    '+++ b/x.tsx',
    "+  const label = t('APP_USER.NAME');",
    '+  <Trans i18nKey="APP_USER.BIO">bio</Trans>',
  ].join('\n');
  const keys = extractKeys(diff, 'react-i18next');
  assert.deepEqual(keys.map((k) => k.keyName).sort(), ['APP_USER.BIO', 'APP_USER.NAME']);
});

test('generic uses the supplied regex first capture group', () => {
  const diff = ['+++ b/x.vue', '+  $t(`SHOP.PRICE`)'].join('\n');
  const keys = extractKeys(diff, 'generic', '\\$t\\(`([A-Z0-9_.]+)`\\)');
  assert.deepEqual(keys.map((k) => k.keyName), ['SHOP.PRICE']);
});
