import type { Strings } from "./strings";

export function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

export function dirName(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

export function relativeTime(iso: string, zh: boolean): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  const delta = Math.round((time - Date.now()) / 1000);
  const abs = Math.abs(delta);
  const formatter = new Intl.RelativeTimeFormat(zh ? "zh-CN" : "en", { numeric: "auto" });
  if (abs < 60) return formatter.format(Math.round(delta), "second");
  if (abs < 3600) return formatter.format(Math.round(delta / 60), "minute");
  if (abs < 86_400) return formatter.format(Math.round(delta / 3600), "hour");
  if (abs < 2_592_000) return formatter.format(Math.round(delta / 86_400), "day");
  if (abs < 31_536_000) return formatter.format(Math.round(delta / 2_592_000), "month");
  return formatter.format(Math.round(delta / 31_536_000), "year");
}

export function formatDate(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  return new Date(time).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export interface StatusMeta {
  letter: string;
  label: string;
  colorKey: "statusSuccess" | "statusWarning" | "statusDanger" | "accent" | "foregroundMuted";
}

export function statusMeta(
  status: "added" | "modified" | "deleted" | "renamed" | "untracked" | "conflicted" | "typechange",
  strings: Strings,
): StatusMeta {
  switch (status) {
    case "added":
      return { letter: "A", label: strings.staged, colorKey: "statusSuccess" };
    case "deleted":
      return { letter: "D", label: strings.deleted, colorKey: "statusDanger" };
    case "renamed":
      return { letter: "R", label: strings.renamed, colorKey: "accent" };
    case "untracked":
      return { letter: "U", label: strings.untracked, colorKey: "statusWarning" };
    case "conflicted":
      return { letter: "!", label: strings.conflicted, colorKey: "statusDanger" };
    case "typechange":
      return { letter: "T", label: strings.typechange, colorKey: "statusWarning" };
    default:
      return { letter: "M", label: strings.modified, colorKey: "statusWarning" };
  }
}

export function fileIconName(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif"].includes(ext)) {
    return "FileImage";
  }
  if (["json", "jsonc", "lock"].includes(ext)) return "FileJson";
  if (["yaml", "yml", "toml", "ini", "conf", "cfg", "env", "properties"].includes(ext)) {
    return "FileCog";
  }
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "mjs",
      "cjs",
      "py",
      "rb",
      "go",
      "rs",
      "java",
      "kt",
      "swift",
      "c",
      "cc",
      "cpp",
      "h",
      "hpp",
      "cs",
      "php",
      "sh",
      "bash",
      "zsh",
      "css",
      "scss",
      "html",
      "vue",
      "svelte",
    ].includes(ext)
  ) {
    return "FileCode";
  }
  if (["md", "markdown", "txt", "log", "rst"].includes(ext)) return "FileText";
  if (lower.startsWith(".env")) return "FileCog";
  return "File";
}

/**
 * UTF-8 byte length without TextEncoder: the plugin client also runs on React
 * Native, where the global is not part of the runtime.
 */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair (emoji and other astral characters): 4 bytes in total.
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
