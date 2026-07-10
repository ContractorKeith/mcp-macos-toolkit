import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createToolkitServer } from "../src/server.js";
import type {
  ProcessRequest,
  ProcessResult,
} from "../src/core/process-runner.js";

class FakeRunner {
  readonly calls: ProcessRequest[] = [];

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.calls.push(request);
    if (request.command === "/usr/bin/sw_vers") {
      return result("ProductName:\t\tmacOS\nProductVersion:\t\t26.0\n");
    }
    if (request.command === "/usr/bin/uname") return result("arm64\n");
    return result("");
  }
}

function result(stdout: string): ProcessResult {
  return { exitCode: 0, stdout, stderr: "", timedOut: false, truncated: false };
}

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

describe("toolkit MCP server", () => {
  it("lists the capability groups and calls a read-only tool through MCP", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-macos-server-"));
    await writeFile(
      join(root, "release-notes.md"),
      "Local-first MCP release checklist",
      "utf8",
    );
    const runner = new FakeRunner();
    const server = await createToolkitServer({
      config: {
        allowedRoots: [root],
        allowedShortcuts: new Set(),
        allowShortcuts: false,
        allowHomebrewMutations: false,
        allowProductivityWrites: false,
        allowModelRuns: false,
        allowModelMutations: false,
        mlxPython: "/usr/bin/python3",
        mlxEmbeddingModel: "test-model",
      },
      runner,
    });
    const client = new Client({ name: "toolkit-test", version: "0.1.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closers.push(async () => {
      await client.close();
      await server.close();
    });

    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "macos_system_info",
        "macos_shortcuts_list",
        "filesystem_search_text",
        "filesystem_semantic_search",
        "homebrew_status",
        "homebrew_install",
        "productivity_calendars_list",
        "productivity_calendar_events",
        "productivity_reminder_lists",
        "productivity_reminders_list",
        "models_status",
        "models_mlx_quantize",
      ]),
    );

    const response = await client.callTool({
      name: "macos_system_info",
      arguments: {},
    });
    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({ architecture: "arm64" });

    const search = await client.callTool({
      name: "filesystem_semantic_search",
      arguments: { path: ".", query: "release checklist", provider: "lexical" },
    });
    expect(search.isError).not.toBe(true);
    expect(search.structuredContent).toMatchObject({
      provider: "lexical",
      matches: [expect.objectContaining({ path: "release-notes.md" })],
    });

    const blockedShortcut = await client.callTool({
      name: "macos_shortcuts_run",
      arguments: { name: "Publish release", confirm: true },
    });
    const blockedEvent = await client.callTool({
      name: "productivity_calendar_create",
      arguments: {
        calendar: "Work",
        title: "Release",
        start: "2026-07-10T13:00:00-04:00",
        end: "2026-07-10T14:00:00-04:00",
        confirm: true,
      },
    });
    expect(blockedShortcut.isError).toBe(true);
    expect(blockedEvent.isError).toBe(true);
    expect(
      runner.calls.some((call) => call.command === "/usr/bin/shortcuts"),
    ).toBe(false);
    expect(
      runner.calls.some((call) => call.command === "/usr/bin/osascript"),
    ).toBe(false);
  });
});
