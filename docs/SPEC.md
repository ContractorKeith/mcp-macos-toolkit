# Product specification

## Goal

Ship a polished, local-first MCP server that gives AI agents useful macOS capabilities without turning the server into an unrestricted shell.

## V1 interface

One stdio MCP server exposes namespaced tools in five groups:

- `macos_*`: list and run Shortcuts, inspect system information.
- `filesystem_*`: bounded file listing, reading, text search, and semantic search with optional local MLX embeddings.
- `homebrew_*`: package discovery, health, and explicitly gated mutations.
- `productivity_*`: read and create Calendar events and Reminders through fixed AppleScript templates.
- `models_*`: inspect Ollama and MLX state, run local generation, and preview or execute MLX quantization.

## Safety contract

- Filesystem access is limited to `MCP_MACOS_ALLOWED_ROOTS` (defaults to the launch directory).
- Child processes never invoke a shell and have output and timeout limits.
- Mutating package/model operations require both an opt-in environment variable and an explicit confirmation argument.
- Arbitrary AppleScript and arbitrary command execution are out of scope.
- The server writes protocol data only to stdout and diagnostics only to stderr.

## Acceptance gates

- Node.js 22+ on macOS; TypeScript strict mode.
- Unit tests cover path containment, symlink escapes, command timeouts/output limits, mutation gates, and adapter parsing.
- An MCP client smoke test lists tools and invokes a read-only tool over stdio.
- Formatting, lint, typecheck, tests, and build pass in CI.
- README documents installation, client configuration, permissions, security posture, and optional MLX setup.
