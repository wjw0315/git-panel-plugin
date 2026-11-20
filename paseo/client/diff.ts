export type DiffLineKind = "add" | "del" | "context" | "meta";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface ParsedDiff {
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  truncated: boolean;
  oldPath: string | null;
  newPath: string | null;
}

export interface SplitCell {
  number: number;
  text: string;
  kind: "add" | "del" | "context";
}

export interface SplitRow {
  left: SplitCell | null;
  right: SplitCell | null;
  meta: string | null;
}

const MAX_LINES = 2500;

export function parseUnifiedDiff(text: string): ParsedDiff {
  const hunks: DiffHunk[] = [];
  let additions = 0;
  let deletions = 0;
  let truncated = false;
  let oldPath: string | null = null;
  let newPath: string | null = null;
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  let seenLines = 0;

  const rawLines = text.split("\n");
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();
  for (const raw of rawLines) {
    const line = raw.replace(/\r$/, "");
    if (current === null) {
      if (line.startsWith("--- ")) {
        const value = line.slice(4).trim();
        if (value !== "/dev/null") oldPath = value.replace(/^a\//, "");
      } else if (line.startsWith("+++ ")) {
        const value = line.slice(4).trim();
        if (value !== "/dev/null") newPath = value.replace(/^b\//, "");
      } else if (line.startsWith("@@")) {
        const parsed = parseHunkHeader(line);
        if (parsed) {
          current = { ...parsed, lines: [] };
          hunks.push(current);
          oldLine = parsed.oldStart;
          newLine = parsed.newStart;
        }
      }
      continue;
    }

    if (line.startsWith("@@")) {
      const parsed = parseHunkHeader(line);
      if (parsed) {
        current = { ...parsed, lines: [] };
        hunks.push(current);
        oldLine = parsed.oldStart;
        newLine = parsed.newStart;
      }
      continue;
    }
    if (line.startsWith("diff --git ")) {
      current = null;
      continue;
    }
    seenLines += 1;
    if (seenLines > MAX_LINES) {
      truncated = true;
      break;
    }

    if (line.startsWith("\\")) {
      current.lines.push({ kind: "meta", text: line });
      continue;
    }
    const marker = line[0] ?? " ";
    const body = line.slice(1);
    if (marker === "+") {
      current.lines.push({ kind: "add", text: body, newLine });
      newLine += 1;
      additions += 1;
    } else if (marker === "-") {
      current.lines.push({ kind: "del", text: body, oldLine });
      oldLine += 1;
      deletions += 1;
    } else if (marker === " ") {
      current.lines.push({ kind: "context", text: body, oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    } else if (marker === "") {
      current.lines.push({ kind: "context", text: "", oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    } else {
      current.lines.push({ kind: "meta", text: line });
    }
  }

  return { hunks, additions, deletions, truncated, oldPath, newPath };
}

function parseHunkHeader(line: string): Omit<DiffHunk, "lines"> | null {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
  if (!match) return null;
  return {
    header: line,
    oldStart: Number(match[1]),
    oldCount: match[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match[3]),
    newCount: match[4] === undefined ? 1 : Number(match[4]),
  };
}

/** Pair deletions with additions so a split view shows them side by side. */
export function toSplitRows(hunks: readonly DiffHunk[]): SplitRow[] {
  const rows: SplitRow[] = [];
  for (const hunk of hunks) {
    rows.push({ left: null, right: null, meta: hunk.header });
    let pendingDel: DiffLine[] = [];
    let pendingAdd: DiffLine[] = [];
    const flush = () => {
      const length = Math.max(pendingDel.length, pendingAdd.length);
      for (let index = 0; index < length; index += 1) {
        const del = pendingDel[index];
        const add = pendingAdd[index];
        rows.push({
          left: del
            ? { number: del.oldLine ?? 0, text: del.text, kind: "del" as const }
            : null,
          right: add
            ? { number: add.newLine ?? 0, text: add.text, kind: "add" as const }
            : null,
          meta: null,
        });
      }
      pendingDel = [];
      pendingAdd = [];
    };
    for (const line of hunk.lines) {
      if (line.kind === "del") {
        pendingDel.push(line);
      } else if (line.kind === "add") {
        pendingAdd.push(line);
      } else if (line.kind === "context") {
        flush();
        rows.push({
          left:
            line.oldLine === undefined
              ? null
              : { number: line.oldLine, text: line.text, kind: "context" as const },
          right:
            line.newLine === undefined
              ? null
              : { number: line.newLine, text: line.text, kind: "context" as const },
          meta: null,
        });
      } else {
        flush();
        rows.push({ left: null, right: null, meta: line.text });
      }
    }
    flush();
  }
  return rows;
}

export function highlightSpans(text: string): Array<{ text: string; className: string }> {
  // A lightweight tokenizer. The panel only needs readable structure, not a
  // full language grammar, and pulling a highlighter into the client bundle
  // would break Paseo's allowed-module boundary.
  const pattern =
    /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|class|interface|type|enum|import|export|from|return|if|else|for|while|switch|case|break|continue|new|await|async|try|catch|finally|throw|extends|implements|public|private|protected|static|readonly|def|lambda|fn|impl|struct|trait|use|mod|match|pub|self|None|True|False)\b)|(\b\d+(?:\.\d+)?\b)/g;
  const spans: Array<{ text: string; className: string }> = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      spans.push({ text: text.slice(last, match.index), className: "plain" });
    }
    const value = match[0];
    const className = match[1]
      ? "comment"
      : match[2]
        ? "string"
        : match[3]
          ? "keyword"
          : "number";
    spans.push({ text: value, className });
    last = match.index + value.length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), className: "plain" });
  return spans;
}
