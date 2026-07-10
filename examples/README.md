# Client Configuration Examples

Build the repository before using these examples:

```bash
npm ci
npm run build
```

Replace `/absolute/path/to/mcp-macos-toolkit` with the full path to your checkout. Do not use a relative path; desktop clients often launch MCP servers from a different working directory.

Available examples:

- [`claude-desktop.json`](claude-desktop.json) — JSON `mcpServers` entry.
- [`cursor.mcp.json`](cursor.mcp.json) — project or user MCP JSON.
- [`codex-config.toml`](codex-config.toml) — Codex MCP server table.
- [`readonly.env.example`](readonly.env.example) — conservative environment starting point.

The JSON files cannot expand `$HOME` or `~` reliably across clients. Write absolute paths.

Begin with only `MCP_MACOS_ALLOWED_ROOTS`. Add one mutation capability for one session only after reading [Permissions](../docs/permissions.md). Every write or mutation also requires `confirm=true` in the tool call.
