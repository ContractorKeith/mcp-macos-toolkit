import { spawn } from "node:child_process";

export interface ProcessRequest {
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
  input?: string;
  signal?: AbortSignal;
}

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  aborted?: boolean;
}

const SAFE_ENV_KEYS = [
  "HOME",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "PATH",
  "TMPDIR",
  "XDG_CACHE_HOME",
  "HF_HOME",
  "NO_COLOR",
] as const;

function sanitizedEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const output: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    if (source[key] !== undefined) output[key] = source[key];
  }
  return output;
}

function appendCapped(
  current: Buffer,
  chunk: Buffer,
  limit: number,
): [Buffer, boolean] {
  const remaining = Math.max(0, limit - current.byteLength);
  if (chunk.byteLength <= remaining)
    return [Buffer.concat([current, chunk]), false];
  return [Buffer.concat([current, chunk.subarray(0, remaining)]), true];
}

export class ProcessRunner {
  async run(request: ProcessRequest): Promise<ProcessResult> {
    const timeoutMs = request.timeoutMs ?? 15_000;
    const maxOutputBytes = request.maxOutputBytes ?? 1_000_000;

    return await new Promise((resolve, reject) => {
      const child = spawn(request.command, [...(request.args ?? [])], {
        cwd: request.cwd,
        env: { ...sanitizedEnvironment(process.env), ...(request.env ?? {}) },
        shell: false,
        stdio: "pipe",
      });
      let stdout: Buffer = Buffer.alloc(0);
      let stderr: Buffer = Buffer.alloc(0);
      let truncated = false;
      let timedOut = false;
      let aborted = false;
      let forceKillTimer: NodeJS.Timeout | undefined;

      child.stdout.on("data", (chunk: Buffer) => {
        const [next, wasTruncated] = appendCapped(
          stdout,
          chunk,
          maxOutputBytes,
        );
        stdout = next;
        truncated ||= wasTruncated;
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const [next, wasTruncated] = appendCapped(
          stderr,
          chunk,
          maxOutputBytes,
        );
        stderr = next;
        truncated ||= wasTruncated;
      });
      child.once("error", reject);

      const terminate = (): void => {
        child.kill("SIGTERM");
        forceKillTimer ??= setTimeout(() => child.kill("SIGKILL"), 1_000);
        forceKillTimer.unref();
      };
      const timer = setTimeout(() => {
        timedOut = true;
        terminate();
      }, timeoutMs);

      const abort = (): void => {
        aborted = true;
        terminate();
      };
      if (request.signal?.aborted) abort();
      else request.signal?.addEventListener("abort", abort, { once: true });

      child.once("close", (exitCode) => {
        clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        request.signal?.removeEventListener("abort", abort);
        resolve({
          exitCode,
          stdout: stdout.toString("utf8"),
          stderr: stderr.toString("utf8"),
          timedOut,
          truncated,
          aborted,
        });
      });

      if (request.input === undefined) child.stdin.end();
      else child.stdin.end(request.input);
    });
  }
}
