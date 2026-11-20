import type { PluginTheme } from "@getpaseo/plugin";

/** Shared contract for the CodeMirror host and the plain-text fallback. */
export interface EditorProps {
  value: string;
  readOnly: boolean;
  filePath: string;
  theme: PluginTheme;
  /** Disable grammar loading while keeping line numbers and theming. */
  highlight?: boolean;
  /** Soft-wrap long lines. Off by default so code keeps its alignment. */
  wrap?: boolean;
  onChange?: (value: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
}
