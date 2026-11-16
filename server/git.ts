import { execCommand } from "@getpaseo/plugin/server";

/** A git failure that carries a stable error code for the client. */
export class GitError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface GitOptions {
  timeout?: number;
  maxBuffer?: number;
  accept?: readonly number[];
}

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  LC_ALL: "C",
  LANG: "C",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0",
  GIT_PAGER: "cat",
};

/**
 * Run git with an argv array. No shell, no string interpolation. The working
 * directory is the repository root, every command has a timeout and an output
 * ceiling, and `--literal-pathspecs` keeps user paths literal.
 */
export async function git(
  cwd: string,
  args: readonly string[],
  options: GitOptions = {},
): Promise<GitResult> {
  try {
    const result = await execCommand("git", ["--literal-pathspecs", ...args], {
      cwd,
      env: GIT_ENV,
      timeout: options.timeout ?? 20_000,
      maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
    });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const failure = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
      killed?: boolean;
    };
    const code = typeof failure.code === "number" ? failure.code : failure.killed ? -1 : 1;
    if (options.accept?.includes(code)) {
      return {
        stdout: typeof failure.stdout === "string" ? failure.stdout : "",
        stderr: typeof failure.stderr === "string" ? failure.stderr : "",
        code,
      };
    }
    const stderr = (failure.stderr ?? "").trim();
    const message = stderr || failure.message || `git ${args[0] ?? ""} failed`;
    throw new GitError(classifyGitError(message), message);
  }
}

/** Run git and return stdout, throwing a coded error on failure. */
export async function gitOut(
  cwd: string,
  args: readonly string[],
  options: GitOptions = {},
): Promise<string> {
  return (await git(cwd, args, options)).stdout;
}

export function classifyGitError(message: string): string {
  if (/CONFLICT|Automatic merge failed|needs merge|fix conflicts/i.test(message)) {
    return "conflict";
  }
  if (
    /Authentication failed|could not read Username|terminal prompts disabled|Permission denied \(publickey\)|Invalid username or password/i.test(
      message,
    )
  ) {
    return "auth-failed";
  }
  if (/\[rejected\]|non-fast-forward|fetch first|failed to push some refs/i.test(message)) {
    return "push-rejected";
  }
  if (/Not possible to fast-forward|not possible to fast-forward/i.test(message)) {
    return "not-ff";
  }
  if (/would be overwritten by checkout|Your local changes|Please commit your changes/i.test(message)) {
    return "local-changes-block";
  }
  if (/not a git repository/i.test(message)) {
    return "not-a-git-repo";
  }
  if (/unknown revision|bad revision|ambiguous argument/i.test(message)) {
    return "not-found";
  }
  if (/already exists/i.test(message)) {
    return "already-exists";
  }
  return "git-error";
}

export function firstLine(text: string): string {
  const index = text.indexOf("\n");
  return (index === -1 ? text : text.slice(0, index)).trim();
}
