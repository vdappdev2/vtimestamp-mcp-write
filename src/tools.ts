/**
 * MCP Tool Registration
 *
 * Registers the vtimestamp_create tool for creating timestamps on the Verus blockchain.
 */

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getVdxfKeys, isValidSha256, isValidIdentity, findTimestampByHash, buildTimestampContentMap } from './vdxf.js';
import {
  getIdentity,
  getIdentityHistory,
  updateIdentity,
  getConfig,
  VerusRpcError,
  RPC_ERROR_CODES,
} from './verus-rpc.js';

export function registerTools(server: McpServer): void {
  server.tool(
    'vtimestamp_create',
    'Create a new timestamp on a VerusID. Writes a SHA-256 hash and metadata to the Verus blockchain via a local or remote daemon.',
    {
      identity: z.string().describe('VerusID name (e.g., "alice@")'),
      hash: z.string().describe('SHA-256 hash of the document (64-character hex string)'),
      title: z.string().describe('Title for the timestamp'),
      description: z.string().optional().describe('Description of the timestamped document'),
      filename: z.string().optional().describe('Original filename'),
      filesize: z.number().optional().describe('File size in bytes'),
      sourceoffunds: z.string().optional().describe('Funding address (R-address, z-address, or ID@)'),
      feeoffer: z.number().optional().describe('Fee offer in VRSC (default: 0.0001)'),
    },
    async ({ identity, hash, title, description, filename, filesize, sourceoffunds, feeoffer }) => {
      // Validate identity format
      if (!isValidIdentity(identity)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid identity format — must be a VerusID name ending with @ (e.g., "alice@")'
        );
      }

      // Validate hash format
      if (!isValidSha256(hash)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid hash format — must be a 64-character hex string'
        );
      }

      const cfg = getConfig();
      const keys = getVdxfKeys(cfg.network);

      try {
        // Step 1: Verify identity exists and get name + parent
        let name: string;
        let parent: string;
        try {
          const idResponse = await getIdentity(identity);
          name = idResponse.identity.name;
          parent = idResponse.identity.parent;
        } catch (err) {
          if (err instanceof VerusRpcError && err.code === RPC_ERROR_CODES.IDENTITY_NOT_FOUND) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    error: `Identity '${identity}' not found on ${cfg.network}`,
                  }),
                },
              ],
              isError: true,
            };
          }
          throw err;
        }

        // Step 2: Check for duplicate hash
        try {
          const historyResponse = await getIdentityHistory(identity);
          const existing = findTimestampByHash(historyResponse.history, hash, keys);
          if (existing) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    {
                      error: 'Duplicate timestamp',
                      identity,
                      hash,
                      message: `This hash has already been timestamped on ${identity} at block ${existing.blockheight} (tx: ${existing.txid})`,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        } catch {
          // If history check fails, proceed anyway — the timestamp itself is more important
        }

        // Step 3: Build contentmultimap
        const contentmultimap = buildTimestampContentMap(
          { sha256: hash, title, description, filename, filesize },
          keys
        );

        // Step 4: Call updateidentity
        const txid = await updateIdentity(
          { name, parent, contentmultimap },
          feeoffer,
          sourceoffunds
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  identity,
                  hash,
                  title,
                  transaction_id: txid,
                  network: cfg.network,
                  message: 'Timestamp created successfully',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        if (err instanceof McpError) throw err;

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Failed to create timestamp: ${err instanceof Error ? err.message : 'Unknown error'}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
