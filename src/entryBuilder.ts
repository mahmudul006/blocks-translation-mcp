import type { BlocksUploadEntry, TranslatedResource } from './types.js';

export function assembleUploadEntries(
  moduleId: string,
  tenantId: string,
  entries: { keyName: string; resources: TranslatedResource[] }[],
  cultures: string[],
): BlocksUploadEntry[] {
  return entries.map(({ keyName, resources }) => {
    const providedCultures = new Set(resources.map((r) => r.culture));
    const isPartiallyTranslated = !cultures.every((c) => providedCultures.has(c));

    return {
      // Left empty on purpose — the Blocks portal assigns the _id on import.
      _id: '',
      TenantId: tenantId,
      KeyName: keyName,
      ModuleId: moduleId,
      Value: null,
      Resources: resources.map((r) => ({
        Value: r.value,
        Culture: r.culture,
        CharacterLength: 0,
      })),
      Routes: [],
      IsPartiallyTranslated: isPartiallyTranslated,
    };
  });
}
