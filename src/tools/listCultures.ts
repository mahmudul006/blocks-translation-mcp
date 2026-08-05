import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BlocksClient } from '../blocksClient.js';

export function registerListCultures(server: McpServer, client: BlocksClient) {
  server.registerTool(
    'list_cultures',
    {
      title: "List the tenant's translation cultures",
      description:
        'Returns the culture codes this Blocks tenant supports (e.g. en-US, de-DE, ...), fetched from the ' +
        'Blocks Language API and cached to disk. Call this to learn exactly which cultures to translate into ' +
        'before sync_keys / build_upload_entries. Do NOT read local i18n files or rely on memory for the ' +
        'culture set — this tool is the source of truth. Also reports which culture is the tenant default. ' +
        'Pass refresh:true to re-fetch from the API if the tenant recently added a language.',
      inputSchema: {
        refresh: z.boolean().optional().describe('Re-fetch languages from the API, bypassing the cache.'),
      },
    },
    async ({ refresh }) => {
      const languages = await client.getLanguages(refresh ?? false);
      const cultures = languages.map((l) => l.code);
      const defaultCulture = (languages.find((l) => l.isDefault) ?? languages[0])?.code ?? null;
      return {
        content: [
          { type: 'text', text: JSON.stringify({ cultures, defaultCulture, languages }, null, 2) },
        ],
      };
    },
  );
}
