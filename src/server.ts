import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ToolkitConfig } from "./core/config.js";
import { PathPolicy } from "./core/path-policy.js";
import { ProcessRunner } from "./core/process-runner.js";
import { registerFilesystemTools } from "./tools/filesystem.js";
import { registerHomebrewTools } from "./tools/homebrew.js";
import { registerMacosTools } from "./tools/macos.js";
import { registerModelTools } from "./tools/models.js";
import { registerProductivityTools } from "./tools/productivity.js";

export interface ToolkitServerOptions {
  config: ToolkitConfig;
  runner?: ProcessRunner;
}

export async function createToolkitServer(
  options: ToolkitServerOptions,
): Promise<McpServer> {
  const runner = options.runner ?? new ProcessRunner();
  const paths = await PathPolicy.create(options.config.allowedRoots);
  const server = new McpServer(
    { name: "mcp-macos-toolkit", version: "0.1.0" },
    {
      instructions:
        "Use read-only inventory tools before operations. Files are limited to configured roots. Mutating tools require startup opt-in and confirm=true.",
    },
  );

  registerMacosTools(server, {
    runner,
    allowShortcuts: options.config.allowShortcuts,
    allowedShortcuts: options.config.allowedShortcuts,
  });
  registerFilesystemTools(server, {
    runner,
    paths,
    mlxPython: options.config.mlxPython,
    mlxEmbeddingModel: options.config.mlxEmbeddingModel,
    mlxScriptPath: fileURLToPath(
      new URL("../scripts/mlx_embed.py", import.meta.url),
    ),
  });
  registerHomebrewTools(server, {
    runner,
    allowMutations: options.config.allowHomebrewMutations,
  });
  registerProductivityTools(server, {
    runner,
    allowWrites: options.config.allowProductivityWrites,
  });
  registerModelTools(server, {
    runner,
    paths,
    mlxPython: options.config.mlxPython,
    allowRuns: options.config.allowModelRuns,
    allowMutations: options.config.allowModelMutations,
  });

  return server;
}
