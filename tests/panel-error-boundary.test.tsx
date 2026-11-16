import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelErrorBoundary } from "../client/error-boundary";
import type { Strings } from "../client/strings";
import { rpc } from "./stubs/plugin-client";

/**
 * Regression: a render failure used to take out the whole Paseo surface, which
 * then only a full reload recovered from ("This plugin panel is unavailable.").
 * The panel must instead show the error, keep a working Retry, and report the
 * crash through `git.panel-error`.
 */

const THEME = {
  colors: {
    accent: "#0af",
    border: "#333",
    foreground: "#fff",
    foregroundMuted: "#999",
    statusDanger: "#a00",
    surface0: "#000",
    surface1: "#111",
  },
} as never;

const STRINGS = new Proxy({}, { get: (_target, key) => String(key) }) as Strings;

const reports: unknown[] = [];

function installRpc() {
  reports.length = 0;
  rpc.handler = (name) => {
    if (name === "git.panel-error") {
      return (async (input: unknown) => {
        reports.push(input);
        return { ok: true };
      }) as never;
    }
    throw new Error(`Unexpected RPC in this test: ${name}`);
  };
}

let shouldFail = true;

function Boom() {
  if (shouldFail) throw new Error("celebrate with a stack overflow");
  return <span>panel body</span>;
}

afterEach(() => {
  cleanup();
  rpc.handler = null;
});

describe("PanelErrorBoundary", () => {
  it("渲染出错时显示错误与重试，并把堆栈上报到插件日志", () => {
    installRpc();
    // React still prints the caught error to the console; keep the test output readable.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      shouldFail = true;
      render(
        <PanelErrorBoundary surface="workspace-panel" theme={THEME} strings={STRINGS}>
          <Boom />
        </PanelErrorBoundary>,
      );
      expect(screen.getByText("panelCrashed")).not.toBeNull();
      expect(screen.getByText("celebrate with a stack overflow")).not.toBeNull();
      expect(reports).toHaveLength(1);
      expect((reports[0] as { surface: string }).surface).toBe("workspace-panel");
      expect((reports[0] as { message: string }).message).toBe("celebrate with a stack overflow");
    } finally {
      spy.mockRestore();
    }
  });

  it("点重试后重新渲染子组件，不需要重载整个面板", () => {
    installRpc();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      shouldFail = true;
      render(
        <PanelErrorBoundary surface="workspace-panel" theme={THEME} strings={STRINGS}>
          <Boom />
        </PanelErrorBoundary>,
      );
      expect(screen.getByText("panelCrashed")).not.toBeNull();

      shouldFail = false;
      fireEvent.click(screen.getByLabelText("retry"));

      expect(screen.getByText("panel body")).not.toBeNull();
      expect(screen.queryByText("panelCrashed")).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
