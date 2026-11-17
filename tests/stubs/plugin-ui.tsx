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

/** 测试断言用：记录 toast 与剪贴板写入。 */
export const toastLog: Array<{ kind: string; message: string }> = [];

export function useToast() {
  return {
    show: (message?: string) => {
      toastLog.push({ kind: "show", message: message ?? "" });
    },
    error: (message?: string) => {
      toastLog.push({ kind: "error", message: message ?? "" });
    },
    dismiss: noop,
  };
}

export async function copyText(value: string): Promise<void> {
  (globalThis as { __copied?: string }).__copied = value;
}

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
