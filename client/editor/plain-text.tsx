import { TextInput } from "@getpaseo/plugin/client/ui";
import { ScrollView, Text, View } from "react-native";
import type { EditorProps } from "./types";

/** Rendering budget for the fallback preview; CodeMirror handles bigger files. */
const MAX_RENDERED_LINES = 4000;

/**
 * Native/host fallback: the same behaviour the files tab had before the
 * CodeMirror integration (plain TextInput when editing, monospace preview with
 * a line gutter when reading).
 */
export function PlainTextEditor({ value, readOnly, theme, onChange }: EditorProps) {
  if (!readOnly) {
    return (
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          flex: 1,
          color: theme.colors.foreground,
          backgroundColor: theme.colors.surface0,
          fontFamily: "Menlo",
          fontSize: 12,
          padding: 10,
          textAlignVertical: "top",
        }}
      />
    );
  }

  const lines = value.split("\n").slice(0, MAX_RENDERED_LINES);
  return (
    <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30, paddingTop: 4 }}>
        {lines.map((line, index) => (
          <View key={index} style={{ flexDirection: "row" }}>
            <Text
              style={{
                color: theme.colors.foregroundMuted,
                fontFamily: "Menlo",
                fontSize: 10,
                lineHeight: 17,
                width: 44,
                textAlign: "right",
                paddingRight: 8,
                opacity: 0.7,
              }}
            >
              {index + 1}
            </Text>
            <Text
              style={{
                color: theme.colors.foreground,
                fontFamily: "Menlo",
                fontSize: 11.5,
                lineHeight: 17,
              }}
            >
              {line === "" ? " " : line}
            </Text>
          </View>
        ))}
      </ScrollView>
    </ScrollView>
  );
}
