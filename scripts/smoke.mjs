#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

if (process.platform !== "darwin") {
  process.stdout.write("stdio smoke skipped: macOS required\n");
  process.exit(0);
}

const client = new Client({
  name: "mcp-macos-toolkit-smoke",
  version: "0.1.0",
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/cli.js"],
  env: {
    ...process.env,
    MCP_MACOS_ALLOWED_ROOTS: process.cwd(),
  },
  stderr: "pipe",
});

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (tools.length < 10)
    throw new Error(`Expected at least 10 tools, received ${tools.length}`);
  const result = await client.callTool({
    name: "macos_system_info",
    arguments: {},
  });
  if (result.isError)
    throw new Error("macos_system_info returned an MCP tool error");
  process.stdout.write(
    `stdio smoke passed: ${tools.length} tools discovered\n`,
  );
} finally {
  await client.close();
}
