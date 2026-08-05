import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BlocksClient } from '../blocksClient.js';
import { getConfig } from '../config.js';
import { getProjectRoot } from '../projectRoot.js';
import { assembleUploadEntries } from '../entryBuilder.js';

const entrySchema = z.object({
  keyName: z.string(),
  englishText: z.string().describe('The en-US text — used for the duplicate-text dedup check.'),
  resources: z
    .array(z.object({ culture: z.string(), value: z.string() }))
    .min(1)
    .describe('Translate yourself first into every tenant culture (call list_cultures for the exact set) before calling this tool.'),
});

export function registerSyncKeys(server: McpServer, client: BlocksClient) {
  server.registerTool(
    'sync_keys',
    {
      title: 'Dedup-check, build, and write a Blocks upload in one call',
      description:
        'The one-call path for adding new translation keys: resolves the module by name (cached to disk), ' +
        'dedup-checks every key against the target module + root + generic-app, skips any key whose exact ' +
        'KeyName already exists in the target module (would overwrite/duplicate), builds portal-ready upload ' +
        'entries for the rest, and — if outputPath is given — writes them straight to disk. Keys with the ' +
        'same English text under a DIFFERENT existing key are NOT auto-skipped (reusing them means changing ' +
        'the calling code, not this tool\'s call) — they come back in duplicateWarnings for you to decide on. ' +
        'Returns a compact summary, not the full entry JSON, to keep the response small — read the written ' +
        'file if you need the entries themselves. The upload JSON is written to outputPath, or — when you omit ' +
        'outputPath (recommended) — to the path from BLOCKS_OUTPUT_PATH_PATTERN with {module} substituted, ' +
        'resolved against the project root. Parent directories are created automatically. Do NOT invent an ' +
        'output path: omit outputPath and let the configured location be used.',
      inputSchema: {
        moduleName: z.string().describe('e.g. "app-survey" (not a ModuleId).'),
        entries: z.array(entrySchema).min(1),
        extraModuleNames: z
          .array(z.string())
          .optional()
          .describe('Additional module names to dedup-check beyond the target/root/generic-app default.'),
        outputPath: z
          .string()
          .optional()
          .describe('Where to write the upload JSON. Omit to use BLOCKS_OUTPUT_PATH_PATTERN (recommended). A relative path is resolved against the project root; parent dirs are created.'),
        tenantId: z.string().optional().describe('Defaults to BLOCKS_TENANT_ID from .env if omitted.'),
      },
    },
    async ({ moduleName, entries, extraModuleNames, outputPath, tenantId }) => {
      const dedupModuleNames = Array.from(
        new Set([moduleName, ...getConfig().defaultDedupModules, ...(extraModuleNames ?? [])]),
      );
      const existence = await client.checkKeysExist(
        dedupModuleNames,
        entries.map(({ keyName, englishText }) => ({ keyName, englishText })),
      );
      const existenceByKey = new Map(existence.map((e) => [e.keyName, e]));

      const skippedExisting: { keyName: string; existsInModules: string[] }[] = [];
      const duplicateWarnings: { keyName: string; duplicateTextIn: (typeof existence)[number]['duplicateTextIn'] }[] =
        [];
      const toBuild: typeof entries = [];

      for (const entry of entries) {
        const result = existenceByKey.get(entry.keyName)!;
        if (result.existsInModules.includes(moduleName)) {
          skippedExisting.push({ keyName: entry.keyName, existsInModules: result.existsInModules });
          continue;
        }
        if (result.duplicateTextIn.length > 0) {
          duplicateWarnings.push({ keyName: entry.keyName, duplicateTextIn: result.duplicateTextIn });
        }
        toBuild.push(entry);
      }

      const cultures = await client.getCultureCodes();
      const invalid = toBuild.flatMap((e) => e.resources.map((r) => r.culture)).filter((c) => !cultures.includes(c));
      if (invalid.length > 0) {
        throw new Error(
          `Unknown culture(s) ${[...new Set(invalid)].join(', ')}. This tenant supports: ${cultures.join(', ')}.`,
        );
      }
      const resolvedTenantId = tenantId ?? getConfig().tenantId;
      const moduleId = await client.resolveModuleId(moduleName);
      const uploadEntries = assembleUploadEntries(moduleId, resolvedTenantId, toBuild, cultures);

      // Resolve where to write: explicit outputPath, else the configured pattern with {module}
      // substituted. A relative path is anchored to the project root, and parent dirs are created
      // so the write never fails just because the folder doesn't exist yet.
      let writtenPath: string | null = null;
      if (uploadEntries.length > 0) {
        const target = outputPath ?? getConfig().outputPathPattern.replace('{module}', moduleName);
        writtenPath = isAbsolute(target) ? target : join(getProjectRoot(), target);
        await mkdir(dirname(writtenPath), { recursive: true });
        await writeFile(writtenPath, JSON.stringify(uploadEntries, null, 2));
      }

      const summary = {
        moduleId,
        written: uploadEntries.map((e) => e.KeyName),
        skippedExisting,
        duplicateWarnings,
        outputPath: writtenPath,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      };
    },
  );
}
