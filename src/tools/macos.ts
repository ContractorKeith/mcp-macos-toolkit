import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import type { ProcessRunner } from "../core/process-runner.js";
import { failure, fromProcess, ok } from "../core/results.js";

interface MacosDeps {
  runner: ProcessRunner;
  allowShortcuts: boolean;
  allowedShortcuts: ReadonlySet<string>;
}

export function registerMacosTools(server: McpServer, deps: MacosDeps): void {
  server.registerTool(
    "macos_system_info",
    {
      title: "macOS System Info",
      description:
        "Inspect macOS version and machine architecture without changing the system.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const [version, architecture] = await Promise.all([
        deps.runner.run({ command: "/usr/bin/sw_vers", timeoutMs: 5_000 }),
        deps.runner.run({
          command: "/usr/bin/uname",
          args: ["-m"],
          timeoutMs: 5_000,
        }),
      ]);
      if (version.exitCode !== 0 || architecture.exitCode !== 0) {
        return failure(
          "Unable to inspect this Mac. The toolkit supports macOS only.",
        );
      }
      const data = {
        platform: "darwin",
        architecture: architecture.stdout.trim(),
        swVers: version.stdout.trim(),
      };
      return ok(`${data.swVers}\nArchitecture: ${data.architecture}`, data);
    },
  );

  server.registerTool(
    "macos_shortcuts_list",
    {
      title: "List Shortcuts",
      description:
        "List installed Apple Shortcuts and show which ones are allowlisted.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const result = await deps.runner.run({
        command: "/usr/bin/shortcuts",
        args: ["list"],
        timeoutMs: 10_000,
      });
      if (result.exitCode !== 0)
        return fromProcess("Listing Shortcuts", result);
      const shortcuts = result.stdout
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({
          name,
          allowed: deps.allowedShortcuts.has(name),
        }));
      return ok(`Found ${shortcuts.length} Shortcuts.`, { shortcuts });
    },
  );

  server.registerTool(
    "macos_shortcuts_run",
    {
      title: "Run Approved Shortcut",
      description:
        "Run an installed Shortcut only when Shortcut execution is enabled and its exact name is allowlisted.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(200),
        confirm: z.literal(true),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ name }, extra) => {
      if (!deps.allowShortcuts) {
        return failure(
          "Shortcut execution is disabled. Set MCP_MACOS_ALLOW_SHORTCUTS=true at startup.",
        );
      }
      if (!deps.allowedShortcuts.has(name)) {
        return failure(`Shortcut is not allowlisted: ${name}`);
      }
      const result = await deps.runner.run({
        command: "/usr/bin/shortcuts",
        args: ["run", name],
        timeoutMs: 120_000,
        signal: extra.signal,
      });
      return fromProcess(`Shortcut ${name}`, result);
    },
  );
}
