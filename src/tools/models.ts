import { access } from "node:fs/promises";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import type { PathPolicy } from "../core/path-policy.js";
import type { ProcessRunner } from "../core/process-runner.js";
import { failure, fromProcess, ok } from "../core/results.js";

interface ModelDeps {
  runner: ProcessRunner;
  paths: PathPolicy;
  mlxPython: string;
  allowRuns: boolean;
  allowMutations: boolean;
}

async function firstExecutable(
  paths: readonly string[],
): Promise<string | undefined> {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next fixed location.
    }
  }
  return undefined;
}

const modelName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/);

export function registerModelTools(server: McpServer, deps: ModelDeps): void {
  server.registerTool(
    "models_status",
    {
      title: "Local Model Runtime Status",
      description:
        "Inspect locally installed Ollama and MLX runtimes without downloading or starting models.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const ollama = await firstExecutable([
        "/opt/homebrew/bin/ollama",
        "/usr/local/bin/ollama",
      ]);
      const mlx = await deps.runner.run({
        command: deps.mlxPython,
        args: ["-c", "import mlx_lm; print('available')"],
        timeoutMs: 10_000,
      });
      const data = {
        architecture: process.arch,
        ollama: { available: Boolean(ollama), path: ollama ?? null },
        mlxLm: { available: mlx.exitCode === 0, python: deps.mlxPython },
      };
      return ok(
        `Ollama: ${data.ollama.available ? "available" : "not found"}; MLX LM: ${data.mlxLm.available ? "available" : "not found"}.`,
        data,
      );
    },
  );

  server.registerTool(
    "models_ollama_list",
    {
      title: "List Ollama Models",
      description:
        "List downloaded Ollama models and currently running models.",
      inputSchema: z.object({ includeRunning: z.boolean().default(true) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ includeRunning }) => {
      const ollama = await firstExecutable([
        "/opt/homebrew/bin/ollama",
        "/usr/local/bin/ollama",
      ]);
      if (!ollama)
        return failure(
          "Ollama was not found in /opt/homebrew/bin or /usr/local/bin.",
        );
      const installed = await deps.runner.run({
        command: ollama,
        args: ["list"],
        timeoutMs: 15_000,
      });
      if (installed.exitCode !== 0)
        return fromProcess("Listing Ollama models", installed);
      const running = includeRunning
        ? await deps.runner.run({
            command: ollama,
            args: ["ps"],
            timeoutMs: 15_000,
          })
        : undefined;
      return ok(installed.stdout.trim(), {
        installed: installed.stdout.trim(),
        running: running?.exitCode === 0 ? running.stdout.trim() : null,
      });
    },
  );

  server.registerTool(
    "models_run",
    {
      title: "Run Local Model",
      description:
        "Run a prompt through an already installed Ollama or MLX model. Model runs are disabled by default.",
      inputSchema: z.object({
        runtime: z.enum(["ollama", "mlx"]),
        model: modelName,
        prompt: z.string().min(1).max(20_000),
        maxTokens: z.number().int().min(1).max(4_096).default(512),
        confirm: z.literal(true),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ runtime, model, prompt, maxTokens }, extra) => {
      if (!deps.allowRuns) {
        return failure(
          "Model execution is disabled. Set MCP_MACOS_ALLOW_MODEL_RUNS=true at startup.",
        );
      }
      if (runtime === "ollama") {
        const ollama = await firstExecutable([
          "/opt/homebrew/bin/ollama",
          "/usr/local/bin/ollama",
        ]);
        if (!ollama)
          return failure("Ollama is not installed in a supported location.");
        return fromProcess(
          `Running Ollama model ${model}`,
          await deps.runner.run({
            command: ollama,
            args: ["run", model, prompt],
            timeoutMs: 300_000,
            maxOutputBytes: 2_000_000,
            signal: extra.signal,
          }),
        );
      }
      if (process.arch !== "arm64")
        return failure("MLX model execution requires Apple Silicon.");
      return fromProcess(
        `Running MLX model ${model}`,
        await deps.runner.run({
          command: deps.mlxPython,
          args: [
            "-m",
            "mlx_lm.generate",
            "--model",
            model,
            "--prompt",
            prompt,
            "--max-tokens",
            String(maxTokens),
          ],
          timeoutMs: 300_000,
          maxOutputBytes: 2_000_000,
          signal: extra.signal,
        }),
      );
    },
  );

  server.registerTool(
    "models_mlx_quantize",
    {
      title: "Quantize MLX Model",
      description:
        "Preview or run local MLX model conversion with quantization. Execution is disabled by default and never uploads the result.",
      inputSchema: z.object({
        input: z.string().min(1),
        output: z.string().min(1),
        bits: z
          .union([z.literal(2), z.literal(3), z.literal(4), z.literal(8)])
          .default(4),
        execute: z.boolean().default(false),
        confirm: z.boolean().default(false),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ input, output, bits, execute, confirm }, extra) => {
      if (process.arch !== "arm64")
        return failure("MLX quantization requires Apple Silicon.");
      try {
        const inputPath = await deps.paths.resolve(input);
        const outputPath = await deps.paths.resolve(output);
        const args = [
          "-m",
          "mlx_lm.convert",
          "--hf-path",
          inputPath,
          "--mlx-path",
          outputPath,
          "--quantize",
          "--q-bits",
          String(bits),
        ];
        if (!execute) {
          return ok("Quantization preview only; no process was started.", {
            command: deps.mlxPython,
            args,
            input: inputPath,
            output: outputPath,
          });
        }
        if (!deps.allowMutations || !confirm) {
          return failure(
            "Quantization execution requires MCP_MACOS_ALLOW_MODEL_MUTATIONS=true and confirm=true.",
          );
        }
        return fromProcess(
          "MLX quantization",
          await deps.runner.run({
            command: deps.mlxPython,
            args,
            timeoutMs: 1_800_000,
            maxOutputBytes: 5_000_000,
            signal: extra.signal,
          }),
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );
}
