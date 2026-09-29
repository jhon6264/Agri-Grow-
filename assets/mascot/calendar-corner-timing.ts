export const CORNER_MASCOT_COLUMNS = 4;
export const CORNER_MASCOT_ROWS = 4;

// Rest, raise and wave, rest, blink, then pause before repeating.
const FRAME_DURATIONS = [
  1650, 90, 90, 90,
  90, 90, 95, 95,
  95, 95, 90, 100,
  900, 75, 95, 1400,
] as const;

export const CORNER_MASCOT_CYCLE_MS = FRAME_DURATIONS.reduce<number>((total, duration) => total + duration, 0);

export function cornerMascotFrameAt(elapsed: number): number {
  'worklet';
  let remaining = Math.max(0, elapsed) % CORNER_MASCOT_CYCLE_MS;
  for (let frame = 0; frame < FRAME_DURATIONS.length; frame++) {
    if (remaining < FRAME_DURATIONS[frame]) return frame;
    remaining -= FRAME_DURATIONS[frame];
  }
  return 0;
}
