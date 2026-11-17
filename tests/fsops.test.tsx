import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runFsOp, openerArgv } from "../server/fsops";

/**
 * 本仓首批服务端测试：fs-op 模块对真实临时目录直测（spec 接缝 2）。
 * 只断言外部行为（文件系统结果与错误码），不探内部实现。
 */

let root = "";
async function seed(rel: string, content: string): Promise<void> {
  const absolute = join(root, rel);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

function dirname(absolute: string): string {
  return absolute.replace(/\/[^/]+$/, "").replace(/\/$/, "");
}

const GATES = { allowEdit: true, allowSystemOpen: true };
const input = (op: Record<string, unknown>) => ({ cwd: root, repo: "", op } as never);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "gitpanel-fsop-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  root = "";
});

describe("fs-op createFile/createDir", () => {
  it("createFile 在指定目录创建空文件", async () => {
    const result = await runFsOp(input({ kind: "createFile", parentPath: "", name: "a.txt" }), GATES);
    expect(result).toEqual({ ok: true, affectedDir: "" });
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("");
  });

  it("createDir 创建目录", async () => {
    const result = await runFsOp(input({ kind: "createDir", parentPath: "", name: "docs" }), GATES);
    expect(result.ok).toBe(true);
    expect((await lstat(join(root, "docs"))).isDirectory()).toBe(true);
  });

  it("目标已存在返回 already-exists，不覆盖", async () => {
    await seed("a.txt", "keep");
    const result = await runFsOp(input({ kind: "createFile", parentPath: "", name: "a.txt" }), GATES);
    expect(result).toMatchObject({ ok: false, error: { code: "already-exists" } });
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("keep");
  });

  it("名称含路径分隔符或为 .git 被拒绝", async () => {
    expect(await runFsOp(input({ kind: "createFile", parentPath: "", name: "a/b.txt" }), GATES))
      .toMatchObject({ ok: false, error: { code: "invalid-path" } });
    expect(await runFsOp(input({ kind: "createFile", parentPath: "", name: ".." }), GATES))
      .toMatchObject({ ok: false, error: { code: "invalid-path" } });
    expect(await runFsOp(input({ kind: "createDir", parentPath: "", name: ".git" }), GATES))
      .toMatchObject({ ok: false, error: { code: "invalid-path" } });
  });

  it("父目录不存在返回 invalid-path", async () => {
    const result = await runFsOp(input({ kind: "createFile", parentPath: "nope", name: "x" }), GATES);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid-path" } });
  });
});

describe("fs-op rename", () => {
  it("同目录改名成功，affectedDir 指向父目录", async () => {
    await seed("src/old.txt", "hi");
    const result = await runFsOp(input({ kind: "rename", path: "src/old.txt", newName: "new.txt" }), GATES);
    expect(result).toEqual({ ok: true, affectedDir: "src" });
    await expect(lstat(join(root, "src/old.txt"))).rejects.toThrow();
    expect(await readFile(join(root, "src/new.txt"), "utf8")).toBe("hi");
  });

  it("目标已存在拒绝", async () => {
    await seed("a.txt", "src");
    await seed("b.txt", "dst");
    const result = await runFsOp(input({ kind: "rename", path: "a.txt", newName: "b.txt" }), GATES);
    expect(result).toMatchObject({ ok: false, error: { code: "already-exists" } });
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("src");
  });

  it("newName 非法（.git）拒绝", async () => {
    await seed("a.txt", "x");
    const result = await runFsOp(input({ kind: "rename", path: "a.txt", newName: ".git" }), GATES);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid-path" } });
  });
});

describe("fs-op delete", () => {
  it("删除文件与递归删除文件夹", async () => {
    await seed("f.txt", "x");
    await seed("d/inner.txt", "y");
    expect((await runFsOp(input({ kind: "delete", path: "f.txt" }), GATES)).ok).toBe(true);
    expect((await runFsOp(input({ kind: "delete", path: "d" }), GATES)).ok).toBe(true);
    await expect(lstat(join(root, "f.txt"))).rejects.toThrow();
    await expect(lstat(join(root, "d"))).rejects.toThrow();
  });

  it("删除嵌套 Git 仓库被拒绝", async () => {
    await seed("sub/.git/HEAD", "ref: refs/heads/main");
    const result = await runFsOp(input({ kind: "delete", path: "sub" }), GATES);
    expect(result).toMatchObject({ ok: false, error: { code: "nested-repo" } });
    expect((await lstat(join(root, "sub"))).isDirectory()).toBe(true);
  });

  it("删除 .git 本体被拒绝", async () => {
    await seed(".git/HEAD", "ref:");
    const result = await runFsOp(input({ kind: "delete", path: ".git" }), GATES);
    expect(result).toMatchObject({ ok: false, error: { code: "write-denied" } });
  });
});

describe("fs-op upload", () => {
  it("base64 内容落盘", async () => {
    const content = Buffer.from("hello upload").toString("base64");
    const result = await runFsOp(input({ kind: "upload", parentPath: "", name: "pic.bin", contentBase64: content }), GATES);
    expect(result.ok).toBe(true);
    expect(await readFile(join(root, "pic.bin"), "utf8")).toBe("hello upload");
  });

  it("超过 16 MiB 返回 too-large", async () => {
    const big = Buffer.alloc(16 * 1024 * 1024 + 1).toString("base64");
    const result = await runFsOp(input({ kind: "upload", parentPath: "", name: "big.bin", contentBase64: big }), GATES);
    expect(result).toMatchObject({ ok: false, error: { code: "too-large" } });
  });

  it("目标已存在拒绝", async () => {
    await seed("a.txt", "keep");
    const result = await runFsOp(input({ kind: "upload", parentPath: "", name: "a.txt", contentBase64: "aGk=" }), GATES);
    expect(result).toMatchObject({ ok: false, error: { code: "already-exists" } });
  });
});

describe("fs-op 设置闸门", () => {
  it("allowEdit=false 时写操作返回 edit-disabled", async () => {
    const result = await runFsOp(input({ kind: "createFile", parentPath: "", name: "x.txt" }), {
      allowEdit: false,
      allowSystemOpen: true,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "edit-disabled" } });
  });

  it("allowSystemOpen=false 时 reveal 返回 edit-disabled 闸码", async () => {
    await seed("a.txt", "x");
    const result = await runFsOp(input({ kind: "reveal", path: "a.txt" }), {
      allowEdit: true,
      allowSystemOpen: false,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "edit-disabled" } });
  });
});

describe("opener argv 构造（平台断言，spawn 打桩不真开）", () => {
  const originalPlatform = process.platform;
  it("darwin: reveal 用 open -R，open 用 open", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    expect(openerArgv("reveal", "/repo/a.txt")).toEqual(["open", "-R", "/repo/a.txt"]);
    expect(openerArgv("open", "/repo/a.txt")).toEqual(["open", "/repo/a.txt"]);
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });
  it("linux: xdg-open", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    expect(openerArgv("open", "/repo/a.txt")).toEqual(["xdg-open", "/repo/a.txt"]);
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });
  it("win32: explorer /select,", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    expect(openerArgv("reveal", "C:\\repo\\a.txt")).toEqual(["explorer", "/select,C:\\repo\\a.txt"]);
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });
});
