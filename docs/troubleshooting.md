# Troubleshooting

## The Server Does Not Start

Build the current checkout and run the complete gate:

```bash
npm ci
npm run check
node --version
```

Use an absolute path to `dist/cli.js` in the MCP client configuration. Confirm the path belongs to the checkout you just built. Restart the MCP client completely after changing its configuration.

If the client reports invalid protocol output, run the server through the MCP Inspector or capture stderr. Do not add `console.log` calls to stdout; stdout is reserved for MCP protocol messages.

## A Path Is Outside The Allowed Roots

`MCP_MACOS_ALLOWED_ROOTS` is colon-separated. Relative paths resolve from the first root.

```bash
export MCP_MACOS_ALLOWED_ROOTS="/Users/you/Projects:/Users/you/Documents/AgentNotes"
```

Check for:

- a typo or unresolved `~` in client JSON
- a symlink whose target leaves the allowed root
- a relative path intended for a different root
- the MCP client launching from a different working directory when the variable is unset

Prefer adding one narrow root over granting the complete home directory.

## A Shortcut Is Listed But Will Not Run

Verify:

1. The exact Shortcut name is in `MCP_MACOS_ALLOWED_SHORTCUTS`.
2. Names are comma-separated.
3. `MCP_MACOS_ALLOW_SHORTCUTS=true` is set in the MCP process environment.
4. The call contains `confirm=true`.
5. The hosting application has the requested Automation permission.

Shortcut names are matched as configuration values, not fuzzy natural-language labels. Restart the server after changing the allowlist.

## Calendar Or Reminders Access Is Denied

Open **System Settings > Privacy & Security > Calendars** or **Reminders**. Look for the application that launched Node, which may be Terminal or the MCP client rather than `mcp-macos-toolkit`.

After granting access:

1. Quit the hosting application completely.
2. Start it again.
3. Retry a read-only request first.

Writes also require `MCP_MACOS_ALLOW_PRODUCTIVITY_WRITES=true` and `confirm=true`.

Avoid resetting the entire TCC database unless you understand that unrelated applications will lose their grants.

## Homebrew Is Missing Or Uses The Wrong Architecture

Check:

```bash
command -v brew
brew --prefix
uname -m
```

Apple Silicon Homebrew normally uses `/opt/homebrew`. Make sure the MCP client environment can find the intended executable. Read-only queries do not require the mutation flag. Changes require `MCP_MACOS_ALLOW_HOMEBREW_MUTATIONS=true` and `confirm=true`.

## Ollama Is Unavailable

Check that Ollama is installed and its local service is running:

```bash
command -v ollama
ollama list
ollama ps
```

Discovery should report a missing runtime as a capability issue rather than crashing the server. Generation requires `MCP_MACOS_ALLOW_MODEL_RUNS=true` and `confirm=true`.

## MLX Semantic Search Is Unavailable

Confirm the configured Python path is absolute and executable:

```bash
"$MCP_MACOS_MLX_PYTHON" --version
```

Then verify the required local MLX embedding packages in that environment. The default model is `mlx-community/all-MiniLM-L6-v2-4bit`; override it with `MCP_MACOS_MLX_EMBED_MODEL` only after checking compatibility.

Text search remains available without MLX. The toolkit does not silently use a cloud embedding API.

## A Mutation Is Rejected

All writes and mutations require two controls:

- the capability's startup environment flag set to `true`
- `confirm=true` in the specific tool call

Restart the server after changing environment variables. Do not enable unrelated flags simply to get past a rejected call.

## A Command Times Out Or Output Is Truncated

Timeouts and output caps are safety controls. Narrow the search, use a smaller root, reduce result count, or operate on a smaller model. Do not remove limits globally to accommodate one unexpectedly broad call.

For a reproducible defect, open a sanitized bug report with the tool name, bounded input, toolkit commit, macOS version, Node.js version, MCP client, and stderr message.
