import {
  Component,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { canUseDom } from "./capability";
import { PlainTextEditor } from "./plain-text";
import type { EditorProps } from "./types";

export type { EditorProps } from "./types";

/** A host that failed once will not grow a DOM later in the same session. */
let codeEditorLoadFailed = false;

class EditorBoundary extends Component<
  {
    fallback: ReactNode;
    onError?: (error: unknown) => void;
    children: ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Entry point used by the files tab.
 *
 * CodeMirror is loaded with a dynamic import: a native host never evaluates
 * that module graph, and a web host that cannot load it keeps the plain-text
 * editor. Rendering failures inside the editor are contained by the boundary
 * instead of taking down the whole panel.
 */
export function Editor(props: EditorProps) {
  const [CodeEditor, setCodeEditor] = useState<ComponentType<EditorProps> | null>(null);
  const [failed, setFailed] = useState(() => !canUseDom());
  const { onError } = props;

  useEffect(() => {
    if (failed) return;
    if (codeEditorLoadFailed) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    import("./codemirror")
      .then((module) => {
        if (cancelled) return;
        setCodeEditor(() => module.CodeMirrorEditor);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        codeEditorLoadFailed = true;
        onError?.(error);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // Probe once per mounted editor; capability results are cached in the module.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fallback = <PlainTextEditor {...props} />;
  if (failed || !CodeEditor) return fallback;
  const Host = CodeEditor;

  return (
    <EditorBoundary fallback={fallback} onError={onError}>
      <Host {...props} />
    </EditorBoundary>
  );
}
