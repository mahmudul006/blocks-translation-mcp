import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getConfig, type Framework } from '../config.js';
import { getProjectRoot } from '../projectRoot.js';
import { collectDiff } from '../gitCollect.js';
import { extractKeys } from '../keyExtractors.js';

export function registerFindKeys(server: McpServer) {
  server.registerTool(
    'find_keys',
    {
      title: 'Find new/changed translation keys in the current project',
      description:
        'Scans the current project for added/changed translation keys and returns them deduped with ' +
        'their source-derived prefix, using the configured framework (ngx-translate | react-i18next | ' +
        'generic). In the default mode it reads the working-tree + staged diff AND brand-new untracked ' +
        'files (a common place for new keys); pass diffBase to compare against a ref instead. Does NOT ' +
        'resolve the Blocks module slug — use list_modules for that. Standalone building block; for a ' +
        'full sync prefer prepare_sync, which composes this with module/culture resolution and dedupe.',
      inputSchema: {
        diffBase: z
          .string()
          .optional()
          .describe('A git ref (e.g. "main") to diff against. Omit to use uncommitted changes (working tree + staged).'),
        framework: z
          .enum(['ngx-translate', 'react-i18next', 'generic'])
          .optional()
          .describe('Override the configured BLOCKS_FRAMEWORK for this call.'),
      },
    },
    async ({ diffBase, framework }) => {
      const cfg = getConfig();
      const diff = await collectDiff(getProjectRoot(), diffBase);
      const keys = extractKeys(diff, (framework as Framework) ?? cfg.framework, cfg.keyRegex);
      return { content: [{ type: 'text', text: JSON.stringify({ count: keys.length, keys }, null, 2) }] };
    },
  );
}
