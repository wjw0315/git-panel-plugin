import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { languageLoaderFor } from "./languages";
import { createEditorTheme } from "./theme";
import type { EditorProps } from "./types";

/**
 * DOM-only implementation. This module is imported dynamically by
 * `client/editor/index.tsx`, so its module graph (and CodeMirror's browser
 * detection) never runs on a native host.
 */
export function CodeMirrorEditor({
  value,
  readOnly,
  filePath,
  theme,
  highlight = true,
  wrap = false,
  onChange,
  onSave,
  onCancel,
  onError,
}: EditorProps) {
  const hostRef = useRef<unknown>(null);
  const viewRef = useRef<EditorView | null>(null);
  const applyingExternal = useRef(false);
  const callbacks = useRef({ onChange, onSave, onCancel, onError });
  callbacks.current = { onChange, onSave, onCancel, onError };

  const themeCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const languageCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());

  // Mount once; every prop change is applied through a compartment so the
  // undo history and scroll position survive file/theme switches.
  useEffect(() => {
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;

    const saveBinding = {
      key: "Mod-s",
      preventDefault: true,
      run: () => {
        callbacks.current.onSave?.();
        return true;
      },
    };
    const saveEnterBinding = {
      key: "Mod-Enter",
      preventDefault: true,
      run: () => {
        callbacks.current.onSave?.();
        return true;
      },
    };
    const cancelBinding = {
      key: "Escape",
      run: () => {
        if (!callbacks.current.onCancel) return false;
        callbacks.current.onCancel();
        return true;
      },
    };

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          keymap.of([
            saveBinding,
            saveEnterBinding,
            cancelBinding,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (applyingExternal.current) return;
            callbacks.current.onChange?.(update.state.doc.toString());
          }),
          themeCompartment.current.of(createEditorTheme(theme)),
          readOnlyCompartment.current.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          wrapCompartment.current.of(wrap ? EditorView.lineWrapping : []),
        ],
      }),
    });
    viewRef.current = view;

    return () => {
      viewRef.current = null;
      view.destroy();
    };
    // Mount-only on purpose; subsequent props are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    applyingExternal.current = true;
    try {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    } finally {
      applyingExternal.current = false;
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(createEditorTheme(theme)),
    });
  }, [theme]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap]);

  useEffect(() => {
    let active = true;
    void (async () => {
      let language: Extension | null = null;
      if (highlight) {
        try {
          language = await languageLoaderFor(filePath)();
        } catch (error) {
          // A missing grammar only costs colouring; keep the editor usable.
          if (active) callbacks.current.onError?.(error);
        }
      }
      if (!active) return;
      viewRef.current?.dispatch({
        effects: languageCompartment.current.reconfigure(language ? [language] : []),
      });
      viewRef.current?.requestMeasure();
    })();
    return () => {
      active = false;
    };
  }, [filePath, highlight]);

  return (
    <View
      ref={hostRef as never}
      style={{ flex: 1, minHeight: 0, backgroundColor: theme.colors.surface0 }}
    />
  );
}
