import { Platform } from "react-native";

/**
 * The Paseo client runs on Expo Web (with a DOM) and on React Native (without
 * one). CodeMirror is DOM-only, so the editor has to probe the host once and
 * remember the answer for the rest of the session.
 */
export interface HostSignals {
  hasDocument: boolean;
  platform: string;
}

export function evaluateHost(signals: HostSignals): boolean {
  return signals.hasDocument && signals.platform === "web";
}

let cached: boolean | null = null;

export function canUseDom(): boolean {
  if (cached === null) {
    cached = evaluateHost({
      hasDocument:
        typeof document !== "undefined" && typeof document.createElement === "function",
      platform: Platform.OS,
    });
  }
  return cached;
}

/** Test-only hook: the probe result is cached for the lifetime of the module. */
export function resetCapabilityCacheForTests(): void {
  cached = null;
}
