import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 回归：ticket 03 要求面板内每个可点击按钮都有功能提示。
 * 图标按钮由 label 兜底，文字按钮必须显式声明 hint。
 */

const FILES = ["overview.tsx", "changes.tsx", "files.tsx", "panel.tsx"];

describe("按钮提示覆盖", () => {
  it("面板内所有文字按钮都声明了 hint", () => {
    const missing: string[] = [];
    for (const file of FILES) {
      const source = readFileSync(join(process.cwd(), "client", file), "utf8");
      const pattern = /<TextButton\b[\s\S]*?\/>/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        if (!/\bhint=\{/.test(match[0])) {
          const line = source.slice(0, match.index).split("\n").length;
          missing.push(`${file}:${line}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
