import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import ts from "typescript";
import { TS_LIKE, parseMarkdown } from "./markdown.mjs";

// Fails when the docs drift from the code or from the agent-first README contract:
// README section order, install command, version line, and first permission check
// placement, fenced code languages, relative links and anchors, public exports (found
// with the TypeScript compiler) in the README API table, thrown errors (found in the
// TypeScript AST) in the README errors table, the exact Links / footer / llms.txt
// Ecosystem blocks, one shared package description, and stray links to the old company
// domain. Every failure names the fix. Run with `pnpm check:docs` (part of `pnpm lint`).

const PACKAGE = "@vllnt/convex-permissions";
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

const VERSION_LINE =
  /^These docs describe version (\S+)\. If `npm view @vllnt\/convex-permissions version` prints an older version, install `@vllnt\/convex-permissions@canary` or read the README inside your installed package\.$/;

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

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 1. README structure, placement, and exact blocks.
const readme = read(README);
const readmeDoc = parseMarkdown(readme);
const pkg = JSON.parse(read("package.json"));
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
// The version line sits in ## Install and names package.json "version", so a release PR keeps it true.
const versionMatches = section(readme, "Install").map((line) => VERSION_LINE.exec(line)).filter(Boolean);
if (versionMatches.length !== 1) {
  fail(README, `## Install has ${versionMatches.length} version lines`, `add exactly one line after the install command: "These docs describe version ${pkg.version}. If \`npm view ${PACKAGE} version\` prints an older version, install \`${PACKAGE}@canary\` or read the README inside your installed package."`);
} else if (versionMatches[0][1] !== pkg.version) {
  fail(README, `the ## Install version line says ${versionMatches[0][1]}, package.json version is ${pkg.version}`, `change the version line to "These docs describe version ${pkg.version}."`);
}
const firstCheck = readmeDoc.fences.find((fence) => fence.info === "ts" && /\.(check|require)\(/.test(fence.body.join("\n")));
if (!firstCheck || firstCheck.line > FIRST_LINES) {
  fail(README, `the first \`\`\`ts example that calls check or require ${firstCheck ? `starts on line ${firstCheck.line}` : "is missing"}`, `start the Quick start permission check within the first ${FIRST_LINES} lines`);
}
if (!readme.includes(`\n${LINKS_BLOCK}\n## License`)) {
  fail(README, "the ## Links block differs from the required text or is not right before ## License", "copy the exact Links block from LINKS_BLOCK in scripts/check-docs.mjs");
}
if (!readme.endsWith(`\n${FOOTER}`)) {
  fail(README, "the README does not end with the required footer", "end the README with the exact FOOTER text in scripts/check-docs.mjs");
}

// 2. One description everywhere.
const description = pkg.description;
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

// 3. Fenced code blocks carry a language tag; TypeScript is always plain `ts`, the only tag
// scripts/extract-doc-examples.mjs type-checks (both scripts share scripts/markdown.mjs).
for (const file of FENCED_DOCS) {
  for (const fence of parseMarkdown(read(file)).fences) {
    if (fence.lang === "") fail(`${file}:${fence.line}`, "fenced code block has no language tag", "add a language after the opening fence, e.g. ```ts or ```bash");
    if (TS_LIKE.test(fence.lang) && fence.info !== "ts") {
      fail(`${file}:${fence.line}`, `TypeScript block tagged "${fence.info}" is not type-checked`, "tag it exactly ```ts (no attributes) so pnpm test:package type-checks it");
    }
    if (!fence.closed) fail(`${file}:${fence.line}`, "fenced code block is never closed", "add the closing fence");
  }
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

// One TypeScript program over the entry points and every shipped source file.
const sourceFiles = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
  .split("\n")
  .filter((path) => /\.ts$/.test(path) && !/(^|\/)_generated\//.test(path) && !/\.(test|spec)\.ts$/.test(path));
/** package.json "exports" subpath -> source file (dist/**.d.ts and dist/**.js map back to src/**.ts). */
const entrySources = new Map();
for (const [subpath, target] of Object.entries(pkg.exports)) {
  if (subpath === "./package.json") continue;
  const file = typeof target === "string" ? target : (target.types ?? target.default);
  const source = file.replace(/^\.\/dist\//, "src/").replace(/^\.\//, "").replace(/\.d\.ts$/, ".ts").replace(/\.js$/, ".ts");
  if (!existsSync(source)) {
    fail("package.json", `exports["${subpath}"] maps to ${source}, which does not exist`, "point the export at a file built from src/, or extend the mapping in scripts/check-docs.mjs");
    continue;
  }
  const label = subpath === "." ? PACKAGE : `${PACKAGE}${subpath.slice(1)}`;
  const known = entrySources.get(source);
  if (known === undefined || label.length < known.length) entrySources.set(source, label);
}
const program = ts.createProgram([...new Set([...sourceFiles, ...entrySources.keys()])], {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: ["vite/client"],
});
const checker = program.getTypeChecker();
const sourceFileOf = (path) => program.getSourceFile(resolve(path));
const where = (node) => {
  const file = node.getSourceFile();
  return `${relative(process.cwd(), file.fileName)}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
};

// 5. Every public export is in the README API table (first column), linked to docs/API.md.
const isPublicMember = (symbol) =>
  symbol.name !== "prototype" &&
  !symbol.name.startsWith("#") &&
  !(symbol.declarations ?? []).some((declaration) =>
    (ts.getCombinedModifierFlags(declaration) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) !== 0,
  );
const required = [];
for (const [source, label] of entrySources) {
  const sourceFile = sourceFileOf(source);
  const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    fail(source, `the TypeScript program has no module for ${label}`, "fix the entry path in package.json exports or the program in scripts/check-docs.mjs");
    continue;
  }
  const sub = label === PACKAGE ? "" : label.slice(PACKAGE.length);
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const name = exported.name;
    if (name === "default") {
      required.push({ name: `${label} default export`, test: (cell) => cell.includes(`\`${label}\``) });
      continue;
    }
    const named = new RegExp(`\`(?:new\\s+)?${escapeRe(name)}[\\s(<\`]`);
    required.push({
      name: sub === "" ? name : `${name} from ${sub}`,
      test: (cell) => named.test(cell) && (sub === "" || cell.includes(`\`${sub}\``) || cell.includes(`\`${label}\``)),
    });
    const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    if (!(target.flags & ts.SymbolFlags.Class)) continue;
    const members = [
      ...checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(target)),
      ...checker.getPropertiesOfType(checker.getTypeOfSymbol(target)),
    ].filter(isPublicMember);
    for (const member of members) {
      const pattern = new RegExp(`\`(?:${escapeRe(name)}\\.)?${escapeRe(member.name)}[(<\`]`);
      required.push({ name: `${name}.${member.name}`, test: (cell) => pattern.test(cell) });
    }
  }
}
const firstCell = (line) => line.split("|")[1] ?? "";
const apiRows = section(readme, "API").filter((line) => line.startsWith("|"));
for (const { name, test } of required) {
  const row = apiRows.find((line) => test(firstCell(line)));
  if (!row) {
    fail(README, `public export ${name} is missing from the ## API table`, `add a row for ${name} to the README ## API table (name it in the first column, in backticks)`);
  } else if (!/\]\(\.\/docs\/API\.md#[^)]+\)/.test(row)) {
    fail(README, `the ## API row for ${name} does not link into docs/API.md`, `link the row to its ./docs/API.md#anchor reference`);
  }
}

