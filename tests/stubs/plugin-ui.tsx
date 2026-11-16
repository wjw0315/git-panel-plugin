import type { ReactNode } from "react";

/** Stand-in for `@getpaseo/plugin/client/ui`: rendering helpers the tests do not exercise. */
export function Icon(_props: { name: string; size?: number; color?: string }) {
  return null;
}

export function Markdown({ children }: { children?: ReactNode }) {
  return <div data-testid="markdown">{children}</div>;
}

export function TextInput(props: { value?: string; onChangeText?: (value: string) => void }) {
  return (
    <textarea
      value={props.value ?? ""}
      onChange={(event) => props.onChangeText?.((event.target as unknown as { value: string }).value)}
    />
  );
}

const noop = () => {};

export function useToast() {
  return { show: noop, error: noop, dismiss: noop };
}
