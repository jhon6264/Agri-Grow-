const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Calendar index isolates greeting typewriter into memoized GreetingTitle', () => {
  const file = path.join(__dirname, '..', 'app', '(tabs)', 'index.tsx');
  const source = fs.readFileSync(file, 'utf8');

  // Must have GreetingTitle component wrapped in memo with its own typed state
  assert.ok(source.includes('const GreetingTitle = memo(function GreetingTitle'), 'GreetingTitle must be memoized');
  const calendarScreenDef = source.slice(source.indexOf('export default function CalendarScreen'));
  assert.ok(!calendarScreenDef.includes('const [typed, setTyped]'), 'typed state must not exist inside CalendarScreen');
  assert.ok(source.includes('<GreetingTitle greeting={greeting} />'), 'Must render GreetingTitle component');
});

test('AlmanacScreen uses virtualized FlatList instead of ScrollView .map()', () => {
  const file = path.join(__dirname, '..', 'app', 'almanac.tsx');
  const source = fs.readFileSync(file, 'utf8');

  // Must use FlatList
  assert.ok(source.includes('<FlatList'), 'AlmanacScreen must use FlatList');
  assert.ok(source.includes('initialNumToRender={8}'), 'FlatList must have initialNumToRender');
  assert.ok(source.includes('removeClippedSubviews'), 'FlatList must clip offscreen subviews');
  // CropCard must be wrapped in memo
  assert.ok(source.includes('const CropCard = memo(function CropCard'), 'CropCard must be memoized');
});

test('MarketPricesScreen memoizes ProductRow', () => {
  const file = path.join(__dirname, '..', 'app', 'market-prices.tsx');
  const source = fs.readFileSync(file, 'utf8');

  assert.ok(source.includes('const ProductRow = memo(function ProductRow'), 'ProductRow must be memoized');
});

test('Main tabs scaffold keeps Slot in a single stable JSX position', () => {
  const file = path.join(__dirname, '..', 'app', '(tabs)', '_layout.tsx');
  const source = fs.readFileSync(file, 'utf8');

  // Count occurrences of <Slot /> in _layout.tsx
  const slotCount = (source.match(/<Slot\s*\/>/g) || []).length;
  assert.equal(slotCount, 1, 'There must only be 1 stable <Slot /> in (tabs)/_layout.tsx');
});

test('ContentProvider throttles automatic checkForUpdates', () => {
  const file = path.join(__dirname, '..', 'src', 'others', 'ContentProvider.tsx');
  const source = fs.readFileSync(file, 'utf8');

  assert.ok(source.includes('lastCheckedTime'), 'Must track lastCheckedTime');
  assert.ok(source.includes('Date.now() - lastCheckedTime.current < 120000'), 'Must throttle automatic update checks to 2 minutes');
});
