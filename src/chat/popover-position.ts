export type PopoverAnchor = { x: number; y: number; width: number; height: number };

export function positionChatPopover(anchor: PopoverAnchor, screenWidth: number,
  screenHeight: number, topInset: number, bottomInset: number, fontScale = 1) {
  const margin = 8;
  const preferredWidth = Math.min(Math.max(120, 120 * Math.min(fontScale, 1.5)), screenWidth - margin * 2);
  const rowHeight = Math.max(44, 20 * fontScale + 20);
  const height = rowHeight * 2 + 8;
  const right = anchor.x + anchor.width + 6;
  const rightSpace = screenWidth - margin - right;
  // Keep the menu beside the dots even on narrow phones when its labels fit.
  const fitsRight = rightSpace >= 88 * Math.min(fontScale, 1.5);
  const width = fitsRight ? Math.min(preferredWidth, rightSpace) : preferredWidth;
  const preferredLeft = fitsRight ? right : anchor.x - width - 6;
  return {
    left: Math.max(margin, Math.min(preferredLeft, screenWidth - width - margin)),
    top: Math.max(topInset + margin, Math.min(anchor.y, screenHeight - bottomInset - height - margin)),
    width, rowHeight,
  };
}
