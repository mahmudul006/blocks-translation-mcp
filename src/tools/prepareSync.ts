import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BlocksClient } from '../blocksClient.js';
import { getConfig, type Framework } from '../config.js';
import { getProjectRoot } from '../projectRoot.js';
import { collectDiff } from '../gitCollect.js';
import { extractKeys } from '../keyExtractors.js';
import { moduleSlugFromPrefix } from '../moduleSlug.js';

/** Groups extracted keys by their own module (derived from each key's prefix), so keys never
 *  leak into a sibling module's bucket. When moduleName is given, only that module is kept. */
export function groupKeysByModule(
  keys: { keyName: string; prefix: string }[],
  moduleName?: string,
): { module: string; keys: string[] }[] {
  const byModule = new Map<string, string[]>();
  for (const k of keys) {
    const slug = moduleSlugFromPrefix(k.prefix);
    if (moduleName && slug !== moduleName) continue;
    const arr = byModule.get(slug) ?? [];
    arr.push(k.keyName);
    byModule.set(slug, arr);
  }
  return [...byModule.entries()].map(([module, moduleKeys]) => ({ module, keys: moduleKeys }));
}

export function registerPrepareSync(server: McpServer, client: BlocksClient) {
  server.registerTool(
    'prepare_sync',
    {
      title: 'One-call prep: diff -> keys -> per-module cultures + exact dedupe',
      description:
        'The FIRST and usually ONLY prep call for a translation sync. Scans the project diff ' +
        '(working-tree + staged + untracked), groups the found keys BY THEIR OWN module (from each ' +
        "key's prefix), fetches the tenant cultures, and exact-dedupes each module's keys against that " +
        'module + any modules in BLOCKS_DEDUP_MODULES (none by default) — all in code, no LLM work. Handles a ' +
        'diff spanning several modules in ONE call. Returns { cultures, modules: [{ module, newKeys, ' +
        'existingSkip }] }. Do NOT call find_keys / list_modules / list_cultures / search_keys ' +
        'separately — this replaces them. Then, for each module with non-empty newKeys, infer English ' +
        'from the key names, translate into cultures, and call sync_keys for THAT module (omit ' +
        'outputPath) — one sync_keys call per module produces one JSON file per module.',
      inputSchema: {
        moduleName: z
          .string()
          .optional()
          .describe('Scope to a single Blocks module slug, e.g. "app-user-management". Omit to process every module present in the diff.'),
        diffBase: z.string().optional().describe('Git ref to diff against. Omit for uncommitted changes.'),
        framework: z.enum(['ngx-translate', 'react-i18next', 'generic']).optional(),
        extraModuleNames: z.array(z.string()).optional().describe('Extra modules to exact-dedupe against.'),
        refresh: z.boolean().optional().describe('Re-fetch tenant cultures from the API, bypassing the cache.'),
      },
    },
    async ({ moduleName, diffBase, framework, extraModuleNames, refresh }) => {
      const cfg = getConfig();
      const diff = await collectDiff(getProjectRoot(), diffBase);
      const keys = extractKeys(diff, (framework as Framework) ?? cfg.framework, cfg.keyRegex);
      const groups = groupKeysByModule(keys, moduleName);

      if (groups.length === 0) {
        const note = moduleName
          ? `No keys found for module "${moduleName}" in the diff.`
          : 'No translation keys found in the diff.';
        return { content: [{ type: 'text', text: JSON.stringify({ cultures: [], modules: [], note }, null, 2) }] };
      }

      const cultures = await client.getCultureCodes(refresh ?? false);

      const modules = await Promise.all(
        groups.map(async ({ module, keys: moduleKeys }) => {
          const dedupModules = Array.from(new Set([module, ...cfg.defaultDedupModules, ...(extraModuleNames ?? [])]));
          // Exact-KeyName dedupe only (no English needed here); empty englishText disables text-dup noise.
          const existence = await client.checkKeysExist(
            dedupModules,
            moduleKeys.map((keyName) => ({ keyName, englishText: '' })),
          );
          const existingSkip: string[] = [];
          const newKeys: string[] = [];
          for (const e of existence) {
            if (e.existsInModules.includes(module)) existingSkip.push(e.keyName);
            else newKeys.push(e.keyName);
          }
          return { module, newKeys, existingSkip };
        }),
      );

      return { content: [{ type: 'text', text: JSON.stringify({ cultures, modules }, null, 2) }] };
    },
  );
}
