import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BlocksClient } from '../blocksClient.js';
import { getConfig } from '../config.js';
import { assembleUploadEntries } from '../entryBuilder.js';

const entrySchema = z.object({
  keyName: z.string(),
  resources: z
    .array(
      z.object({
        culture: z.string(),
        value: z.string(),
      }),
    )
    .min(1),
});

export function registerBuildUploadEntries(server: McpServer, client: BlocksClient) {
  server.registerTool(
    'build_upload_entries',
    {
      title: 'Build Blocks portal upload JSON',
      description:
        'Pure JSON assembly (aside from resolving moduleName -> id, which is cached to disk so it rarely ' +
        'needs a live call). Takes already-translated keys (translate them yourself first, matching tone ' +
        'across all 7 cultures) and stamps them into the exact array shape the Blocks portal JSON import ' +
        'expects: _id (new uuid), TenantId, ModuleId, Value: null, Routes: [], and IsPartiallyTranslated ' +
        'computed from whether all target cultures were provided. ' +
        'Run search_keys first to avoid re-uploading keys that already exist. ' +
        'Prefer sync_keys for the common case (dedup-check + build + write to disk in one call).',
      inputSchema: {
        moduleName: z.string().optional().describe('e.g. "app-survey" — resolved to a ModuleId via cache/list_modules.'),
        moduleId: z.string().optional().describe('Raw ModuleId, if already known. Takes priority over moduleName.'),
        tenantId: z.string().optional().describe('Defaults to BLOCKS_TENANT_ID from .env if omitted.'),
        entries: z.array(entrySchema).min(1),
      },
    },
    async ({ moduleName, moduleId, tenantId, entries }) => {
      const resolvedModuleId = moduleId ?? (moduleName ? await client.resolveModuleId(moduleName) : undefined);
      if (!resolvedModuleId) {
        throw new Error('Provide either moduleName or moduleId.');
      }
      const cultures = await client.getCultureCodes();
      const invalid = entries.flatMap((e) => e.resources.map((r) => r.culture)).filter((c) => !cultures.includes(c));
      if (invalid.length > 0) {
        throw new Error(
          `Unknown culture(s) ${[...new Set(invalid)].join(', ')}. This tenant supports: ${cultures.join(', ')}.`,
        );
      }
      const resolvedTenantId = tenantId ?? getConfig().tenantId;
      const uploadEntries = assembleUploadEntries(resolvedModuleId, resolvedTenantId, entries, cultures);

      return {
        content: [{ type: 'text', text: JSON.stringify(uploadEntries, null, 2) }],
      };
    },
  );
}
