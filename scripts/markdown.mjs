// Fenced-code parsing shared by check-docs.mjs and extract-doc-examples.mjs, so both
// scripts agree on what a code block is. Follows CommonMark fences: ``` or ~~~, three or
// more, any indentation; a block closes on the same character, at least as long, with
// nothing after it. A block left open runs to the end of the file.

/** Tags that mean TypeScript. Docs must spell them as plain `ts` so every one is type-checked. */
export const TS_LIKE = /^(ts|typescript|tsx|mts|cts)$/i;

/**
 * @param {string} text
 * @returns {{ lines: string[], inCode: boolean[], fences: { line: number, info: string, lang: string, body: string[], closed: boolean }[] }}
 */
export function parseMarkdown(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const inCode = [];
  const fences = [];
  let open = null;
  lines.forEach((line, index) => {
    if (open === null) {
      const start = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
      // A backtick fence's info string cannot contain a backtick (CommonMark).
      if (start && !(start[2][0] === "`" && start[3].includes("`"))) {
        const info = start[3].trim();
        open = { line: index + 1, indent: start[1].length, marker: start[2], info, lang: info.split(/\s+/)[0] ?? "", body: [], closed: false };
        fences.push(open);
        inCode.push(true);
        return;
      }
      inCode.push(false);
      return;
    }
    inCode.push(true);
    const end = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
    if (end && end[1][0] === open.marker[0] && end[1].length >= open.marker.length) {
      open.closed = true;
      open = null;
      return;
    }
    // Drop up to the fence's own indentation, as CommonMark does.
    open.body.push(line.replace(new RegExp(`^ {0,${open.indent}}`), ""));
  });
  return {
    lines,
    inCode,
    fences: fences.map(({ line, info, lang, body, closed }) => ({ line, info, lang, body, closed })),
  };
}
