import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BlocksClient } from './blocksClient.js';
import { registerListModules } from './tools/listModules.js';
import { registerSearchKeys } from './tools/searchKeys.js';
import { registerBuildUploadEntries } from './tools/buildUploadEntries.js';
import { registerSyncKeys } from './tools/syncKeys.js';
import { registerFindKeys } from './tools/findKeys.js';
import { registerListCultures } from './tools/listCultures.js';
import { registerPrepareSync } from './tools/prepareSync.js';
import { SERVER_INSTRUCTIONS } from './instructions.js';

const server = new McpServer(
  { name: 'blocks-translation-mcp', version: '0.3.0' },
  { instructions: SERVER_INSTRUCTIONS },
);

const client = new BlocksClient();

registerPrepareSync(server, client);
registerFindKeys(server);
registerListCultures(server, client);
registerListModules(server, client);
registerSearchKeys(server, client);
registerBuildUploadEntries(server, client);
registerSyncKeys(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
