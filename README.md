# mcp-macos-toolkit

[![CI](https://github.com/ContractorKeith/mcp-macos-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/ContractorKeith/mcp-macos-toolkit/actions/workflows/ci.yml)
[![Security](https://github.com/ContractorKeith/mcp-macos-toolkit/actions/workflows/security.yml/badge.svg)](https://github.com/ContractorKeith/mcp-macos-toolkit/actions/workflows/security.yml)
[![CodeQL](https://github.com/ContractorKeith/mcp-macos-toolkit/actions/workflows/codeql.yml/badge.svg)](https://github.com/ContractorKeith/mcp-macos-toolkit/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Local-first macOS tools for MCP: search your Mac, run approved Shortcuts, manage Homebrew, and work with local models without turning your agent into an unrestricted shell.

> **Status: early access / active development (`v0.1.0`).** The public interface is being stabilized. Review tool inputs before approving calls, keep mutation flags off unless needed, and report rough edges through GitHub Issues.

## Why This Exists

macOS already has useful automation, package-management, productivity, and local-AI tools. They are usually exposed one command at a time. `mcp-macos-toolkit` gives MCP clients one bounded stdio server with explicit schemas, local-only data paths, and opt-in mutation controls.

The V1 interface is organized into five groups:

| Group            | What it covers                                                          | Default posture                                                |
| ---------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| `macos_*`        | System information and approved Apple Shortcuts                         | Listing is read-only; running requires an allowlist and opt-in |
| `filesystem_*`   | Bounded listing, reading, text search, and optional MLX semantic search | Confined to configured roots                                   |
| `homebrew_*`     | Discovery, health, package information, and gated changes               | Mutations disabled                                             |
| `productivity_*` | Calendar events and Reminders through fixed AppleScript templates       | Reads enabled; writes disabled                                 |
| `models_*`       | Ollama/MLX discovery, local generation, and MLX quantization            | Runs and mutations disabled                                    |

Arbitrary shell commands and arbitrary AppleScript are intentionally out of scope.

For a curated set of modern macOS command-line tools, pair this server with
[`homebrew-cli-toolbelt`](https://github.com/ContractorKeith/homebrew-cli-toolbelt). The toolbelt
answers _what should I install?_; this MCP server provides bounded discovery and one-package-at-a-time
installation without running the toolbelt's interactive installer or any remote shell script.

### V0.1 Tool Surface

| Tool                           | Operation                                           | Access                                               |
| ------------------------------ | --------------------------------------------------- | ---------------------------------------------------- |
| `macos_system_info`            | Inspect macOS version and architecture              | Read-only                                            |
| `macos_shortcuts_list`         | List installed and allowlisted Shortcuts            | Read-only                                            |
| `macos_shortcuts_run`          | Run an exact allowlisted Shortcut                   | Gated + confirmed                                    |
| `filesystem_list`              | List files beneath an allowed root                  | Read-only                                            |
| `filesystem_read_text`         | Read a bounded UTF-8 file                           | Read-only                                            |
| `filesystem_search_text`       | Search text with sensitive-path exclusions          | Read-only                                            |
| `filesystem_semantic_search`   | Use local MLX embeddings or local lexical fallback  | Read-only                                            |
| `homebrew_status`              | Inspect local Homebrew configuration                | Read-only                                            |
| `homebrew_search`              | Search the formula/cask catalog                     | Read-only; may use Homebrew network access           |
| `homebrew_info`                | Read structured package metadata                    | Read-only; may use Homebrew network access           |
| `homebrew_outdated`            | List outdated installed packages                    | Read-only; may use Homebrew network access           |
| `homebrew_doctor`              | Run Homebrew health diagnostics                     | Read-only                                            |
| `homebrew_toolbelt_status`     | Inspect a configured CLI toolbelt tier              | Read-only                                            |
| `homebrew_install`             | Install one validated formula or cask               | Gated + confirmed                                    |
| `productivity_calendars_list`  | List Calendar names                                 | Read-only                                            |
| `productivity_calendar_events` | List bounded events from one Calendar               | Read-only                                            |
| `productivity_reminder_lists`  | List Reminders list names                           | Read-only                                            |
| `productivity_reminders_list`  | List bounded reminders from one list                | Read-only                                            |
| `productivity_calendar_create` | Create one Calendar event                           | Gated + confirmed                                    |
| `productivity_reminder_create` | Create one Reminder                                 | Gated + confirmed                                    |
| `models_status`                | Inspect installed Ollama/MLX runtimes               | Read-only                                            |
| `models_ollama_list`           | List downloaded and running Ollama models           | Read-only                                            |
| `models_mlx_list`              | List locally cached MLX model repositories          | Read-only                                            |
| `models_run_stats`             | Inspect active Ollama/MLX processes without prompts | Read-only                                            |
| `models_run`                   | Run an already installed Ollama or MLX model        | Gated + confirmed                                    |
| `models_mlx_quantize`          | Preview or execute bounded local MLX conversion     | Preview is read-only; execution is gated + confirmed |

## Quick Start From Source

Requirements:

- macOS on Apple Silicon
- Node.js 22 or newer; CI verifies Node.js 22 and 24
- npm

```bash
git clone https://github.com/ContractorKeith/mcp-macos-toolkit.git
cd mcp-macos-toolkit
npm ci
npm run check
npm run build
node dist/cli.js doctor
```

Point your MCP client at the compiled entrypoint using an absolute path:

```json
{
  "mcpServers": {
    "macos-toolkit": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-macos-toolkit/dist/cli.js"],
      "env": {
        "MCP_MACOS_ALLOWED_ROOTS": "/Users/you/Documents:/Users/you/Projects"
      }
    }
  }
}
```

Ready-to-edit configurations are in [`examples/`](examples/). This repository does not currently promise an npm-hosted install path; use a source checkout until a package release is announced.

## Safe Configuration

The launch directory is the only allowed filesystem root when `MCP_MACOS_ALLOWED_ROOTS` is unset. Add the smallest roots that cover the work you want the agent to do.

| Environment variable                  | Format                   | Purpose                                                            |
| ------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| `MCP_MACOS_ALLOWED_ROOTS`             | Colon-separated paths    | Filesystem boundaries; defaults to the launch directory            |
| `MCP_MACOS_ALLOWED_SHORTCUTS`         | Comma-separated names    | Shortcuts the server may run                                       |
| `MCP_MACOS_ALLOW_SHORTCUTS`           | `true`                   | Enables running allowlisted Shortcuts                              |
| `MCP_MACOS_ALLOW_HOMEBREW_MUTATIONS`  | `true`                   | Enables Homebrew install operations                                |
| `MCP_MACOS_TOOLBELT_PATH`             | Absolute directory path  | Optional trusted `homebrew-cli-toolbelt` checkout                  |
| `MCP_MACOS_ALLOW_PRODUCTIVITY_WRITES` | `true`                   | Enables Calendar and Reminders writes                              |
| `MCP_MACOS_ALLOW_MODEL_RUNS`          | `true`                   | Enables local model generation                                     |
| `MCP_MACOS_ALLOW_MODEL_MUTATIONS`     | `true`                   | Enables MLX conversion or quantization execution                   |
| `MCP_MACOS_MLX_PYTHON`                | Absolute executable path | Selects the Python environment used for optional MLX helpers       |
| `MCP_MACOS_MLX_EMBED_MODEL`           | Model identifier         | Embedding model; defaults to `mlx-community/all-MiniLM-L6-v2-4bit` |

Every write or mutation call also requires `confirm=true`. The environment flag is a server-owner control; `confirm=true` is a per-call acknowledgment. Both must be present.

Start read-only, then enable one capability for one session. For example:

```json
{
  "env": {
    "MCP_MACOS_ALLOWED_ROOTS": "/Users/you/Projects",
    "MCP_MACOS_ALLOWED_SHORTCUTS": "Start Focus Timer,Open Project Notes",
    "MCP_MACOS_ALLOW_SHORTCUTS": "true"
  }
}
```

See [Permissions](docs/permissions.md) for macOS Privacy & Security settings and [Security Model](docs/security-model.md) for the complete trust boundary.

## Example Prompts

Once connected to an MCP client, try read-only requests first:

```text
Show me the allowed filesystem roots, then find Markdown files mentioning release checklists.
```

```text
List my outdated Homebrew formulae. Do not install or upgrade anything.
```

```text
Show the local Ollama and MLX models and any currently running Ollama models.
```

For Shortcuts, Calendar, Reminders, package changes, model runs, or quantization, inspect the proposed tool input before approving it.

## Optional MLX Semantic Search

Text search works without MLX. Semantic search is optional and remains local to the configured Python environment.

1. Create or select a Python environment with the required MLX embedding dependencies.
2. Set `MCP_MACOS_MLX_PYTHON` to its absolute Python executable.
3. Optionally change `MCP_MACOS_MLX_EMBED_MODEL`.
4. Download the selected model in that Python environment yourself after reviewing its source and disk requirements.

The default embedding model is `mlx-community/all-MiniLM-L6-v2-4bit`. The server forces the embedding helper into offline mode: it does not silently download a model or fall back to a cloud API.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Run the complete local gate with:

```bash
npm run check
```

The official MCP SDK is pinned to the V1 production line. The server logic is separated from stdio transport so adapters and safety policy can be tested without granting CI runners access to personal macOS data.

See [Architecture](ARCHITECTURE.md), [Contributing](CONTRIBUTING.md), and the [product specification](docs/SPEC.md).

## Security

`mcp-macos-toolkit` is a local stdio server. It does not provide a hosted service or telemetry endpoint. It can still reach sensitive local data and invoke powerful system tools when you enable those capabilities.

- Keep allowed roots narrow.
- Never enable mutation flags you do not need.
- Treat file contents and tool output as untrusted input to the model.
- Review `confirm=true` calls before approving them.
- Do not expose the stdio process through an unauthenticated network bridge.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Limitations

- macOS only; V1 targets Apple Silicon.
- macOS permissions are granted to the application hosting the MCP process, not to this repository in the abstract.
- Calendar and Reminders behavior depends on local account configuration and macOS privacy grants.
- Semantic search and MLX operations require separately installed local Python dependencies and model files.
- Long-running model operations can consume substantial memory, storage, and battery.
- This project cannot guarantee that an MCP client will display or enforce tool annotations correctly.

## Contributing

Bug reports, focused tool additions, permission-flow improvements, tests, and documentation fixes are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT. See [LICENSE](LICENSE).
