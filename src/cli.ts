#!/usr/bin/env node
// Single entrypoint: `blocks-translation-mcp install` runs the interactive installer;
// anything else (the default, how MCP clients launch it) boots the stdio server.
const cmd = process.argv[2];

if (cmd === 'install') {
  const { runInstaller } = await import('./install/installer.js');
  await runInstaller(process.argv.slice(3));
} else {
  await import('./index.js'); // boots the MCP stdio server
}
