import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FilesTab } from "../client/files";
import type { Strings } from "../client/strings";
import { rpc } from "./stubs/plugin-client";

/**
 * 回归：文件页的上下文菜单 hook（useContextMenu）曾无条件
 * `window.addEventListener("keydown", ...)`。React Native（Hermes）没有
 * window/DOM，文件 tab 一挂载就抛 "undefined is not a function" 炸掉面板
 * （Paseo 手机端 2026-11-18 实测）。DOM API 必须特性检测。
 *
 * 模拟方式：jsdom 的 window 上删掉 add/removeEventListener（等价于
 * Hermes 无 DOM 事件系统的场景；真机连 window 都不存在，由守卫第一级
 * `typeof window === "undefined"` 拦截）。不整只替换 window，
 * 否则 testing-library 自身会误伤。
 */

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

const originalAdd = globalThis.window?.addEventListener;
const originalRemove = globalThis.window?.removeEventListener;

afterEach(() => {
  cleanup();
  rpc.handler = null;
  if (globalThis.window) {
    const win = globalThis.window as unknown as Record<string, unknown>;
    win.addEventListener = originalAdd;
    win.removeEventListener = originalRemove;
  }
});

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

describe("文件页在无 DOM 事件系统的 RN 运行时可挂载", () => {
  it("window 缺 addEventListener 时挂载不抛错", () => {
    const win = globalThis.window as unknown as Record<string, unknown>;
    delete win.addEventListener;
    delete win.removeEventListener;
    rpc.handler = (() => (async () => ({ entries: [], path: "", truncated: false })) as never) as never;

    render(
      <QueryClientProvider client={newClient()}>
        <FilesTab
          cwd="/repo"
          repo=""
          theme={THEME}
          strings={STRINGS}
          mode="wide"
          tab={{ setModified: () => {} } as never}
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByTestId("modal")).toBeNull();
  });
});
