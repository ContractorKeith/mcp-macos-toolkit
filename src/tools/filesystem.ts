import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { basename, relative } from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fg from "fast-glob";
import * as z from "zod/v4";

import type { PathPolicy } from "../core/path-policy.js";
import type { ProcessRunner } from "../core/process-runner.js";
import { failure, ok } from "../core/results.js";

const DEFAULT_IGNORES = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.env*",
  "**/.ssh/**",
  "**/.gnupg/**",
  "**/.aws/**",
  "**/.azure/**",
  "**/.config/gcloud/**",
  "**/Library/Keychains/**",
  "**/Library/Mail/**",
  "**/Library/Safari/**",
  "**/Library/Application Support/Google/Chrome/**",
  "**/Library/Application Support/Firefox/Profiles/**",
  "**/*.{pem,key,p12,pfx,kdbx,mobileprovision}",
];
const TEXT_EXTENSIONS =
  "**/*.{md,mdx,txt,json,yaml,yml,toml,ts,tsx,js,jsx,py,rb,go,rs,swift,sh,zsh,css,html}";
const globPattern = z
  .string()
  .max(200)
  .refine(
    (pattern) =>
      !pattern.startsWith("/") &&
      !pattern.split(/[\\/]/u).includes("..") &&
      !pattern.includes("\0"),
    "Glob patterns must stay beneath the selected root",
  );

interface FilesystemDeps {
  paths: PathPolicy;
  runner: ProcessRunner;
  mlxPython: string;
  mlxEmbeddingModel: string;
  mlxScriptPath: string;
}

interface Candidate {
  path: string;
  excerpt: string;
}

async function readBoundedText(
  path: string,
  maxBytes: number,
): Promise<{ text: string; bytes: number }> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error("The requested path is not a file.");
    if (info.size > maxBytes)
      throw new Error(`File exceeds the ${maxBytes}-byte read limit.`);
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maxBytes)
      throw new Error(`File exceeds the ${maxBytes}-byte read limit.`);
    return {
      text: buffer.subarray(0, bytesRead).toString("utf8"),
      bytes: bytesRead,
    };
  } finally {
    await handle.close();
  }
}

function lexicalScore(query: string, text: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  const haystack = text.toLowerCase();
  return (
    terms.reduce(
      (score, term) => score + (haystack.includes(term) ? 1 : 0),
      0,
    ) / terms.length
  );
}

function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index]! * b[index]!;
    normA += a[index]! ** 2;
    normB += b[index]! ** 2;
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

async function candidates(
  root: string,
  pattern: string,
  maxFiles: number,
): Promise<Candidate[]> {
  const matches = await fg(pattern, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: DEFAULT_IGNORES,
  });
  const output: Candidate[] = [];
  for (const path of matches.slice(0, maxFiles)) {
    try {
      const { text } = await readBoundedText(path, 1_000_000);
      output.push({
        path,
        excerpt: text.slice(0, 12_000),
      });
    } catch {
      // Files can disappear while searching; skip them.
    }
  }
  return output;
}

