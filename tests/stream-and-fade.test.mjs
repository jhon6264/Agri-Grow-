import test from 'node:test';
import assert from 'node:assert/strict';

// Polyfill rAF for Node test environment
global.requestAnimationFrame = (fn) => setTimeout(fn, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

test('StreamSmoother steps whole words fluidly without stalling', async () => {
  const { StreamSmoother } = await import('../src/chat/stream-smoother.ts');
  const visible = [];
  const smoother = new StreamSmoother((text, done) => {
    visible.push({ text, done });
  });

  smoother.append('Ang kamatis kinahanglan og ');
  smoother.append('igong tubig ug adlaw.');
  smoother.markDone();
  smoother.flush();

  const last = visible[visible.length - 1];
  assert.ok(last);
  assert.equal(last.text, 'Ang kamatis kinahanglan og igong tubig ug adlaw.');
  assert.equal(last.done, true);
});

test('StreamSmoother advances sub-word tokens without freezing', async () => {
  const { StreamSmoother } = await import('../src/chat/stream-smoother.ts');
  const visible = [];
  const smoother = new StreamSmoother((text, done) => {
    visible.push({ text, done });
  });

  // Append incomplete word without a space (sub-word token)
  smoother.append('Kam');
  
  // Wait 40ms to allow a tick to process
  await new Promise((resolve) => setTimeout(resolve, 40));
  
  // Verify text advanced immediately instead of freezing
  assert.ok(visible.length > 0, 'Should advance sub-word token without waiting for space');
  assert.equal(visible[visible.length - 1].text, 'Kam');

  smoother.append('atis ');
  smoother.markDone();
  smoother.flush();
  assert.equal(visible[visible.length - 1].text, 'Kamatis ');
});
