import { createHash } from "node:crypto";

export function countLines(text: string): number {
  if (text === "") return 0;
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) count += 1;
  }
  if (!text.endsWith("\n")) count += 1;
  return count;
}

export function looksBinary(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, 8192);
  for (let index = 0; index < limit; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

export function sha256(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
};

export function imageMimeForPath(path: string): string | null {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return null;
  return IMAGE_MIME[path.slice(dot + 1).toLowerCase()] ?? null;
}
