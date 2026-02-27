/**
 * VDXF Key Constants, Parsing Helpers, and Building Functions
 *
 * Adapted from vtimestamp-mcp/src/vdxf.ts and vtimestamp/src/lib/vdxf.ts
 */

import type {
  Network,
  ContentMultiMap,
  CreateTimestampInput,
  DataDescriptor,
  DataDescriptorWrapper,
  IdentityHistoryEntry,
  TimestampData,
  TimestampRecord,
} from './types.js';

// ============================================================================
// VDXF Key Constants
// ============================================================================

/** DataDescriptor wrapper key (same for testnet and mainnet) */
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

const TESTNET_VDXF: VdxfKeys = {
  proofBasic: 'i6UD4js3jqyjz9Mttmbk2Sh4eCuwLKPLyQ',
  dataDescriptor: DATA_DESCRIPTOR_KEY,
  labels: {
    sha256: 'iBCkvv7KC18xd3P164Cvw1pxpLo5FyGEtm',
    title: 'iHXGu1nW4jQoeooBHPGE58qQGf9wMakEtj',
    description: 'iP1PCTTHPpktP26xTEu1BuwENWMHQaia4D',
    filename: 'i4xgBqX9btMX8tnAjsyVFrgSLnigxPwBw5',
    filesize: 'iRz2tyZZEwmrxRPSrwN8UTAC8g5KyVkBiE',
  },
};

const MAINNET_VDXF: VdxfKeys = {
  proofBasic: 'iJvkQ3uTKmRoFiE3rtP8YJxryLBKu8enmX',
  dataDescriptor: DATA_DESCRIPTOR_KEY,
  labels: {
    sha256: 'iPRekBwQwFxNHf6mE68n8i2iXEnVdk1hw8',
    title: 'iJx4aJf4SRByyNAi4Z93FC7QNaysyU5mdP',
    description: 'iS8HnXSHWPL7GLkxYS4SpC7QW2Bnyp93T2',
    filename: 'iBTcwxUDgvqGXGMC26U52522HrsXC8ggoC',
    filesize: 'iHBnDKDyKbXeizg322cxLUps7Uodc1udF4',
  },
};

export function getVdxfKeys(network: Network): VdxfKeys {
  return network === 'testnet' ? TESTNET_VDXF : MAINNET_VDXF;
}

// ============================================================================
// Parsing Helpers (for duplicate check)
// ============================================================================

/** VDXF flag indicating a deleted/cleared entry */
const FLAG_DELETED = 32;

function isDeleted(descriptor: DataDescriptor): boolean {
  return descriptor.objectdata === null || descriptor.flags === FLAG_DELETED;
}

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
    const msg = descriptor.objectdata.message;
    if (typeof msg === 'string') {
      const num = parseInt(msg, 10);
      if (!isNaN(num)) return num;
    }
  }
  return undefined;
}

export function parseTimestampData(
  entries: DataDescriptorWrapper[],
  keys: VdxfKeys
): TimestampData | null {
  const data: Partial<TimestampData> = {};

  for (const wrapper of entries) {
    const descriptor = wrapper[keys.dataDescriptor];
    if (!descriptor || isDeleted(descriptor)) continue;

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

  if (!data.sha256 || !data.title) {
    return null;
  }

  return data as TimestampData;
}

export function parseHistoryEntry(
  entry: IdentityHistoryEntry,
  keys: VdxfKeys
): TimestampRecord | null {
  const contentmultimap = entry.identity.contentmultimap;
  if (!contentmultimap) return null;

  const entries = contentmultimap[keys.proofBasic];
  if (!entries || entries.length === 0) return null;

  const data = parseTimestampData(entries, keys);
  if (!data) return null;

  return {
    data,
    blockhash: entry.blockhash,
    blockheight: entry.height,
    txid: entry.output.txid,
  };
}

export function findTimestampByHash(
  history: IdentityHistoryEntry[],
  sha256: string,
  keys: VdxfKeys
): TimestampRecord | null {
  const normalizedHash = sha256.toLowerCase();

  for (const entry of history) {
    const record = parseHistoryEntry(entry, keys);
    if (record && record.data.sha256.toLowerCase() === normalizedHash) {
      return record;
    }
  }

  return null;
}

// ============================================================================
// Building Functions (for creating timestamps)
// ============================================================================

function buildDataDescriptor(
  keys: VdxfKeys,
  label: string,
  value: string | number,
  mimetype: string = 'text/plain'
): DataDescriptorWrapper {
  const objectdata =
    typeof value === 'number' ? { message: value.toString() } : { message: value };

  return {
    [keys.dataDescriptor]: {
      version: 1,
      flags: 0,
      label,
      mimetype,
      objectdata,
    },
  };
}

export function buildTimestampContentMap(
  input: CreateTimestampInput,
  keys: VdxfKeys
): ContentMultiMap {
  const entries: DataDescriptorWrapper[] = [];

  // Required fields
  entries.push(buildDataDescriptor(keys, keys.labels.sha256, input.sha256));
  entries.push(buildDataDescriptor(keys, keys.labels.title, input.title));

  // Optional fields
  if (input.description) {
    entries.push(buildDataDescriptor(keys, keys.labels.description, input.description));
  }
  if (input.filename) {
    entries.push(buildDataDescriptor(keys, keys.labels.filename, input.filename));
  }
  if (input.filesize !== undefined) {
    entries.push(buildDataDescriptor(keys, keys.labels.filesize, input.filesize));
  }

  return {
    [keys.proofBasic]: entries,
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
