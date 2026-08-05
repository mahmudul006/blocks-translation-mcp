import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BlocksClient } from '../blocksClient.js';
import { getConfig } from '../config.js';

export function registerSearchKeys(server: McpServer, client: BlocksClient) {
  server.registerTool(
    'search_keys',
    {
      title: 'Search for existing Blocks keys (dedup check)',
      description:
        'Checks each key two ways before you upload it, no login required (public GetUilmFile endpoint): ' +
        '(1) exact KeyName match, and (2) same English text under a DIFFERENT KeyName (trimmed, ' +
        'case-insensitive) — catches e.g. adding "APP_X.SUBMIT" = "Submit" when "SUBMIT_TEXT" already = ' +
        '"Submit" elsewhere, so you reuse the existing key instead of creating a duplicate string. By ' +
        'default always checks the target module plus "root" and "generic-app" ' +
        '(the two shared modules keys commonly leak into/from). Pass extraModuleNames to widen it.',
      inputSchema: {
        targetModuleName: z.string().describe('Module name being worked on, e.g. "app-survey" (not a ModuleId).'),
        keys: z
          .array(
            z.object({
              keyName: z.string(),
              englishText: z.string().describe('The en-US text you intend to upload for this key.'),
            }),
          )
          .min(1),
        extraModuleNames: z
          .array(z.string())
          .optional()
          .describe('Additional module names to check beyond the target/root/generic-app default.'),
      },
    },
    async ({ targetModuleName, keys, extraModuleNames }) => {
      const moduleNames = Array.from(
        new Set([targetModuleName, ...getConfig().defaultDedupModules, ...(extraModuleNames ?? [])]),
      );

      const results = await client.checkKeysExist(moduleNames, keys);
      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      };
    },
  );
}
