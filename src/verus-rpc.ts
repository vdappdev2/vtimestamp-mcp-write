/**
 * Verus RPC Client (Daemon-Targeted)
 *
 * Single-endpoint JSON-RPC 1.0 client with optional Basic auth.
 * Connects to a user's Verus daemon for wallet operations.
 */

import type {
  Network,
  GetIdentityResponse,
  IdentityHistoryResponse,
  ContentMultiMap,
} from './types.js';

// ============================================================================
// Configuration
// ============================================================================

interface RpcConfig {
  url: string;
  user?: string;
  password?: string;
  network: Network;
}

let config: RpcConfig | null = null;

export function getConfig(): RpcConfig {
  if (config) return config;

  const url = process.env.VERUS_RPC_URL;
  if (!url) {
    throw new Error('VERUS_RPC_URL environment variable is required');
  }

  const networkEnv = process.env.VERUS_NETWORK?.toLowerCase();
  const network: Network =
    networkEnv === 'testnet' ? 'testnet' : 'mainnet';

  config = {
    url,
    user: process.env.VERUS_RPC_USER || undefined,
    password: process.env.VERUS_RPC_PASSWORD || undefined,
    network,
  };

  return config;
}

const RPC_TIMEOUT = 30_000;

// ============================================================================
// Error Class
// ============================================================================

export class VerusRpcError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'VerusRpcError';
    this.code = code;
  }
}

export const RPC_ERROR_CODES = {
  IDENTITY_NOT_FOUND: -5,
} as const;

// ============================================================================
// RPC Client
// ============================================================================

interface RpcResponse<T> {
  result: T | null;
  error: { code: number; message: string } | null;
  id: string;
}

async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const cfg = getConfig();

  const request = {
    jsonrpc: '1.0' as const,
    id: `vtimestamp-mcp-write-${Date.now()}`,
    method,
    params,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'text/plain',
  };

  if (cfg.user && cfg.password) {
    const credentials = Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }

  const response = await fetch(cfg.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(RPC_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP error: ${response.status} ${response.statusText}`);
  }

  const data: RpcResponse<T> = await response.json();

  if (data.error) {
    throw new VerusRpcError(data.error.code, data.error.message);
  }

  if (data.result === null) {
    throw new Error(`RPC returned null result for method ${method}`);
  }

  return data.result;
}

// ============================================================================
// RPC Methods
// ============================================================================

export async function getIdentity(identity: string): Promise<GetIdentityResponse> {
  return rpcCall<GetIdentityResponse>('getidentity', [identity]);
}

export async function getIdentityHistory(
  identity: string
): Promise<IdentityHistoryResponse> {
  return rpcCall<IdentityHistoryResponse>('getidentityhistory', [identity]);
}

interface UpdateIdentityParams {
  name: string;
  parent: string;
  contentmultimap: ContentMultiMap;
}

export async function updateIdentity(
  identityJson: UpdateIdentityParams,
  feeoffer?: number,
  sourceoffunds?: string
): Promise<string> {
  // Params: [identityJson, returntx, tokenupdate, feeoffer, sourceoffunds]
  const params: unknown[] = [identityJson, false, false];

  if (feeoffer !== undefined) {
    params.push(feeoffer);
  } else {
    params.push(0.0001);
  }

  if (sourceoffunds) {
    params.push(sourceoffunds);
  }

  return rpcCall<string>('updateidentity', params);
}
