export const MASCOT_COLUMNS = 4;
export const MASCOT_ROWS = 4;
export const MASCOT_FRAME_SIZE = 256;
export const MASCOT_FRAME_DURATIONS = [
  250, 100, 100, 100, 100, 100, 100, 100,
  100, 100, 100, 200, 60, 100, 60, 3000,
] as const;
export const MASCOT_CYCLE_MS = MASCOT_FRAME_DURATIONS.reduce<number>((sum, ms) => sum + ms, 0);

export function mascotFrameAt(elapsed: number): number {
  'worklet';
  let remaining = Math.max(0, elapsed) % MASCOT_CYCLE_MS;
  for (let frame = 0; frame < MASCOT_FRAME_DURATIONS.length; frame++) {
    if (remaining < MASCOT_FRAME_DURATIONS[frame]) return frame;
    remaining -= MASCOT_FRAME_DURATIONS[frame];
  }
  return 0;
}
