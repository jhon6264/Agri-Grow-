// Source-space registration for the layered PNG. These never change during playback.
export const PEEK_RIG = {
  atlasSize: 1254,
  viewBox: '160 0 490 710',
  width: 490,
  height: 710,
  elbow: { x: 570, y: 625 },
  armScale: 0.88,
  // The sleeve lip is drawn in front of the arm, concealing the cutout join.
  cuffPath: 'M 510 620 Q 553 646 599 620 L 610 690 L 510 690 Z',
  elbowPatch: { x: 503, y: 570, width: 105, height: 120 },
  wrist: { x: 517, y: 1036 },
  palm: { x: 405, y: 865, width: 230, height: 179 },
  forearm: { x: 405, y: 1032, width: 230, height: 143 },
  body: { x: 160, y: 0, width: 510, height: 710 },
  grip: { x: 1000, y: 395, width: 190, height: 245, pivotX: 1064, pivotY: 610 },
  wave: { x: 405, y: 865, width: 230, height: 310, pivotX: 468, pivotY: 1122 },
  eyes: { tx: -580, ty: -625 },
} as const;

export const PEEK_CYCLE_MS = 7200;

function smoothStep(value: number) {
  'worklet';
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

export function peekPoseAt(elapsed: number) {
  'worklet';
  const t = Math.max(0, elapsed) % PEEK_CYCLE_MS;
  let angle = 0;
  let wristAngle = 0;
  let palmScaleX = 1;
  if (t >= 1800 && t < 2350) angle = -44 * smoothStep((t - 1800) / 550);
  else if (t >= 2350 && t < 3950) {
    const phase = (t - 2350) / 1600 * Math.PI * 4;
    angle = -44 - 2 * (1 - Math.cos(phase));
    wristAngle = 18 * Math.sin(phase);
    // Foreshortening turns the palm toward its edge, independently of the elbow.
    palmScaleX = Math.cos((1 - Math.cos(phase)) * 0.5 * 55 * Math.PI / 180);
  }
  else if (t >= 3950 && t < 4550) angle = -44 * (1 - smoothStep((t - 3950) / 600));
  // Exactly one hand is drawn. It opens as it releases and closes before regripping.
  const openHand = angle <= -26;
  // Independent, visibly held blinks: one at rest and one during the wave.
  let blink = 0;
  for (const start of [900, 3050, 5600]) {
    const b = t - start;
    if (b >= 0 && b < 80) blink = smoothStep(b / 80);
    else if (b >= 80 && b < 240) blink = 1;
    else if (b >= 240 && b < 340) blink = 1 - smoothStep((b - 240) / 100);
  }
  return { angle, openHand, blink, wristAngle, palmScaleX };
}
