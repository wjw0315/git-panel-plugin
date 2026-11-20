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
  onLayout?: (event: unknown) => void;
  onPress?: () => void;
  /** 测试经 fireLongPress(node) 直接触发；无 DOM 原生对应事件。 */
  onLongPress?: () => void;
  /** 右键：透传 DOM onContextMenu（React 合成事件，fireEvent.contextMenu 可触发）。 */
  onContextMenu?: (event: unknown) => void;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
  style?: unknown;
  testID?: string;
};

/**
 * jsdom has no layout engine, so the stub records each `onLayout` handler by
 * node and tests trigger it with `fireLayout(node, width)`.
 */
const layoutHandlers = new WeakMap<Element, (event: unknown) => void>();

const longPressHandlers = new WeakMap<Element, (event?: unknown) => void>();

/** 测试触发行的长按（上下文菜单的移动端入口）；event 模拟 RN 的 nativeEvent。 */
export function fireLongPress(element: Element, event?: { pageX: number; pageY: number }): void {
  longPressHandlers.get(element)?.({ nativeEvent: event });
}

/**
 * jsdom 无布局引擎，这里可配置「窗口内的面板原点」供 measureInWindow 模拟返回；
 * 上下文菜单定位（视口坐标 → 面板内坐标）依赖它做回归测试。
 */
export const mockWindowOrigin: { x: number; y: number; width: number; height: number } = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
};

export function fireLayout(element: Element, width: number, height = 0): void {
  layoutHandlers.get(element)?.({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
}

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
      onLayout,
      onPress,
      onLongPress,
      onContextMenu,
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
    // display:"none"（窄屏单列的隐藏列）与数值 width/minWidth（split 单元格宽度）
    // 要落进 DOM，测试才能断言可见性与算出的宽度。
    const css: Record<string, string> = {};
    if (boxShadow) css.boxShadow = boxShadow;
    if (resolvedStyle && typeof resolvedStyle === "object") {
      const resolved = resolvedStyle as Record<string, unknown>;
      if (resolved.display === "none") css.display = "none";
      // jsdom 的 cssstyle 拒收无单位数值，必须带 px 才会落进 style 属性。
      if (typeof resolved.width === "number") css.width = `${resolved.width}px`;
      if (typeof resolved.minWidth === "number") css.minWidth = `${resolved.minWidth}px`;
      // 固定高度上限也要落进 DOM：切换仓库弹层曾用 maxHeight:420 把仓库裁掉。
      if (typeof resolved.maxHeight === "number") css.maxHeight = `${resolved.maxHeight}px`;
      if (typeof resolved.left === "number") css.left = `${resolved.left}px`;
      if (typeof resolved.top === "number") css.top = `${resolved.top}px`;
    }
    const hasCss = Object.keys(css).length > 0;
    // RN stub 的 props 带索引签名，onLayout 的静态类型会被摊成 unknown；按函数收窄一次。
    const layoutHandler =
      typeof onLayout === "function" ? (onLayout as (event: unknown) => void) : null;
    const attach = (node: unknown) => {
      if (node instanceof Element && layoutHandler) layoutHandlers.set(node, layoutHandler);
      if (node instanceof Element && typeof onLongPress === "function") {
        longPressHandlers.set(node, onLongPress as () => void);
      }
      // 模拟 RN 的 measureInWindow：回调 (x, y, width, height)，位置取 mockWindowOrigin。
      if (node instanceof HTMLElement) {
        (node as unknown as { measureInWindow?: unknown }).measureInWindow = (
          callback: (x: number, y: number, width: number, height: number) => void,
        ) => {
          callback(mockWindowOrigin.x, mockWindowOrigin.y, mockWindowOrigin.width, mockWindowOrigin.height);
        };
      }
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };
    return createElement(
      tag,
      {
        ref: attach,
        onClick: onPress as (() => void) | undefined,
        onContextMenu: onContextMenu as ((event: unknown) => void) | undefined,
        onMouseEnter: onHoverIn as (() => void) | undefined,
        onMouseLeave: onHoverOut as (() => void) | undefined,
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        disabled: tag === "button" ? disabled : undefined,
        style: hasCss ? css : undefined,
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

/** jsdom 里没有虚拟化列表，测试只关心行内容，按数组平铺即可。 */
export function FlatList<T>({
  data,
  renderItem,
  keyExtractor,
  ListEmptyComponent,
  ListFooterComponent,
}: {
  data?: readonly T[] | null;
  renderItem: (info: { item: T; index: number }) => ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  ListEmptyComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
  style?: unknown;
  contentContainerStyle?: unknown;
}) {
  const rows = data ?? [];
  return (
    <div>
      {rows.length === 0 ? ListEmptyComponent : null}
      {rows.map((item, index) => (
        <div key={keyExtractor ? keyExtractor(item, index) : index}>
          {renderItem({ item, index })}
        </div>
      ))}
      {ListFooterComponent}
    </div>
  );
}

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
