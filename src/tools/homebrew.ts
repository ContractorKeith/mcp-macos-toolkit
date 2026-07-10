import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { ProcessRequest, ProcessResult } from "../core/process-runner.js";

interface HomebrewProcessRunner {
  run(request: ProcessRequest): Promise<ProcessResult>;
}

export interface HomebrewToolDependencies {
  runner: HomebrewProcessRunner;
  allowMutations: boolean;
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
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    structuredContent: { ...result },
    ...(result.success ? {} : { isError: true }),
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
): Promise<CallToolResult> {
  try {
    const processResult = await deps.runner.run({
      command: HOMEBREW_PATH,
      args,
      timeoutMs,
      maxOutputBytes: 1_000_000,
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
    async ({ name, type, confirm }) => {
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
      );
    },
  );
}
