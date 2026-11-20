import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions, type ViewStyle } from "react-native";

const HINT_DELAY_MS = 400;
const HINT_GAP = 6;
const HINT_MAX_WIDTH = 260;

interface HintAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 浮层定位：默认在按钮下方，底部放不下就翻到上方，左右夹在视口内。 */
export function computeHintPosition(
  anchor: HintAnchor,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  let top = anchor.y + anchor.height + HINT_GAP;
  if (size.height > 0 && top + size.height > viewport.height - 4) {
    top = Math.max(4, anchor.y - size.height - HINT_GAP);
  }
  const maxLeft = Math.max(4, viewport.width - size.width - 4);
  const left = Math.max(4, Math.min(anchor.x + anchor.width / 2 - size.width / 2, maxLeft));
  return { left, top };
}

/** 取按钮在视口中的位置：原生用 measureInWindow，Web 回退到 DOM 矩形。 */
function measureInWindow(view: View | null, done: (anchor: HintAnchor) => void): void {
  if (!view) return;
  const target = view as unknown as {
    measureInWindow?: (
      callback: (x: number, y: number, width: number, height: number) => void,
    ) => void;
    getBoundingClientRect?: () => { left: number; top: number; width: number; height: number };
  };
  if (typeof target.measureInWindow === "function") {
    target.measureInWindow((x, y, width, height) => done({ x, y, width, height }));
    return;
  }
  if (typeof target.getBoundingClientRect === "function") {
    const rect = target.getBoundingClientRect();
    done({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  }
}

/** 浮层用 fixed 定位，避免被滚动容器裁剪；贴近边缘时翻转或夹紧。 */
function HintBubble({
  theme,
  text,
  anchor,
}: {
  theme: PluginTheme;
  text: string;
  anchor: HintAnchor;
}) {
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { left, top } = computeHintPosition(anchor, size, window);

  return (
    <View
      testID="button-hint"
      pointerEvents="none"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize({ width, height });
      }}
      style={{
        position: "fixed" as unknown as "absolute",
        left,
        top,
        zIndex: 9999,
        maxWidth: HINT_MAX_WIDTH,
      }}
    >
      <View
        style={{
          borderRadius: 6,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface2,
          paddingHorizontal: 8,
          paddingVertical: 6,
          shadowColor: theme.colors.foregroundMuted,
          shadowOpacity: 0.35,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 8,
        }}
      >
        <Text style={{ color: theme.colors.foreground, fontSize: 11, lineHeight: 15 }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

/** 悬停时的浮起阴影与功能提示；阴影不占布局，避免悬停引起位移。 */
function useHoverState(theme: PluginTheme, disabled: boolean, hint?: string) {
  const [hovered, setHovered] = useState(false);
  const [anchor, setAnchor] = useState<HintAnchor | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<View>(null);

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const onHoverIn = () => {
    setHovered(true);
    if (!hint || disabled) return;
    clearTimer();
    timer.current = setTimeout(() => {
      measureInWindow(ref.current, setAnchor);
    }, HINT_DELAY_MS);
  };

  const onHoverOut = () => {
    setHovered(false);
    clearTimer();
    setAnchor(null);
  };

  const shadow: ViewStyle =
    hovered && !disabled
      ? {
          shadowColor: theme.colors.foregroundMuted,
          shadowOpacity: 0.35,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }
      : {};
  return {
    ref,
    shadow,
    hintText: disabled ? undefined : hint,
    anchor,
    onHoverIn,
    onHoverOut,
  };
}

export function IconButton({
  theme,
  icon,
  label,
  onPress,
  active = false,
  disabled = false,
  size = 15,
  color,
  hint,
}: {
  theme: PluginTheme;
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  color?: string;
  hint?: string;
}) {
  const hover = useHoverState(theme, disabled, hint ?? label);
  return (
    <>
      <Pressable
        ref={hover.ref}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        onHoverIn={hover.onHoverIn}
        onHoverOut={hover.onHoverOut}
        style={({ pressed }) => ({
          ...(pressed ? {} : hover.shadow),
          paddingHorizontal: 6,
          paddingVertical: 5,
          borderRadius: 6,
          opacity: disabled ? 0.35 : 1,
          backgroundColor: active
            ? theme.colors.surface2
            : pressed
              ? theme.colors.surface1
              : "transparent",
        })}
      >
        <Icon name={icon} size={size} color={color ?? theme.colors.foregroundMuted} />
      </Pressable>
      {hover.hintText && hover.anchor ? (
        <HintBubble theme={theme} text={hover.hintText} anchor={hover.anchor} />
      ) : null}
    </>
  );
}

export function TextButton({
  theme,
  label,
  onPress,
  disabled = false,
  primary = false,
  danger = false,
  icon,
  compact = false,
  hint,
}: {
  theme: PluginTheme;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  icon?: string;
  compact?: boolean;
  hint?: string;
}) {
  const hover = useHoverState(theme, disabled, hint);
  const tint = danger
    ? theme.colors.statusDanger
    : primary
      ? theme.colors.accentForeground
      : theme.colors.foreground;
  return (
    <>
      <Pressable
        ref={hover.ref}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        onHoverIn={hover.onHoverIn}
        onHoverOut={hover.onHoverOut}
        style={({ pressed }) => ({
          ...(pressed ? {} : hover.shadow),
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          paddingHorizontal: compact ? 8 : 11,
          paddingVertical: compact ? 5 : 7,
          borderRadius: 7,
          opacity: disabled ? 0.4 : 1,
          backgroundColor: primary
            ? theme.colors.accent
            : pressed
              ? theme.colors.surface2
              : theme.colors.surface1,
          borderWidth: primary ? 0 : 1,
          borderColor: danger ? theme.colors.statusDanger : theme.colors.border,
        })}
      >
        {icon ? <Icon name={icon} size={13} color={tint} /> : null}
        <Text style={{ color: tint, fontSize: compact ? 12 : 13, fontWeight: "500" }}>
          {label}
        </Text>
      </Pressable>
      {hover.hintText && hover.anchor ? (
        <HintBubble theme={theme} text={hover.hintText} anchor={hover.anchor} />
      ) : null}
    </>
  );
}

export function Chip({
  theme,
  label,
  icon,
  onPress,
  active = false,
  color,
  hint,
}: {
  theme: PluginTheme;
  label: string;
  icon?: string;
  onPress?: () => void;
  active?: boolean;
  color?: string;
  hint?: string;
}) {
  const hover = useHoverState(theme, false, hint);
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: active ? theme.colors.surface2 : theme.colors.surface1,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {icon ? <Icon name={icon} size={12} color={color ?? theme.colors.foregroundMuted} /> : null}
      <Text
        numberOfLines={1}
        style={{ color: color ?? theme.colors.foreground, fontSize: 12, maxWidth: 220 }}
      >
        {label}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <>
      <Pressable
        ref={hover.ref}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onHoverIn={hover.onHoverIn}
        onHoverOut={hover.onHoverOut}
        style={({ pressed }) => (pressed ? {} : hover.shadow)}
      >
        {content}
      </Pressable>
      {hover.hintText && hover.anchor ? (
        <HintBubble theme={theme} text={hover.hintText} anchor={hover.anchor} />
      ) : null}
    </>
  );
}

export function CountBadge({
  theme,
  value,
  tone = "muted",
}: {
  theme: PluginTheme;
  value: number;
  tone?: "muted" | "accent" | "danger";
}) {
  if (value <= 0) return null;
  const background =
    tone === "accent"
      ? theme.colors.accent
      : tone === "danger"
        ? theme.colors.statusDanger
        : theme.colors.surface2;
  const color = tone === "muted" ? theme.colors.foregroundMuted : theme.colors.accentForeground;
  return (
    <View
      style={{
        minWidth: 17,
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 8,
        alignItems: "center",
        backgroundColor: background,
      }}
    >
      <Text style={{ color, fontSize: 10, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

export function Checkbox({
  theme,
  checked,
  label,
  onPress,
  disabled,
}: {
  theme: PluginTheme;
  checked: boolean;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1 }}
    >
      <View
        style={{
          width: 15,
          height: 15,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: checked ? theme.colors.accent : theme.colors.border,
          backgroundColor: checked ? theme.colors.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Icon name="Check" size={11} color={theme.colors.accentForeground} /> : null}
      </View>
      <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export function Divider({ theme }: { theme: PluginTheme }) {
  return <View style={{ height: 1, backgroundColor: theme.colors.border }} />;
}

export function EmptyState({
  theme,
  icon,
  title,
  detail,
  children,
}: {
  theme: PluginTheme;
  icon: string;
  title: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 }}>
      <Icon name={icon} size={28} color={theme.colors.foregroundMuted} />
      <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }}>
        {title}
      </Text>
      {detail ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, textAlign: "center" }}>
          {detail}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function SectionLabel({ theme, children }: { theme: PluginTheme; children: ReactNode }) {
  return (
    <Text
      style={{
        color: theme.colors.foregroundMuted,
        fontSize: 11,
        fontWeight: "600",
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

export function Spinner({ color }: { color: string }) {
  return (
    <View style={{ padding: 12, alignItems: "center" }}>
      <Text style={{ color, fontSize: 12 }}>…</Text>
    </View>
  );
}

/** Rows kept mounted at once; long lists grow on demand instead of all at once. */
const PAGE_SIZE = 200;

export function usePagedList<T>(items: T[], pageSize = PAGE_SIZE) {
  const [limit, setLimit] = useState(pageSize);
  const visible = items.length > limit ? items.slice(0, limit) : items;
  return {
    visible,
    hasMore: items.length > limit,
    remaining: Math.max(items.length - limit, 0),
    total: items.length,
    showMore: () => setLimit((current) => current + pageSize),
  };
}

/** Footer for a paged list: "Load more (200 / 2401)". */
export function PagedFooter({
  theme,
  label,
  shown,
  total,
  onPress,
}: {
  theme: PluginTheme;
  label: string;
  shown: number;
  total: number;
  onPress: () => void;
}) {
  if (shown >= total) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 8,
        paddingHorizontal: 10,
        backgroundColor: pressed ? theme.colors.surface1 : "transparent",
      })}
    >
      <Text style={{ color: theme.colors.accentForeground, fontSize: 12, fontWeight: "600" }}>
        {label} ({shown} / {total})
      </Text>
    </Pressable>
  );
}
