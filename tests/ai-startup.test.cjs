const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startupPresentation, recoveryMessage } = require('../src/ai/startup-state.ts');
const { RequestGate } = require('../src/ai/request-gate.ts');
const { connectionOwner } = require('../src/database/connection-owner.ts');
const installed = { stage: 'installed', accepted: true, bytes: 1, total: 1, ready: false };

test('verified installation and onboarding independently choose returning experience', () => {
  assert.equal(startupPresentation(installed).returning, true);
  assert.equal(startupPresentation({ ...installed, accepted: false }).returning, false);
  assert.equal(startupPresentation({ ...installed, stage: 'missing' }).returning, false);
});
test('labels follow readiness, never elapsed time', () => {
  assert.equal(startupPresentation({ ...installed, initializationPhase: 'engine', elapsedMs: 300000 }).label, 'preparing');
  assert.equal(startupPresentation({ ...installed, initializationPhase: 'session' }).label, 'almost there');
  assert.equal(startupPresentation({ ...installed, ready: true }).label, 'here it is');
});
test('slow native work stays busy; recovery requires a separate explicit retry', () => {
  const busy = startupPresentation({ ...installed, elapsedMs: 90000, recoverability: 'busy' });
  assert.equal(busy.slow, true); assert.equal(busy.canRetry, false); assert.equal(busy.recovery, false);
  const interrupted = { ...installed, recoverability: 'retry_required', previousExit: { reason: 'low_memory' } };
  assert.equal(startupPresentation(interrupted).recovery, true);
  assert.match(recoveryMessage(interrupted), /memory was low/);
  assert.match(recoveryMessage({ ...interrupted, previousExit: null }), /interrupted/);
});
test('stop/background invalidates preparation without allowing a competing send', () => {
  const gate = new RequestGate(); const first = gate.begin();
  assert.throws(() => gate.begin());
  gate.stop(); assert.equal(gate.accepts(first), false); assert.throws(() => gate.begin());
  gate.finish(first); const second = gate.begin();
  gate.finish(first); assert.throws(() => gate.begin());
  assert.equal(gate.accepts(second), true); assert.equal(gate.accepts(first), false);
  gate.finish(second);
});
test('database remounts and concurrent setup share one live connection', async () => {
  let opens = 0; let resolve;
  const db = { open: true };
  const get = connectionOwner(() => { opens++; return new Promise(r => { resolve = r; }); });
  const first = get(); const remount = get();
  assert.equal(first, remount); resolve(db);
  assert.equal(await first, db); assert.equal(await get(), db); assert.equal(opens, 1);
});
test('failed database initialization can retry without retaining a failed handle', async () => {
  let opens = 0;
  const get = connectionOwner(async () => { if (++opens === 1) throw new Error('locked'); return 'fresh'; });
  await assert.rejects(get()); assert.equal(await get(), 'fresh'); assert.equal(opens, 2);
});
