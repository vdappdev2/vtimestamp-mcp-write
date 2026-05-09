/**
 * VDXF Key Constants, Parsing Helpers, and Building Functions
 *
 * Adapted from vtimestamp-mcp/src/vdxf.ts and vtimestamp/src/lib/vdxf.ts.
 *
 * Writer emits the daemon-managed `{data:{}}` envelope (single-leaf JSON
 * blob), producing a flags:13 public-encrypted on-chain entry. Reader
 * branches on inner descriptor flags to handle both legacy plaintext
 * (flags:0) and encrypted (flags:13) entries — see workspace-root
 * transition_plan.md.
 */

import type {
  ContentMultiMap,
  CreateTimestampInput,
  DataDescriptor,
  DataDescriptorWrapper,
  IdentityHistoryEntry,
  TimestampData,
  TimestampRecord,
} from './types.js';
import { decryptData } from './verus-rpc.js';

// ============================================================================
// VDXF Key Constants
// ============================================================================

/** DataDescriptor wrapper key */
const DATA_DESCRIPTOR_KEY = 'i4GC1YGEVD21afWudGoFJVdnfjJ5XWnCQv';

interface VdxfKeys {
  proofBasic: string;
  dataDescriptor: string;
  labels: {
    sha256: string;
    title: string;
    description: string;
    filename: string;
    filesize: string;
  };
}

const MAINNET_VDXF: VdxfKeys = {
  proofBasic: 'iJvkQ3uTKmRoFiE3rtP8YJxryLBKu8enmX',
  dataDescriptor: DATA_DESCRIPTOR_KEY,
  // Legacy label keys — required to parse plaintext (flags:0) entries written
  // before the encrypted-cmm transition. Not used on the write side anymore.
  labels: {
    sha256: 'iPRekBwQwFxNHf6mE68n8i2iXEnVdk1hw8',
    title: 'iJx4aJf4SRByyNAi4Z93FC7QNaysyU5mdP',
    description: 'iS8HnXSHWPL7GLkxYS4SpC7QW2Bnyp93T2',
    filename: 'iBTcwxUDgvqGXGMC26U52522HrsXC8ggoC',
    filesize: 'iHBnDKDyKbXeizg322cxLUps7Uodc1udF4',
  },
};

export function getVdxfKeys(): VdxfKeys {
  return MAINNET_VDXF;
}

// ============================================================================
// Flag bits on the inner DataDescriptor
// ============================================================================

const FLAG_ENCRYPTED = 1;
const FLAG_HAS_IVK = 8;
const FLAG_DELETED = 32;

/** flags:13 — HAS_OBJECTDATA(4) | ENCRYPTED(1) | HAS_IVK(8) — public-encrypted, on-chain ivk. */
function isPublicEncrypted(descriptor: DataDescriptor): boolean {
  return (descriptor.flags & FLAG_ENCRYPTED) !== 0
    && (descriptor.flags & FLAG_HAS_IVK) !== 0;
}

/** flags:5 / flags:37 — encrypted but no published ivk; not decryptable by us. */
function isPrivateEncrypted(descriptor: DataDescriptor): boolean {
  return (descriptor.flags & FLAG_ENCRYPTED) !== 0
    && (descriptor.flags & FLAG_HAS_IVK) === 0;
}

function isDeleted(descriptor: DataDescriptor): boolean {
  return descriptor.objectdata === null || descriptor.flags === FLAG_DELETED;
}

// ============================================================================
// Legacy plaintext parsing (non-encrypted entries — typically flags:96)
// ============================================================================

function extractStringValue(descriptor: DataDescriptor): string | undefined {
  if (descriptor.objectdata === null) return undefined;
  if (typeof descriptor.objectdata === 'object' && 'message' in descriptor.objectdata) {
    return descriptor.objectdata.message;
  }
  return undefined;
}

function extractNumberValue(descriptor: DataDescriptor): number | undefined {
  if (typeof descriptor.objectdata === 'number') {
    return descriptor.objectdata;
  }
  if (typeof descriptor.objectdata === 'object' && descriptor.objectdata !== null) {
    const msg = (descriptor.objectdata as { message: string }).message;
    if (typeof msg === 'string') {
      const num = parseInt(msg, 10);
      if (!isNaN(num)) return num;
    }
  }
  return undefined;
}

/**
 * Parse a legacy plaintext timestamp entry. The legacy writer sets both
 * `label` and `mimetype`, so on-chain flags are typically 96
 * (LABEL_PRESENT|MIME_TYPE_PRESENT) — not 0. Accept any non-encrypted
 * descriptor; encrypted entries take a different path.
 */
function parseLegacyPlaintextEntries(
  entries: DataDescriptorWrapper[],
  keys: VdxfKeys,
): TimestampData | null {
  const data: Partial<TimestampData> = {};

  for (const wrapper of entries) {
    const descriptor = wrapper[keys.dataDescriptor];
    if (!descriptor || isDeleted(descriptor)) continue;
    if ((descriptor.flags & FLAG_ENCRYPTED) !== 0) continue;

    const label = descriptor.label;
    if (!label) continue;

    if (label === keys.labels.sha256) {
      data.sha256 = extractStringValue(descriptor);
    } else if (label === keys.labels.title) {
      data.title = extractStringValue(descriptor);
    } else if (label === keys.labels.description) {
      data.description = extractStringValue(descriptor);
    } else if (label === keys.labels.filename) {
      data.filename = extractStringValue(descriptor);
    } else if (label === keys.labels.filesize) {
      data.filesize = extractNumberValue(descriptor);
    }
  }

  if (!data.sha256 || !data.title) return null;
  return data as TimestampData;
}

