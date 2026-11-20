import type { Extension } from "@codemirror/state";

/**
 * Language support is loaded on demand: the editor bundle is already the
 * heaviest part of the client, so each grammar is only evaluated when a file
 * of that type is opened.
 */
export type LanguageLoader = () => Promise<Extension | null>;

const none: LanguageLoader = async () => null;

function javascript(typescript: boolean, jsx: boolean): LanguageLoader {
  return async () => (await import("@codemirror/lang-javascript")).javascript({ typescript, jsx });
}

const LOADERS: Record<string, LanguageLoader> = {
  js: javascript(false, false),
  mjs: javascript(false, false),
  cjs: javascript(false, false),
  jsx: javascript(false, true),
  ts: javascript(true, false),
  tsx: javascript(true, true),
  json: async () => (await import("@codemirror/lang-json")).json(),
  jsonc: async () => (await import("@codemirror/lang-json")).json(),
  md: async () => (await import("@codemirror/lang-markdown")).markdown(),
  markdown: async () => (await import("@codemirror/lang-markdown")).markdown(),
  html: async () => (await import("@codemirror/lang-html")).html(),
  htm: async () => (await import("@codemirror/lang-html")).html(),
  css: async () => (await import("@codemirror/lang-css")).css(),
  scss: async () => (await import("@codemirror/lang-css")).css(),
  less: async () => (await import("@codemirror/lang-css")).css(),
  py: async () => (await import("@codemirror/lang-python")).python(),
  java: async () => (await import("@codemirror/lang-java")).java(),
  c: async () => (await import("@codemirror/lang-cpp")).cpp(),
  h: async () => (await import("@codemirror/lang-cpp")).cpp(),
  cc: async () => (await import("@codemirror/lang-cpp")).cpp(),
  cpp: async () => (await import("@codemirror/lang-cpp")).cpp(),
  hpp: async () => (await import("@codemirror/lang-cpp")).cpp(),
  rs: async () => (await import("@codemirror/lang-rust")).rust(),
  xml: async () => (await import("@codemirror/lang-xml")).xml(),
  svg: async () => (await import("@codemirror/lang-xml")).xml(),
  yaml: async () => (await import("@codemirror/lang-yaml")).yaml(),
  yml: async () => (await import("@codemirror/lang-yaml")).yaml(),
  sql: async () => (await import("@codemirror/lang-sql")).sql(),
};

function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function languageLoaderFor(path: string): LanguageLoader {
  return LOADERS[extensionOf(path)] ?? none;
}
