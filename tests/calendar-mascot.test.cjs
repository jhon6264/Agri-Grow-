const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  WHOLE_CYCLE_MS,
  WHOLE_FRAME,
  WHOLE_OFFSETS,
  WHOLE_SEQUENCE,
  wholeFrameAt,
} = require('../assets/mascot/calendar-whole-motion.ts');
const { calendarCornerLayout } = require('../assets/mascot/calendar-corner-layout.ts');

test('calendarCornerLayout produces reduced size without pushing calendar content', () => {
  for (const width of [320, 360, 390, 412, 430]) {
    const layout = calendarCornerLayout(width);
    // Size is scaled down by ~25% compared to original ~96px on 390px screens
    assert.ok(layout.size >= 68 && layout.size <= 80, `size ${layout.size} for width ${width} should be between 68 and 80`);
    // Height respects the viewport aspect ratio (368 / 232)
    const expectedHeight = layout.size * WHOLE_FRAME.viewHeight / WHOLE_FRAME.viewWidth;
    assert.equal(layout.height, expectedHeight);
    // Crucial: contentHeight and textReservation are 0 so cards are NOT pushed down
    assert.equal(layout.contentHeight, 0, 'contentHeight must be 0 to prevent card displacement');
    assert.equal(layout.textReservation, 0, 'textReservation must be 0 for natural text flow');
  }
});

test('calendar mascot timing cycle is 6300ms and loops smoothly', () => {
  assert.equal(WHOLE_CYCLE_MS, 6300);
  assert.equal(wholeFrameAt(0), 0); // initial rest/grip pose
  assert.equal(wholeFrameAt(1599), 0); // stays resting for 1600ms

  // Hand release & waving sequence
  assert.equal(wholeFrameAt(1600), 1);
  assert.equal(wholeFrameAt(1710), 2);
  assert.equal(wholeFrameAt(1820), 3);
  assert.equal(wholeFrameAt(1930), 5);
  assert.equal(wholeFrameAt(2040), 6);

  // Return to rest
  assert.equal(wholeFrameAt(3200), 0);

  // Blink sequence during rest
  assert.equal(wholeFrameAt(4100), 13); // half-closed
  assert.equal(wholeFrameAt(4200), 14); // fully closed
  assert.equal(wholeFrameAt(4350), 13); // half-closed
  assert.equal(wholeFrameAt(4450), 0);  // eyes open rest

  // Boundary loop
  assert.equal(wholeFrameAt(6299), 0);
  assert.equal(wholeFrameAt(6300), 0);
  assert.equal(wholeFrameAt(6300 + 1600), 1);
});

test('all wholeFrameAt frames have valid offsets and cell bounds', () => {
  for (let t = 0; t < WHOLE_CYCLE_MS * 2; t += 25) {
    const frame = wholeFrameAt(t);
    assert.ok(frame >= 0 && frame < 16, `frame ${frame} should be 0-15`);
    const offset = WHOLE_OFFSETS[frame];
    assert.ok(offset !== undefined, `offset for frame ${frame} should exist`);
    assert.ok(typeof offset.dx === 'number' && typeof offset.dy === 'number');

    const col = frame % WHOLE_FRAME.columns;
    const row = Math.floor(frame / WHOLE_FRAME.columns);

    const sourceX = -(col * WHOLE_FRAME.width + WHOLE_FRAME.viewX - offset.dx);
    const sourceY = -(row * WHOLE_FRAME.height + WHOLE_FRAME.viewY - offset.dy);

    // Negative translations within sheet bounds
    assert.ok(sourceX <= 0 && sourceX >= -WHOLE_FRAME.sheetWidth, `sourceX ${sourceX} within sheet`);
    assert.ok(sourceY <= 0 && sourceY >= -WHOLE_FRAME.sheetHeight, `sourceY ${sourceY} within sheet`);
  }
});
