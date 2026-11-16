import { describe, expect, it } from "vitest";
import { languageLoaderFor } from "../client/editor/languages";

describe("languageLoaderFor", () => {
  it("returns a loader for every supported extension", async () => {
    const supported = [
      "a.js",
      "a.mjs",
      "a.cjs",
      "a.ts",
      "a.tsx",
      "a.jsx",
      "a.json",
      "a.md",
      "a.markdown",
      "a.html",
      "a.css",
      "a.py",
      "a.java",
      "a.cpp",
      "a.h",
      "a.rs",
      "a.xml",
      "a.yaml",
      "a.yml",
      "a.sql",
    ];
    for (const path of supported) {
      const extension = await languageLoaderFor(path)();
      expect(extension, path).toBeTruthy();
    }
  });

  it("returns no language for unknown extensions", async () => {
    for (const path of ["a.txt", "Makefile", "a.log", "a.png"]) {
      await expect(languageLoaderFor(path)()).resolves.toBeNull();
    }
  });

  it("is case-insensitive", async () => {
    await expect(languageLoaderFor("README.MD")()).resolves.toBeTruthy();
    await expect(languageLoaderFor("Main.JAVA")()).resolves.toBeTruthy();
  });
});
