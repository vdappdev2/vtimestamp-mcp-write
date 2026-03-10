/**
 * MCP Tool Registration
 *
 * Registers the vtimestamp_create tool for creating timestamps on the Verus blockchain.
 */

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getVdxfKeys, isValidIdentity, findTimestampByHash, buildTimestampContentMap } from './vdxf.js';
import {
  getIdentity,
  getIdentityHistory,
  updateIdentity,
  VerusRpcError,
  RPC_ERROR_CODES,
} from './verus-rpc.js';

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function registerTools(server: McpServer): void {
  server.tool(
    'vtimestamp_create',
    'Create a new timestamp on a VerusID. Provide either a file_path or text — the server computes the SHA-256 hash automatically. Writes the hash and metadata to the Verus blockchain.',
    {
      identity: z.string().describe('VerusID name (e.g., "alice@")'),
      file_path: z.string().optional().describe('Path to a file to hash and timestamp. Mutually exclusive with text.'),
      text: z.string().optional().describe('Text to hash and timestamp (e.g., an attestation, decision, or report). Mutually exclusive with file_path.'),
      title: z.string().describe('Title for the timestamp'),
      description: z.string().optional().describe('Description of the timestamped content'),
      filename: z.string().optional().describe('Original filename (auto-detected when using file_path)'),
      filesize: z.number().optional().describe('File size in bytes (auto-detected when using file_path)'),
      sourceoffunds: z.string().optional().describe('Funding address (R-address, z-address, or ID@)'),
      feeoffer: z.number().optional().describe('Fee offer in VRSC (default: 0.0001)'),
    },
    async ({ identity, file_path, text, title, description, filename, filesize, sourceoffunds, feeoffer }) => {
      // Validate identity format
      if (!isValidIdentity(identity)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid identity format — must be a VerusID name ending with @ (e.g., "alice@")'
        );
      }

      // Validate exactly one input mode
      if (!file_path && !text) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Must provide either file_path or text'
        );
      }
      if (file_path && text) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Only one of file_path or text may be provided — they are mutually exclusive'
        );
      }

      // Resolve hash from the provided input
      let hash: string;
      let resolvedFilename = filename;
      let resolvedFilesize = filesize;

      if (file_path) {
        try {
          const fileBuffer = await readFile(file_path);
          hash = sha256(fileBuffer);
          if (!resolvedFilename) {
            resolvedFilename = basename(file_path);
          }
          if (resolvedFilesize === undefined) {
            const fileStat = await stat(file_path);
            resolvedFilesize = fileStat.size;
          }
        } catch (err) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
      } else {
        hash = sha256(text!);
      }

      const keys = getVdxfKeys('mainnet');

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
                    error: `Identity '${identity}' not found`,
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
          { sha256: hash, title, description, filename: resolvedFilename, filesize: resolvedFilesize },
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
