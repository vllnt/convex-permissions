import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

// Writes every ```ts block of the given markdown files to <out-dir>/<file>-L<line>.ts so
// scripts/test-package.sh can type-check each one against the packed tarball. A type
// error names the doc and the line its block starts on.
// Usage: node scripts/extract-doc-examples.mjs <out-dir> <file.md>...

const [outDir, ...files] = process.argv.slice(2);
if (!outDir || files.length === 0) {
  console.error("usage: extract-doc-examples.mjs <out-dir> <file.md>...");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

let count = 0;
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  let block = null;
  lines.forEach((line, index) => {
    if (block === null) {
      const open = /^```(\S*)\s*$/.exec(line);
      if (open) block = { lang: open[1], start: index + 1, body: [] };
      return;
    }
    if (/^```\s*$/.test(line)) {
      if (block.lang === "ts") {
        const name = `${basename(file, ".md")}-L${block.start}.ts`;
        writeFileSync(join(outDir, name), `${block.body.join("\n")}\n`);
        count++;
      }
      block = null;
      return;
    }
    block.body.push(line);
  });
}
if (count === 0) {
  console.error("extract-doc-examples: no ```ts blocks found");
  process.exit(1);
}
console.log(`OK    extracted ${count} ts examples`);
