import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { TS_LIKE, parseMarkdown } from "./markdown.mjs";

// Writes every ```ts block of the given markdown files to <out-dir>/<file>-L<line>.ts so
// scripts/test-package.sh can type-check each one against the packed tarball. A type
// error names the doc and the line its block starts on.
//
// A block that declares `export interface X` or `export type X` restates a package type,
// so the extractor appends a two-way type-equality assertion against the package's own
// export of X: if the doc drifts from the code, the type-check fails.
//
// Usage: node scripts/extract-doc-examples.mjs <out-dir> <file.md>...

const PACKAGE = "@vllnt/convex-permissions";
const [outDir, ...files] = process.argv.slice(2);
if (!outDir || files.length === 0) {
  console.error("usage: extract-doc-examples.mjs <out-dir> <file.md>...");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const errors = [];
let count = 0;
let asserted = 0;
for (const file of files) {
  for (const fence of parseMarkdown(readFileSync(file, "utf8")).fences) {
    if (!TS_LIKE.test(fence.lang)) continue;
    if (fence.info !== "ts") {
      errors.push(`${file}:${fence.line}: tag "${fence.info}" is TypeScript but not plain ts, so it is not type-checked; use \`\`\`ts`);
      continue;
    }
    if (!fence.closed) {
      errors.push(`${file}:${fence.line}: ts block is never closed; add the closing fence`);
      continue;
    }
    const body = fence.body.join("\n");
    const declared = [...body.matchAll(/^export\s+(?:interface|type)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    const checks = declared.map(
      (name) =>
        `import type { ${name} as __Package_${name} } from "${PACKAGE}";\n` +
        `export const __same_${name}: __Equals<${name}, __Package_${name}> = true;`,
    );
    const equals =
      checks.length === 0
        ? ""
        : "\n// Added by extract-doc-examples.mjs: the doc's declaration must equal the package export.\n" +
          "type __Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;\n" +
          `${checks.join("\n")}\n`;
    asserted += checks.length;
    writeFileSync(join(outDir, `${basename(file, ".md")}-L${fence.line}.ts`), `${body}\n${equals}`);
    count++;
  }
}
if (errors.length > 0) {
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exit(1);
}
if (count === 0) {
  console.error("FAIL no ```ts blocks found");
  process.exit(1);
}
console.log(`OK    extracted ${count} ts examples, ${asserted} type-equality assertion(s)`);
