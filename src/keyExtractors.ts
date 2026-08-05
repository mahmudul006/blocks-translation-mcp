import type { Framework } from './config.js';

// A translation key: a dotted identifier like APP_X.SOME_KEY (>= 2 segments).
const KEY = String.raw`[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+`;

const BUILTIN_PATTERNS: Record<Exclude<Framework, 'generic'>, RegExp[]> = {
  'ngx-translate': [
    // Template pipe — covers {{ "X" | translate }}, {{ 'X' | translate }}, and
    // [attr]/[prop]="'X' | translate". Either quote style, since Angular templates use both.
    new RegExp(String.raw`['"](${KEY})['"]\s*\|\s*translate`, 'g'),
    // TS service calls — translateService.instant('X'), translate.get('X'), .stream('X').
    // Receiver must contain "translate" so plain Map.get()/.instant() don't false-match.
    new RegExp(String.raw`[Tt]ranslate\w*\.\s*(?:instant|get|stream)\(\s*['"\`](${KEY})['"\`]`, 'g'),
  ],
  'react-i18next': [
    /\bt\(\s*['"`]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)['"`]/g,
    /i18nKey=["'`]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)["'`]/g,
  ],
};

/** Extracts translation keys from git-diff text. Only added/changed lines (`+`, not `+++`)
 *  are scanned, so pre-existing keys are ignored. Returns deduped keys with their prefix. */
export function extractKeys(
  diffText: string,
  framework: Framework,
  customRegex?: string,
): { keyName: string; prefix: string }[] {
  const patterns: RegExp[] =
    framework === 'generic'
      ? [new RegExp(customRegex ?? '', 'g')]
      : BUILTIN_PATTERNS[framework];

  if (framework === 'generic' && !customRegex) {
    throw new Error('BLOCKS_FRAMEWORK=generic requires BLOCKS_KEY_REGEX (first capture group = key).');
  }

  const addedLines = diffText
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'));

  const found = new Map<string, { keyName: string; prefix: string }>();
  for (const line of addedLines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(line)) !== null) {
        const keyName = m[1];
        if (!keyName) continue;
        const prefix = keyName.split('.')[0];
        found.set(keyName, { keyName, prefix });
      }
    }
  }
  return [...found.values()];
}
