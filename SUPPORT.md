# Support

`mcp-macos-toolkit` is an early-access open-source project maintained on a best-effort basis.

## Before Opening An Issue

1. Confirm you are on macOS and using Node.js 22 or 24.
2. Pull the latest `main` branch, run `npm ci`, and rebuild with `npm run build`.
3. Review [Permissions](docs/permissions.md) and [Troubleshooting](docs/troubleshooting.md).
4. Reproduce the problem with the smallest possible allowed root and all mutation flags disabled.
5. Remove usernames, home-directory paths, calendar details, reminder text, tokens, model prompts, and other personal data from logs.

## Where To Ask

- Use a bug report for reproducible defects.
- Use a feature request for a bounded new capability.
- Use GitHub Discussions, when enabled, for setup questions and design ideas.
- Use the private process in [SECURITY.md](SECURITY.md) for vulnerabilities.

Support does not include recovering deleted files, reverting Homebrew changes, repairing Calendar or Reminders data, debugging third-party MCP clients, or troubleshooting arbitrary local model environments. The maintainer may still help identify whether the toolkit caused the problem.

## Useful Diagnostic Information

Include:

- macOS version and architecture
- Node.js and npm versions
- MCP client name and version
- toolkit commit or release
- tool name and sanitized input
- expected and actual result
- sanitized stderr output
- whether the issue reproduces with mutation flags disabled

Never include credentials, complete environment dumps, real personal records, or unredacted filesystem indexes.
