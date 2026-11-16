import { settingsRpc } from "@getpaseo/plugin";
import type {
  PluginButtonIconProps,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { useSyncExternalStore } from "react";
import { View } from "react-native";
import { gitPanelSettings, snapshotRpc } from "../shared/git";

type PillStatus = "clean" | "dirty" | "unknown";

interface PillState {
  label: string;
  title: string;
  status: PillStatus;
}

const UNKNOWN: PillState = { label: "", title: "Git", status: "unknown" };
const states = new Map<string, PillState>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setPillState(agentId: string, state: PillState) {
  states.set(agentId, state);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getPillState(agentId: string): PillState {
  return states.get(agentId) ?? UNKNOWN;
}

/** A small coloured dot; Paseo passes the button context into custom icons. */
function GitDot(props: PluginButtonIconProps) {
  const agentId = props.context === "agent" ? props.agentId : "";
  const state = useSyncExternalStore(
    subscribe,
    () => getPillState(agentId),
    () => getPillState(agentId),
  );
  const color =
    state.status === "clean"
      ? "#2EA043"
      : state.status === "dirty"
        ? "#D29922"
        : "#8B949E";
  return <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />;
}

interface AgentRef {
  id: string;
  workspaceId: string;
  cwd: string;
  status: string;
}

interface AgentInfo {
  id: string;
  workspaceId: string | null;
  cwd: string;
  status: string;
}

interface AgentList {
  subscription: {
    subscribe(handlers: {
      snapshot(state: { entries: Array<{ agent: AgentInfo }> }): void;
      update(message: {
        type: string;
        payload: { kind: string; agentId?: string; agent?: AgentInfo };
      }): void;
    }): void;
  };
}

function baseName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function contributePills(client: PluginClientContext): () => void {
  const pills = new Map<string, PluginButtonRegistration>();
  const agents = new Map<string, AgentRef>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const inflight = new Set<string>();
  const lifetime = new AbortController();
  let stopped = false;
  let enabled = true;

  const queueRefresh = (agent: AgentRef, delay = 0) => {
    const existing = pending.get(agent.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      pending.delete(agent.id);
      void refresh(agent);
    }, delay);
    pending.set(agent.id, timer);
  };

  const register = (agent: AgentRef, force = false) => {
    if (stopped || !enabled) return;
    const existing = agents.get(agent.id);
    if (
      !force &&
      existing &&
      existing.workspaceId === agent.workspaceId &&
      existing.cwd === agent.cwd &&
      pills.has(agent.id)
    ) {
      agents.set(agent.id, agent);
      return;
    }
    agents.set(agent.id, agent);
    pills.get(agent.id)?.remove();
    const registration = client.addComposerPill({
      id: "git-panel-pill",
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button: {
        title: `Git: ${baseName(agent.cwd)}`,
        icon: GitDot,
        label: baseName(agent.cwd),
        behavior: {
          kind: "action",
          onPress() {
            client.openPanel("git-panel-agent", {
              workspaceId: agent.workspaceId,
              agentId: agent.id,
            });
          },
        },
      },
    });
    pills.set(agent.id, registration);
    setPillState(agent.id, {
      label: baseName(agent.cwd),
      title: `Git: ${baseName(agent.cwd)}`,
      status: "unknown",
    });
    // Stagger cold-start polls so a fleet of agents does not run git at once.
    queueRefresh(agent, Math.min(pills.size, 8) * 400);
  };

  const remove = (agentId: string) => {
    const timer = pending.get(agentId);
    if (timer) clearTimeout(timer);
    pending.delete(agentId);
    pills.get(agentId)?.remove();
    pills.delete(agentId);
  };

  async function refresh(agent: AgentRef) {
    if (stopped || inflight.has(agent.id)) return;
    inflight.add(agent.id);
    try {
      const result = await client.rpc(snapshotRpc, { cwd: agent.cwd, repo: "" });
      if (stopped) return;
      if (!result.ok) {
        const label = baseName(agent.cwd);
        setPillState(agent.id, { label, title: result.error.message, status: "unknown" });
        pills.get(agent.id)?.update({ label, title: `Git: ${label}` });
        return;
      }
      const snapshot = result.value;
      const branch = snapshot.branch ?? "HEAD";
      const label = `${snapshot.name} (${branch})${snapshot.dirty ? " *" : ""}`;
      const status: PillStatus = snapshot.dirty ? "dirty" : "clean";
      setPillState(agent.id, {
        label,
        title: `Git: ${snapshot.root} (${branch})`,
        status,
      });
      pills.get(agent.id)?.update({ label, title: `Git: ${snapshot.root} (${branch})` });
    } catch {
      // A closed or unreachable agent keeps its last label.
    } finally {
      inflight.delete(agent.id);
    }
  }

  const timer = setInterval(() => {
    for (const agent of agents.values()) queueRefresh(agent);
  }, 60_000);

  const settingsTimer = setInterval(() => {
    void readSettings();
  }, 15_000);

  async function readSettings() {
    try {
      const state = await client.rpc(settingsRpc("git-panel").read, {});
      if (stopped) return;
      const parsed =
        state.status === "ready" ? gitPanelSettings.schema.safeParse(state.values) : null;
      const next = parsed?.success ? parsed.data.showComposerPill : true;
      if (next === enabled) return;
      enabled = next;
      if (!enabled) {
        for (const agentId of [...pills.keys()]) remove(agentId);
      } else {
        for (const agent of agents.values()) register(agent, true);
      }
    } catch {
      // Settings are optional; the pill defaults to visible.
    }
  }

  void readSettings();

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then((result: unknown) => {
      const { subscription } = result as AgentList;
      subscription.subscribe({
        snapshot: ({ entries }) => {
          const seen = new Set<string>();
          for (const entry of entries) {
            const agent = entry.agent;
            if (!agent.workspaceId) continue;
            seen.add(agent.id);
            register({
              id: agent.id,
              workspaceId: agent.workspaceId,
              cwd: agent.cwd,
              status: agent.status,
            });
          }
          for (const agentId of [...pills.keys()]) {
            if (seen.has(agentId)) continue;
            remove(agentId);
            agents.delete(agentId);
            states.delete(agentId);
          }
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") {
            if (update.agentId) {
              remove(update.agentId);
              agents.delete(update.agentId);
              states.delete(update.agentId);
            }
            return;
          }
          if (update.agent && update.agent.workspaceId) {
            const previous = agents.get(update.agent.id);
            const next: AgentRef = {
              id: update.agent.id,
              workspaceId: update.agent.workspaceId,
              cwd: update.agent.cwd,
              status: update.agent.status,
            };
            if (
              !previous ||
              previous.workspaceId !== next.workspaceId ||
              previous.cwd !== next.cwd
            ) {
              register(next, previous !== undefined);
            } else if (previous.status !== next.status) {
              agents.set(next.id, next);
              if (next.status === "idle" || next.status === "error") {
                queueRefresh(next);
              }
            }
          }
        },
      });
    })
    .catch((error: unknown) => {
      if (!stopped) console.error("Git panel: agent observation failed", error);
    });

  return () => {
    stopped = true;
    lifetime.abort();
    clearInterval(timer);
    clearInterval(settingsTimer);
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
    for (const registration of pills.values()) registration.remove();
    pills.clear();
    states.clear();
    listeners.clear();
  };
}
