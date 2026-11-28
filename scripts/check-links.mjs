import { readFileSync } from "node:fs";

// Requests every external URL in the shipped docs and fails on any non-2xx/3xx answer.
// Needs network, so it runs as its own CI job (Links) and stays out of `pnpm lint`.
// npmjs.com answers 403 to every scripted request; confirm the package with `npm view` instead.

const FILES = ["README.md", "docs/API.md", "llms.txt", "CHANGELOG.md"];
const EXEMPT_HOSTS = [/(^|\.)npmjs\.com$/];
const TIMEOUT_MS = 15_000;
const RETRIES = 2;
const BACKOFF_MS = 1_000;
const MAX_RETRY_AFTER_MS = 10_000;
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

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const ok = (status) => status >= 200 && status < 400;

/** One request; returns { status, retryAfterMs }, or throws on network error / timeout. */
async function request(url, method) {
  const response = await fetch(url, {
    method,
    redirect: "follow",
    headers: HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await response.body?.cancel();
  const header = response.headers.get("retry-after");
  const seconds = header === null ? NaN : Number(header);
  const date = header === null ? NaN : Date.parse(header) - Date.now();
  const retryAfterMs = Number.isFinite(seconds) ? seconds * 1_000 : Number.isFinite(date) ? date : undefined;
  return { status: response.status, retryAfterMs };
}

async function statusOf(url) {
  let last = "no attempt";
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    let wait = BACKOFF_MS * (attempt + 1);
    try {
      const head = await request(url, "HEAD");
      if (ok(head.status)) return head.status;
      const get = await request(url, "GET");
      if (ok(get.status)) return get.status;
      last = get.status;
      if (get.status < 500 && get.status !== 429) return get.status;
      if (get.status === 429 && get.retryAfterMs !== undefined) {
        wait = Math.min(Math.max(get.retryAfterMs, 0), MAX_RETRY_AFTER_MS);
      }
    } catch (error) {
      last = error instanceof Error ? (error.cause?.code ?? error.name) : String(error);
    }
    if (attempt < RETRIES) await sleep(wait);
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
  const passed = status === "exempt" || (typeof status === "number" && ok(status));
  if (!passed) failures++;
  console.log(`${passed ? "OK  " : "FAIL"}  ${String(status).padEnd(6)} ${url}  (${[...urls.get(url)].join(", ")})`);
}
if (failures > 0) {
  console.error(`check-links: ${failures} URL(s) failed; fix or remove each FAIL link above`);
  process.exit(1);
}
console.log(`OK    links: ${results.length} external URLs answered 2xx/3xx or are exempt`);
