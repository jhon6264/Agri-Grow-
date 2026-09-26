export const DOWNLOAD_MASCOT_CYCLE_MS = 6000;
export const DOWNLOAD_MASCOT_COLUMNS = 4;
export const DOWNLOAD_MASCOT_ROWS = 4;
/** Use the best aligned forward, intermediate, down and blink poses in the atlas. */
export function downloadMascotFrameAt(elapsed: number) {
  'worklet';
  const t = Math.max(0, elapsed) % DOWNLOAD_MASCOT_CYCLE_MS;
  if (t < 2000) return 0;
  if (t < 2175) return 1;
  if (t < 4525) return 4;
  if (t < 4700) return 1;
  if (t < 5300) return 0;
  if (t < 5380) return 12;
  if (t < 5480) return 13;
  if (t < 5560) return 12;
  return 0;
}
