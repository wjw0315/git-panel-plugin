import type { PluginTheme } from "@getpaseo/plugin";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useErrorReport } from "./api";
import type { Strings } from "./strings";

type Reporter = ReturnType<typeof useErrorReport>;

/**
 * Keeps a rendering failure inside the panel: instead of Paseo swapping the
 * whole surface for "This plugin panel is unavailable." (which only a full
 * reload recovers from), the user gets the error, a Retry button, and the same
 * details are written to the plugin log for diagnosis.
 */
export function PanelErrorBoundary({
  surface,
  theme,
  strings,
  children,
}: {
  surface: string;
  theme: PluginTheme;
  strings: Strings;
  children: ReactNode;
}) {
  const report = useErrorReport();
  return (
    <BoundaryState surface={surface} theme={theme} strings={strings} report={report}>
      {children}
    </BoundaryState>
  );
}

class BoundaryState extends Component<
  {
    surface: string;
    theme: PluginTheme;
    strings: Strings;
    report: Reporter;
    children: ReactNode;
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.report({
      surface: this.props.surface,
      message: error.message || String(error),
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    const { theme, strings, children } = this.props;
    if (!error) return children;
    return (
      <View style={{ flex: 1, minHeight: 0, padding: 16, gap: 8 }}>
        <Text style={{ color: theme.colors.statusDanger, fontSize: 13, fontWeight: "600" }}>
          {strings.panelCrashed}
        </Text>
        <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>
          {error.message || String(error)}
        </Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
          {strings.panelCrashedHint}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.retry}
          onPress={this.reset}
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 6,
            backgroundColor: theme.colors.surface1,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{strings.retry}</Text>
        </Pressable>
      </View>
    );
  }
}
