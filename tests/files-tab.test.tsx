import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FilesTab } from "../client/files";
import type { Strings } from "../client/strings";
import { rpc, type RpcHandler } from "./stubs/plugin-client";

/**
 * Regression: switching GIT-panel tabs unmounts `FilesTab` (panel.tsx renders it
 * conditionally), so coming back re-mounts it with the directory listing already
 * cached. The cached rows must survive that re-mount.
 */

type Entry = { name: string; dir: boolean; size?: number };

const THEME = {
  colors: {
    accent: "#0af",
    border: "#333",
    foreground: "#fff",
    foregroundMuted: "#999",
    statusDanger: "#a00",
    statusSuccess: "#0a0",
    statusWarning: "#a80",
    surface0: "#000",
    surface1: "#111",
    surface2: "#222",
  },
} as never;

const STRINGS = new Proxy({}, { get: (_target, key) => String(key) }) as Strings;

const DIR_ENTRIES: Record<string, Entry[]> = {
  "": [
    { name: "src", dir: true },
    { name: "README.md", dir: false, size: 12 },
  ],
  nested: [{ name: "nested-entry", dir: false, size: 3 }],
};

function dirHandler(): RpcHandler {
  return (async (input: { repo: string; path: string }) => {
    const root = input.repo === "" ? "" : input.repo;
    const entries = input.path === "" ? (DIR_ENTRIES[root] ?? []) : [];
    return { path: input.path, entries, truncated: false };
  }) as unknown as RpcHandler;
}

function fileHandler(): RpcHandler {
  return (async (input: { path: string }) => ({
    ok: true,
    path: input.path,
    variant: "text",
    content: `# ${input.path}`,
    size: 10,
    mtimeMs: 0,
    sha256: "sha",
    editable: false,
    tooLarge: false,
  })) as unknown as RpcHandler;
}

function installRpc() {
  rpc.handler = (name) => {
    if (name === "git.dir-list") return dirHandler();
    if (name === "git.file-content") return fileHandler();
    throw new Error(`Unexpected RPC in this test: ${name}`);
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function mount(client: QueryClient, repo: string) {
  return render(
    <QueryClientProvider client={client}>
      <FilesTab
        cwd="/repo"
        repo={repo}
        theme={THEME}
        strings={STRINGS}
        wide
        tab={{ setModified: () => {} } as never}
      />
    </QueryClientProvider>,
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}

afterEach(() => {
  cleanup();
  rpc.handler = null;
});

describe("FilesTab 目录树的挂载行为", () => {
  it("切走再切回（重新挂载）后仍然显示文件树", async () => {
    installRpc();
    const client = newClient();

    const first = mount(client, "");
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();
    first.unmount();

    mount(client, "");
    await settle();

    expect(screen.queryByText("src")).not.toBeNull();
    expect(screen.queryByText("README.md")).not.toBeNull();
  });

  it("点击刷新后仍然显示文件树", async () => {
    installRpc();
    const client = newClient();

    mount(client, "");
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();

    fireEvent.click(screen.getByLabelText("refresh"));
    await settle();

    expect(screen.queryByText("src")).not.toBeNull();
    expect(screen.queryByText("README.md")).not.toBeNull();
  });

  it("切换仓库时仍然重置为新的仓库内容", async () => {
    installRpc();
    const client = newClient();

    const view = mount(client, "");
    expect(await screen.findByText("src")).toBeTruthy();
    await settle();

    view.unmount();
    mount(client, "nested");

    expect(await screen.findByText("nested-entry")).toBeTruthy();
    expect(screen.queryByText("src")).toBeNull();
  });
});
