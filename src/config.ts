import { config as parseEnv } from 'dotenv';
import { join } from 'node:path';
import { getProjectRoot } from './projectRoot.js';

export type Framework = 'ngx-translate' | 'react-i18next' | 'generic';

export interface BlocksConfig {
  baseUrl: string;
  tenantId: string;
  portalKey?: string;
  username?: string;
  password?: string;
  framework: Framework;
  keyRegex?: string;
  outputPathPattern: string;
  defaultDedupModules: string[];
  /** Origin/Referer the admin surface requires. Configurable for non-cloud Blocks deployments. */
  origin: string;
}

let cached: BlocksConfig | null = null;

/** Reads .env.blocks-translation from the project root WITHOUT mutating process.env,
 *  so explicit env vars keep priority and tests stay isolated. */
function readEnvFile(): Record<string, string> {
  const path = join(getProjectRoot(), '.env.blocks-translation');
  try {
    return parseEnv({ path, processEnv: {} }).parsed ?? {};
  } catch {
    return {};
  }
}

/** Lazily resolves config. Precedence per key: process.env > .env.blocks-translation file. */
export function getConfig(): BlocksConfig {
  if (cached) return cached;

  const file = readEnvFile();
  const get = (k: string): string | undefined => process.env[k] ?? file[k] ?? undefined;

  const tenantId = get('BLOCKS_TENANT_ID');
  if (!tenantId) {
    throw new Error(
      'No Blocks config found for this project. Create `.env.blocks-translation` at your ' +
        'repo root (copy `.env.blocks-translation.example`) or set BLOCKS_* vars in your MCP ' +
        'client config. BLOCKS_TENANT_ID is required.',
    );
  }

  const framework = (get('BLOCKS_FRAMEWORK') as Framework) || 'ngx-translate';
  const dedup = get('BLOCKS_DEDUP_MODULES');

  cached = {
    baseUrl: get('BLOCKS_BASE_URL') || 'https://api.seliseblocks.com',
    tenantId,
    portalKey: get('BLOCKS_PORTAL_KEY'),
    username: get('BLOCKS_USERNAME'),
    password: get('BLOCKS_PASSWORD'),
    framework,
    keyRegex: get('BLOCKS_KEY_REGEX') || undefined,
    outputPathPattern:
      get('BLOCKS_OUTPUT_PATH_PATTERN') ||
      'blocks-translation-helper/blocks-upload.{module}.generated.json',
    defaultDedupModules: dedup
      ? dedup.split(',').map((s) => s.trim()).filter(Boolean)
      : ['root', 'generic-app'],
    origin: (get('BLOCKS_ORIGIN') || 'https://cloud.seliseblocks.com').replace(/\/$/, ''),
  };
  return cached;
}

export function resetConfigForTest(): void {
  cached = null;
}
