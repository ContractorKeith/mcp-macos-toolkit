# Security Policy

`mcp-macos-toolkit` is a local stdio MCP server that can read files and interact with macOS applications and developer tools. It is not a hosted service, but enabling it grants an AI agent access to capabilities owned by the local user account.

## Supported Versions

Security fixes are applied to the latest public release and `main`.

| Version        | Supported   |
| -------------- | ----------- |
| Latest release | Yes         |
| `main`         | Yes         |
| Older releases | Best effort |

## Reporting A Vulnerability

Do not open a public issue for a suspected vulnerability.

Preferred reporting path:

1. Use GitHub private vulnerability reporting or open a private Security Advisory for `ContractorKeith/mcp-macos-toolkit`.
2. Include the affected release or commit, reproduction steps, impact, and a minimal sanitized proof of concept.
3. State whether the issue crosses an allowed filesystem root, bypasses a mutation gate, injects a command or AppleScript value, exposes private data, or corrupts MCP protocol output.
4. Do not attach personal files, calendars, reminders, tokens, complete filesystem indexes, or proprietary model data.

If private vulnerability reporting is unavailable, contact the maintainer through the ContractorKeith GitHub profile and request a private reporting channel.

Response targets:

- Acknowledgment within 3 business days.
- Initial triage within 7 business days.
- Fix or mitigation timing based on severity and release impact.
- Public disclosure after a fix or practical mitigation is available.

## In Scope

- Escaping `MCP_MACOS_ALLOWED_ROOTS`, including symlink or traversal bypasses.
- Running a Shortcut not present in `MCP_MACOS_ALLOWED_SHORTCUTS`.
- Bypassing an opt-in environment flag or the `confirm=true` requirement.
- Shell, command-argument, AppleScript, or Python injection.
- Unexpected network or cloud transmission.
- Secrets or personal data written to logs or protocol errors.
- Denial of service through unbounded subprocesses, output, indexing, or model operations.
- MCP protocol confusion caused by diagnostics written to stdout.
- Vulnerable dependencies, workflows, installer behavior, or package contents.

## Out Of Scope

- Behavior that requires the user to deliberately enable the documented unsafe capability and approve the exact documented operation, with no boundary bypass.
- Vulnerabilities in Homebrew, Ollama, MLX, Apple Shortcuts, macOS, an MCP client, or a model that are not caused or amplified by this project.
- Social engineering, spam, and denial-of-service reports without a concrete technical issue.
- Damage caused by exposing the local stdio server through an unauthenticated third-party network bridge.
- Reports that require publishing another person's private data.

## Security Model Summary

- The server is local-first and uses stdio.
- Filesystem operations are bounded by canonical allowed roots.
- Child processes use fixed executables and argument arrays without a shell.
- Arbitrary AppleScript and arbitrary command execution are not exposed.
- Shortcut execution requires an allowlist and `MCP_MACOS_ALLOW_SHORTCUTS=true`.
- Homebrew changes require `MCP_MACOS_ALLOW_HOMEBREW_MUTATIONS=true`.
- Calendar and Reminders writes require `MCP_MACOS_ALLOW_PRODUCTIVITY_WRITES=true`.
- Model generation requires `MCP_MACOS_ALLOW_MODEL_RUNS=true`.
- MLX conversion/quantization requires `MCP_MACOS_ALLOW_MODEL_MUTATIONS=true`.
- Every write or mutation also requires `confirm=true` in that tool call.
- Subprocesses have time and output limits.
- Protocol output belongs on stdout; diagnostics belong on stderr.
- Semantic embeddings are local and do not silently fall back to a cloud provider.

Tool annotations help clients explain risk, but clients can ignore or misrepresent them. Environment flags are the server owner's primary capability boundary.

Read [the full security model](docs/security-model.md) and [permission guide](docs/permissions.md) before enabling writes.

## Repository Controls

The project uses pull-request checks, CodeQL, dependency review, npm audit, Dependabot, and minimal GitHub Actions permissions. Maintainers should enable GitHub secret scanning, push protection, and private vulnerability reporting in repository settings.
