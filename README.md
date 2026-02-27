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
      "args": ["-y", "vtimestamp-mcp-write"],
      "env": {
        "VERUS_RPC_URL": "http://127.0.0.1:27486",
        "VERUS_RPC_USER": "your_rpc_user",
        "VERUS_RPC_PASSWORD": "your_rpc_password",
        "VERUS_NETWORK": "mainnet"
      }
    }
  }
}
```

Using yarn:

```json
{
  "mcpServers": {
    "vtimestamp-write": {
      "command": "yarn",
      "args": ["dlx", "vtimestamp-mcp-write"],
      "env": {
        "VERUS_RPC_URL": "http://127.0.0.1:27486",
        "VERUS_RPC_USER": "your_rpc_user",
        "VERUS_RPC_PASSWORD": "your_rpc_password",
        "VERUS_NETWORK": "mainnet"
      }
    }
  }
}
```

Using pnpm:

```json
{
  "mcpServers": {
    "vtimestamp-write": {
      "command": "pnpm",
      "args": ["dlx", "vtimestamp-mcp-write"],
      "env": {
        "VERUS_RPC_URL": "http://127.0.0.1:27486",
        "VERUS_RPC_USER": "your_rpc_user",
        "VERUS_RPC_PASSWORD": "your_rpc_password",
        "VERUS_NETWORK": "mainnet"
      }
    }
  }
}
```

### VS Code

Add to your VS Code MCP settings:

```json
{
  "mcp": {
    "servers": {
      "vtimestamp-write": {
        "command": "npx",
        "args": ["-y", "vtimestamp-mcp-write"],
        "env": {
          "VERUS_RPC_URL": "http://127.0.0.1:27486",
          "VERUS_RPC_USER": "your_rpc_user",
          "VERUS_RPC_PASSWORD": "your_rpc_password",
          "VERUS_NETWORK": "mainnet"
        }
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VERUS_RPC_URL` | Yes | Daemon RPC URL (e.g., `http://127.0.0.1:27486`) |
| `VERUS_RPC_USER` | No | RPC username (from `VRSC.conf`) |
| `VERUS_RPC_PASSWORD` | No | RPC password (from `VRSC.conf`) |
| `VERUS_NETWORK` | No | `mainnet` (default) or `testnet` |

**Finding your RPC credentials:** Check your `VRSC.conf` file for `rpcuser` and `rpcpassword`. On macOS: `~/Library/Application Support/Komodo/VRSC/VRSC.conf`. On Linux: `~/.komodo/VRSC/VRSC.conf`.

## Tools

### `vtimestamp_create`

Create a new timestamp on a VerusID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `identity` | string | Yes | VerusID name (e.g., `alice@`) |
| `hash` | string | Yes | SHA-256 hash (64-character hex string) |
| `title` | string | Yes | Title for the timestamp |
| `description` | string | No | Description of the document |
| `filename` | string | No | Original filename |
| `filesize` | number | No | File size in bytes |
| `sourceoffunds` | string | No | Funding address (R-address, z-address, or ID@) |
| `feeoffer` | number | No | Fee offer in VRSC (default: 0.0001) |

**Example prompt:** "Timestamp my Q4 report on alice@. The SHA-256 hash is a7f3b2c1..."

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
- Invalid hash format → `InvalidParams` error
- Identity not found → error with identity name
- Duplicate hash → error with existing block height and txid
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

The simplest setup — `verusd` runs on the same machine as the MCP server.

- **Mainnet:** `VERUS_RPC_URL=http://127.0.0.1:27486`
- **Testnet:** `VERUS_RPC_URL=http://127.0.0.1:18843`

No extra daemon configuration needed — `verusd` accepts localhost connections by default.

### Remote daemon (VPS)

You can point the MCP server at a `verusd` instance running on another machine (e.g., a VPS). The daemon needs two config changes in its `VRSC.conf`:

1. **Allow your IP:** Add `rpcallowip=<your-ip>` (the daemon only accepts localhost by default)
2. **Open the port:** Ensure the RPC port (27486 mainnet, 18843 testnet) is reachable through any firewalls

Then configure your MCP env vars with the remote daemon's URL and credentials (see Installation above).

**Important:** RPC credentials are sent over plain HTTP. If connecting over the open internet (not a local network), use an SSH tunnel to secure the connection:

```bash
ssh -L 27486:127.0.0.1:27486 user@your-vps
```

Then use `VERUS_RPC_URL=http://127.0.0.1:27486` as if it were local — the tunnel handles the rest.

## Security Notes

- This server performs **on-chain writes** that cost a small transaction fee (default 0.0001 VRSC)
- Keep your RPC credentials secure — do not share your `VRSC.conf` values
- The server only connects to the daemon URL you configure — no data is sent elsewhere
- If connecting to a remote daemon, use an SSH tunnel rather than exposing the RPC port directly
- Consider running on **testnet** first to verify your setup
- The `sourceoffunds` parameter can be used to control which address pays fees

## License

MIT
