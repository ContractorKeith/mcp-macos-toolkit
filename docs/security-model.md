# Security Model

## Goal

Give an MCP client useful macOS capabilities without creating a general-purpose remote shell or silently broadening access to personal data.

## Assumptions

- The user controls the local process command and environment.
- The MCP client and model may send incorrect, malicious, or prompt-injected tool input.
- Files, calendar entries, reminders, command output, and model output may contain instructions intended to manipulate an LLM.
- macOS privacy grants apply to the application hosting the server process and may be broader than one tool call.
- Tool annotations are advisory metadata and are not an authorization system.

## Data Flow

```text
untrusted model/tool arguments
        |
        v
schema validation
        |
        v
path + capability + confirmation policy
        |
        v
fixed local adapter --> macOS / Homebrew / Ollama / MLX
        |
        v
bounded, structured result --> MCP client --> model
```

## Threats And Controls

| Threat                                     | Primary controls                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Path traversal                             | Canonical configured roots, lexical containment, closest-existing-ancestor checks                     |
| Symlink escape                             | Resolve existing ancestors and verify canonical containment before access                             |
| Command injection                          | Fixed executables, argument arrays, `shell: false`, strict schemas                                    |
| AppleScript injection                      | Fixed templates and encoded data; no arbitrary scripts                                                |
| Unauthorized Shortcut                      | Explicit comma-separated allowlist, startup flag, per-call confirmation                               |
| Unwanted package/productivity/model change | Capability-specific startup flag plus `confirm=true`                                                  |
| Resource exhaustion                        | Timeouts, output limits, result limits, cancellation, disk-space checks                               |
| Protocol corruption                        | MCP protocol only on stdout; diagnostics only on stderr                                               |
| Data exfiltration                          | Local stdio transport, no telemetry, no silent cloud fallback, narrow roots                           |
| Prompt injection from local content        | Treat returned content as untrusted, include source metadata, avoid executing discovered instructions |
| Secret leakage in errors                   | Structured errors without environment dumps, stack traces, or full sensitive content                  |
| Supply-chain compromise                    | Lockfile installs, pinned dependencies, Dependabot, npm audit, CodeQL, reviewed model sources         |

## Filesystem Boundary

`MCP_MACOS_ALLOWED_ROOTS` accepts colon-separated paths. If unset, the server uses the launch directory. Configure the narrowest practical roots:

```bash
MCP_MACOS_ALLOWED_ROOTS="/Users/you/Projects:/Users/you/Documents/PublicNotes"
```

Do not grant the whole home directory simply to avoid permission errors. In particular, avoid `~/Library`, browser profiles, SSH directories, cloud credential directories, password-manager data, and mail stores unless the task specifically requires them.

An allowed root controls what the server may access; it does not make file contents trustworthy.

## Mutation Boundary

Writes and other consequential operations require both a startup control and `confirm=true`:

| Capability                  | Startup control                                                    |
| --------------------------- | ------------------------------------------------------------------ |
| Run approved Shortcuts      | `MCP_MACOS_ALLOW_SHORTCUTS=true` and `MCP_MACOS_ALLOWED_SHORTCUTS` |
| Change Homebrew packages    | `MCP_MACOS_ALLOW_HOMEBREW_MUTATIONS=true`                          |
| Write Calendar/Reminders    | `MCP_MACOS_ALLOW_PRODUCTIVITY_WRITES=true`                         |
| Run local generation        | `MCP_MACOS_ALLOW_MODEL_RUNS=true`                                  |
| Convert/quantize MLX models | `MCP_MACOS_ALLOW_MODEL_MUTATIONS=true`                             |

Environment flags should be absent, not set to `false`, when unused. Restart the MCP process after changing them.

The two-key gate prevents an MCP client from turning on a capability that the server owner withheld. It cannot guarantee human review if the client automatically approves tool calls. Configure the client to ask before sensitive tools.

## Local Models And Embeddings

- Ollama connections should remain on localhost.
- MLX helpers run through the absolute Python executable in `MCP_MACOS_MLX_PYTHON`.
- The default semantic embedding model is `mlx-community/all-MiniLM-L6-v2-4bit`, configurable through `MCP_MACOS_MLX_EMBED_MODEL`.
- Model files and Python packages are third-party code/data. Review sources, licenses, sizes, and hashes where available.
- The server must not silently select a cloud API, upload indexed content, or download dependencies as a side effect of a read-only tool.

## Logging And Privacy

Logs must not contain complete environment variables, tokens, complete indexed documents, personal Calendar/Reminders records, or full prompts by default. Sanitized diagnostic information belongs on stderr.

When filing an issue, replace usernames and paths, reduce inputs to fictional fixtures, and share only the smallest relevant error.

## Deployment Guidance

V1 is designed for a trusted local stdio client. Do not wrap the server in an unauthenticated HTTP, WebSocket, SSH, or browser-accessible bridge. A network transport needs its own authentication, origin validation, session, rate-limit, and deployment threat model.

## Residual Risks

- A permitted read can expose sensitive content inside an allowed root.
- A permitted Shortcut can perform more work than its name suggests.
- A confirmed mutation can still be harmful or surprising.
- macOS may attribute privacy permissions to a hosting terminal or MCP client with broader access.
- Local model and file content can prompt-inject the client model.
- Third-party tools and model runtimes have their own vulnerabilities and update channels.

Use a separate macOS user account or disposable test fixtures when evaluating new mutating tools.
