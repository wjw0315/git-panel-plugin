// 插件不依赖 @types/node（`.orca/types/tsconfig.json` 的 types 只有 orca 那几个）。
// 这里只声明本插件真正用到的 Node 接口，够 tsc 通过、不引入 node_modules。

declare const process: {
  env: Record<string, string | undefined>
  cwd(): string
}

declare module 'node:child_process' {
  export type ExecFileError = Error & { code?: string | number; killed?: boolean }
  export function execFile(
    file: string,
    args: readonly string[],
    options: {
      cwd?: string
      timeout?: number
      maxBuffer?: number
      windowsHide?: boolean
      env?: Record<string, string | undefined>
    },
    callback: (error: ExecFileError | null, stdout: string, stderr: string) => void
  ): void
}

declare module 'node:fs' {
  export type Dirent = { name: string; isDirectory(): boolean; isFile(): boolean }
  export function existsSync(path: string): boolean
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function statSync(path: string): { size: number; mtimeMs: number; isDirectory(): boolean; isFile(): boolean }
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[]
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void
  export function mkdtempSync(prefix: string): string
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
  export function writeFileSync(path: string, data: string): void
}

declare module 'node:os' {
  export function tmpdir(): string
}

declare module 'node:path' {
  export function join(...parts: string[]): string
  export function basename(path: string): string
  export function relative(from: string, to: string): string
  export function resolve(...parts: string[]): string
}
