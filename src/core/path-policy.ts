import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

function isInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
  );
}

async function closestExistingPath(path: string): Promise<string> {
  let candidate = path;
  while (true) {
    try {
      await lstat(candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = resolve(candidate, "..");
      if (parent === candidate) return candidate;
      candidate = parent;
    }
  }
}

export class PathPolicy {
  private constructor(private readonly roots: readonly string[]) {}

  static async create(roots: readonly string[]): Promise<PathPolicy> {
    if (roots.length === 0)
      throw new Error("At least one allowed root is required");
    const canonicalRoots = await Promise.all(
      roots.map((root) => realpath(resolve(root))),
    );
    return new PathPolicy(canonicalRoots);
  }

  get allowedRoots(): readonly string[] {
    return this.roots;
  }

  async resolve(input: string): Promise<string> {
    const candidate = resolve(
      isAbsolute(input) ? input : resolve(this.roots[0]!, input),
    );
    if (!this.roots.some((root) => isInside(candidate, root))) {
      throw new Error(`Path is outside the allowed roots: ${input}`);
    }

    const existing = await closestExistingPath(candidate);
    const canonicalExisting = await realpath(existing);
    if (!this.roots.some((root) => isInside(canonicalExisting, root))) {
      throw new Error(`Path resolves outside the allowed roots: ${input}`);
    }
    const remaining = relative(existing, candidate);
    return resolve(canonicalExisting, remaining);
  }
}
