import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { ProcessRequest, ProcessResult } from "../core/process-runner.js";
import { failure, ok, sanitizeDiagnostic } from "../core/results.js";

interface HomebrewProcessRunner {
  run(request: ProcessRequest): Promise<ProcessResult>;
}

export interface HomebrewToolDependencies {
  runner: HomebrewProcessRunner;
  allowMutations: boolean;
  toolbeltPath?: string;
}

interface StructuredResult {
  success: boolean;
  operation: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  data?: unknown;
}

const commandOutputSchema = z.object({
  success: z.boolean(),
  operation: z.string(),
  exitCode: z.number().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  timedOut: z.boolean(),
  truncated: z.boolean(),
  data: z.unknown().optional(),
});

const packageTypeSchema = z.enum(["formula", "cask"]);
const packageNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9@+._-]*(?:\/[A-Za-z0-9][A-Za-z0-9@+._-]*){0,2}$/u,
    "Package name must be a Homebrew token or tap-qualified name",
  );
const searchQuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(
    (query) =>
      !query.startsWith("-") &&
      [...query].every(
        (char) => char.codePointAt(0)! >= 32 && char.codePointAt(0) !== 127,
      ),
    {
      message:
        "Search query cannot start with '-' or contain control characters",
    },
  );

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const localReadOnlyAnnotations = {
  ...readOnlyAnnotations,
  openWorldHint: false,
} as const;

const mutationAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

const HOMEBREW_PATH = "/opt/homebrew/bin/brew";

function toToolResult(result: StructuredResult): CallToolResult {
  const safeResult = result.success
    ? result
    : {
        ...result,
        stdout: "",
        stderr: sanitizeDiagnostic(result.stderr || result.stdout),
      };
  return {
    content: [{ type: "text", text: JSON.stringify(safeResult, null, 2) }],
    structuredContent: { ...safeResult },
    ...(safeResult.success ? {} : { isError: true }),
  };
}

function parseBrewConfig(stdout: string): Record<string, string> {
  const config: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/u)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    config[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return config;
}

function blockedResult(operation: string, message: string): CallToolResult {
  return toToolResult({
    success: false,
    operation,
    exitCode: null,
    stdout: "",
    stderr: message,
    timedOut: false,
    truncated: false,
  });
}

