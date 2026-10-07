import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
function load(path, imports, extra = {}) {
  const exports = {};
  const code = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      assert.ok(name in imports, `Unexpected import ${name}`);
      return imports[name];
    },
    process: { env },
    fetch,
    AbortSignal,
    Buffer,
    Response,
    ...extra,
  });
  return exports;
}
const env = {};
const calls = [];
let fail = false;
const fetch = async (url, options) => {
  calls.push({ url, options });
  if (fail) throw new Error("upstream offline");
  return { ok: true };
};
const settings = load("../src/lib/cache-config.ts", {});
const cache = load("../src/lib/public-cache.ts", {
  "server-only": {},
  "./cache-config": settings,
  "./api-url": { API_URL: "https://api.example.test/api" },
});
assert.equal(cache.getPublicCacheConfig().enabled, false);
await cache.publicFetch("/people");
assert.equal(calls.at(-1).options.cache, "no-store");
env.PUBLIC_CACHE_ENABLED = "true";
env.PUBLIC_CACHE_TTL_SECONDS = "7200";
env.PUBLIC_CACHE_NAMESPACE = "vps-test-v1";
await cache.publicFetch("/research?type=PAPER");
assert.equal(
  calls.at(-1).url,
  "https://api.example.test/api/research?type=PAPER",
);
assert.equal(calls.at(-1).options.next.revalidate, 7200);
assert.equal(calls.at(-1).options.next.tags[0], "vps-test-v1:content");
assert.equal(
  calls.at(-1).options.headers["x-public-cache-namespace"],
  "vps-test-v1",
);
await cache.publicFetch("/stats", false, 60);
assert.equal(calls.at(-1).options.next.revalidate, 60);
await cache.publicFetch("/positions", true);
assert.equal(calls.at(-1).options.cache, "no-store");
fail = true;
await assert.rejects(cache.publicFetch("/people"), /offline/);
for (const [key, value] of [
  ["PUBLIC_CACHE_ENABLED", "yes"],
  ["PUBLIC_CACHE_TTL_SECONDS", "0"],
  ["PUBLIC_CACHE_TTL_SECONDS", "1.5"],
  ["PUBLIC_CACHE_TTL_SECONDS", "604801"],
  ["PUBLIC_CACHE_NAMESPACE", "bad namespace"],
]) {
  const previous = env[key];
  env[key] = value;
  assert.throws(() => cache.getPublicCacheConfig(), new RegExp(key));
  env[key] = previous;
}
const expired = [];
const route = load("../src/app/api/revalidate/route.ts", {
  "node:crypto": require("node:crypto"),
  "next/cache": { revalidateTag: (...args) => expired.push(args) },
  "@/lib/public-cache": cache,
});
const request = (token) =>
  new Request("https://site.example.test/api/revalidate", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
assert.equal((await route.POST(request())).status, 503);
env.PUBLIC_CACHE_REVALIDATION_SECRET = "a".repeat(32);
assert.equal((await route.POST(request())).status, 401);
assert.equal((await route.POST(request("wrong"))).status, 401);
assert.equal(expired.length, 0);
assert.equal(
  (await route.POST(request(env.PUBLIC_CACHE_REVALIDATION_SECRET))).status,
  200,
);
assert.equal(expired[0][0], "vps-test-v1:content");
assert.equal(expired[0][1].expire, 0);
env.PUBLIC_CACHE_ENABLED = "false";
await route.POST(request(env.PUBLIC_CACHE_REVALIDATION_SECRET));
assert.equal(expired.length, 1);
console.log(
  "PASS: cache settings, tagged fetch policy, live bypass, namespace, timeout/error propagation, authenticated immediate invalidation and disabled mode.",
);
