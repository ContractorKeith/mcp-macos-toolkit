# Contributing

Thanks for helping improve `mcp-macos-toolkit`.

This project exposes local macOS capabilities to AI agents. Contributions must preserve the safety contract: bounded filesystem access, fixed command adapters, no arbitrary AppleScript or shell execution, and explicit opt-in for mutations.

## Good First Contributions

- Add unit tests for path, parsing, permission, timeout, and error-handling edge cases.
- Improve macOS permission troubleshooting.
- Add read-only support for another stable macOS or Homebrew query.
- Improve MCP tool descriptions and structured output.
- Add sanitized fixtures for Calendar, Reminders, Homebrew, Ollama, or MLX adapters.

Open an issue before proposing a new mutating tool or a new runtime dependency.

## Local Setup

Requirements:

- macOS on Apple Silicon
- Node.js 22 or 24 recommended
- npm

```bash
git clone https://github.com/ContractorKeith/mcp-macos-toolkit.git
cd mcp-macos-toolkit
npm ci
npm run check
```

Use a test directory rather than your home directory while developing filesystem tools:

```bash
MCP_MACOS_ALLOWED_ROOTS="$(mktemp -d)" npm test
```

## Required Checks

Before opening a pull request, run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

CI runs the combined `npm run check` gate on Node.js 22 and 24. A separate macOS lane builds the package and connects an official MCP SDK client to the compiled stdio server for a read-only tool-discovery smoke test.

## Safety Requirements

- Use `spawn` or equivalent argument-array APIs with `shell: false`.
- Do not concatenate model-controlled values into shell, AppleScript, SQL, or Python source.
- Resolve and revalidate paths against configured roots, including symlink targets.
- Give every subprocess a timeout and output limit.
- Keep protocol output on stdout and diagnostics on stderr.
- Do not add telemetry or cloud fallback behavior.
- Mark read-only, destructive, and idempotent tools accurately.
- Require both the relevant startup environment flag and `confirm=true` for every write or mutation.
- Add negative tests for bypass attempts, not only happy-path tests.

Arbitrary shell execution, arbitrary AppleScript, silent cloud calls, and automatic permission escalation are out of scope.

## Pull Requests

- Keep the change focused and explain why it belongs in the toolkit.
- Include tests for behavior changes.
- Include the exact verification commands and results.
- Update README, security, permission, and tool-reference documentation when behavior changes.
- Use fictional or sanitized fixtures. Never include personal calendars, reminders, filesystem contents, tokens, model prompts, or machine identifiers.
- Call out new permissions, network access, downloads, or mutation paths prominently.

Maintainers may ask for a smaller PR when a change combines unrelated capabilities.

## Reporting Security Problems

Do not open a public issue for a suspected vulnerability. Follow [SECURITY.md](SECURITY.md).
