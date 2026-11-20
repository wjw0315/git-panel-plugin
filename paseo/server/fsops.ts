import { spawn } from "node:child_process";
import { lstat, mkdir, rename, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import type { z } from "zod";
import { GitError } from "./git";
import { isInside, realInside } from "./paths";
import { resolveFilesRoot } from "./repos";
import type { fsOpSchema } from "../shared/git";

type FsOpInput = z.output<typeof fsOpSchema>;
type Op = FsOpInput;

/** 上传体积上限（独立于文本编辑的 2 MiB 上限，spec 决策：16 MiB）。 */
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

/** 目标目录（仓库相对）转 POSIX 供客户端局部刷新树。 */
function toAffectedDir(path: string): string {
  const normalized = path.split(sep).join("/").replace(/^\/+|\/+$/g, "");
  return normalized;
}

/** 纯名称校验：拒绝 .、..、.git、含分隔符或 NUL 的名字。 */
function assertSafeName(name: string): void {
  if (name === "" || name === "." || name === ".." || name === ".git") {
    throw new GitError("invalid-path", `Invalid name: ${name}`);
  }
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
    throw new GitError("invalid-path", "Name must not contain path separators");
  }
}

/** 删除前嵌套仓库防护：目标自身是 Git 仓库时拒绝（仓库里的历史会被整目录 rm 破坏）。 */
async function assertNotNestedRepo(absolute: string): Promise<void> {
  try {
    const info = await lstat(join(absolute, ".git"));
    if (info) {
      throw new GitError(
        "nested-repo",
        "Target is a Git repository; remove it from a terminal instead",
      );
    }
  } catch (error) {
    if (error instanceof GitError) throw error;
  }
}

async function assertAbsents(absolute: string, message: string): Promise<void> {
  try {
    await lstat(absolute);
    throw new GitError("already-exists", message);
  } catch (error) {
    if (error instanceof GitError) throw error;
  }
}

async function assertDirectory(absolute: string): Promise<void> {
  const info = await lstat(absolute).catch(() => null);
  if (!info || !info.isDirectory()) {
    throw new GitError("invalid-path", "Parent is not a directory");
  }
}

async function resolveTargetDir(root: string, parentPath: string): Promise<string> {
  const directory = parentPath === "" ? root : await realInside(root, parentPath);
  await assertDirectory(directory);
  return directory;
}

/** 解析仓库内目标路径并证明不逃逸（realInside 兼做符号链接校验）。 */
async function resolveExistingInside(root: string, path: string): Promise<string> {
  return realInside(root, path);
}

/** 构造平台系统打开器 argv；不支持的平台抛 opener-unavailable。 */
export function openerArgv(kind: "reveal" | "open", absolute: string): string[] {
  const platform = process.platform;
  if (platform === "darwin") {
    return kind === "reveal" ? ["open", "-R", absolute] : ["open", absolute];
  }
  if (platform === "linux") {
    return ["xdg-open", absolute];
  }
  if (platform === "win32") {
    return kind === "reveal" ? ["explorer", `/select,${absolute}`] : ["explorer", absolute];
  }
  throw new GitError("opener-unavailable", `No system opener on ${platform}`);
}

function spawnOpener(argv: string[]): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    try {
      const child = spawn(argv[0]!, argv.slice(1), { stdio: "ignore" });
      child.once("error", (error) => {
        rejectPromise(
          new GitError(
            "opener-unavailable",
            error instanceof Error ? error.message : "Could not launch system opener",
          ),
        );
      });
      child.once("spawn", () => resolvePromise());
      // 打开器成功拉起后即可脱离等待；失败由 error 事件上报。
      child.unref();
    } catch (error) {
      rejectPromise(
        new GitError(
          "opener-unavailable",
          error instanceof Error ? error.message : "Could not launch system opener",
        ),
      );
    }
  });
}

/** symlink 目标逃逸防护：realInside 已覆盖既有路径；新建目录树时由 mkdir 自身限定在父目录内。 */
async function realpathGuard(root: string, absolute: string): Promise<void> {
  const real = await realpath(absolute).catch(() => absolute);
  if (!isInside(root, real)) {
    throw new GitError("write-denied", "Path resolves outside the repository");
  }
}

type FsOpResult =
  | { ok: true; affectedDir: string }
  | { ok: false; error: { code: string; message: string } };

