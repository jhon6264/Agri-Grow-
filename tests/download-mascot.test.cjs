const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatDownloadPercentage } = require('../src/ai/download-progress.ts');
const { downloadMascotFrameAt } = require('../assets/mascot/download-timing.ts');

test('download percentage has one decimal without premature completion', () => {
  for (const [bytes, total, expected] of [[0, 1000, '0.0%'], [109, 1000, '10.9%'], [9999, 10000, '99.9%'], [1000, 1000, '100.0%'], [1200, 1000, '100.0%'], [-10, 1000, '0.0%'], [10, 0, '0.0%'], [NaN, 100, '0.0%'], [100, Infinity, '0.0%']]) {
    assert.equal(formatDownloadPercentage(bytes, total), expected);
  }
});
test('mascot holds forward/down gaze, blinks, and loops within the atlas', () => {
  assert.equal(downloadMascotFrameAt(0), 0);
  assert.equal(downloadMascotFrameAt(1999), 0);
  assert.equal(downloadMascotFrameAt(3000), 4);
  assert.equal(downloadMascotFrameAt(4700), 0);
  assert.equal(downloadMascotFrameAt(5400), 13);
  assert.equal(downloadMascotFrameAt(6000), 0);
  for (let t = 0; t < 12000; t += 17) assert.ok(downloadMascotFrameAt(t) >= 0 && downloadMascotFrameAt(t) < 16);
});
