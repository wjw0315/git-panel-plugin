import { createElement, forwardRef, type ReactNode } from "react";

/**
 * Minimal `react-native` stand-in for jsdom tests: every primitive renders a
 * plain DOM element and drops RN-only props instead of leaking them to the DOM.
 */
type StubProps = Record<string, unknown> & {
  children?: ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  disabled?: boolean;
  numberOfLines?: number;
  onPress?: () => void;
};

function host(tag: string) {
  return forwardRef<unknown, StubProps>(function Host(props, ref) {
    const { children, onPress, accessibilityRole, accessibilityLabel, disabled } = props;
    return createElement(
      tag,
      {
        ref,
        onClick: onPress as (() => void) | undefined,
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        disabled: tag === "button" ? disabled : undefined,
      } as Record<string, unknown>,
      children as ReactNode,
    );
  });
}

export const View = host("div");
export const Text = host("span");
export const ScrollView = host("div");
export const Image = host("img");
export const Pressable = host("button");

export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
  flatten: <T,>(style: T): T => style,
  absoluteFillObject: {},
};

export const Platform = {
  OS: "web" as const,
  select: <T,>(options: Record<string, T>): T | undefined => options.web ?? options.default,
};