function fail(error: unknown): FsOpResult {
  if (error instanceof GitError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  const value = error as { code?: unknown; message?: unknown };
  return {
    ok: false,
    error: {
      code: typeof value.code === "string" ? value.code : "fs-error",
      message: typeof value.message === "string" ? value.message : "File operation failed",
    },
  };
}

/** 入口统一返回错误 union（不向 RPC 层抛错）；内部实现直接 throw GitError 表达失败。 */
export async function runFsOp(
  input: { cwd: string; repo: string; op: Op },
  gates: { allowEdit: boolean; allowSystemOpen: boolean },
): Promise<FsOpResult> {
  try {
    return await runFsOpInner(input, gates);
  } catch (error) {
    return fail(error);
  }
}

async function runFsOpInner(
  input: { cwd: string; repo: string; op: Op },
  gates: { allowEdit: boolean; allowSystemOpen: boolean },
): Promise<{ ok: true; affectedDir: string }> {
  const root = await resolveFilesRoot(input.cwd, input.repo);
  const op = input.op;

  switch (op.kind) {
    case "createFile": {
      if (!gates.allowEdit) {
        throw new GitError("edit-disabled", "File editing is disabled in plugin settings");
      }
      assertSafeName(op.name);
      const directory = await resolveTargetDir(root, op.parentPath);
      const target = join(directory, op.name);
      await assertAbsents(target, `${op.name} already exists`);
      await writeFile(target, "", { flag: "wx" });
      return { ok: true, affectedDir: toAffectedDir(op.parentPath) };
    }
    case "createDir": {
      if (!gates.allowEdit) {
        throw new GitError("edit-disabled", "File editing is disabled in plugin settings");
      }
      assertSafeName(op.name);
      const directory = await resolveTargetDir(root, op.parentPath);
      const target = join(directory, op.name);
      await assertAbsents(target, `${op.name} already exists`);
      await mkdir(target);
      await realpathGuard(root, target);
      return { ok: true, affectedDir: toAffectedDir(op.parentPath) };
    }
    case "rename": {
      if (!gates.allowEdit) {
        throw new GitError("edit-disabled", "File editing is disabled in plugin settings");
      }
      assertSafeName(op.newName);
      const source = await resolveExistingInside(root, op.path);
      const parent = dirname(source);
      const target = join(parent, op.newName);
      if (!isInside(root, target)) {
        throw new GitError("invalid-path", "Path escapes the repository");
      }
      await assertAbsents(target, `${op.newName} already exists`);
      await rename(source, target);
      const affected = toAffectedDir(dirname(op.path.split(sep).join("/")));
      return { ok: true, affectedDir: affected === "." ? "" : affected.replace(/\/$/, "") };
    }
    case "delete": {
      if (!gates.allowEdit) {
        throw new GitError("edit-disabled", "File editing is disabled in plugin settings");
      }
      const target = await resolveExistingInside(root, op.path);
      const info = await lstat(target);
      if (info.isDirectory()) {
        await assertNotNestedRepo(target);
        await rm(target, { recursive: true });
      } else {
        await rm(target);
      }
      const affected = toAffectedDir(dirname(op.path.split(sep).join("/")));
      return { ok: true, affectedDir: affected === "." ? "" : affected.replace(/\/$/, "") };
    }
    case "upload": {
      if (!gates.allowEdit) {
        throw new GitError("edit-disabled", "File editing is disabled in plugin settings");
      }
      assertSafeName(op.name);
      const directory = await resolveTargetDir(root, op.parentPath);
      const target = join(directory, op.name);
      await assertAbsents(target, `${op.name} already exists`);
      const bytes = Buffer.from(op.contentBase64, "base64");
      if (bytes.length === 0) {
        throw new GitError("invalid-path", "Upload content is empty");
      }
      if (bytes.length > MAX_UPLOAD_BYTES) {
        throw new GitError(
          "too-large",
          `Upload is larger than the 16 MiB limit (${Math.ceil(bytes.length / 1024 / 1024)} MiB)`,
        );
      }
      await writeFile(target, bytes, { flag: "wx" });
      return { ok: true, affectedDir: toAffectedDir(op.parentPath) };
    }
    case "reveal":
    case "open": {
      if (!gates.allowSystemOpen) {
        throw new GitError("edit-disabled", "System openers are disabled in plugin settings");
      }
      const target = await resolveExistingInside(root, op.path);
      await spawnOpener(openerArgv(op.kind, target));
      const affected = toAffectedDir(dirname(op.path.split(sep).join("/")));
      return { ok: true, affectedDir: affected === "." ? "" : affected.replace(/\/$/, "") };
    }
  }
}
