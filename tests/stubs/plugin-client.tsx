import { useState, type ReactNode } from "react";
import type { ZodType } from "zod";

/** Stand-in for the host's plugin client context. */
type RpcContract = { name: string };
export type RpcHandler = (input: never) => Promise<unknown>;

/**
 * Tests install the RPC behaviour they need; `useRpc` then hands each contract
 * a caller that dispatches by contract name.
 */
export const rpc: { handler: ((name: string) => RpcHandler) | null } = { handler: null };

export function useRpc(contract: RpcContract) {
  return (input: unknown): Promise<unknown> => {
    if (!rpc.handler) throw new Error("No RPC handler installed for this test");
    return rpc.handler(contract.name)(input as never);
  };
}

export function defineTranslations<T>(definition: T): T {
  return definition;
}

export function useTranslation(_translations: unknown): { locale: string } {
  return { locale: "en" };
}

/** Tests can tune the values the files tab reads back from host settings. */
export const testSettings: { values: Record<string, unknown> } = { values: {} };

export function useSettings(_contract?: unknown) {
  return {
    status: "ready" as const,
    values: testSettings.values,
    revision: "test",
    save: async () => {},
  };
}

export function PluginRpcProvider({ children }: { children?: ReactNode }) {
  return children;
}

/** 宿主侧状态桩：面板测试只需要工作目录、agent cwd 与 tab 持久化。 */
const WORKSPACE = {
  directory: "/repo",
  projectRootPath: "/repo",
  name: "repo",
  projectKind: "git" as const,
};

const AGENT = { cwd: "/repo" };

export function useWorkspace<Selection>(
  _workspaceId: string,
  selector: (workspace: typeof WORKSPACE) => Selection,
): Selection | null {
  return selector(WORKSPACE);
}

export function useAgent<Selection>(
  _agentId: string,
  selector: (agent: typeof AGENT) => Selection,
): Selection | null {
  return selector(AGENT);
}

/** tab 状态桩：内存里保存，行为足以覆盖面板的页签与仓库切换。 */
export function useTabState<T>(
  _tab: unknown,
  schema: ZodType<T>,
  defaultState: T,
): [T, (next: T) => void] {
  const [state, setState] = useState<T>(() => schema.parse(defaultState));
  return [state, setState];
}
