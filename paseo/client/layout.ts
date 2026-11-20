import { useCallback, useState } from "react";
import { useWindowDimensions, type LayoutChangeEvent } from "react-native";

/**
 * 面板宽度档位：宿主只给窗口尺寸，而侧栏面板常常只占窗口里的一条，
 * 所以宽窄必须按容器自己量出来的宽度算，拖宽拖窄要实时生效。
 */
export type PanelMode = "narrow" | "medium" | "wide";

/** 窄于该宽度只放得下一栏。 */
export const PANEL_NARROW_MAX = 560;
/** 不窄于该宽度才放得下三栏（分支 214 + 列表 + 详情 320）。 */
export const PANEL_WIDE_MIN = 860;

export function resolvePanelMode(width: number, compact = false): PanelMode {
  if (compact) return "narrow";
  if (width >= PANEL_WIDE_MIN) return "wide";
  if (width < PANEL_NARROW_MAX) return "narrow";
  return "medium";
}

/**
 * 容器宽度优先，尚未测量时回退窗口宽度，避免首帧被判成 0 宽而闪一下单栏。
 * onLayout 在高度变化时也会触发，宽度没变就不重渲染。
 */
export function usePanelMode(compact: boolean) {
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    setMeasured((previous) => (previous === width ? previous : width));
  }, []);
  const mode = resolvePanelMode(measured > 0 ? measured : window.width, compact);
  return { mode, onLayout };
}
