import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

// Fails when the docs drift from the code or from the agent-first README contract:
// README section order, install and first example placement, fenced code languages,
// relative links and anchors, public exports in the README API table, thrown errors in
// the README errors table, the exact Links / footer / llms.txt Ecosystem blocks, one
// shared package description, and stray links to the old company domain.
// Every failure names the fix. Run with `pnpm check:docs` (part of `pnpm lint`).

const README = "README.md";
const API = "docs/API.md";
const LLMS = "llms.txt";
const CHANGELOG = "CHANGELOG.md";
const LINKED_DOCS = [README, API, LLMS, CHANGELOG];
const FENCED_DOCS = [README, API, LLMS, CHANGELOG, "CONTRIBUTING.md"];

const README_TITLE = "# @vllnt/convex-permissions";
const README_SECTIONS = [
  "For coding agents",
  "When to use",
  "Install",
  "Quick start",
  "API",
  "Common tasks",
  "Errors and fixes",
  "Limits and gotchas",
  "Compatibility",
  "Testing",
  "Security",
  "Related packages",
  "Contributing",
  "Links",
  "License",
];
const FIRST_LINES = 40;
const INSTALL_COMMAND = "npm install @vllnt/convex-permissions";

const LINKS_BLOCK = `## Links

- Docs and changelog: [oss.vllnt.com/packages/convex-permissions](https://oss.vllnt.com/packages/convex-permissions) · [release feed](https://oss.vllnt.com/packages/convex-permissions/rss.xml)
- All @vllnt packages: [oss.vllnt.com](https://oss.vllnt.com) · [search packages and docs on index.vllnt.com](https://index.vllnt.com)
- Source and issues: [GitHub](https://github.com/vllnt/convex-permissions) · [issues](https://github.com/vllnt/convex-permissions/issues) · [npm](https://www.npmjs.com/package/@vllnt/convex-permissions)
- Questions and updates: [Discord](https://bntvllnt.com/discord) · [X @bntvllnt](https://x.com/bntvllnt)
- Company and author: [vllnt.com](https://vllnt.com) · [bntvllnt.com](https://bntvllnt.com) · [GitHub @bntvllnt](https://github.com/bntvllnt) · [LinkedIn](https://linkedin.com/in/bntvllnt)
- Sponsor: [GitHub Sponsors](https://github.com/sponsors/bntvllnt)
`;
const FOOTER = `---

Part of [vllnt open source](https://oss.vllnt.com) · [Package page](https://oss.vllnt.com/packages/convex-permissions) · [vllnt.com](https://vllnt.com) · Built by [bntvllnt](https://bntvllnt.com)
`;
const ECOSYSTEM_BLOCK = `## Ecosystem

- [Package page](https://oss.vllnt.com/packages/convex-permissions)
- [Release feed](https://oss.vllnt.com/packages/convex-permissions/rss.xml)
- [All @vllnt packages](https://oss.vllnt.com/llms.txt)
- [Search vllnt packages and docs](https://index.vllnt.com)
- [vllnt](https://vllnt.com/llms.txt)
- [Author](https://bntvllnt.com)
`;
// Built from parts so this file does not match its own check.
const OLD_DOMAIN = new RegExp(["vllnt", "\\.", "ai(?![A-Za-z0-9-])"].join(""), "i");

const errors = [];
const fail = (file, problem, fix) => errors.push(`FAIL ${file}: ${problem}\n     fix: ${fix}`);
const read = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

/** Split a markdown file into lines, marking which lines sit inside fenced code. */
function parseMarkdown(text) {
  const lines = text.split("\n");
  const inCode = [];
  const fences = [];
  let open = null;
  lines.forEach((line, index) => {
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (open === null && fence) {
      open = { marker: fence[1], line: index + 1, lang: fence[2].trim() };
      fences.push(open);
      inCode.push(true);
    } else if (open !== null) {
      inCode.push(true);
      if (fence && fence[1].startsWith(open.marker[0]) && fence[1].length >= open.marker.length && fence[2].trim() === "") {
        open = null;
      }
    } else {
      inCode.push(false);
    }
  });
  return { lines, inCode, fences, unclosed: open };
}

/** GitHub-style heading anchors (lowercase, punctuation dropped, spaces to hyphens). */
function anchorsOf(text) {
  const { lines, inCode } = parseMarkdown(text);
  const seen = new Map();
  const anchors = new Set();
  lines.forEach((line, index) => {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!heading || inCode[index]) return;
    const base = heading[1]
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  });
  return anchors;
}

