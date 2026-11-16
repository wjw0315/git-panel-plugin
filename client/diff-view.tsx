import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { parseUnifiedDiff, toSplitRows, type DiffHunk, type DiffLine } from "./diff";
import type { Strings } from "./strings";

export type DiffMode = "unified" | "split";

const ADD_BG = "rgba(46, 160, 67, 0.16)";
const DEL_BG = "rgba(248, 81, 73, 0.16)";
const ADD_TEXT = "#3FB950";
const DEL_TEXT = "#F85149";

function useTokens(text: string) {
  return useMemo(() => {
    const pattern =
      /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|(\b(?:const|let|var|function|class|interface|type|enum|import|export|from|return|if|else|for|while|switch|case|break|continue|new|await|async|try|catch|finally|throw|extends|implements|public|private|protected|static|readonly|def|lambda|fn|impl|struct|trait|use|mod|match|pub|self|None|True|False)\b)|(\b\d+(?:\.\d+)?\b)/g;
    const spans: Array<{ text: string; kind: "plain" | "string" | "comment" | "keyword" | "number" }> = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) {
        spans.push({ text: text.slice(last, match.index), kind: "plain" });
      }
      const value = match[0];
      const kind = match[1]
        ? "string"
        : match[2]
          ? "comment"
          : match[3]
            ? "keyword"
            : "number";
      spans.push({ text: value, kind });
      last = match.index + value.length;
    }
    if (last < text.length || spans.length === 0) {
      spans.push({ text: text.slice(last), kind: "plain" });
    }
    return spans;
  }, [text]);
}

function tokenColor(
  kind: "plain" | "string" | "comment" | "keyword" | "number",
  theme: PluginTheme,
): string {
  switch (kind) {
    case "string":
      return theme.colors.statusSuccess;
    case "comment":
      return theme.colors.foregroundMuted;
    case "keyword":
      return theme.colors.accent;
    case "number":
      return theme.colors.statusWarning;
    default:
      return theme.colors.foreground;
  }
}

function CodeText({
  text,
  theme,
  color,
  mono,
}: {
  text: string;
  theme: PluginTheme;
  color: string;
  mono?: boolean;
}) {
  const tokens = useTokens(text);
  return (
    <Text
      numberOfLines={1}
      style={{
        color,
        fontFamily: mono === false ? undefined : "Menlo",
        fontSize: 12,
        lineHeight: 18,
      }}
    >
      {tokens.map((token, index) => (
        <Text
          key={index}
          style={{ color: token.kind === "plain" ? color : tokenColor(token.kind, theme) }}
        >
          {token.text}
        </Text>
      ))}
    </Text>
  );
}

function signFor(line: DiffLine): string {
  if (line.kind === "add") return "+";
  if (line.kind === "del") return "-";
  return " ";
}

