import { settingsRpc } from "@getpaseo/plugin";
import type {
  PluginButtonIconProps,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useSyncExternalStore } from "react";
import { View } from "react-native";
import { gitPanelSettings, snapshotRpc } from "../shared/git";

/**
 * Workspace-level entry point for the Git panel.
 *
 * Paseo draws the composer track bar — and with it every composer pill — only
 * once an agent exists (`hasActiveComposer && !draft`). A brand-new agent draft
 * therefore shows nothing at all, not even Paseo's own diff-stat pill. A header
 * button is workspace-scoped and painted with the workspace chrome, so the panel
 * stays reachable before the first message is sent.
 */

type MarkerStatus = "clean" | "dirty" | "unknown";

interface MarkerState {
  title: string;
  status: MarkerStatus;
}

const DEFAULT_TITLE = "Git panel";
const UNKNOWN: MarkerState = { title: DEFAULT_TITLE, status: "unknown" };
const states = new Map<string, MarkerState>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setMarkerState(workspaceId: string, state: MarkerState) {
  states.set(workspaceId, state);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readMarkerState(workspaceId: string): MarkerState {
  return states.get(workspaceId) ?? UNKNOWN;
}

function baseName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function statusColor(status: MarkerStatus): string {
  return status === "clean" ? "#2EA043" : status === "dirty" ? "#D29922" : "#8B949E";
}

/** Branch glyph plus a working-tree dot. */
function HeaderIcon(props: PluginButtonIconProps) {
  const workspaceId = props.context === "workspace" ? props.workspaceId : "";
  const state = useSyncExternalStore(
    subscribe,
    () => readMarkerState(workspaceId),
    () => readMarkerState(workspaceId),
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <Icon name="GitBranch" size={props.size} color={props.color} />
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: statusColor(state.status),
        }}
      />
    </View>
  );
}

interface WorkspaceEntry {
  id: string;
  name?: string;
  workspaceDirectory?: string;
  projectRootPath?: string;
  archivingAt?: string | null;
  internal?: boolean;
}

interface WorkspaceList {
  entries?: WorkspaceEntry[];
  subscription?: {
    subscribe(handlers: {
      snapshot(state: { entries?: WorkspaceEntry[] }): void;
      /** Shape of a workspace update is host-owned; a fresh list is the safe read. */
      update(message: unknown): void;
    }): void;
  };
}

interface Registration {
  cwd: string;
  button: PluginButtonRegistration;
}

