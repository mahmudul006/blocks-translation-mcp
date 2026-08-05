import { BlocksClient } from './blocksClient.js';

const client = new BlocksClient();

try {
  const modules = await client.listModules();
  console.log('listModules OK, count:', modules.length);
  console.log(modules.slice(0, 3));
} catch (err) {
  console.error('listModules FAILED:');
  console.error(err);
}
