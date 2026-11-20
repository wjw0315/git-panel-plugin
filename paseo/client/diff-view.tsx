import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { parseUnifiedDiff, toSplitRows, type DiffHunk, type DiffLine } from "./diff";
import type { PanelMode } from "./layout";
import type { Strings } from "./strings";

export type DiffMode = "unified" | "split";

/**
 * split 单元格宽度：按可用宽度对半分；超长行按字符估算撑开，
 * 两列始终共用同一计算值保证对齐，超出视口的部分靠横向滚动查看。
 * 不再用旧的固定 380 / 内容宽 760（长行会被省略号吃掉）。
 */
const CODE_CHAR_WIDTH = 7.3; // Menlo 12px 的平均字宽估算
const SPLIT_GUTTER = 38 + 12 + 1; // 行号列 + 变更标记列 + 分隔线
const SPLIT_MIN_CELL = 280; // 极窄但仍在宽档时的可读下限

export function resolveSplitCellWidth(
  availableWidth: number | null,
  longestLineChars: number,
): number {
  const half = availableWidth == null ? 0 : availableWidth / 2;
  const needed = Math.ceil((longestLineChars + 1) * CODE_CHAR_WIDTH) + SPLIT_GUTTER;
  return Math.max(half, SPLIT_MIN_CELL, needed);
}

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
  panelMode,
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
  /** 面板档位：窄/中档强制统一视图并隐藏对照开关，用户偏好不动、变宽后恢复。 */
  panelMode?: PanelMode;
  binary?: boolean;
  tooLarge?: boolean;
  loading?: boolean;
  error?: string | null;
}) {
  const parsed = useMemo(() => parseUnifiedDiff(text), [text]);
  const narrowPanel = panelMode != null && panelMode !== "wide";
  const effectiveMode: DiffMode = narrowPanel ? "unified" : mode;
  const splitRows = useMemo(
    () => (effectiveMode === "split" ? toSplitRows(parsed.hunks) : []),
    [effectiveMode, parsed.hunks],
  );
  const [splitAreaWidth, setSplitAreaWidth] = useState<number | null>(null);
  const longestSplitLine = useMemo(
    () =>
      splitRows.reduce(
        (max, row) => Math.max(max, row.left?.text.length ?? 0, row.right?.text.length ?? 0),
        0,
      ),
    [splitRows],
  );
  const splitCellWidth = resolveSplitCellWidth(splitAreaWidth, longestSplitLine);

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
        {onModeChange && !narrowPanel
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
                      effectiveMode === value ? theme.colors.surface2 : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color:
                        effectiveMode === value
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

      {effectiveMode === "unified" ? (
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
        <View
          testID="diff-split-area"
          style={{ flex: 1, minHeight: 0 }}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            setSplitAreaWidth((previous) => (previous === width ? previous : width));
          }}
        >
          <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
            <View style={{ minWidth: "100%" }}>
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
                  <SplitCellView theme={theme} cell={row.left} side="del" width={splitCellWidth} />
                  <SplitCellView theme={theme} cell={row.right} side="add" width={splitCellWidth} />
                </View>
              );
            })}
            </View>
          </ScrollView>
        </View>
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
  width,
}: {
  theme: PluginTheme;
  cell: { number: number; text: string; kind: "add" | "del" | "context" } | null;
  side: "add" | "del";
  width: number;
}) {
  if (!cell) {
    return (
      <View testID="diff-split-cell" style={{ width, backgroundColor: theme.colors.surface0 }} />
    );
  }
  const background = cell.kind === "add" ? ADD_BG : cell.kind === "del" ? DEL_BG : "transparent";
  const color =
    cell.kind === "add" ? ADD_TEXT : cell.kind === "del" ? DEL_TEXT : theme.colors.foreground;
  return (
    <View testID="diff-split-cell" style={{ width, flexDirection: "row", backgroundColor: background }}>
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
