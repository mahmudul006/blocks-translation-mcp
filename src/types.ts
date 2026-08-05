// Cultures are tenant-defined (fetched from Language/Gets), not a fixed list.
export type Culture = string;

export interface Language {
  code: string;
  name: string;
  isDefault: boolean;
}

export interface BlocksModule {
  id: string;
  name: string;
}

export interface TranslatedResource {
  culture: Culture;
  value: string;
}

export interface BlocksResourceEntry {
  Value: string;
  Culture: Culture;
  CharacterLength: number;
}

export interface BlocksUploadEntry {
  _id: string;
  TenantId: string;
  KeyName: string;
  ModuleId: string;
  Value: null;
  Resources: BlocksResourceEntry[];
  Routes: never[];
  IsPartiallyTranslated: boolean;
}

export interface DuplicateTextMatch {
  module: string;
  keyName: string;
  value: string;
}

export interface KeyExistenceResult {
  keyName: string;
  existsInModules: string[];
  /** Different key(s), same module set, whose English text matches (trimmed, case-insensitive). */
  duplicateTextIn: DuplicateTextMatch[];
}