/** Markdown links outside code, as { text, target, line }. */
function linksOf(text) {
  const { lines, inCode } = parseMarkdown(text);
  const links = [];
  lines.forEach((line, index) => {
    if (inCode[index]) return;
    const prose = line.replace(/`[^`]*`/g, "");
    for (const match of prose.matchAll(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ text: match[1], target: match[2], line: index + 1 });
    }
  });
  return links;
}

/** Lines of one `## heading` section of a markdown file. */
function section(text, heading) {
  const { lines, inCode } = parseMarkdown(text);
  const start = lines.findIndex((line, index) => !inCode[index] && line === `## ${heading}`);
  if (start === -1) return [];
  let end = lines.findIndex((line, index) => index > start && !inCode[index] && /^## /.test(line));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end);
}

// 1. README structure, placement, and exact blocks.
const readme = read(README);
const readmeDoc = parseMarkdown(readme);
if (readmeDoc.lines[0] !== README_TITLE) {
  fail(README, `first line is "${readmeDoc.lines[0]}"`, `start the README with "${README_TITLE}"`);
}
const sections = readmeDoc.lines.filter((line, index) => !readmeDoc.inCode[index] && /^## /.test(line)).map((line) => line.slice(3));
if (sections.join("\n") !== README_SECTIONS.join("\n")) {
  const missing = README_SECTIONS.filter((name) => !sections.includes(name));
  const extra = sections.filter((name) => !README_SECTIONS.includes(name));
  fail(
    README,
    `## sections are [${sections.join(", ")}]` +
      (missing.length > 0 ? `; missing [${missing.join(", ")}]` : "") +
      (extra.length > 0 ? `; unexpected [${extra.join(", ")}]` : ""),
    `use exactly these ## sections in this order: ${README_SECTIONS.join(", ")} (use ### for subsections)`,
  );
}
const installLine = readmeDoc.lines.findIndex((line) => line.trim() === INSTALL_COMMAND) + 1;
if (installLine === 0 || installLine > FIRST_LINES) {
  fail(README, `"${INSTALL_COMMAND}" is ${installLine === 0 ? "missing" : `on line ${installLine}`}`, `put the install command within the first ${FIRST_LINES} lines`);
}
const firstExample = readmeDoc.fences.find((fence) => fence.lang === "ts");
if (!firstExample || firstExample.line > FIRST_LINES) {
  fail(README, `first \`\`\`ts example ${firstExample ? `starts on line ${firstExample.line}` : "is missing"}`, `start the Quick start example within the first ${FIRST_LINES} lines`);
}
if (!readme.includes(`\n${LINKS_BLOCK}\n## License`)) {
  fail(README, "the ## Links block differs from the required text or is not right before ## License", "copy the exact Links block from LINKS_BLOCK in scripts/check-docs.mjs");
}
if (!readme.endsWith(`\n${FOOTER}`)) {
  fail(README, "the README does not end with the required footer", "end the README with the exact FOOTER text in scripts/check-docs.mjs");
}

// 2. One description everywhere.
const description = JSON.parse(read("package.json")).description;
if (readmeDoc.lines[2] !== description) {
  fail(README, "line 3 differs from package.json description", `make README line 3 exactly: ${description}`);
}
const llms = read(LLMS);
if (!llms.includes(`\n> ${description}\n`)) {
  fail(LLMS, "summary line differs from package.json description", `add the line "> ${description}" under the llms.txt title`);
}
if (description.length > 160) {
  fail("package.json", `description is ${description.length} characters`, "shorten the description to 160 characters or fewer");
}
if (!llms.endsWith(`\n${ECOSYSTEM_BLOCK}`)) {
  fail(LLMS, "llms.txt does not end with the required ## Ecosystem block", "end llms.txt with the exact ECOSYSTEM_BLOCK text in scripts/check-docs.mjs");
}

// 3. Fenced code blocks carry a language tag.
for (const file of FENCED_DOCS) {
  const doc = parseMarkdown(read(file));
  for (const fence of doc.fences) {
    if (fence.lang === "") fail(`${file}:${fence.line}`, "fenced code block has no language tag", "add a language after the opening fence, e.g. ```ts or ```bash");
  }
  if (doc.unclosed) fail(`${file}:${doc.unclosed.line}`, "fenced code block is never closed", "add the closing fence");
}

// 4. Relative links and anchors resolve; link text describes the target.
const anchorCache = new Map();
const anchorsFor = (path) => {
  if (!anchorCache.has(path)) anchorCache.set(path, anchorsOf(read(path)));
  return anchorCache.get(path);
};
for (const file of LINKED_DOCS) {
  for (const { text, target, line } of linksOf(read(file))) {
    if (/^(here|click here|this|link|this link)$/i.test(text.trim())) {
      fail(`${file}:${line}`, `link text "${text}" does not describe its target`, "name the target in the link text");
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) continue;
    const [pathPart, anchor] = target.split("#");
    const path = pathPart === "" ? file : normalize(join(dirname(file), pathPart));
    if (!existsSync(path)) {
      fail(`${file}:${line}`, `link ${target} points to a missing file`, "fix the path or link the GitHub URL for repo-only files");
      continue;
    }
    if (anchor !== undefined && path.endsWith(".md") && !anchorsFor(path).has(anchor)) {
      fail(`${file}:${line}`, `link ${target} points to a missing anchor in ${path}`, `use one of the heading anchors in ${path}, or rename the heading`);
    }
  }
}

// 5. Every public export is in the README API table, linked to docs/API.md.
const clientSource = read("src/client/index.ts");
const exportsList = [
  ...[...clientSource.matchAll(/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|function|const|enum)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
  ...[...clientSource.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)].flatMap((m) => m[1].split(",").map((name) => name.trim().split(/\s+as\s+/).pop().replace(/^type\s+/, "")).filter(Boolean)),
];
const classBody = /export class Permissions[\s\S]*?\n}\n/.exec(clientSource)?.[0] ?? "";
const methods = [...classBody.matchAll(/^ {2}(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\(/gm)].map((m) => m[1]).filter((name) => name !== "constructor");
const testExports = [...read("src/test.ts").matchAll(/^export\s+(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
const componentApi = [...read("src/component/_generated/component.ts").matchAll(/^export\s+type\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
const hasConfigDefault = /^export default /m.test(read("src/component/convex.config.ts"));
const apiRows = section(readme, "API").filter((line) => line.startsWith("|"));
const required = [
  ...exportsList.map((name) => ({ name, pattern: new RegExp(`\`(?:new\\s+)?${name}\\b`) })),
  ...methods.map((name) => ({ name: `Permissions.${name}`, pattern: new RegExp(`\`[^\`]*\\b${name}\\(`) })),
  ...testExports.map((name) => ({ name: `/test ${name}`, pattern: new RegExp(`\`${name}\\b`) })),
  ...componentApi.map((name) => ({ name: `/_generated/component ${name}`, pattern: new RegExp(`\`${name}\\b`) })),
  ...(hasConfigDefault ? [{ name: "/convex.config default export", pattern: /`@vllnt\/convex-permissions\/convex\.config`/ }] : []),
];
// Match on the first column only, so a type named in another row's description does not count.
const firstCell = (line) => line.split("|")[1] ?? "";
for (const { name, pattern } of required) {
  const row = apiRows.find((line) => pattern.test(firstCell(line)));
  if (!row) {
    fail(README, `public export ${name} is missing from the ## API table`, `add a row for ${name} to the README ## API table`);
  } else if (!/\]\(\.\/docs\/API\.md#[^)]+\)/.test(row)) {
    fail(README, `the ## API row for ${name} does not link into docs/API.md`, `link the row to its ./docs/API.md#anchor reference`);
  }
}

// 6. Every error the package throws is in the README errors table.
const errorRows = section(readme, "Errors and fixes").filter((line) => line.startsWith("|")).join("\n");
const sources = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
  .split("\n")
  .filter((path) => /\.ts$/.test(path) && !/(^|\/)_generated\//.test(path) && !/\.(test|spec)\.ts$/.test(path));
const allSource = sources.map((path) => read(path)).join("\n");
for (const path of sources) {
  const source = read(path);
  for (const match of source.matchAll(/throw new Error\(\s*(["'`])((?:\\.|(?!\1).)*)\1\s*\)/g)) {
    const template = match[2];
    // Expand `${param}` from the enclosing function's call sites and `${String(CONST)}` from its regex literal.
    const enclosing = [...source.slice(0, match.index).matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)/g)].pop();
    const constants = Object.fromEntries([...source.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*(\/.+\/[a-z]*);/g)].map((m) => [m[1], m[2]]));
    let variants = [template];
    if (enclosing && template.includes(`\${${enclosing[2]}}`)) {
      const callArgs = [...allSource.matchAll(new RegExp(`${enclosing[1]}\\(\\s*"([^"]+)"`, "g"))].map((m) => m[1]);
      variants = [...new Set(callArgs)].map((arg) => template.replaceAll(`\${${enclosing[2]}}`, arg));
    }
    variants = variants.map((text) => text.replace(/\$\{String\(([A-Z_][A-Z0-9_]*)\)\}/g, (whole, name) => constants[name] ?? whole));
    for (const message of variants) {
      if (/\$\{/.test(message)) {
        fail(path, `cannot resolve the thrown message "${message}"`, "use a literal message or extend scripts/check-docs.mjs to resolve it");
      } else if (!errorRows.includes(`\`${message}\``)) {
        fail(README, `thrown error "${message}" (${path}) is missing from the ## Errors and fixes table`, `add a row with \`${message}\`, its cause, and its fix`);
      }
    }
  }
  for (const match of source.matchAll(/new ConvexError\(\s*\{[\s\S]*?code:\s*"([^"]+)"/g)) {
    if (!errorRows.includes(`"${match[1]}"`) && !errorRows.includes(`\`${match[1]}\``)) {
      fail(README, `ConvexError code ${match[1]} (${path}) is missing from the ## Errors and fixes table`, `add a row for code "${match[1]}" with its data shape, cause, and fix`);
    }
  }
}

// 7. No links to the old company domain in any tracked text file.
for (const path of execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean)) {
  if (!existsSync(path)) continue;
  const buffer = readFileSync(path);
  if (buffer.includes(0)) continue;
  buffer
    .toString("utf8")
    .split("\n")
    .forEach((line, index) => {
      if (OLD_DOMAIN.test(line)) fail(`${path}:${index + 1}`, "mentions the old vllnt company domain", "replace it with the matching https://vllnt.com URL");
    });
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`check-docs: ${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`OK    docs: ${README_SECTIONS.length} README sections, ${required.length} public exports, links, errors, and fixed blocks match`);
