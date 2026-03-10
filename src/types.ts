/**
 * TypeScript interfaces for vtimestamp-mcp-write
 */

// ============================================================================
// Verus RPC Types
// ============================================================================

export interface DataDescriptor {
  version: number;
  flags: number;
  objectdata: { message: string } | number | null;
  label?: string;
  mimetype?: string;
}

export interface DataDescriptorWrapper {
  [wrapperKey: string]: DataDescriptor;
}

export interface ContentMultiMap {
  [outerKey: string]: DataDescriptorWrapper[];
}

export interface IdentityData {
  version: number;
  flags: number;
  name: string;
  identityaddress: string;
  parent: string;
  contentmultimap?: ContentMultiMap;
}

export interface IdentityHistoryEntry {
  identity: IdentityData;
  blockhash: string;
  height: number;
  output: {
    txid: string;
    voutnum: number;
  };
}

export interface IdentityHistoryResponse {
  fullyqualifiedname: string;
  status: string;
  history: IdentityHistoryEntry[];
}

export interface GetIdentityResponse {
  friendlyname: string;
  fullyqualifiedname: string;
  identity: IdentityData;
  status: string;
  canspendfor: boolean;
  cansignfor: boolean;
  blockheight: number;
  txid: string;
  vout: number;
}

// ============================================================================
// vtimestamp Types
// ============================================================================

export interface TimestampData {
  sha256: string;
  title: string;
  description?: string;
  filename?: string;
  filesize?: number;
}

export interface TimestampRecord {
  data: TimestampData;
  blockhash: string;
  blockheight: number;
  txid: string;
}

export interface CreateTimestampInput {
  sha256: string;
  title: string;
  description?: string;
  filename?: string;
  filesize?: number;
}