// 6. Every error the shipped source can throw is in the README errors table. Messages are
// resolved from the AST: literals, + and template concatenation, module-level string or
// regex constants, String(...), and parameters of a helper whose every call site passes a
// literal. Anything else fails, so a new error cannot ship undocumented.
const errorRows = section(readme, "Errors and fixes").filter((line) => line.startsWith("|")).join("\n");
const unresolved = (node, why) =>
  fail(where(node), `cannot resolve the thrown error (${why})`, "document it in the README ## Errors and fixes table with a literal message, or extend section 6 of scripts/check-docs.mjs");
const sources = sourceFiles.map(sourceFileOf).filter(Boolean);
const functionScope = (node) => {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current)) return current;
  }
  return undefined;
};
const functionName = (fn) => {
  if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
  if (fn.parent && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) return fn.parent.name.text;
  return undefined;
};
/** Every reference to an identifier name across the sources: { call?: CallExpression, node }. */
function referencesOf(name) {
  const found = [];
  for (const file of sources) {
    const visit = (node) => {
      const declares =
        node.parent &&
        (((ts.isFunctionDeclaration(node.parent) || ts.isVariableDeclaration(node.parent)) && node.parent.name === node) ||
          ts.isImportSpecifier(node.parent) ||
          ts.isExportSpecifier(node.parent) ||
          (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node));
      if (ts.isIdentifier(node) && node.text === name && !declares) {
        const call = ts.isCallExpression(node.parent) && node.parent.expression === node ? node.parent : undefined;
        found.push({ call, node });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return found;
}
/** Module-level `const NAME = "..." | /.../` in the file of `node`. */
function moduleConstant(node, name) {
  for (const statement of node.getSourceFile().statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer) {
        const init = declaration.initializer;
        if (ts.isStringLiteralLike(init)) return init.text;
        if (ts.isRegularExpressionLiteral(init)) return init.text;
      }
    }
  }
  return undefined;
}
const cross = (lists) => lists.reduce((acc, list) => acc.flatMap((prefix) => list.map((item) => prefix + item)), [""]);
/** Possible string values of `expr`, or a { param } / { reason } marker. */
function resolveText(expr, env) {
  if (ts.isParenthesizedExpression(expr)) return resolveText(expr.expression, env);
  if (ts.isStringLiteralLike(expr)) return [expr.text];
  if (ts.isRegularExpressionLiteral(expr)) return [expr.text];
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === "String" && expr.arguments.length === 1) {
    return resolveText(expr.arguments[0], env);
  }
  const parts = [];
  if (ts.isTemplateExpression(expr)) {
    parts.push(expr.head.text);
    for (const span of expr.templateSpans) parts.push(span.expression, span.literal.text);
  } else if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    parts.push(expr.left, expr.right);
  } else if (ts.isIdentifier(expr)) {
    if (env.has(expr.text)) return [env.get(expr.text)];
    const fn = functionScope(expr);
    if (fn && fn.parameters.some((param) => ts.isIdentifier(param.name) && param.name.text === expr.text)) return { param: expr.text };
    const constant = moduleConstant(expr, expr.text);
    return constant === undefined ? { reason: `\`${expr.text}\` is not a literal, a module constant, or a helper parameter` } : [constant];
  } else {
    return { reason: `\`${expr.getText()}\` is not a literal message` };
  }
  const lists = [];
  for (const part of parts) {
    if (typeof part === "string") {
      lists.push([part]);
      continue;
    }
    const value = resolveText(part, env);
    if (!Array.isArray(value)) return value;
    lists.push(value);
  }
  return cross(lists);
}
/** Resolve a message, expanding helper parameters from every call site's literal argument. */
function resolveMessage(expr) {
  const first = resolveText(expr, new Map());
  if (Array.isArray(first) || first.reason) return first;
  const fn = functionScope(expr);
  const name = fn && functionName(fn);
  if (!name) return { reason: `parameter \`${first.param}\` belongs to an anonymous function` };
  const params = fn.parameters.map((param) => (ts.isIdentifier(param.name) ? param.name.text : ""));
  const references = referencesOf(name);
  const loose = references.find((reference) => !reference.call);
  if (loose) return { reason: `\`${name}\` is passed as a value at ${where(loose.node)}, so its message parameters cannot be resolved` };
  if (references.length === 0) return { reason: `\`${name}\` has no call site to resolve \`${first.param}\` from` };
  const messages = new Set();
  for (const { call } of references) {
    const env = new Map();
    for (const [index, param] of params.entries()) {
      const arg = call.arguments[index];
      if (arg && ts.isStringLiteralLike(arg)) env.set(param, arg.text);
    }
    const value = resolveText(expr, env);
    if (!Array.isArray(value)) {
      return { reason: value.param ? `${where(call)} passes a non-literal \`${value.param}\` to \`${name}\`` : value.reason };
    }
    value.forEach((message) => messages.add(message));
  }
  return [...messages];
}
const calleeName = (node) => (ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : undefined);
let errorCount = 0;
for (const file of sources) {
  const visit = (node) => {
    if (ts.isNewExpression(node) && calleeName(node) === "ConvexError") {
      errorCount++;
      const [data] = node.arguments ?? [];
      if (data && ts.isObjectLiteralExpression(data)) {
        const code = data.properties.find((prop) => ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) && prop.name.text === "code");
        if (!code || !ts.isStringLiteralLike(code.initializer)) {
          unresolved(node, "ConvexError data has no top-level literal `code`");
        } else if (!errorRows.includes(`"${code.initializer.text}"`) && !errorRows.includes(`\`${code.initializer.text}\``)) {
          fail(README, `ConvexError code ${code.initializer.text} (${where(node)}) is missing from the ## Errors and fixes table`, `add a row for code "${code.initializer.text}" with its data shape, cause, and fix`);
        }
      } else if (data) {
        const messages = resolveMessage(data);
        if (!Array.isArray(messages)) unresolved(node, messages.reason);
        else for (const message of messages) if (!errorRows.includes(`\`${message}\``)) fail(README, `ConvexError message "${message}" (${where(node)}) is missing from the ## Errors and fixes table`, `add a row with \`${message}\`, its cause, and its fix`);
      } else {
        unresolved(node, "ConvexError without data");
      }
    }
    if (ts.isThrowStatement(node)) {
      const thrown = node.expression;
      const constructed = (ts.isNewExpression(thrown) || ts.isCallExpression(thrown)) && calleeName(thrown);
      if (constructed === "ConvexError") {
        // Checked above.
      } else if (!constructed) {
        unresolved(node, `\`throw ${thrown.getText()}\` does not construct an error in place`);
      } else {
        errorCount++;
        const [message] = thrown.arguments ?? [];
        const messages = message ? resolveMessage(message) : { reason: `${constructed} without a message` };
        if (!Array.isArray(messages)) {
          unresolved(node, messages.reason);
        } else {
          for (const text of messages) {
            if (!errorRows.includes(`\`${text}\``)) {
              fail(README, `thrown ${constructed} "${text}" (${where(node)}) is missing from the ## Errors and fixes table`, `add a row with \`${text}\`, its cause, and its fix`);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
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
console.log(`OK    docs: ${README_SECTIONS.length} README sections, ${required.length} public exports and members, ${errorCount} thrown errors, links, and fixed blocks match`);
