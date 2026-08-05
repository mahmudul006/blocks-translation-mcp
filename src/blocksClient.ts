import { readFile, writeFile } from 'node:fs/promises';
import { getConfig } from './config.js';
import { projectCachePath } from './projectRoot.js';
import type { BlocksModule, DuplicateTextMatch, KeyExistenceResult, Language } from './types.js';

interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

/** Refresh this long before actual expiry — the Blocks admin API returns 200+[] for
 *  an expired session instead of 401, so we can't rely on a reactive retry alone. */
const TOKEN_REFRESH_BUFFER_MS = 60_000;

/**
 * The admin surface rejects requests with "NotAcceptable: Invalid_Origin_Or_Referer"
 * unless Origin/Referer match the real portal — headers a browser sends automatically
 * but Node's fetch does not. The origin is configurable (BLOCKS_ORIGIN) for non-cloud
 * Blocks deployments; the referer is the origin with a trailing slash.
 */
function adminOriginHeaders(): { origin: string; referer: string } {
  const origin = getConfig().origin;
  return { origin, referer: `${origin}/` };
}

/**
 * Two unrelated Blocks surfaces, captured 2026-08-02 (see blocks-api-capture.md):
 *
 * - Admin surface (idp/Authentication + uilm/Module,Key) — needs username/password
 *   login. `x-blocks-key` here is the Blocks *portal's own* app key (config.portalKey,
 *   constant across projects), and the token is sent as a Cookie
 *   (`access_token_<portalKey>=<jwt>`), NOT an Authorization header — mirrors exactly
 *   what the browser sent, since that's the only proven-working mechanism.
 *   Our tenant is scoped via a `projectKey` query/body param instead.
 *
 * - Public surface (uilm/Key/GetUilmFile) — no login at all. `x-blocks-key` here is
 *   OUR tenant key directly (config.tenantId). One call per ModuleName + Language
 *   returns the whole flat KeyName->text dict, no pagination.
 */
