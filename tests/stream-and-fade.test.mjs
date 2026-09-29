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

test('StreamSmoother keeps emoji clusters intact and finishes a burst promptly', async () => {
  const { StreamSmoother } = await import('../src/chat/stream-smoother.ts');
  const frames = [];
  const smoother = new StreamSmoother((text, done) => frames.push({ text, done }));
  smoother.append('\ud83d');
  assert.equal(frames.length, 0, 'A lone high surrogate must stay buffered');
  smoother.append('\ude80 Hello 👨‍👩‍👧‍👦 ' + 'word '.repeat(100));
  smoother.markDone();
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(frames.at(-1).text, '🚀 Hello 👨‍👩‍👧‍👦 ' + 'word '.repeat(100));
  assert.equal(frames.at(-1).done, true);
  assert.ok(frames.every(frame => !/[\uD800-\uDBFF]$/.test(frame.text)));
  assert.ok(frames.every(frame => !frame.text.endsWith('👨‍') && !frame.text.endsWith('👨‍👩‍')));
});

test('reset discards pending text from the previous response', async () => {
  const { StreamSmoother } = await import('../src/chat/stream-smoother.ts');
  const frames = [];
  const smoother = new StreamSmoother((text, done) => frames.push({ text, done }));
  smoother.append('old '.repeat(100));
  smoother.reset();
  smoother.append('new answer');
  smoother.markDone();
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(frames.at(-1).text, 'new answer');
  assert.equal(frames.at(-1).done, true);
});
