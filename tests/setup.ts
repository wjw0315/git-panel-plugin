/**
 * jsdom implements neither Range#getClientRects nor Range#getBoundingClientRect,
 * which CodeMirror uses while measuring the document. Returning empty rects is
 * enough for the smoke tests: they assert mounting/lifecycle, never layout.
 */
if (typeof Range !== "undefined") {
  const prototype = Range.prototype as unknown as Record<string, unknown>;
  if (typeof prototype.getClientRects !== "function") {
    prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
  if (typeof prototype.getBoundingClientRect !== "function") {
    prototype.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    });
  }
}

export {};
