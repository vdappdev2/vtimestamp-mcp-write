/**
 * TypeScript interfaces for vtimestamp-mcp-write
 */

// ============================================================================
// Verus RPC Types
// ============================================================================

export interface DataDescriptor {
  version: number;
  flags: number;
  // On-chain encrypted descriptors (flags:13/5/37) carry ciphertext as a hex string.
  // Legacy plaintext descriptors (flags:0) carry { message: string } or a raw number.
  objectdata: { message: string } | number | string | null;
  label?: string;
  mimetype?: string;
  // Encryption fields, present when flags has the relevant bits set.
  epk?: string;
  ivk?: string;
  salt?: string;
}

export interface DataDescriptorWrapper {
  [wrapperKey: string]: DataDescriptor;
}

/**
 * `{data: {...}}` envelope shorthand inside contentmultimap. The daemon
 * recognizes this and produces an encrypted DataDescriptor on-chain.
 * See verusidx-documentation/docs/how-to/data/publish-encrypted-data-on-identity.md.
 */
export interface DataEnvelope {
  data: {
    message?: string;
    messagehex?: string;
    filename?: string;
    encrypttoaddress?: string;
    createmmr?: boolean;
    mmrdata?: Array<{ message?: string; messagehex?: string; filename?: string }>;
  };
}

export type ContentMultiMapValue = DataDescriptorWrapper | DataEnvelope;

export interface ContentMultiMap {
  [outerKey: string]: ContentMultiMapValue[];
}

/**
 * The decrypted form of a flags:13 entry, returned by `decryptdata`
 * with `retrieve: true`. Plaintext bytes live as hex in `objectdata`.
 */
export interface DecryptedDataDescriptor {
  version: number;
  flags: number;
  objectdata: string;
  salt?: string;
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

