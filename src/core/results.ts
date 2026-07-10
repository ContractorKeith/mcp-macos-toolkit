import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function ok(
  message: string,
  data?: Record<string, unknown>,
): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    ...(data ? { structuredContent: data } : {}),
  };
}

export function failure(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function fromProcess(
  label: string,
  result: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  },
): CallToolResult {
  if (result.timedOut) return failure(`${label} timed out.`);
  if (result.exitCode !== 0) {
    const detail =
      result.stderr.trim() ||
      result.stdout.trim() ||
      `exit ${String(result.exitCode)}`;
    return failure(`${label} failed: ${detail}`);
  }
  return ok(result.stdout.trim() || `${label} completed.`, {
    exitCode: result.exitCode,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  });
}
