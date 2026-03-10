#!/usr/bin/env node

/**
 * vtimestamp-mcp-write
 *
 * MCP server for creating vtimestamp proofs on the Verus blockchain
 * via a local or remote Verus daemon.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getConfig } from './verus-rpc.js';
import { registerTools } from './tools.js';

// Validate config before starting
try {
  const cfg = getConfig();

  // Mask URL for logging (show host only)
  let maskedUrl: string;
  try {
    const url = new URL(cfg.url);
    maskedUrl = `${url.protocol}//${url.hostname}:${url.port || '(default)'}`;
  } catch {
    maskedUrl = '(invalid URL)';
  }

  process.stderr.write(
    `vtimestamp-mcp-write: connecting to ${maskedUrl}\n`
  );
} catch (err) {
  process.stderr.write(
    `vtimestamp-mcp-write: ${err instanceof Error ? err.message : 'Configuration error'}\n`
  );
  process.exit(1);
}

const server = new McpServer({
  name: 'vtimestamp-mcp-write',
  version: '1.1.1',
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});