export class BlocksClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private moduleCache: Map<string, string> | null = null;
  private languages: Language[] | null = null;
  /** Dedupes concurrent logins: parallel admin calls share one in-flight login. */
  private loginInFlight: Promise<void> | null = null;

  /** Admin surface (login, listModules) needs all three; public surface (checkKeysExist) needs none. */
  private requireAdminConfig(): { username: string; password: string; portalKey: string } {
    const { username, password, portalKey } = getConfig();
    if (!username || !password || !portalKey) {
      throw new Error(
        'BLOCKS_USERNAME/BLOCKS_PASSWORD/BLOCKS_PORTAL_KEY not set — required for the admin surface (login, list_modules, languages).',
      );
    }
    return { username, password, portalKey };
  }

  private async login(): Promise<void> {
    // Share a single in-flight login across concurrent callers.
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = this.doLogin().finally(() => {
      this.loginInFlight = null;
    });
    return this.loginInFlight;
  }

  private async doLogin(): Promise<void> {
    const { username, password, portalKey } = this.requireAdminConfig();

    const response = await fetch(`${getConfig().baseUrl}/idp/v1/Authentication/Token`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'x-blocks-key': portalKey,
        ...adminOriginHeaders(),
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username,
        password,
      }),
    });

    if (!response.ok) {
      throw new Error(`Blocks login failed: ${response.status} ${response.statusText} — ${await response.text()}`);
    }

    const body = (await response.json()) as LoginResponse;
    this.token = body.access_token;
    this.tokenExpiresAt = Date.now() + body.expires_in * 1000 - TOKEN_REFRESH_BUFFER_MS;
  }

  /** Proactively refreshes on expiry — a expired-session response here is 200+[], not 401,
   *  so waiting for a 401 to trigger relogin (the old behavior) silently returns empty forever. */
  private async getToken(): Promise<string> {
    if (!this.token || Date.now() >= this.tokenExpiresAt) {
      await this.login();
    }
    return this.token!;
  }

  /** Admin surface only. Re-logs-in once on a 401 and retries, transparently. */
  private async adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { portalKey } = this.requireAdminConfig();
    const token = await this.getToken();
    const response = await fetch(`${getConfig().baseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        'x-blocks-key': portalKey,
        cookie: `access_token_${portalKey}=${token}`,
        ...adminOriginHeaders(),
      },
    });

    if (response.status === 401) {
      await this.login();
      return this.adminRequest<T>(path, init);
    }

    if (!response.ok) {
      throw new Error(`Blocks admin request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  async listModules(): Promise<BlocksModule[]> {
    interface ModuleGetsEntry {
      moduleName: string;
      itemId: string;
    }
    const modules = await this.adminRequest<ModuleGetsEntry[]>(
      `/uilm/v1/Module/Gets?projectKey=${getConfig().tenantId}`,
    );
    const result = modules.map((m) => ({ id: m.itemId, name: m.moduleName }));
    await this.setModuleCache(result);
    return result;
  }

  private async readCacheFile(): Promise<{ modules?: Record<string, string>; languages?: Language[] }> {
    try {
      return JSON.parse(await readFile(projectCachePath(), 'utf-8'));
    } catch {
      return {};
    }
  }

  private async writeCacheFile(patch: { modules?: Record<string, string>; languages?: Language[] }): Promise<void> {
    const current = await this.readCacheFile();
    const next = { ...current, ...patch, cachedAt: new Date().toISOString() };
    await writeFile(projectCachePath(), JSON.stringify(next, null, 2)).catch(() => {
      // Cache is a pure optimization — a write failure must not break the caller.
    });
  }

  private async loadModuleCache(): Promise<Map<string, string>> {
    if (this.moduleCache) return this.moduleCache;
    const modules = (await this.readCacheFile()).modules ?? {};
    this.moduleCache = new Map(Object.entries(modules));
    return this.moduleCache;
  }

  private async setModuleCache(modules: BlocksModule[]): Promise<void> {
    this.moduleCache = new Map(modules.map((m) => [m.name, m.id]));
    const asObject = Object.fromEntries(this.moduleCache);
    await this.writeCacheFile({ modules: asObject });
  }

  /** Fetches the tenant's languages. Uses the in-memory + on-disk cache unless `refresh` is set,
   *  in which case it re-queries the API (so a newly-added tenant language is picked up). */
  async getLanguages(refresh = false): Promise<Language[]> {
    if (!refresh) {
      if (this.languages) return this.languages;
      const cached = (await this.readCacheFile()).languages;
      if (cached && cached.length > 0) {
        this.languages = cached;
        return cached;
      }
    }
    interface LanguageEntry {
      languageCode: string;
      languageName: string;
      isDefault: boolean;
    }
    const raw = await this.adminRequest<LanguageEntry[]>(
      `/uilm/v1/Language/Gets?projectKey=${getConfig().tenantId}`,
    );
    this.languages = raw.map((l) => ({ code: l.languageCode, name: l.languageName, isDefault: l.isDefault }));
    await this.writeCacheFile({ languages: this.languages });
    return this.languages;
  }

  async getCultureCodes(refresh = false): Promise<string[]> {
    return (await this.getLanguages(refresh)).map((l) => l.code);
  }

  async getDefaultLanguageCode(): Promise<string> {
    const langs = await this.getLanguages();
    return (langs.find((l) => l.isDefault) ?? langs[0])?.code ?? 'en-US';
  }

  /** Resolves a module name to its id, using the disk cache first and only falling back to an
   *  admin-authenticated listModules() (and re-caching) on a cache miss. */
  async resolveModuleId(moduleName: string): Promise<string> {
    const cache = await this.loadModuleCache();
    const cached = cache.get(moduleName);
    if (cached) return cached;

    const modules = await this.listModules();
    const match = modules.find((m) => m.name === moduleName);
    if (!match) {
      const available = modules.map((m) => m.name).join(', ');
      throw new Error(`No Blocks module named "${moduleName}". Available modules: ${available}`);
    }
    return match.id;
  }

  /**
   * Public surface, no login needed. For each requested key, checks both:
   *  - exact KeyName match (existsInModules) — case-sensitive, matches portal convention
   *  - same English text under a DIFFERENT KeyName (duplicateTextIn) — trimmed,
   *    case-insensitive, catches e.g. new "APP_X.SUBMIT" = "Submit" when "SUBMIT_TEXT"
   *    already = "Submit" elsewhere.
   * One unauthenticated GetUilmFile call per module covers both checks — the full
   * flat dict is already in memory, so the text index is free to build alongside it.
   */
  async checkKeysExist(
    moduleNames: string[],
    keys: { keyName: string; englishText: string }[],
  ): Promise<KeyExistenceResult[]> {
    const normalize = (text: string) => text.trim().toLowerCase();
    const cachedDefault = (await this.readCacheFile()).languages?.find((l) => l.isDefault)?.code ?? 'en-US';

    const existsIn = new Map<string, string[]>(keys.map((k) => [k.keyName, []]));
    const duplicateTextIn = new Map<string, DuplicateTextMatch[]>(keys.map((k) => [k.keyName, []]));
    const wantedByNormalizedText = new Map<string, { keyName: string; englishText: string }[]>();
    for (const k of keys) {
      const norm = normalize(k.englishText);
      const bucket = wantedByNormalizedText.get(norm) ?? [];
      bucket.push(k);
      wantedByNormalizedText.set(norm, bucket);
    }

    await Promise.all(
      moduleNames.map(async (moduleName) => {
        const params = new URLSearchParams({
          ProjectKey: getConfig().tenantId,
          ModuleName: moduleName,
          Language: cachedDefault,
        });
        // A module that doesn't exist in this tenant (e.g. a default dedup module like
        // "generic-app" that a different project doesn't have) must NOT abort the whole
        // check — treat it as "absent, no matches" so the tool stays reusable across tenants.
        let flatKeys: Record<string, string>;
        try {
          const response = await fetch(`${getConfig().baseUrl}/uilm/v1/Key/GetUilmFile?${params}`, {
            headers: { 'x-blocks-key': getConfig().tenantId },
          });
          if (!response.ok) return; // module absent / not readable — skip it
          flatKeys = (await response.json()) as Record<string, string>;
        } catch {
          return; // network hiccup on one module shouldn't fail the batch
        }

        for (const { keyName } of keys) {
          if (keyName in flatKeys) {
            existsIn.get(keyName)!.push(moduleName);
          }
        }

        for (const [existingKeyName, existingValue] of Object.entries(flatKeys)) {
          const matches = wantedByNormalizedText.get(normalize(existingValue));
          if (!matches) continue;
          for (const wanted of matches) {
            if (wanted.keyName === existingKeyName) continue; // exact match, already in existsInModules
            duplicateTextIn
              .get(wanted.keyName)!
              .push({ module: moduleName, keyName: existingKeyName, value: existingValue });
          }
        }
      }),
    );

    return keys.map(({ keyName }) => ({
      keyName,
      existsInModules: existsIn.get(keyName)!,
      duplicateTextIn: duplicateTextIn.get(keyName)!,
    }));
  }
}
