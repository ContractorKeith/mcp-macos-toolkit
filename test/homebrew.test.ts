import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it } from "vitest";

import type {
  ProcessRequest,
  ProcessResult,
} from "../src/core/process-runner.js";
import { registerHomebrewTools } from "../src/tools/homebrew.js";

const successfulResult: ProcessResult = {
  exitCode: 0,
  stdout: "",
  stderr: "",
  timedOut: false,
  truncated: false,
};

class FakeRunner {
  readonly requests: ProcessRequest[] = [];
  readonly results: ProcessResult[] = [];

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(request);
    return this.results.shift() ?? successfulResult;
  }
}

const closeables: Array<{ close(): Promise<void> }> = [];

async function createClient(
  runner: FakeRunner,
  allowMutations = false,
): Promise<Client> {
  const server = new McpServer({ name: "homebrew-test", version: "0.0.0" });
  registerHomebrewTools(server, { runner, allowMutations });

  const client = new Client({ name: "homebrew-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closeables.push(client, server);
  return client;
}

afterEach(async () => {
  await Promise.all(
    closeables.splice(0).map(async (closeable) => await closeable.close()),
  );
});

describe("Homebrew MCP tools", () => {
  it("publishes accurate read-only and mutation annotations", async () => {
    const client = await createClient(new FakeRunner());

    const { tools } = await client.listTools();
    const status = tools.find((tool) => tool.name === "homebrew_status");
    const install = tools.find((tool) => tool.name === "homebrew_install");

    expect(status?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(install?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
  });

  it("returns structured Homebrew status without invoking a shell", async () => {
    const runner = new FakeRunner();
    runner.results.push({
      ...successfulResult,
      stdout: "HOMEBREW_VERSION: 6.0.9\nHOMEBREW_PREFIX: /opt/homebrew\n",
    });
    const client = await createClient(runner);

    const result = await client.callTool({
      name: "homebrew_status",
      arguments: {},
    });

    expect(runner.requests).toEqual([
      {
        command: "/opt/homebrew/bin/brew",
        args: ["config"],
        timeoutMs: 15_000,
        maxOutputBytes: 1_000_000,
      },
    ]);
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      success: true,
      operation: "status",
      data: {
        config: { HOMEBREW_VERSION: "6.0.9", HOMEBREW_PREFIX: "/opt/homebrew" },
      },
    });
  });

  it("preserves a failed Homebrew command as a structured tool error", async () => {
    const runner = new FakeRunner();
    runner.results.push({
      ...successfulResult,
      exitCode: 1,
      stderr: "Homebrew is unavailable",
    });
    const client = await createClient(runner);

    const result = await client.callTool({
      name: "homebrew_status",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      success: false,
      operation: "status",
      exitCode: 1,
      stderr: "Homebrew is unavailable",
    });
  });

  it("searches a selected package type and structures the matches", async () => {
    const runner = new FakeRunner();
    runner.results.push({
      ...successfulResult,
      stdout: "ripgrep\nripgrep-all\n",
    });
    const client = await createClient(runner);

    const result = await client.callTool({
      name: "homebrew_search",
      arguments: { query: "ripgrep", type: "formula" },
    });

    expect(runner.requests[0]?.args).toEqual([
      "search",
      "--formula",
      "ripgrep",
    ]);
    expect(result.structuredContent).toMatchObject({
      success: true,
      operation: "search",
      data: { matches: ["ripgrep", "ripgrep-all"] },
    });
  });

  it("returns parsed package information for one validated name", async () => {
    const runner = new FakeRunner();
    const packageInfo = {
      formulae: [{ name: "ripgrep", versions: { stable: "14.1.1" } }],
      casks: [],
    };
    runner.results.push({
      ...successfulResult,
      stdout: JSON.stringify(packageInfo),
    });
    const client = await createClient(runner);

    const result = await client.callTool({
      name: "homebrew_info",
      arguments: { name: "ripgrep", type: "formula" },
    });

    expect(runner.requests[0]?.args).toEqual([
      "info",
      "--json=v2",
      "--formula",
      "ripgrep",
    ]);
    expect(result.structuredContent).toMatchObject({
      success: true,
      operation: "info",
      data: packageInfo,
    });
  });

  it("returns parsed outdated formulae and casks", async () => {
    const runner = new FakeRunner();
    const outdated = {
      formulae: [
        { name: "jq", installed_versions: ["1.7"], current_version: "1.8" },
      ],
      casks: [],
    };
    runner.results.push({
      ...successfulResult,
      stdout: JSON.stringify(outdated),
    });
    const client = await createClient(runner);

    const result = await client.callTool({
      name: "homebrew_outdated",
      arguments: {},
    });

    expect(runner.requests[0]?.args).toEqual(["outdated", "--json=v2"]);
    expect(result.structuredContent).toMatchObject({
      success: true,
      operation: "outdated",
      data: outdated,
    });
  });

  it("blocks installation when server mutations are disabled", async () => {
    const runner = new FakeRunner();
    const client = await createClient(runner, false);

    const result = await client.callTool({
      name: "homebrew_install",
      arguments: { name: "ripgrep", type: "formula", confirm: true },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      success: false,
      operation: "install",
      stderr: expect.stringContaining("disabled"),
    });
    expect(runner.requests).toHaveLength(0);
  });

  it("blocks installation without explicit per-call confirmation", async () => {
    const runner = new FakeRunner();
    const client = await createClient(runner, true);

    const result = await client.callTool({
      name: "homebrew_install",
      arguments: { name: "ripgrep", type: "formula", confirm: false },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      success: false,
      stderr: expect.stringContaining("confirm=true"),
    });
    expect(runner.requests).toHaveLength(0);
  });

  it("installs exactly one confirmed package with fixed arguments", async () => {
    const runner = new FakeRunner();
    runner.results.push({ ...successfulResult, stdout: "installed ripgrep\n" });
    const client = await createClient(runner, true);

    const result = await client.callTool({
      name: "homebrew_install",
      arguments: { name: "ripgrep", type: "formula", confirm: true },
    });

    expect(runner.requests).toEqual([
      {
        command: "/opt/homebrew/bin/brew",
        args: ["install", "--formula", "ripgrep"],
        timeoutMs: 600_000,
        maxOutputBytes: 1_000_000,
      },
    ]);
    expect(result.structuredContent).toMatchObject({
      success: true,
      operation: "install",
    });
  });

  it("rejects option and shell-like package names before process execution", async () => {
    const runner = new FakeRunner();
    const client = await createClient(runner, true);

    for (const name of [
      "--force",
      "ripgrep; touch /tmp/pwned",
      "../../formula",
    ]) {
      const result = await client.callTool({
        name: "homebrew_install",
        arguments: { name, type: "formula", confirm: true },
      });
      expect(result.isError).toBe(true);
    }

    expect(runner.requests).toHaveLength(0);
  });
});