// ============================================================================
// Encrypted parsing (flags:13 entries)
// ============================================================================

/** Cache decryptdata results — daemon round-trip is the dominant cost. */
const decryptCache = new Map<string, TimestampData | null>();

function cacheKeyFor(descriptor: DataDescriptor, txid: string): string {
  const od = typeof descriptor.objectdata === 'string'
    ? descriptor.objectdata
    : JSON.stringify(descriptor.objectdata);
  return `${txid}|${od}`;
}

async function decryptEnvelopeEntry(
  descriptor: DataDescriptor,
  txid: string,
): Promise<TimestampData | null> {
  const cacheKey = cacheKeyFor(descriptor, txid);
  const cached = decryptCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let parsed: TimestampData | null = null;
  try {
    const decrypted = await decryptData(descriptor, txid);
    if (decrypted.length > 0) {
      const hex = decrypted[0].objectdata;
      const json = Buffer.from(hex, 'hex').toString('utf8');
      const payload = JSON.parse(json) as Partial<TimestampData>;
      if (payload.sha256 && payload.title) {
        parsed = {
          sha256: payload.sha256,
          title: payload.title,
          description: payload.description,
          filename: payload.filename,
          filesize: payload.filesize,
        };
      }
    }
  } catch {
    // Decryption failure: treat as un-decryptable entry, surface null.
    parsed = null;
  }

  decryptCache.set(cacheKey, parsed);
  return parsed;
}

// ============================================================================
// Unified read path — handles legacy + encrypted entries under proof.basic
// ============================================================================

export async function parseHistoryEntry(
  entry: IdentityHistoryEntry,
  keys: VdxfKeys,
): Promise<TimestampRecord | null> {
  const contentmultimap = entry.identity.contentmultimap;
  if (!contentmultimap) return null;

  // On-chain entries are always wrapped DataDescriptors — the `{data:{}}`
  // envelope shape only exists in outgoing write payloads, never in reads.
  const entries = contentmultimap[keys.proofBasic] as DataDescriptorWrapper[] | undefined;
  if (!entries || entries.length === 0) return null;

  // Decide which path applies by inspecting the first non-deleted descriptor.
  // Encrypted entries are stored as a single `{i4GC1...: {flags:13, ...}}` —
  // legacy entries are an array of plaintext DataDescriptors.
  const txid = entry.output.txid;

  for (const wrapper of entries) {
    const descriptor = wrapper[keys.dataDescriptor];
    if (!descriptor || isDeleted(descriptor)) continue;

    if (isPublicEncrypted(descriptor)) {
      const data = await decryptEnvelopeEntry(descriptor, txid);
      if (data) {
        return {
          data,
          blockhash: entry.blockhash,
          blockheight: entry.height,
          txid,
        };
      }
      // Encrypted but undecryptable: skip and keep scanning the array in case
      // a sibling legacy entry exists alongside.
      continue;
    }

    if (isPrivateEncrypted(descriptor)) {
      // Not produced by this app; we don't hold keys for it.
      continue;
    }

    // Legacy plaintext: parse the whole entry array as the old shape.
    const data = parseLegacyPlaintextEntries(entries, keys);
    if (data) {
      return {
        data,
        blockhash: entry.blockhash,
        blockheight: entry.height,
        txid,
      };
    }
    return null;
  }

  return null;
}

export async function findTimestampByHash(
  history: IdentityHistoryEntry[],
  sha256: string,
  keys: VdxfKeys,
): Promise<TimestampRecord | null> {
  const normalizedHash = sha256.toLowerCase();

  for (const entry of history) {
    const record = await parseHistoryEntry(entry, keys);
    if (record && record.data.sha256.toLowerCase() === normalizedHash) {
      return record;
    }
  }

  return null;
}

// ============================================================================
// Building Functions — emit the `{data:{}}` envelope (public-encrypted)
// ============================================================================

/**
 * Build a contentmultimap entry for a new timestamp. Emits the
 * daemon-managed `{data: {message: <json>}}` envelope so the daemon
 * encrypts with an ephemeral key and publishes the IVK on-chain
 * (flags:13). Anyone can decrypt via `decryptdata + txid + retrieve:true`.
 */
export function buildTimestampContentMap(
  input: CreateTimestampInput,
  keys: VdxfKeys,
): ContentMultiMap {
  const payload: TimestampData = {
    sha256: input.sha256,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    ...(input.filename ? { filename: input.filename } : {}),
    ...(input.filesize !== undefined ? { filesize: input.filesize } : {}),
  };

  return {
    [keys.proofBasic]: [
      { data: { message: JSON.stringify(payload) } },
    ],
  };
}

// ============================================================================
// Validation
// ============================================================================

export function isValidSha256(hash: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Validate a VerusID name (basic format check)
 */
export function isValidIdentity(identity: string): boolean {
  return identity.endsWith('@') && identity.length >= 2;
}