async function runCommand(
  deps: HomebrewToolDependencies,
  operation: string,
  args: readonly string[],
  parse?: (stdout: string) => unknown,
  timeoutMs = 15_000,
  signal?: AbortSignal,
  env?: NodeJS.ProcessEnv,
): Promise<CallToolResult> {
  try {
    const processResult = await deps.runner.run({
      command: HOMEBREW_PATH,
      args,
      timeoutMs,
      maxOutputBytes: 1_000_000,
      ...(signal ? { signal } : {}),
      ...(env ? { env } : {}),
    });
    const success = processResult.exitCode === 0 && !processResult.timedOut;
    let data: unknown;
    if (success && parse) {
      try {
        data = parse(processResult.stdout);
      } catch (error) {
        return toToolResult({
          success: false,
          operation,
          ...processResult,
          stderr: `Unable to parse Homebrew output: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return toToolResult({
      success,
      operation,
      ...processResult,
      ...(data === undefined ? {} : { data }),
    });
  } catch (error) {
    return toToolResult({
      success: false,
      operation,
      exitCode: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      timedOut: false,
      truncated: false,
    });
  }
}

export function registerHomebrewTools(
  server: McpServer,
  deps: HomebrewToolDependencies,
): void {
  server.registerTool(
    "homebrew_status",
    {
      title: "Homebrew status",
      description:
        "Inspect the local Homebrew version, prefix, and configuration.",
      inputSchema: z.object({}),
      outputSchema: commandOutputSchema,
      annotations: localReadOnlyAnnotations,
    },
    async () =>
      await runCommand(deps, "status", ["config"], (stdout) => ({
        config: parseBrewConfig(stdout),
      })),
  );

  server.registerTool(
    "homebrew_search",
    {
      title: "Search Homebrew packages",
      description: "Search the Homebrew formula and cask catalog by name.",
      inputSchema: z.object({
        query: searchQuerySchema.describe("Package name or search text"),
        type: packageTypeSchema
          .optional()
          .describe("Limit results to formulae or casks"),
      }),
      outputSchema: commandOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ query, type }) =>
      await runCommand(
        deps,
        "search",
        ["search", ...(type ? [`--${type}`] : []), query],
        (stdout) => ({
          matches: stdout
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      ),
  );

  server.registerTool(
    "homebrew_info",
    {
      title: "Homebrew package information",
      description:
        "Return Homebrew's structured metadata for one formula or cask.",
      inputSchema: z.object({
        name: packageNameSchema.describe(
          "Homebrew package token or tap-qualified name",
        ),
        type: packageTypeSchema.describe(
          "Whether the package is a formula or cask",
        ),
      }),
      outputSchema: commandOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ name, type }) =>
      await runCommand(
        deps,
        "info",
        ["info", "--json=v2", `--${type}`, name],
        (stdout) => JSON.parse(stdout),
      ),
  );

  server.registerTool(
    "homebrew_outdated",
    {
      title: "Outdated Homebrew packages",
      description:
        "List installed Homebrew packages with newer versions available.",
      inputSchema: z.object({
        type: packageTypeSchema
          .optional()
          .describe("Limit results to formulae or casks"),
      }),
      outputSchema: commandOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ type }) =>
      await runCommand(
        deps,
        "outdated",
        ["outdated", "--json=v2", ...(type ? [`--${type}`] : [])],
        (stdout) => JSON.parse(stdout),
      ),
  );

  server.registerTool(
    "homebrew_doctor",
    {
      title: "Homebrew health check",
      description:
        "Run Homebrew's read-only diagnostic checks with automatic updates disabled.",
      inputSchema: z.object({}),
      outputSchema: commandOutputSchema,
      annotations: localReadOnlyAnnotations,
    },
    async (_, extra) =>
      await runCommand(
        deps,
        "doctor",
        ["doctor"],
        undefined,
        120_000,
        extra.signal,
        {
          HOMEBREW_NO_AUTO_UPDATE: "1",
        },
      ),
  );

  server.registerTool(
    "homebrew_toolbelt_status",
    {
      title: "CLI Toolbelt Tier Status",
      description:
        "Inspect a local homebrew-cli-toolbelt tier and check whether its curated formulae and casks are installed.",
      inputSchema: z.object({
        tier: z.enum(["minimal", "intermediate", "full"]).default("minimal"),
      }),
      annotations: localReadOnlyAnnotations,
    },
    async ({ tier }, extra) => {
      if (!deps.toolbeltPath) {
        return failure(
          "Set MCP_MACOS_TOOLBELT_PATH to a trusted homebrew-cli-toolbelt checkout to inspect curated tiers.",
        );
      }
      const filename =
        tier === "minimal"
          ? "Brewfile.minimal"
          : tier === "intermediate"
            ? "Brewfile.intermediate"
            : "Brewfile";
      const brewfile = join(deps.toolbeltPath, filename);
      try {
        const source = await readFile(brewfile, "utf8");
        const entries = [
          ...source.matchAll(/^\s*(brew|cask)\s+"([^"]+)"/gmu),
        ].map(([, type, name]) => ({ type, name }));
        const check = await deps.runner.run({
          command: HOMEBREW_PATH,
          args: ["bundle", "check", "--no-upgrade", `--file=${brewfile}`],
          timeoutMs: 120_000,
          maxOutputBytes: 1_000_000,
          signal: extra.signal,
          env: { HOMEBREW_NO_AUTO_UPDATE: "1" },
        });
        return ok(
          check.exitCode === 0
            ? `${tier} toolbelt tier is installed.`
            : `${tier} toolbelt tier has missing packages.`,
          {
            tier,
            brewfile,
            complete: check.exitCode === 0,
            entries,
            details: sanitizeDiagnostic(check.stdout || check.stderr),
          },
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "homebrew_install",
    {
      title: "Install a Homebrew package",
      description:
        "Install one named Homebrew formula or cask. Requires server mutation opt-in and confirm=true.",
      inputSchema: z.object({
        name: packageNameSchema.describe(
          "Homebrew package token or tap-qualified name",
        ),
        type: packageTypeSchema.describe(
          "Whether the package is a formula or cask",
        ),
        confirm: z
          .boolean()
          .describe("Explicitly confirm this package installation"),
      }),
      outputSchema: commandOutputSchema,
      annotations: mutationAnnotations,
    },
    async ({ name, type, confirm }, extra) => {
      if (!deps.allowMutations) {
        return blockedResult(
          "install",
          "Homebrew mutations are disabled. Enable allowMutations in the server configuration.",
        );
      }
      if (!confirm) {
        return blockedResult("install", "Installation requires confirm=true.");
      }
      return await runCommand(
        deps,
        "install",
        ["install", `--${type}`, name],
        undefined,
        600_000,
        extra.signal,
      );
    },
  );
}
