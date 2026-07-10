#!/usr/bin/env node
import { access } from "node:fs/promises";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./core/config.js";
import { createToolkitServer } from "./server.js";

const VERSION = "0.1.0";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function doctor(): Promise<void> {
  const config = loadConfig();
  const report = {
    version: VERSION,
    supported: process.platform === "darwin",
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    allowedRoots: config.allowedRoots,
    capabilities: {
      shortcuts: await exists("/usr/bin/shortcuts"),
      appleScript: await exists("/usr/bin/osascript"),
      homebrew:
        (await exists("/opt/homebrew/bin/brew")) ||
        (await exists("/usr/local/bin/brew")),
      ollama:
        (await exists("/opt/homebrew/bin/ollama")) ||
        (await exists("/usr/local/bin/ollama")),
      mlxPython: await exists(config.mlxPython),
    },
    mutations: {
      shortcuts: config.allowShortcuts,
      homebrew: config.allowHomebrewMutations,
      productivity: config.allowProductivityWrites,
      modelRuns: config.allowModelRuns,
      models: config.allowModelMutations,
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (command === "doctor") {
    await doctor();
    return;
  }
  if (command === "--help" || command === "-h") {
    process.stdout.write(
      "mcp-macos-toolkit [doctor|--version]\n\nWithout arguments, starts the local stdio MCP server.\n",
    );
    return;
  }
  if (command !== undefined) throw new Error(`Unknown command: ${command}`);
  if (process.platform !== "darwin") {
    throw new Error(
      "mcp-macos-toolkit supports macOS only. Run `mcp-macos-toolkit doctor` for details.",
    );
  }
  const server = await createToolkitServer({ config: loadConfig() });
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  process.stderr.write(
    `mcp-macos-toolkit: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