export function DiffView({
  theme,
  strings,
  text,
  mode,
  onModeChange,
  binary = false,
  tooLarge = false,
  loading = false,
  error,
}: {
  theme: PluginTheme;
  strings: Strings;
  text: string;
  mode: DiffMode;
  onModeChange?: (mode: DiffMode) => void;
  binary?: boolean;
  tooLarge?: boolean;
  loading?: boolean;
  error?: string | null;
}) {
  const parsed = useMemo(() => parseUnifiedDiff(text), [text]);
  const splitRows = useMemo(
    () => (mode === "split" ? toSplitRows(parsed.hunks) : []),
    [mode, parsed.hunks],
  );

  if (loading) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          {strings.loadingDiff}
        </Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{error}</Text>
      </View>
    );
  }
  if (binary) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          {strings.binaryFile}
        </Text>
      </View>
    );
  }
  if (tooLarge) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          {strings.fileTooLarge}
        </Text>
      </View>
    );
  }
  if (text.trim() === "") {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          {strings.noPreview}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 8,
          paddingVertical: 5,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {onModeChange
          ? (
              (["unified", "split"] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={strings[value]}
                  onPress={() => onModeChange(value)}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 5,
                    backgroundColor:
                      mode === value ? theme.colors.surface2 : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color:
                        mode === value
                          ? theme.colors.foreground
                          : theme.colors.foregroundMuted,
                      fontSize: 11,
                    }}
                  >
                    {strings[value]}
                  </Text>
                </Pressable>
              ))
            )
          : null}
        <View style={{ flex: 1 }} />
        <Text style={{ color: theme.colors.statusSuccess, fontSize: 11 }}>
          +{parsed.additions}
        </Text>
        <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
          -{parsed.deletions}
        </Text>
        {parsed.truncated ? (
          <Text style={{ color: theme.colors.statusWarning, fontSize: 11 }}>
            {strings.fileTooLarge}
          </Text>
        ) : null}
      </View>

      {mode === "unified" ? (
        <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
          <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
            {parsed.hunks.map((hunk, hunkIndex) => (
              <View key={`hunk-${hunkIndex}`}>
                <HunkHeader theme={theme} header={hunk.header} />
                {hunk.lines.map((line, lineIndex) => (
                  <UnifiedLine
                    key={lineIndex}
                    theme={theme}
                    line={line}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        </ScrollView>
      ) : (
        <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
          <View style={{ minWidth: 760 }}>
            {splitRows.map((row, index) => {
              if (row.meta) {
                return row.meta.startsWith("@@") ? (
                  <HunkHeader key={index} theme={theme} header={row.meta} />
                ) : (
                  <View key={index} style={{ paddingHorizontal: 8, paddingVertical: 1 }}>
                    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                      {row.meta}
                    </Text>
                  </View>
                );
              }
              return (
                <View key={index} style={{ flexDirection: "row" }}>
                  <SplitCellView theme={theme} cell={row.left} side="del" />
                  <SplitCellView theme={theme} cell={row.right} side="add" />
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function HunkHeader({ theme, header }: { theme: PluginTheme; header: string }) {
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface1,
        paddingHorizontal: 8,
        paddingVertical: 2,
        minWidth: "100%",
      }}
    >
      <Text style={{ color: theme.colors.foregroundMuted, fontFamily: "Menlo", fontSize: 11 }}>
        {header}
      </Text>
    </View>
  );
}

function UnifiedLine({ theme, line }: { theme: PluginTheme; line: DiffLine }) {
  if (line.kind === "meta") {
    return (
      <View style={{ paddingHorizontal: 8 }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontFamily: "Menlo", fontSize: 11 }}>
          {line.text}
        </Text>
      </View>
    );
  }
  const background = line.kind === "add" ? ADD_BG : line.kind === "del" ? DEL_BG : "transparent";
  const color = line.kind === "add" ? ADD_TEXT : line.kind === "del" ? DEL_TEXT : theme.colors.foreground;
  return (
    <View style={{ flexDirection: "row", backgroundColor: background }}>
      <Text style={numberStyle(theme)}>{line.oldLine ?? ""}</Text>
      <Text style={numberStyle(theme)}>{line.newLine ?? ""}</Text>
      <Text style={{ ...markerStyle, color }}>{signFor(line)}</Text>
      <CodeText text={line.text} theme={theme} color={color} />
    </View>
  );
}

function SplitCellView({
  theme,
  cell,
  side,
}: {
  theme: PluginTheme;
  cell: { number: number; text: string; kind: "add" | "del" | "context" } | null;
  side: "add" | "del";
}) {
  const width = 380;
  if (!cell) {
    return <View style={{ width, backgroundColor: theme.colors.surface0 }} />;
  }
  const background = cell.kind === "add" ? ADD_BG : cell.kind === "del" ? DEL_BG : "transparent";
  const color =
    cell.kind === "add" ? ADD_TEXT : cell.kind === "del" ? DEL_TEXT : theme.colors.foreground;
  return (
    <View style={{ width, flexDirection: "row", backgroundColor: background }}>
      <View style={{ width: 1, backgroundColor: theme.colors.border }} />
      <Text style={numberStyle(theme)}>{cell.number}</Text>
      <CodeText text={cell.text} theme={theme} color={color} />
      {side === "del" ? null : null}
    </View>
  );
}

const markerStyle = {
  fontFamily: "Menlo",
  fontSize: 12,
  lineHeight: 18,
  width: 12,
  textAlign: "center" as const,
};

function numberStyle(theme: PluginTheme) {
  return {
    color: theme.colors.foregroundMuted,
    fontFamily: "Menlo",
    fontSize: 10,
    lineHeight: 18,
    width: 38,
    textAlign: "right" as const,
    paddingRight: 6,
    opacity: 0.8,
  } as const;
}
