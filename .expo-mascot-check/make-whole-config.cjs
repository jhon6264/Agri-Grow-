const fs=require('fs');const offsets=JSON.parse(fs.readFileSync('.expo-mascot-check/whole-registration.json','utf8'));fs.writeFileSync('assets/mascot/calendar-whole-motion.ts',`// Each displayed pose is a complete character. Offsets align the whole image, never body parts.
export const WHOLE_FRAME = { width: 256, height: 384, columns: 4, sheetWidth: 1024, sheetHeight: 1536, viewX: 12, viewY: 16, viewWidth: 232, viewHeight: 368 } as const;
export const WHOLE_OFFSETS = ${JSON.stringify(offsets.map(({dx,dy})=>({dx,dy})),null,2)} as const;
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
`);
