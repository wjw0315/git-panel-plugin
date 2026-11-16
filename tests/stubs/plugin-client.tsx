import type { ReactNode } from "react";

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