export function contributeHeaderButtons(client: PluginClientContext): () => void {
  const registrations = new Map<string, Registration>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const inflight = new Set<string>();
  const lifetime = new AbortController();
  let stopped = false;
  let enabled = true;
  let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

  const queueRefresh = (workspaceId: string, cwd: string, delay = 0) => {
    const existing = pending.get(workspaceId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      pending.delete(workspaceId);
      void refresh(workspaceId, cwd);
    }, delay);
    pending.set(workspaceId, timer);
  };

  const remove = (workspaceId: string) => {
    const timer = pending.get(workspaceId);
    if (timer) clearTimeout(timer);
    pending.delete(workspaceId);
    registrations.get(workspaceId)?.button.remove();
    registrations.delete(workspaceId);
    if (states.delete(workspaceId)) emit();
  };

  async function refresh(workspaceId: string, cwd: string) {
    if (stopped || inflight.has(workspaceId)) return;
    inflight.add(workspaceId);
    try {
      const result = await client.rpc(snapshotRpc, { cwd, repo: "" });
      if (stopped) return;
      const registration = registrations.get(workspaceId);
      // The workspace may have moved or been dropped while git was running.
      if (!registration || registration.cwd !== cwd) return;
      if (!result.ok) {
        const title = result.error.message;
        setMarkerState(workspaceId, { title, status: "unknown" });
        registration.button.update({ title });
        return;
      }
      const snapshot = result.value;
      const branch = snapshot.branch ?? "HEAD";
      const label = `Git · ${snapshot.name} (${branch})${snapshot.dirty ? " *" : ""}`;
      const title = `Git: ${snapshot.root} (${branch})${snapshot.dirty ? " *" : ""}`;
      setMarkerState(workspaceId, { title, status: snapshot.dirty ? "dirty" : "clean" });
      registration.button.update({ title, label });
    } catch {
      // A workspace that moved or a host that went away keeps its last title.
    } finally {
      inflight.delete(workspaceId);
    }
  }

  const reconcile = (entries: WorkspaceEntry[] | undefined) => {
    if (stopped) return;
    const seen = new Set<string>();
    let index = 0;
    for (const entry of entries ?? []) {
      const cwd = entry.workspaceDirectory ?? entry.projectRootPath ?? "";
      if (!entry.id || !cwd || entry.archivingAt || entry.internal) continue;
      seen.add(entry.id);
      const existing = registrations.get(entry.id);
      if (existing && existing.cwd === cwd) {
        index += 1;
        continue;
      }
      if (existing) remove(entry.id);
      if (!enabled) continue;
      try {
        const label = `Git · ${entry.name || baseName(cwd)}`;
        const title = `Git: ${label}`;
        const button = client.addHeaderButton({
          id: "git-panel-header",
          workspaceId: entry.id,
          button: {
            title,
            label,
            icon: HeaderIcon,
            behavior: {
              kind: "action",
              onPress() {
                client.openPanel("git-panel", { workspaceId: entry.id });
              },
            },
          },
        });
        registrations.set(entry.id, { cwd, button });
        setMarkerState(entry.id, { title, status: "unknown" });
        // Stagger cold-start polls so a fleet of workspaces does not run git at once.
        queueRefresh(entry.id, cwd, Math.min(index, 8) * 300);
      } catch (error) {
        console.error("Git panel: header button registration failed", error);
        continue;
      }
      index += 1;
    }
    for (const workspaceId of [...registrations.keys()]) {
      if (!seen.has(workspaceId)) remove(workspaceId);
    }
  };

  async function listWorkspaces() {
    if (stopped) return;
    try {
      const result = (await client.paseo.workspaces.list({})) as WorkspaceList;
      if (stopped) return;
      reconcile(result?.entries);
    } catch {
      // A host without the workspace list keeps the composer pill only.
    }
  }

  const scheduleReconcile = () => {
    if (stopped || reconcileTimer) return;
    reconcileTimer = setTimeout(() => {
      reconcileTimer = null;
      void listWorkspaces();
    }, 500);
  };

  async function readSettings() {
    try {
      const state = await client.rpc(settingsRpc("git-panel").read, {});
      if (stopped) return;
      const parsed =
        state.status === "ready" ? gitPanelSettings.schema.safeParse(state.values) : null;
      const next = parsed?.success ? parsed.data.showHeaderButton : true;
      if (next === enabled) return;
      enabled = next;
      if (!enabled) {
        for (const workspaceId of [...registrations.keys()]) remove(workspaceId);
      } else {
        await listWorkspaces();
      }
    } catch {
      // Settings are optional; the header button defaults to visible.
    }
  }

  const timer = setInterval(() => {
    for (const [workspaceId, registration] of registrations) {
      queueRefresh(workspaceId, registration.cwd);
    }
  }, 60_000);

  const settingsTimer = setInterval(() => {
    void readSettings();
  }, 15_000);

  void readSettings();

  void client.paseo.workspaces
    .list({ subscribe: {} })
    .then((result: unknown) => {
      if (stopped) return;
      const list = result as WorkspaceList;
      reconcile(list?.entries);
      list?.subscription?.subscribe({
        snapshot: ({ entries }) => reconcile(entries),
        update: () => scheduleReconcile(),
      });
    })
    .catch((error: unknown) => {
      if (!stopped) console.error("Git panel: workspace observation failed", error);
    });

  return () => {
    stopped = true;
    lifetime.abort();
    clearInterval(timer);
    clearInterval(settingsTimer);
    if (reconcileTimer) clearTimeout(reconcileTimer);
    for (const pendingTimer of pending.values()) clearTimeout(pendingTimer);
    pending.clear();
    for (const registration of registrations.values()) registration.button.remove();
    registrations.clear();
    states.clear();
    listeners.clear();
  };
}
