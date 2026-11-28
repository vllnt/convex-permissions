import { readFileSync } from "node:fs";

// Requests every external URL in the shipped docs and fails on any non-2xx/3xx answer.
// Needs network, so it runs as its own CI step and stays out of `pnpm lint`.
// npmjs.com answers 403 to every scripted request; confirm the package with `npm view` instead.

const FILES = ["README.md", "docs/API.md", "llms.txt", "CHANGELOG.md"];
const EXEMPT_HOSTS = [/(^|\.)npmjs\.com$/];
const TIMEOUT_MS = 15_000;
const RETRIES = 2;
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; docs-link-check)", accept: "*/*" };

const urls = new Map();
for (const file of FILES) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/https?:\/\/[^\s)<>"'`\]]+/g)) {
    const url = match[0].replace(/[.,;:]+$/, "");
    if (!urls.has(url)) urls.set(url, new Set());
    urls.get(url).add(file);
  }
}

/** One request; returns the HTTP status, or throws on network error / timeout. */
async function request(url, method) {
  const response = await fetch(url, {
    method,
    redirect: "follow",
    headers: HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await response.body?.cancel();
  return response.status;
}

async function statusOf(url) {
  let last = "no attempt";
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const head = await request(url, "HEAD");
      if (head >= 200 && head < 400) return head;
      const get = await request(url, "GET");
      if (get >= 200 && get < 400) return get;
      last = get;
      if (get < 500 && get !== 429) return get;
    } catch (error) {
      last = error instanceof Error ? (error.cause?.code ?? error.name) : String(error);
    }
  }
  return last;
}

const results = await Promise.all(
  [...urls.keys()].map(async (url) => {
    const host = new URL(url).hostname;
    if (EXEMPT_HOSTS.some((pattern) => pattern.test(host))) return { url, status: "exempt" };
    return { url, status: await statusOf(url) };
  }),
);

let failures = 0;
for (const { url, status } of results.sort((a, b) => a.url.localeCompare(b.url))) {
  const ok = status === "exempt" || (typeof status === "number" && status >= 200 && status < 400);
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"}  ${String(status).padEnd(6)} ${url}  (${[...urls.get(url)].join(", ")})`);
}
if (failures > 0) {
  console.error(`check-links: ${failures} URL(s) failed; fix or remove each FAIL link above`);
  process.exit(1);
}
console.log(`OK    links: ${results.length} external URLs answered 2xx/3xx or are exempt`);
