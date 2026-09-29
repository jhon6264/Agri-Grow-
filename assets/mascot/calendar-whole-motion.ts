// Each displayed pose is a complete character. Offsets align the whole image, never body parts.
export const WHOLE_FRAME = { width: 256, height: 384, columns: 4, sheetWidth: 1024, sheetHeight: 1536, viewX: 12, viewY: 16, viewWidth: 232, viewHeight: 368 } as const;
export const WHOLE_OFFSETS = [
  {
    "dx": 0,
    "dy": 0
  },
  {
    "dx": 3.843,
    "dy": 0.583
  },
  {
    "dx": 3.563,
    "dy": 0.677
  },
  {
    "dx": 6.745,
    "dy": 0.827
  },
  {
    "dx": -0.372,
    "dy": 10.819
  },
  {
    "dx": 2.128,
    "dy": 10.871
  },
  {
    "dx": 2.201,
    "dy": 10.786
  },
  {
    "dx": 7.111,
    "dy": 10.625
  },
  {
    "dx": -0.321,
    "dy": 11.82
  },
  {
    "dx": 2.295,
    "dy": 11.537
  },
  {
    "dx": 2.997,
    "dy": 13.808
  },
  {
    "dx": 6.868,
    "dy": 12.724
  },
  {
    "dx": 0.009,
    "dy": 12.054
  },
  {
    "dx": 2.908,
    "dy": 11.775
  },
  {
    "dx": 2.512,
    "dy": 12.082
  },
  {
    "dx": 7.269,
    "dy": 12.46
  }
] as const;
export const WHOLE_SEQUENCE = [
  [0,1600], [1,110], [2,110], [3,110],
  [5,110], [6,150], [5,110], [4,150], [5,110], [6,150], [5,110],
  [3,110], [2,110], [1,110], [0,900],
  [13,100], [14,150], [13,100], [0,1900],
] as const;
export const WHOLE_CYCLE_MS = WHOLE_SEQUENCE.reduce<number>((sum, entry) => sum + entry[1], 0);
export function wholeFrameAt(elapsed: number): number {
  'worklet';
  let remaining = Math.max(0, elapsed) % WHOLE_CYCLE_MS;
  for (const [frame, duration] of WHOLE_SEQUENCE) {
    if (remaining < duration) return frame;
    remaining -= duration;
  }
  return 0;
}
