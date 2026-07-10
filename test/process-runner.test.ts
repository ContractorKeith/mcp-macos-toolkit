import { describe, expect, it } from "vitest";

import { ProcessRunner } from "../src/core/process-runner.js";

describe("ProcessRunner", () => {
  it("captures structured process output", async () => {
    const result = await new ProcessRunner().run({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write('ready'); process.stderr.write('note')",
      ],
    });

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "ready",
      stderr: "note",
      timedOut: false,
    });
  });

  it("terminates commands that exceed their timeout", async () => {
    const result = await new ProcessRunner().run({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10_000)"],
      timeoutMs: 25,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  it("caps captured output", async () => {
    const result = await new ProcessRunner().run({
      command: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(1_000))"],
      maxOutputBytes: 64,
    });

    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(64);
    expect(result.truncated).toBe(true);
  });

  it("cancels a subprocess when the caller aborts", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 25);

    const result = await new ProcessRunner().run({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10_000)"],
      signal: controller.signal,
    });

    expect(result.aborted).toBe(true);
    expect(result.timedOut).toBe(false);
  });

  it("merges explicit child settings into a sanitized environment", async () => {
    process.env.MCP_MACOS_TEST_SECRET = "do-not-forward";
    try {
      const result = await new ProcessRunner().run({
        command: process.execPath,
        args: [
          "-e",
          "process.stdout.write(JSON.stringify({home: process.env.HOME, custom: process.env.TOOLKIT_CUSTOM, secret: process.env.MCP_MACOS_TEST_SECRET}))",
        ],
        env: { TOOLKIT_CUSTOM: "local-only" },
      });
      expect(JSON.parse(result.stdout)).toMatchObject({
        home: expect.any(String),
        custom: "local-only",
      });
      expect(result.stdout).not.toContain("do-not-forward");
    } finally {
      delete process.env.MCP_MACOS_TEST_SECRET;
    }
  });
});
