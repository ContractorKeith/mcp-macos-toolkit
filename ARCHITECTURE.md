# Architecture

## Purpose

`mcp-macos-toolkit` is one local stdio MCP server with several macOS capability groups. The design keeps protocol handling, safety policy, and operating-system adapters separate so powerful integrations can be tested without giving tests broad access to a developer's Mac.

## System Shape

```text
MCP client
    |
    | JSON-RPC over stdio
    v
MCP transport and tool registry
    |
    +--> input/output schemas and tool annotations
    +--> capability and confirmation gates
    +--> path policy / process policy
    |
    +--> macOS adapters
          +-- Shortcuts and system information
          +-- bounded filesystem and search
          +-- Homebrew
          +-- Calendar and Reminders templates
          +-- Ollama and optional MLX helpers
```

The process exposes protocol messages only on stdout. Logs and diagnostics go to stderr so they cannot corrupt the MCP stream.

## Capability Groups

### macOS

The `macos_*` tools inspect system information and interact with Apple Shortcuts. Shortcut execution is narrower than general AppleScript: names must be configured in `MCP_MACOS_ALLOWED_SHORTCUTS`, the server must start with `MCP_MACOS_ALLOW_SHORTCUTS=true`, and each run must include `confirm=true`.

### Filesystem

The `filesystem_*` tools resolve every path through a shared path policy. `MCP_MACOS_ALLOWED_ROOTS` is colon-separated and defaults to the launch directory. Paths are canonicalized, and existing ancestors are resolved so symlinks cannot be used to escape a configured root.

Text search is the baseline. Semantic search delegates to an optional local MLX Python environment selected by `MCP_MACOS_MLX_PYTHON`; the server does not add a cloud fallback.

### Homebrew

The `homebrew_*` adapters invoke the Homebrew executable with fixed argument arrays. Discovery and health operations are read-only. Package mutations require `MCP_MACOS_ALLOW_HOMEBREW_MUTATIONS=true` and `confirm=true`.

### Productivity

The `productivity_*` tools use fixed AppleScript templates for Calendar and Reminders. Model-controlled values are passed as data, not concatenated into arbitrary scripts. Reads rely on macOS privacy grants. Writes additionally require `MCP_MACOS_ALLOW_PRODUCTIVITY_WRITES=true` and `confirm=true`.

### Models

The `models_*` tools inspect Ollama and MLX state, run local generation, and support guarded MLX conversion or quantization. Generation requires `MCP_MACOS_ALLOW_MODEL_RUNS=true`. Conversion and quantization require `MCP_MACOS_ALLOW_MODEL_MUTATIONS=true`. Consequential calls also require `confirm=true`.

Long-running child processes must be cancellable, time-bounded, and output-bounded. The server must not silently download models or select a cloud provider.

## Core Policies

### Path policy

1. Resolve configured roots to canonical absolute paths.
2. Resolve a requested path relative to the first root unless it is absolute.
3. Reject lexical traversal outside every root.
4. Resolve the closest existing ancestor and reject symlink escapes.
5. Reuse the resolved path for the operation rather than resolving an unchecked input again.

### Process policy

- Spawn a fixed executable with an argument array and `shell: false`.
- Bound execution time and captured output.
- Capture stdout, stderr, exit status, timeout, and truncation separately.
- Return actionable structured errors without raw stack traces or environment dumps.
- Terminate children when the operation or server shuts down.

### Mutation policy

Mutation is a two-key gate:

1. The server owner enables a capability through the documented environment variable.
2. The individual tool call includes `confirm=true`.

This does not prove that a human approved the call. MCP clients are responsible for presenting sensitive inputs and keeping a human in the loop. The environment variable prevents a client from enabling a capability that the server owner withheld.

## Trust Boundaries

- **Trusted configuration:** server command, environment, allowed roots, and executable locations selected by the local user.
- **Untrusted MCP input:** every tool argument, including paths, package names, model names, dates, and Shortcut names.
- **Untrusted local content:** indexed files, command output, calendar text, reminders, model output, and metadata returned to an LLM.
- **External components:** MCP client, macOS, Homebrew, Shortcuts, Ollama, MLX, Python packages, and downloaded models.

See [Security Model](docs/security-model.md) for threats and mitigations.

## Testing Strategy

- Pure unit tests for schemas, path containment, gates, parsing, and error mapping.
- Injected command-runner tests that assert exact executable and arguments.
- Temporary-directory integration tests for filesystem and index behavior.
- MCP protocol tests against the compiled stdio entrypoint.
- Read-only smoke tests on GitHub-hosted Apple Silicon macOS runners.
- Manual permission checks for Calendar, Reminders, and Automation because hosted CI cannot safely grant a developer's TCC permissions.

No CI job should perform package changes, productivity writes, model generation, conversion, or quantization.
