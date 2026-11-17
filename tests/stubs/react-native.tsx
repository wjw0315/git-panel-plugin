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
  onHoverIn?: () => void;
  onHoverOut?: () => void;
  style?: unknown;
  testID?: string;
};

/** RN 的 shadow* 打平成 box-shadow，方便测试断言悬停阴影。 */
function shadowToCss(style: Record<string, unknown>): string | undefined {
  const opacity = typeof style.shadowOpacity === "number" ? style.shadowOpacity : 0;
  if (opacity <= 0) return undefined;
  const color = typeof style.shadowColor === "string" ? style.shadowColor : "#000";
  const radius = typeof style.shadowRadius === "number" ? style.shadowRadius : 0;
  const offset = (style.shadowOffset ?? {}) as { width?: number; height?: number };
  return `${offset.width ?? 0}px ${offset.height ?? 0}px ${radius}px ${color}`;
}

function host(tag: string) {
  return forwardRef<unknown, StubProps>(function Host(props, ref) {
    const {
      children,
      onPress,
      onHoverIn,
      onHoverOut,
      accessibilityRole,
      accessibilityLabel,
      disabled,
      style,
      testID,
    } = props;
    const resolvedStyle =
      typeof style === "function"
        ? (style as (state: { pressed: boolean; hovered: boolean }) => unknown)({
            pressed: false,
            hovered: false,
          })
        : style;
    const boxShadow =
      resolvedStyle && typeof resolvedStyle === "object"
        ? shadowToCss(resolvedStyle as Record<string, unknown>)
        : undefined;
    return createElement(
      tag,
      {
        ref,
        onClick: onPress as (() => void) | undefined,
        onMouseEnter: onHoverIn as (() => void) | undefined,
        onMouseLeave: onHoverOut as (() => void) | undefined,
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        disabled: tag === "button" ? disabled : undefined,
        style: boxShadow ? { boxShadow } : undefined,
        "data-testid": testID,
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

export function useWindowDimensions() {
  return { width: 1024, height: 768, scale: 1, fontScale: 1 };
}
