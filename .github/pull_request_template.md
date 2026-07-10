## Summary

-

## Why It Belongs

-

## Verification

- [ ] `npm run check`
- [ ] `git diff --check`
- [ ] Read-only MCP stdio smoke, if the protocol surface changed
- [ ] Manual macOS permission test, if Calendar, Reminders, Shortcuts, or Automation changed

## Safety Review

- [ ] No arbitrary shell execution or arbitrary AppleScript was added.
- [ ] Paths, command arguments, timeouts, output limits, and errors are tested.
- [ ] Writes/mutations require the documented startup flag and `confirm=true`.
- [ ] Tool annotations match read-only, destructive, and idempotent behavior.
- [ ] No credentials, personal files, calendar/reminder data, model prompts, or complete environment dumps are included.
- [ ] Documentation covers any new permission, network access, download, or mutation path.

## Evidence

Paste concise test output or explain why a check could not be run.
