import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contributeHeaderButtons } from "../client/header-button";
import type { PluginClientContext } from "@getpaseo/plugin/client";

interface Entry {
  id: string;
  name: string;
  workspaceDirectory?: string;
  projectRootPath?: string;
  archivingAt?: string | null;
  internal?: boolean;
}

interface ButtonRecord {
  id: string;
  workspaceId: string;
  button: {
    title: string;
    icon: unknown;
    label?: string;
    behavior: { kind: "action"; onPress(): void };
  };
  updates: Array<{ title?: string; label?: string }>;
  removed: boolean;
}

interface Options {
  entries?: Entry[];
  snapshot?: unknown;
  settings?: Record<string, unknown>;
}

function makeClient(options: Options = {}) {
  const entries = options.entries ?? [
    { id: "ws-1", name: "repo", workspaceDirectory: "/repo" },
  ];
  const buttons: ButtonRecord[] = [];
  const opened: Array<{ id: string; options: Record<string, string> }> = [];
  const settings = { values: options.settings ?? {} };
  let snapshotHandler: (state: { entries: Entry[] }) => void = () => {};
  let updateHandler: (message: unknown) => void = () => {};

  const client = {
    rpc: (_contract: { name: string }, _input: unknown) => {
      if (_contract.name === "git.snapshot") {
        return Promise.resolve(
          options.snapshot ?? {
            ok: true,
            value: { name: "repo", root: "/repo", branch: "main", dirty: false },
          },
        );
      }
      return Promise.resolve({ status: "ready", revision: "1", values: settings.values });
    },
    addHeaderButton: (contribution: {
      id: string;
      workspaceId: string;
      button: ButtonRecord["button"];
    }) => {
      const record: ButtonRecord = { ...contribution, updates: [], removed: false };
      buttons.push(record);
      return {
        update: (patch: { title?: string; label?: string }) => {
          record.updates.push(patch);
        },
        remove: () => {
          record.removed = true;
        },
      };
    },
    openPanel: (id: string, panelOptions: Record<string, string>) => {
      opened.push({ id, options: panelOptions });
    },
    paseo: {
      workspaces: {
        list: async (listOptions?: { subscribe?: unknown }) => ({
          entries,
          subscription: listOptions?.subscribe
            ? {
                subscribe: (handlers: {
                  snapshot: (state: { entries: Entry[] }) => void;
                  update: (message: unknown) => void;
                }) => {
                  snapshotHandler = handlers.snapshot;
                  updateHandler = handlers.update;
                },
              }
            : undefined,
        }),
      },
    },
  };

  return {
    client: client as unknown as PluginClientContext,
    buttons,
    opened,
    settings,
    pushSnapshot(next: Entry[]) {
      snapshotHandler({ entries: next });
    },
    pushUpdate() {
      updateHandler({});
    },
  };
}

/** Let the plugin's async reads settle under fake timers. */
async function settle(ms = 400) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("workspace header button", () => {
  it("registers one button per workspace before any agent exists", async () => {
    const harness = makeClient({
      entries: [
        { id: "ws-1", name: "repo", workspaceDirectory: "/repo" },
        { id: "ws-2", name: "worktree", projectRootPath: "/worktree" },
      ],
    });
    const dispose = contributeHeaderButtons(harness.client);
    await settle();

    expect(harness.buttons.map((button) => button.workspaceId)).toEqual(["ws-1", "ws-2"]);
    expect(harness.buttons.every((button) => button.id === "git-panel-header")).toBe(true);
    // The label carries a "Git ·" prefix so the button is not mistaken for a host control.
    expect(harness.buttons.map((button) => button.button.label)).toEqual(["Git · repo", "Git · worktree"]);
    dispose();
  });

  it("opens the workspace Git panel from the header button", async () => {
    const harness = makeClient();
    const dispose = contributeHeaderButtons(harness.client);
    await settle();

    harness.buttons[0]?.button.behavior.onPress();
    expect(harness.opened).toEqual([{ id: "git-panel", options: { workspaceId: "ws-1" } }]);
    dispose();
  });

  it("labels the button with the branch and marks a dirty tree", async () => {
    const harness = makeClient({
      snapshot: { ok: true, value: { name: "repo", root: "/repo", branch: "feat/x", dirty: true } },
    });
    const dispose = contributeHeaderButtons(harness.client);
    await settle();

    expect(harness.buttons[0]?.updates.at(-1)).toEqual({
      title: "Git: /repo (feat/x) *",
      label: "Git · repo (feat/x) *",
    });
    dispose();
  });

  it("keeps the host error message when git cannot answer", async () => {
    const harness = makeClient({
      snapshot: { ok: false, error: { code: "not-a-repo", message: "not a git repository" } },
    });
    const dispose = contributeHeaderButtons(harness.client);
    await settle();

    expect(harness.buttons[0]?.updates.at(-1)).toEqual({ title: "not a git repository" });
    dispose();
  });

  it("drops buttons for workspaces that left the list", async () => {
    const harness = makeClient({
      entries: [
        { id: "ws-1", name: "repo", workspaceDirectory: "/repo" },
        { id: "ws-2", name: "gone", workspaceDirectory: "/gone" },
      ],
    });
    const dispose = contributeHeaderButtons(harness.client);
    await settle();
    expect(harness.buttons).toHaveLength(2);

    harness.pushSnapshot([{ id: "ws-1", name: "repo", workspaceDirectory: "/repo" }]);
    await settle(10);

    expect(harness.buttons[1]?.removed).toBe(true);
    dispose();
  });

  it("re-reads the workspace list when the host only sends an update", async () => {
    const harness = makeClient({ entries: [] });
    const dispose = contributeHeaderButtons(harness.client);
    await settle();
    expect(harness.buttons).toHaveLength(0);

    const created = { id: "ws-3", name: "fresh", workspaceDirectory: "/fresh" };
    (harness.client.paseo as unknown as {
      workspaces: { list: () => Promise<{ entries: Entry[]; subscription?: undefined }> };
    }).workspaces.list = async () => ({ entries: [created] });
    harness.pushUpdate();
    await settle(1_000);

    expect(harness.buttons.map((button) => button.workspaceId)).toEqual(["ws-3"]);
    dispose();
  });

  it("skips archiving and internal workspaces", async () => {
    const harness = makeClient({
      entries: [
        { id: "ws-1", name: "repo", workspaceDirectory: "/repo" },
        { id: "ws-2", name: "closing", workspaceDirectory: "/closing", archivingAt: "2026-01-01" },
        { id: "ws-3", name: "hidden", workspaceDirectory: "/hidden", internal: true },
      ],
    });
    const dispose = contributeHeaderButtons(harness.client);
    await settle();

    expect(harness.buttons.map((button) => button.workspaceId)).toEqual(["ws-1"]);
    dispose();
  });

  it("stays hidden when the setting is off", async () => {
    const harness = makeClient({ settings: { showHeaderButton: false } });
    const dispose = contributeHeaderButtons(harness.client);
    await settle();

    expect(harness.buttons).toHaveLength(0);
    dispose();
  });

  it("removes every button on cleanup", async () => {
    const harness = makeClient();
    const dispose = contributeHeaderButtons(harness.client);
    await settle();

    dispose();
    expect(harness.buttons[0]?.removed).toBe(true);
  });
});
