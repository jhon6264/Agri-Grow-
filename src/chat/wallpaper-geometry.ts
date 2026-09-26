export function wallpaperCover(width: number, height: number) {
  const scale = Math.max(width / 1080, height / 1920);
  return { width: 1080 * scale, height: 1920 * scale,
    x: (width - 1080 * scale) / 2, y: (height - 1920 * scale) / 2 };
}

export function bottomFadeBounds(height: number, composerHeight: number, composerBottomOffset: number, keyboardTranslation: number) {
  'worklet';
  const start = Math.max(0, Math.min(height, height - composerHeight + composerBottomOffset + keyboardTranslation));
  return { start, border: start + 32 };
}
