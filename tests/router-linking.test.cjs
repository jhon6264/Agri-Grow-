const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { patchSource } = require('../scripts/patch-router-linking.cjs');
const file = path.join(path.dirname(require.resolve('expo-router/package.json')), 'build/fork/useLinking.native.js');
const source = fs.readFileSync(file, 'utf8');

function linking(getInitialURL) {
  const effects = []; const notifications = []; let listener;
  const module = { exports: {} };
  const react = { useRef: current => ({ current }), useEffect: fn => effects.push(fn), useCallback: fn => fn };
  vm.runInNewContext(source, { exports: module.exports, module, process: { env: { NODE_ENV: 'production' } },
    require: name => {
      if (name === 'react') return react;
      if (name === './extractPathFromURL') return { extractExpoPathFromURL: (_, url) => url.replace('agrigrow://', '/') };
      if (name === '../react-navigation/native') return { useNavigationIndependentTree: () => false };
      return {};
    },
  });
  const api = module.exports.useLinking({ current: null }, {
    prefixes: ['agrigrow://'], getInitialURL, getStateFromPath: path => ({ path }),
    subscribe: callback => { listener = callback; return () => {}; },
  }, path => notifications.push(path));
  return { api, notifications, commit: () => effects.forEach(effect => effect()) };
}
test('async initial URL preserves its route without notifying before commit', async () => {
  let resolve;
  const state = linking(() => new Promise(r => { resolve = r; }));
  const pending = state.api.getInitialState(); resolve('agrigrow://chat');
  assert.equal((await pending).path, '/chat');
  assert.deepEqual(state.notifications, []);
  state.commit(); assert.deepEqual(state.notifications, ['/chat']);
  state.commit(); assert.deepEqual(state.notifications, ['/chat']);
});
test('synchronous initial URL also waits for commit', async () => {
  const state = linking(() => 'agrigrow://others');
  assert.equal((await state.api.getInitialState()).path, '/others');
  assert.deepEqual(state.notifications, []);
  state.commit(); assert.deepEqual(state.notifications, ['/others']);
});
test('abandoned initial render does not dispatch a late notification', async () => {
  const state = linking(() => Promise.resolve('agrigrow://chat'));
  await state.api.getInitialState(); await Promise.resolve();
  assert.deepEqual(state.notifications, []);
});
test('postinstall patch is idempotent and rejects unexpected upstream source', () => {
  assert.equal(patchSource(source), source);
  assert.throws(() => patchSource('unrecognized source'), /source changed/);
});
