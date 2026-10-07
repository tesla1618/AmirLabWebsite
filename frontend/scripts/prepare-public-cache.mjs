import { readdir, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { getPublicCacheConfig } from "../src/lib/cache-config.ts";

const { tag } = getPublicCacheConfig();
const directory = resolve(".next/cache/fetch-cache");
// Native tag expiry lives in process memory. A restart is a cold public cache
// rather than a chance to resurrect an invalidated entry left on disk.
try {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = resolve(directory, entry.name);
    let cached;
    try {
      cached = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
    if (Array.isArray(cached.tags) && cached.tags.includes(tag))
      await unlink(path);
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
