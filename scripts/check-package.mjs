import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Fails when the npm tarball would miss the version-matched docs coding agents read from
// node_modules, ship contributor-only files, or carry llms.txt links that do not resolve inside it.
const REQUIRED = [
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "llms.txt",
  "docs/API.md",
  "src/test.ts",
];
const FORBIDDEN = [
  /^AGENTS\.md$/,
  /^ROADMAP\.md$/,
  /^CONTRIBUTING\.md$/,
  /^(example|scripts|tests?|specs?|\.github)\//,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
];
const REPO_BLOB = /^https:\/\/github\.com\/vllnt\/convex-permissions\/blob\/[^/]+\/(.+)$/;

const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  encoding: "utf8",
});
/** @type {{ files: { path: string }[] }[]} */
const [pack] = JSON.parse(output);
const packed = new Set(pack.files.map((file) => file.path));
const errors = [];

for (const path of REQUIRED) {
  if (!packed.has(path)) errors.push(`missing from tarball: ${path} (add it to package.json "files")`);
}
for (const path of packed) {
  if (FORBIDDEN.some((pattern) => pattern.test(path))) {
    errors.push(`must not ship: ${path} (exclude it from package.json "files")`);
  }
}
const llmsTargets = [...readFileSync("llms.txt", "utf8").matchAll(/\]\(([^)\s]+)\)/g)].map(
  ([, target]) => target,
);
// Every shipped docs page is listed in llms.txt, so an internal note in docs/ cannot ship unnoticed.
for (const path of packed) {
  if (path.startsWith("docs/") && !llmsTargets.includes(`./${path}`)) {
    errors.push(`${path} ships but llms.txt does not link ./${path}; link it or move it out of docs/`);
  }
}
for (const target of llmsTargets) {
  const blob = REPO_BLOB.exec(target);
  if (blob && packed.has(blob[1])) {
    errors.push(`llms.txt: ${target} ships in the tarball; link it as ./${blob[1]}`);
  }
  if (/^[a-z]+:/i.test(target) || target.startsWith("#")) continue;
  const path = target.split("#")[0];
  if (!path.startsWith("./") || !packed.has(path.slice(2))) {
    errors.push(`llms.txt: ${target} must be a ./ link to a file in the tarball`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exit(1);
}
console.log(`OK    package files: ${packed.size} packed, docs and llms.txt links present`);
