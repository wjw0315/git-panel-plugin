import { describe, expect, it } from "vitest";
import { relativeTime, utf8Bytes } from "../client/format";

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

describe("relativeTime 在没有 Intl.RelativeTimeFormat 的运行时", () => {
  // Android Hermes（Paseo 手机端）没有 Intl.RelativeTimeFormat，
  // new undefined() 会直接把整个面板炸掉（面板渲染出错：
  // "undefined cannot be used as a constructor"）。
  function withoutRelativeTimeFormat<T>(run: () => T): T {
    const intl = globalThis.Intl as unknown as Record<string, unknown>;
    const original = intl.RelativeTimeFormat;
    delete intl.RelativeTimeFormat;
    try {
      return run();
    } finally {
      intl.RelativeTimeFormat = original;
    }
  }

  it("过去时间返回可读字符串而不抛错", () => {
    withoutRelativeTimeFormat(() => {
      const iso = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      expect(relativeTime(iso, false)).toMatch(/3 hours ago|3 hour/);
      expect(relativeTime(iso, true)).toContain("前");
    });
  });

  it("未来时间返回可读字符串而不抛错", () => {
    withoutRelativeTimeFormat(() => {
      const iso = new Date(Date.now() + 2 * 86_400 * 1000).toISOString();
      expect(relativeTime(iso, false)).toMatch(/in 2 days|2 days/);
      expect(relativeTime(iso, true)).toContain("后");
    });
  });

  it("非法输入原样返回", () => {
    withoutRelativeTimeFormat(() => {
      expect(relativeTime("not-a-date", false)).toBe("not-a-date");
    });
  });

  it("有 Intl.RelativeTimeFormat 时仍用它（桌面/web 措辞不变）", () => {
    const iso = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    expect(relativeTime(iso, false)).toBe("3 hours ago");
  });
});
