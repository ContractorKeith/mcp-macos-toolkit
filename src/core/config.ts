import { delimiter, resolve } from "node:path";

function enabled(value: string | undefined): boolean {
  return value?.toLowerCase() === "true" || value === "1";
}

function split(value: string | undefined, separator: string): string[] {
  return (value ?? "")
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface ToolkitConfig {
  allowedRoots: string[];
  allowedShortcuts: Set<string>;
  allowShortcuts: boolean;
  allowHomebrewMutations: boolean;
  allowProductivityWrites: boolean;
  allowModelRuns: boolean;
  allowModelMutations: boolean;
  mlxPython: string;
  mlxEmbeddingModel: string;
  toolbeltPath?: string;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): ToolkitConfig {
  const roots = split(env.MCP_MACOS_ALLOWED_ROOTS, delimiter);
  const toolbeltPath = env.MCP_MACOS_TOOLBELT_PATH?.trim();
  return {
    allowedRoots: (roots.length > 0 ? roots : [process.cwd()]).map((root) =>
      resolve(root),
    ),
    allowedShortcuts: new Set(split(env.MCP_MACOS_ALLOWED_SHORTCUTS, ",")),
    allowShortcuts: enabled(env.MCP_MACOS_ALLOW_SHORTCUTS),
    allowHomebrewMutations: enabled(env.MCP_MACOS_ALLOW_HOMEBREW_MUTATIONS),
    allowProductivityWrites: enabled(env.MCP_MACOS_ALLOW_PRODUCTIVITY_WRITES),
    allowModelRuns: enabled(env.MCP_MACOS_ALLOW_MODEL_RUNS),
    allowModelMutations: enabled(env.MCP_MACOS_ALLOW_MODEL_MUTATIONS),
    mlxPython: env.MCP_MACOS_MLX_PYTHON?.trim() || "/usr/bin/python3",
    mlxEmbeddingModel:
      env.MCP_MACOS_MLX_EMBED_MODEL?.trim() ||
      "mlx-community/all-MiniLM-L6-v2-4bit",
    ...(toolbeltPath ? { toolbeltPath: resolve(toolbeltPath) } : {}),
  };
}
