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

export async function copyText(_value: string): Promise<void> {}

function ModalRoot({
  open,
  title,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div data-testid="modal">
      {title ? <div data-testid="modal-title">{title}</div> : null}
      <button data-testid="modal-close" onClick={() => onOpenChange?.(false)} />
      {children}
    </div>
  );
}

function ModalContent({
  children,
}: {
  children?: ReactNode;
  scrollable?: boolean;
  style?: unknown;
}) {
  return <div data-testid="modal-content">{children}</div>;
}

export const Modal = Object.assign(ModalRoot, { Content: ModalContent });