export function registerFilesystemTools(
  server: McpServer,
  deps: FilesystemDeps,
): void {
  server.registerTool(
    "filesystem_list",
    {
      title: "List Files",
      description:
        "List files beneath an allowed macOS directory without following symlinks.",
      inputSchema: z.object({
        path: z.string().default("."),
        pattern: globPattern.default("**/*"),
        limit: z.number().int().min(1).max(500).default(100),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path, pattern, limit }) => {
      try {
        const root = await deps.paths.resolve(path);
        const matches = await fg(pattern, {
          cwd: root,
          onlyFiles: true,
          followSymbolicLinks: false,
          ignore: DEFAULT_IGNORES,
        });
        const files = matches.slice(0, limit);
        return ok(`Found ${files.length} files beneath ${basename(root)}.`, {
          root,
          files,
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "filesystem_read_text",
    {
      title: "Read Text File",
      description: "Read a bounded UTF-8 text file from an allowed root.",
      inputSchema: z.object({
        path: z.string().min(1),
        maxBytes: z.number().int().min(1).max(1_000_000).default(200_000),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path, maxBytes }) => {
      try {
        const resolved = await deps.paths.resolve(path);
        const { text, bytes } = await readBoundedText(resolved, maxBytes);
        return ok(text, { path: resolved, bytes, text });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "filesystem_search_text",
    {
      title: "Search File Text",
      description:
        "Search text locally beneath an allowed root; sensitive paths are excluded.",
      inputSchema: z.object({
        path: z.string().default("."),
        query: z.string().trim().min(1).max(500),
        pattern: globPattern.default(TEXT_EXTENSIONS),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path, query, pattern, limit }) => {
      try {
        const root = await deps.paths.resolve(path);
        const files = await candidates(root, pattern, 300);
        const matches = files
          .map((item) => ({
            path: relative(root, item.path),
            score: lexicalScore(query, item.excerpt),
            excerpt: item.excerpt.slice(0, 500),
          }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        return ok(`Found ${matches.length} local text matches.`, {
          root,
          matches,
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "filesystem_semantic_search",
    {
      title: "Semantic File Search",
      description:
        "Search local files with optional MLX embeddings. Auto mode falls back to lexical search locally and never calls a cloud API.",
      inputSchema: z.object({
        path: z.string().default("."),
        query: z.string().trim().min(1).max(500),
        provider: z.enum(["auto", "mlx", "lexical"]).default("auto"),
        limit: z.number().int().min(1).max(20).default(8),
        maxFiles: z.number().int().min(1).max(200).default(50),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path, query, provider, limit, maxFiles }, extra) => {
      try {
        const root = await deps.paths.resolve(path);
        const files = await candidates(root, TEXT_EXTENSIONS, maxFiles);
        if (provider === "lexical") {
          const matches = files
            .map((item) => ({
              path: relative(root, item.path),
              score: lexicalScore(query, item.excerpt),
              excerpt: item.excerpt.slice(0, 500),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
          return ok(
            `Found ${matches.length} matches with the local lexical fallback.`,
            {
              provider: "lexical",
              matches,
            },
          );
        }

        const input = JSON.stringify({
          texts: [query, ...files.map((item) => item.excerpt)],
        });
        const embedded = await deps.runner.run({
          command: deps.mlxPython,
          args: [deps.mlxScriptPath, "--model", deps.mlxEmbeddingModel],
          input,
          timeoutMs: 120_000,
          maxOutputBytes: 10_000_000,
          signal: extra.signal,
          env: { HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" },
        });
        if (embedded.exitCode !== 0 || embedded.timedOut) {
          if (provider === "mlx") {
            return failure(
              `MLX embeddings unavailable: ${embedded.stderr.trim() || "install mlx-embeddings in the configured Python environment"}`,
            );
          }
          const matches = files
            .map((item) => ({
              path: relative(root, item.path),
              score: lexicalScore(query, item.excerpt),
              excerpt: item.excerpt.slice(0, 500),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
          return ok(
            `MLX was unavailable; found ${matches.length} matches with local lexical search.`,
            {
              provider: "lexical",
              fallbackReason: embedded.stderr.trim() || "MLX unavailable",
              matches,
            },
          );
        }
        const parsed = JSON.parse(embedded.stdout) as {
          embeddings: number[][];
        };
        const queryVector = parsed.embeddings[0];
        if (!queryVector || parsed.embeddings.length !== files.length + 1) {
          return failure(
            "MLX embedding helper returned an invalid vector set.",
          );
        }
        const matches = files
          .map((item, index) => ({
            path: relative(root, item.path),
            score: cosine(queryVector, parsed.embeddings[index + 1] ?? []),
            excerpt: item.excerpt.slice(0, 500),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        return ok(
          `Found ${matches.length} matches with local MLX embeddings.`,
          {
            provider: "mlx",
            model: deps.mlxEmbeddingModel,
            matches,
          },
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );
}
