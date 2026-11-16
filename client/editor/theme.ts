import type { PluginTheme } from "@getpaseo/plugin";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export interface EditorPalette {
  isDark: boolean;
  background: string;
  foreground: string;
  muted: string;
  gutterText: string;
  border: string;
  accent: string;
  activeLine: string;
  selection: string;
  comment: string;
  string: string;
  keyword: string;
  number: string;
}

function parseColor(color: string): [number, number, number] | null {
  const value = color.trim();
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  // Accept #rgb, #rgba, #rrggbb and #rrggbbaa: the alpha channel is not used here.
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (!hex) return null;
  const digits = hex[1];
  const full =
    digits.length === 3 || digits.length === 4
      ? digits
          .slice(0, 3)
          .split("")
          .map((part) => part + part)
          .join("")
      : digits.slice(0, 6);
  if (full.length !== 6) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgba(color: string, alpha: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function isDark(color: string): boolean {
  const rgb = parseColor(color);
  if (!rgb) return true;
  const [r, g, b] = rgb.map((channel) => channel / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

export function editorPalette(theme: PluginTheme): EditorPalette {
  const colors = theme.colors;
  return {
    isDark: isDark(colors.surface0),
    background: colors.surface0,
    foreground: colors.foreground,
    muted: colors.foregroundMuted,
    gutterText: colors.foregroundMuted,
    border: colors.border,
    accent: colors.accent,
    activeLine: colors.surface1,
    selection: rgba(colors.accent, 0.25),
    comment: colors.foregroundMuted,
    string: colors.statusSuccess,
    keyword: colors.accent,
    number: colors.statusWarning,
  };
}

export function createEditorTheme(theme: PluginTheme): Extension {
  const palette = editorPalette(theme);
  const highlight = HighlightStyle.define([
    { tag: tags.comment, color: palette.comment, fontStyle: "italic" },
    { tag: [tags.string, tags.regexp, tags.special(tags.string)], color: palette.string },
    {
      tag: [
        tags.keyword,
        tags.operator,
        tags.controlKeyword,
        tags.definitionKeyword,
        tags.moduleKeyword,
      ],
      color: palette.keyword,
    },
    { tag: [tags.number, tags.bool, tags.null], color: palette.number },
    { tag: [tags.propertyName, tags.attributeName], color: palette.foreground },
    { tag: [tags.typeName, tags.className, tags.namespace], color: palette.foreground },
    { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: palette.accent },
    { tag: tags.heading, color: palette.accent, fontWeight: "600" },
    { tag: [tags.link, tags.url], color: palette.accent, textDecoration: "underline" },
    { tag: [tags.invalid, tags.deleted], color: palette.keyword },
  ]);

  const baseTheme = EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: palette.background,
        color: palette.foreground,
        fontSize: "12.5px",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": {
        fontFamily: "Menlo, Monaco, 'SF Mono', Consolas, monospace",
        lineHeight: "1.55",
        overflow: "auto",
      },
      ".cm-content": { caretColor: palette.accent, padding: "6px 0" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: palette.accent },
      ".cm-gutters": {
        backgroundColor: palette.background,
        color: palette.gutterText,
        borderRight: `1px solid ${palette.border}`,
      },
      ".cm-activeLine": { backgroundColor: palette.activeLine },
      ".cm-activeLineGutter": { backgroundColor: palette.activeLine },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        { backgroundColor: palette.selection },
      ".cm-selectionMatch": { backgroundColor: palette.selection },
      ".cm-panels": {
        backgroundColor: palette.activeLine,
        color: palette.foreground,
      },
      ".cm-panels.cm-panels-top": { borderBottom: `1px solid ${palette.border}` },
      ".cm-panel.cm-search input, .cm-panel.cm-search button": {
        color: palette.foreground,
        backgroundColor: palette.background,
        border: `1px solid ${palette.border}`,
      },
      ".cm-tooltip": {
        backgroundColor: palette.activeLine,
        color: palette.foreground,
        border: `1px solid ${palette.border}`,
      },
      ".cm-matchingBracket": {
        backgroundColor: rgba(theme.colors.accent, 0.22),
        outline: `1px solid ${palette.border}`,
      },
    },
    { dark: palette.isDark },
  );

  return [baseTheme, syntaxHighlighting(highlight)];
}
