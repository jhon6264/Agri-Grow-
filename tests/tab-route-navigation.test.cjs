const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveCurrentTab } = require('../src/navigation/tab-resolver.ts');

test('resolveCurrentTab maps standard tab routes correctly', () => {
  assert.equal(resolveCurrentTab('/', 'calendar'), 'calendar');
  assert.equal(resolveCurrentTab('/index', 'calendar'), 'calendar');
  assert.equal(resolveCurrentTab('', 'calendar'), 'calendar');
  assert.equal(resolveCurrentTab('/chat', 'calendar'), 'chat');
  assert.equal(resolveCurrentTab('/others', 'calendar'), 'others');
});

test('resolveCurrentTab retains active tab when navigating to sub-routes from Others', () => {
  const previousTab = 'others';
  // The 3 screens opened from Others
  assert.equal(resolveCurrentTab('/weather', previousTab), 'others');
  assert.equal(resolveCurrentTab('/market-prices', previousTab), 'others');
  assert.equal(resolveCurrentTab('/almanac', previousTab), 'others');

  // Verify derived layout booleans for weather
  const currentTabWeather = resolveCurrentTab('/weather', previousTab);
  const isChatWeather = currentTabWeather === 'chat';
  const isOthersWeather = currentTabWeather === 'others';
  const isCalendarWeather = currentTabWeather === 'calendar' && ('/weather' === '/' || '/weather' === '/index' || '/weather' === '');

  assert.equal(isOthersWeather, true, 'isOthers must remain true on /weather');
  assert.equal(isCalendarWeather, false, 'isCalendar must NOT be true on /weather');
  assert.equal(isChatWeather, false, 'isChat must be false on /weather');

  // Verify derived layout booleans for market-prices
  const currentTabPrices = resolveCurrentTab('/market-prices', previousTab);
  const isOthersPrices = currentTabPrices === 'others';
  const isCalendarPrices = currentTabPrices === 'calendar' && ('/market-prices' === '/' || '/market-prices' === '/index' || '/market-prices' === '');
  assert.equal(isOthersPrices, true, 'isOthers must remain true on /market-prices');
  assert.equal(isCalendarPrices, false, 'isCalendar must NOT be true on /market-prices');

  // Verify derived layout booleans for almanac
  const currentTabAlmanac = resolveCurrentTab('/almanac', previousTab);
  const isOthersAlmanac = currentTabAlmanac === 'others';
  const isCalendarAlmanac = currentTabAlmanac === 'calendar' && ('/almanac' === '/' || '/almanac' === '/index' || '/almanac' === '');
  assert.equal(isOthersAlmanac, true, 'isOthers must remain true on /almanac');
  assert.equal(isCalendarAlmanac, false, 'isCalendar must NOT be true on /almanac');
});

test('resolveCurrentTab retains active tab when navigating to sub-routes from Calendar', () => {
  const previousTab = 'calendar';
  assert.equal(resolveCurrentTab('/add-schedule', previousTab), 'calendar');
  assert.equal(resolveCurrentTab('/modal', previousTab), 'calendar');

  const currentTabSchedule = resolveCurrentTab('/add-schedule', previousTab);
  const isCalendarSchedule = currentTabSchedule === 'calendar' && ('/add-schedule' === '/' || '/add-schedule' === '/index' || '/add-schedule' === '');
  assert.equal(isCalendarSchedule, false, 'isCalendar overlay should only be active directly on calendar index');
});

test('resolveCurrentTab transitions between tabs cleanly', () => {
  let tab = 'calendar';
  tab = resolveCurrentTab('/others', tab);
  assert.equal(tab, 'others');

  // Pushes weather from others
  tab = resolveCurrentTab('/weather', tab);
  assert.equal(tab, 'others');

  // Returns back to others
  tab = resolveCurrentTab('/others', tab);
  assert.equal(tab, 'others');

  // Switches to chat
  tab = resolveCurrentTab('/chat', tab);
  assert.equal(tab, 'chat');

  // Switches to calendar
  tab = resolveCurrentTab('/', tab);
  assert.equal(tab, 'calendar');
});
