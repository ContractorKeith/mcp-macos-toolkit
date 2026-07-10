# macOS Permissions And Capability Flags

Start with no mutation flags and the smallest filesystem root. macOS will prompt for privacy permissions when a fixed adapter first reaches Calendar, Reminders, or an automated application.

## Filesystem Roots

Configure colon-separated roots:

```bash
export MCP_MACOS_ALLOWED_ROOTS="/Users/you/Projects:/Users/you/Documents/AgentNotes"
```

If unset, the launch directory is the only root. Relative tool paths resolve from the first configured root.

Ordinary folders usually need no additional macOS permission. Protected locations may require Files and Folders or Full Disk Access for the application hosting the MCP server. Do not grant Full Disk Access merely to suppress an error. Add a narrower allowed root or move sanitized working files into a dedicated directory.

## Shortcuts

Shortcut listing is read-only. Running a Shortcut requires all three conditions:

1. Its exact name appears in `MCP_MACOS_ALLOWED_SHORTCUTS`.
2. `MCP_MACOS_ALLOW_SHORTCUTS=true` is set when the server starts.
3. The tool call includes `confirm=true`.

```bash
export MCP_MACOS_ALLOWED_SHORTCUTS="Start Focus Timer,Open Project Notes"
export MCP_MACOS_ALLOW_SHORTCUTS=true
```

Review each allowlisted Shortcut in Shortcuts.app. A Shortcut can contain network calls, file writes, scripts, or application automation beyond what its name implies.

The first run may prompt for Automation access. Grant only the specific application relationship needed. The permission may appear under **System Settings > Privacy & Security > Automation** for Terminal, your MCP desktop client, or another hosting application.

## Calendar And Reminders

Read tools require Calendar or Reminders access from the hosting application. On recent macOS versions, check:

- **System Settings > Privacy & Security > Calendars**
- **System Settings > Privacy & Security > Reminders**

Writes additionally require:

```bash
export MCP_MACOS_ALLOW_PRODUCTIVITY_WRITES=true
```

The individual write call must include `confirm=true`.

macOS grants may be listed under the terminal or MCP client that launched Node. Quit and restart that application after changing a grant. Do not use `tccutil reset` as a first troubleshooting step because it can remove grants for unrelated applications.

## Homebrew

Homebrew discovery, package information, outdated checks, and health reporting are read-only. Install, upgrade, and uninstall operations require:

```bash
export MCP_MACOS_ALLOW_HOMEBREW_MUTATIONS=true
```

The individual mutation call must include `confirm=true`. Homebrew may prompt for developer tools or administrator actions outside the MCP server. Review exact package names and expected dependency changes before approval.

## Ollama And MLX

Model discovery is read-only. Generation requires:

```bash
export MCP_MACOS_ALLOW_MODEL_RUNS=true
```

MLX conversion or quantization execution requires:

```bash
export MCP_MACOS_ALLOW_MODEL_MUTATIONS=true
```

Each consequential call must include `confirm=true`.

For optional MLX helpers, select an absolute Python executable:

```bash
export MCP_MACOS_MLX_PYTHON="/Users/you/.venvs/mcp-mlx/bin/python"
export MCP_MACOS_MLX_EMBED_MODEL="mlx-community/all-MiniLM-L6-v2-4bit"
```

The embedding model variable is optional; the value shown is the default. Initial model downloads can be large and involve third-party artifacts. The toolkit must not silently substitute a cloud embedding provider.

## Recommended Read-Only Profile

```json
{
  "env": {
    "MCP_MACOS_ALLOWED_ROOTS": "/Users/you/Projects"
  }
}
```

## Recommended Shortcut-Only Profile

```json
{
  "env": {
    "MCP_MACOS_ALLOWED_ROOTS": "/Users/you/Projects",
    "MCP_MACOS_ALLOWED_SHORTCUTS": "Start Focus Timer",
    "MCP_MACOS_ALLOW_SHORTCUTS": "true"
  }
}
```

Keep separate client profiles for read-only work and mutation-enabled maintenance rather than leaving every flag enabled permanently.
