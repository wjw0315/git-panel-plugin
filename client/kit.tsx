import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

export function IconButton({
  theme,
  icon,
  label,
  onPress,
  active = false,
  disabled = false,
  size = 15,
  color,
}: {
  theme: PluginTheme;
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
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
}: {
  theme: PluginTheme;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  icon?: string;
  compact?: boolean;
}) {
  const tint = danger
    ? theme.colors.statusDanger
    : primary
      ? theme.colors.accentForeground
      : theme.colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
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
  );
}

export function Chip({
  theme,
  label,
  icon,
  onPress,
  active = false,
  color,
}: {
  theme: PluginTheme;
  label: string;
  icon?: string;
  onPress?: () => void;
  active?: boolean;
  color?: string;
}) {
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
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      {content}
    </Pressable>
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
