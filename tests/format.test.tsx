import { describe, expect, it } from "vitest";
import { utf8Bytes } from "../client/format";

describe("utf8Bytes", () => {
  it("counts ascii, cjk, and surrogate pairs", () => {
    expect(utf8Bytes("abc")).toBe(3);
    expect(utf8Bytes("中文")).toBe(6);
    expect(utf8Bytes("a中")).toBe(4);
    expect(utf8Bytes("😀")).toBe(4);
    expect(utf8Bytes("a😀b")).toBe(6);
    expect(utf8Bytes("")).toBe(0);
  });
});
