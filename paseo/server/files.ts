import { readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { z } from "zod";
import {
  MAX_FILE_BYTES,
  isEditablePath,
  type dirListRpc,
  type fileContentRpc,
  type fileWriteRpc,
} from "../shared/git";
import { git } from "./git";
import { assertSafeRelative, realInside } from "./paths";
import { resolveFilesRoot } from "./repos";
import { imageMimeForPath, looksBinary, sha256 } from "./text";

type DirListInput = z.output<typeof dirListRpc.input>;
type FileContentInput = z.output<typeof fileContentRpc.input>;
type FileWriteInput = z.output<typeof fileWriteRpc.input>;

const MAX_DIR_ENTRIES = 500;
const MAX_DIR_SIZE_STATS = 300;
const MAX_IGNORE_PATHS = 300;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function listDirectory(input: DirListInput) {
  const root = await resolveFilesRoot(input.cwd, input.repo);
  const directory = input.path === "" ? root : await realInside(root, input.path);
  const entries = await readdir(directory, { withFileTypes: true });
  const visible = entries.filter((entry) => entry.name !== ".git");
  const truncated = visible.length > MAX_DIR_ENTRIES;
  const shown = truncated ? visible.slice(0, MAX_DIR_ENTRIES) : visible;

  const names = shown.map((entry) => entry.name);
  let ignored = new Set<string>();
  if (names.length > 0) {
    const rels = names
      .slice(0, MAX_IGNORE_PATHS)
      .map((name) => (input.path === "" ? name : `${input.path}/${name}`));
    try {
      const checked = await git(root, ["check-ignore", "-z", "--", ...rels], {
        accept: [0, 1, 128],
        timeout: 3_000,
      });
      if (checked.code === 0 && checked.stdout !== "") {
        ignored = new Set(checked.stdout.split("\0").filter(Boolean));
      }
    } catch {
      // The file browser also works outside a Git repository.
    }
  }

  const result = await Promise.all(
    shown.map(async (entry, index) => {
      const rel = input.path === "" ? entry.name : `${input.path}/${entry.name}`;
      let size: number | undefined;
      if (!entry.isDirectory() && index < MAX_DIR_SIZE_STATS) {
        try {
          size = (await stat(join(directory, entry.name))).size;
        } catch {
          size = undefined;
        }
      }
      return {
        name: entry.name,
        dir: entry.isDirectory(),
        ...(size !== undefined ? { size } : {}),
        ...(ignored.has(rel) ? { ignored: true } : {}),
      };
    }),
  );

  result.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { path: input.path, root, entries: result, truncated };
}

export async function getFileContent(input: FileContentInput, allowEdit: boolean) {
  const root = await resolveFilesRoot(input.cwd, input.repo);
  const absolute = await realInside(root, input.path);
  const info = await stat(absolute);
  if (!info.isFile()) {
    return { ok: false as const, error: { code: "invalid-path", message: "Not a file" } };
  }

  const mime = imageMimeForPath(input.path);
  const tooLarge = info.size > MAX_FILE_BYTES && mime === null;
  const imageTooLarge = info.size > MAX_IMAGE_BYTES;
  if (tooLarge) {
    return {
      ok: true as const,
      path: input.path,
      variant: "text" as const,
      size: info.size,
      mtimeMs: info.mtimeMs,
      sha256: "",
      editable: false,
      tooLarge: true,
    };
  }

  const buffer = await readFile(absolute);
  const digest = sha256(buffer);
  if (mime && !imageTooLarge) {
    return {
      ok: true as const,
      path: input.path,
      variant: "image" as const,
      dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
      mime,
      size: info.size,
      mtimeMs: info.mtimeMs,
      sha256: digest,
      editable: false,
      tooLarge: false,
    };
  }

  if (looksBinary(buffer)) {
    return {
      ok: true as const,
      path: input.path,
      variant: "binary" as const,
      size: info.size,
      mtimeMs: info.mtimeMs,
      sha256: digest,
      editable: false,
      tooLarge: imageTooLarge,
    };
  }

  return {
    ok: true as const,
    path: input.path,
    variant: "text" as const,
    content: buffer.toString("utf8"),
    size: info.size,
    mtimeMs: info.mtimeMs,
    sha256: digest,
    editable: allowEdit && isEditablePath(input.path),
    tooLarge: false,
  };
}

export async function writeFileContent(input: FileWriteInput, allowEdit: boolean) {
  if (!allowEdit) {
    return {
      ok: false as const,
      error: { code: "edit-disabled", message: "File editing is disabled in plugin settings" },
    };
  }
  assertSafeRelative(input.path);
  if (!isEditablePath(input.path)) {
    return {
      ok: false as const,
      error: { code: "not-editable", message: "This file type is not editable" },
    };
  }
  const bytes = Buffer.byteLength(input.content, "utf8");
  if (bytes > MAX_FILE_BYTES) {
    return {
      ok: false as const,
      error: { code: "too-large", message: "File is larger than the 2 MiB edit limit" },
    };
  }

  const root = await resolveFilesRoot(input.cwd, input.repo);
  const absolute = await realInside(root, input.path);
  const info = await stat(absolute);
  if (!info.isFile()) {
    return { ok: false as const, error: { code: "invalid-path", message: "Not a file" } };
  }
  const current = await readFile(absolute);
  if (sha256(current) !== input.baseSha) {
    return {
      ok: false as const,
      error: {
        code: "file-changed",
        message: "The file changed on disk while you were editing; reload before saving",
      },
    };
  }

  const directory = join(absolute, "..");
  const temporary = join(
    directory,
    `.${basename(absolute)}.gitpanel-${process.pid}-${Date.now()}.tmp`,
  );
  try {
    await writeFile(temporary, input.content, { mode: info.mode });
    await rename(temporary, absolute);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    return {
      ok: false as const,
      error: {
        code: "write-failed",
        message: error instanceof Error ? error.message : "Could not write the file",
      },
    };
  }
  return { ok: true as const, sha256: sha256(Buffer.from(input.content, "utf8")) };
}
