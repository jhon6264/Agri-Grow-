const { test } = require('node:test');
const assert = require('node:assert/strict');
const { phDateKey, phGreeting, nextPhGreetingChange, frontFirst, weekDays, monthCells, dayCardColor, phTimestamp, scheduleTimeParts, orderSchedulesForDay } = require('../src/calendar/calendar-time.ts');
const { occursOn, expandSchedules } = require('../src/calendar/recurrence.ts');

test('Philippine midnight changes today and the Sunday week without changing cards early', () => {
  const before = Date.parse('2026-09-26T15:59:59Z');
  const after = Date.parse('2026-09-26T16:00:00Z');
  assert.equal(phDateKey(before), '2026-09-26');
  assert.equal(phDateKey(after), '2026-09-27');
  assert.deepEqual(weekDays('2026-09-23'), weekDays('2026-09-26'));
  assert.equal(weekDays('2026-09-27')[0], '2026-09-27');
  assert.equal(frontFirst('2026-09-23')[0], '2026-09-23');
  assert.equal(new Set(frontFirst('2026-09-23')).size, 7);
});
test('greeting wakes only when it can change', () => {
  const morning = Date.parse('2026-09-25T03:59:59Z');
  assert.equal(phGreeting(morning), 'Good Morning, Jhon');
  assert.equal(nextPhGreetingChange(morning), Date.parse('2026-09-25T04:00:00Z'));
  assert.equal(phGreeting(nextPhGreetingChange(morning)), 'Good Afternoon, Jhon');
  const evening = Date.parse('2026-09-25T15:59:59Z');
  assert.equal(nextPhGreetingChange(evening), Date.parse('2026-09-25T16:00:00Z'));
});
test('current month handles leap February and Sunday starting columns', () => {
  const cells = monthCells('2028-02-19');
  assert.equal(cells.filter(Boolean).length, 29);
  assert.equal(cells.findIndex(Boolean), 2);
  assert.equal(cells.length % 7, 0);
});
test('cards follow consecutive days across weekends, months, and years', () => {
  assert.deepEqual(frontFirst('2026-09-25'), [
    '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28',
    '2026-09-29', '2026-09-30', '2026-10-01',
  ]);
  assert.deepEqual(frontFirst('2026-12-30'), [
    '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
    '2027-01-03', '2027-01-04', '2027-01-05',
  ]);
  assert.deepEqual(frontFirst('2028-02-28').slice(0, 3), ['2028-02-28', '2028-02-29', '2028-03-01']);
  assert.equal(new Set(frontFirst('2026-09-25').map(dayCardColor)).size, 7);
});

test('today puts nearest upcoming schedules first, then passed schedules in the order they passed', () => {
  const day = '2026-09-25';
  const at = (id, hour, minute, date = day) => ({ id, day: date, at: phTimestamp(date, hour, minute) });
  const schedules = [at('past-old', 8, 0), at('upcoming-b', 11, 0), at('past-new', 9, 30),
    at('upcoming-a', 10, 0), at('same-b', 12, 0), at('same-a', 12, 0), at('other', 7, 0, '2026-09-26')];
  const now = phTimestamp(day, 9, 55);
  assert.deepEqual(orderSchedulesForDay(schedules, day, now).map(item => item.id),
    ['upcoming-a', 'upcoming-b', 'same-a', 'same-b', 'past-old', 'past-new']);
  assert.deepEqual(orderSchedulesForDay(schedules, day, phTimestamp(day, 12, 1)).map(item => item.id),
    ['past-old', 'past-new', 'upcoming-a', 'upcoming-b', 'same-a', 'same-b']);
  assert.deepEqual(orderSchedulesForDay(schedules, '2026-09-26', now).map(item => item.id), ['other']);
});

test('recurring series expands only visible days across Philippine month boundaries', () => {
  const record = (id, day, repeatKind, intervalDays = 1) => ({ id, title: id, day,
    at: phTimestamp(day, 8, 30), reminder: 0, notificationId: null, repeatKind, intervalDays });
  const rows = [record('once', '2028-02-29', 'none'), record('daily', '2028-02-28', 'daily'),
    record('weekly', '2028-02-24', 'weekly'), record('custom', '2028-02-27', 'interval', 3)];
  const visible = expandSchedules(rows, '2028-02-29', '2028-03-02');
  assert.deepEqual(visible.filter(item => item.seriesId === 'daily').map(item => item.day),
    ['2028-02-29', '2028-03-01', '2028-03-02']);
  assert.deepEqual(visible.filter(item => item.seriesId === 'weekly').map(item => item.day), ['2028-03-02']);
  assert.deepEqual(visible.filter(item => item.seriesId === 'custom').map(item => item.day), ['2028-03-01']);
  assert.equal(visible.find(item => item.seriesId === 'once').id, 'once');
  assert.equal(visible.find(item => item.seriesId === 'daily').at, phTimestamp('2028-02-29', 8, 30));
  assert.equal(occursOn(rows[3], '2028-02-29'), false);
});

test('schedule time separates PH time and AM/PM', () => {
  assert.deepEqual(scheduleTimeParts(phTimestamp('2026-09-25', 9, 5)), { time: '9:05', period: 'AM' });
  assert.deepEqual(scheduleTimeParts(phTimestamp('2026-09-25', 12, 30)), { time: '12:30', period: 'PM' });
});
