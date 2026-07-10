import { mkdtemp, mkdir, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PathPolicy } from "../src/core/path-policy.js";

describe("PathPolicy", () => {
  it("allows paths inside a configured root and rejects traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-macos-root-"));
    const policy = await PathPolicy.create([root]);

    await expect(policy.resolve("notes/today.md")).resolves.toBe(
      join(await realpath(root), "notes/today.md"),
    );
    await expect(policy.resolve("../secret.txt")).rejects.toThrow(
      "outside the allowed roots",
    );
  });

  it("rejects a symlink that escapes a configured root", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-macos-root-"));
    const outside = await mkdtemp(join(tmpdir(), "mcp-macos-outside-"));
    await mkdir(join(root, "safe"));
    await symlink(outside, join(root, "safe", "escape"));
    const policy = await PathPolicy.create([root]);

    await expect(policy.resolve("safe/escape/private.txt")).rejects.toThrow(
      "outside the allowed roots",
    );
  });

  it("returns the canonical target for a symlink that stays inside the root", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-macos-root-"));
    await mkdir(join(root, "actual"));
    await symlink(join(root, "actual"), join(root, "alias"));
    const policy = await PathPolicy.create([root]);

    await expect(policy.resolve("alias/note.md")).resolves.toBe(
      join(await realpath(root), "actual", "note.md"),
    );
  });
});
