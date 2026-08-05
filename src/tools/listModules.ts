import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BlocksClient } from '../blocksClient.js';

export function registerListModules(server: McpServer, client: BlocksClient) {
  server.registerTool(
    'list_modules',
    {
      title: 'List Blocks modules',
      description:
        'Lists modules available in the configured Blocks tenant (name + id). ' +
        'Use this to resolve a module name (e.g. "app-user-management", "root", "generic-app") to the ' +
        'ModuleId needed by search_keys and build_upload_entries.',
      inputSchema: {},
    },
    async () => {
      const modules = await client.listModules();
      return {
        content: [{ type: 'text', text: JSON.stringify(modules, null, 2) }],
      };
    },
  );
}
