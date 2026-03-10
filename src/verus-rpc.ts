/**
 * Verus RPC Client (Daemon-Targeted)
 *
 * Single-endpoint JSON-RPC 1.0 client with optional Basic auth.
 * Connects to a user's Verus daemon for wallet operations.
 *
 * Auto-detects RPC credentials from VRSC.conf when possible.
 * Env vars override auto-detected values for remote daemon use.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import type {
  GetIdentityResponse,
  IdentityHistoryResponse,
  ContentMultiMap,
} from './types.js';

// ============================================================================
// VRSC.conf Auto-Detection
// ============================================================================

function getDefaultConfPath(): string {
  const home = homedir();
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Komodo', 'VRSC', 'VRSC.conf');
    case 'win32':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Komodo', 'VRSC', 'VRSC.conf');
    default:
      return join(home, '.komodo', 'VRSC', 'VRSC.conf');
  }
}

interface ConfValues {
  rpcuser?: string;
  rpcpassword?: string;
  rpcport?: string;
}

function parseVrscConf(confPath: string): ConfValues | null {
  try {
    const content = readFileSync(confPath, 'utf-8');
    const values: ConfValues = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (key === 'rpcuser') values.rpcuser = value;
      else if (key === 'rpcpassword') values.rpcpassword = value;
      else if (key === 'rpcport') values.rpcport = value;
    }
    return values;
  } catch {
    return null;
  }
}

// ============================================================================
// Configuration
// ============================================================================

interface RpcConfig {
  url: string;
  user?: string;
  password?: string;
}

let config: RpcConfig | null = null;

export function getConfig(): RpcConfig {
  if (config) return config;

  // Try auto-detect from VRSC.conf
  const confPath = process.env.VERUS_CONF_PATH || getDefaultConfPath();
  const conf = parseVrscConf(confPath);

  const user = process.env.VERUS_RPC_USER || conf?.rpcuser || undefined;
  const password = process.env.VERUS_RPC_PASSWORD || conf?.rpcpassword || undefined;

  // URL: env var > build from conf rpcport > default port (27486)
  const url = process.env.VERUS_RPC_URL
    || `http://127.0.0.1:${conf?.rpcport || '27486'}`;

  if (!user || !password) {
    throw new Error(
      `Could not find RPC credentials. Looked for VRSC.conf at: ${confPath}\n` +
      'Either ensure your Verus daemon is installed, set VERUS_CONF_PATH, ' +
      'or provide VERUS_RPC_URL, VERUS_RPC_USER, and VERUS_RPC_PASSWORD.'
    );
  }

  config = { url, user, password };
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
