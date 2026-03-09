# vtimestamp-mcp-write

MCP server for **creating** [vtimestamp](https://vtimestamp.com) proofs on the Verus blockchain.

Enables AI agents (Claude Desktop, VS Code, etc.) to create document timestamps on a VerusID — writing directly to the Verus blockchain via a local or remote daemon.

> **Looking for the read-only server?** See [vtimestamp-mcp](https://www.npmjs.com/package/vtimestamp-mcp) — no daemon or wallet required.

## Prerequisites

- **Node.js 18+**
- **Verus daemon (`verusd`)** running with:
  - The identity's private key imported into the wallet
  - RPC access enabled (default on localhost)

## Installation

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vtimestamp-write": {
      "command": "npx",
      "args": ["-y", "vtimestamp-mcp-write"]
    }
  }
}
```

That's it — the server auto-detects your RPC credentials from `VRSC.conf` (see [Configuration](#configuration) below).

### VS Code

Add to your VS Code MCP settings:

```json
{
  "mcp": {
    "servers": {
      "vtimestamp-write": {
        "command": "npx",
        "args": ["-y", "vtimestamp-mcp-write"]
      }
    }
  }
}
```

## Configuration

The server automatically reads RPC credentials from your local `VRSC.conf` file. No manual configuration is needed for most users.

**Auto-detected `VRSC.conf` paths:**
- **macOS:** `~/Library/Application Support/Komodo/VRSC/VRSC.conf`
- **Linux:** `~/.komodo/VRSC/VRSC.conf`
- **Windows:** `%AppData%\Roaming\Komodo\VRSC\VRSC.conf`

### Environment Variables

All optional — only needed for non-standard setups or remote daemons.

| Variable | Description |
|----------|-------------|
| `VERUS_NETWORK` | `mainnet` (default) or `testnet` |
| `VERUS_CONF_PATH` | Custom path to `VRSC.conf` |
| `VERUS_RPC_URL` | Override: daemon RPC URL (for remote daemons) |
| `VERUS_RPC_USER` | Override: RPC username (for remote daemons) |
| `VERUS_RPC_PASSWORD` | Override: RPC password (for remote daemons) |

## Tools

### `vtimestamp_create`

Create a new timestamp on a VerusID. Provide either a file path or text — the server computes the SHA-256 hash automatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `identity` | string | Yes | VerusID name (e.g., `alice@`) |
| `file_path` | string | One of | Path to a file to hash and timestamp |
| `text` | string | One of | Text to hash and timestamp (e.g., an attestation or report) |
| `title` | string | Yes | Title for the timestamp |
| `description` | string | No | Description of the content |
| `filename` | string | No | Original filename (auto-detected when using `file_path`) |
| `filesize` | number | No | File size in bytes (auto-detected when using `file_path`) |
| `sourceoffunds` | string | No | Funding address (R-address, z-address, or ID@) |
| `feeoffer` | number | No | Fee offer in VRSC (default: 0.0001) |

Either `file_path` or `text` must be provided (mutually exclusive).

**Example prompts:**
- "Timestamp the file at /path/to/report.pdf on alice@"
- "Timestamp this text on alice@: I attest that invoice #4521 was approved"

**Success response:**
```json
{
  "success": true,
  "identity": "alice@",
  "hash": "a7f3b2c1...",
  "title": "Q4 Report",
  "transaction_id": "abc123...",
  "network": "mainnet",
  "message": "Timestamp created successfully"
}
```

**Error cases:**
- Identity not found → error with identity name
- Duplicate hash → error with existing block height and txid
- File not found → `InvalidParams` error
- RPC failure → error with daemon message

## How It Works

The server connects to your Verus daemon (local or remote) to create on-chain timestamps. The daemon must have the identity's private key in its wallet to sign the `updateidentity` transaction.

```
AI Agent (Claude Desktop, VS Code, etc.)
    │ stdio (JSON-RPC)
    ▼
vtimestamp-mcp-write (local)
    │ HTTP (JSON-RPC 1.0, with auth)
    ▼
Your Verus Daemon (verusd)
    ├── Has identity's private key in wallet
    ├── Signs and broadcasts updateidentity tx
    └── Local (127.0.0.1) or remote (VPS)
```

## Daemon Setup

### Local daemon

The simplest setup — `verusd` runs on the same machine as the MCP server. No configuration needed — credentials are auto-detected from `VRSC.conf`.

### Remote daemon (VPS)

You can point the MCP server at a `verusd` instance running on another machine (e.g., a VPS). The daemon needs two config changes in its `VRSC.conf`:

1. **Allow your IP:** Add `rpcallowip=<your-ip>` (the daemon only accepts localhost by default)
2. **Open the port:** Ensure the RPC port (27486 mainnet, 18843 testnet) is reachable through any firewalls

Then set the env var overrides (`VERUS_RPC_URL`, `VERUS_RPC_USER`, `VERUS_RPC_PASSWORD`) in your MCP config.

**Important:** RPC credentials are sent over plain HTTP. If connecting over the open internet (not a local network), use an SSH tunnel to secure the connection:

```bash
ssh -L 27486:127.0.0.1:27486 user@your-vps
```

Then use `VERUS_RPC_URL=http://127.0.0.1:27486` as if it were local — the tunnel handles the rest.

## Security Notes

- This server **reads your `VRSC.conf`** to auto-detect RPC credentials — no secrets are copied or stored elsewhere
- This server performs **on-chain writes** that cost a small transaction fee (default 0.0001 VRSC)
- The server only connects to your local daemon (or the URL you configure) — no data is sent elsewhere
- If connecting to a remote daemon, use an SSH tunnel rather than exposing the RPC port directly
- Consider running on **testnet** first to verify your setup
- The `sourceoffunds` parameter can be used to control which address pays fees

## License

MIT
