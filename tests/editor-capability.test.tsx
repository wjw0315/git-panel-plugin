import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseDom,
  evaluateHost,
  resetCapabilityCacheForTests,
} from "../client/editor/capability";

afterEach(() => {
  resetCapabilityCacheForTests();
  vi.unstubAllGlobals();
});

describe("evaluateHost", () => {
  it("treats a document plus web platform as usable", () => {
    expect(evaluateHost({ hasDocument: true, platform: "web" })).toBe(true);
  });

  it("rejects native platforms even with a document shim", () => {
    expect(evaluateHost({ hasDocument: true, platform: "ios" })).toBe(false);
    expect(evaluateHost({ hasDocument: true, platform: "android" })).toBe(false);
  });

  it("rejects hosts without a document", () => {
    expect(evaluateHost({ hasDocument: false, platform: "web" })).toBe(false);
  });
});

describe("canUseDom", () => {
  it("is true in jsdom with a web platform stub", () => {
    expect(canUseDom()).toBe(true);
  });

  it("is false when document is missing", () => {
    resetCapabilityCacheForTests();
    vi.stubGlobal("document", undefined);
    expect(canUseDom()).toBe(false);
  });

  it("caches the first result instead of re-probing", () => {
    expect(canUseDom()).toBe(true);
    vi.stubGlobal("document", undefined);
    expect(canUseDom()).toBe(true);
    resetCapabilityCacheForTests();
    expect(canUseDom()).toBe(false);
  });
});
