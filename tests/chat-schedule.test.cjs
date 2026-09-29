const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { migrateChatDatabase, insertConversation, insertMessage } = require('../src/database/chatDatabase.ts');
const { isScheduleIntent, scheduleReply, parseScheduleDraft, draftProblem, scheduleFromDraft,
  scheduleSummary, scheduleExtractionPrompt, relativePhilippineDay, scheduleSavedMessage,
  calendarIntent, parseCalendarIntent, parseScheduleDrafts, scheduleBulkSummary, resolveScheduleDay,
  scheduleListMessage, parseEditExtraction, draftFromSchedule, scheduleDraftDiffers,
  matchingScheduleTargets, scheduleLanguageForText, parseScheduleCommand, parseScheduleLines, isStructuredScheduleInput,
  scheduleLineSummary, parseNumberedScheduleChange, parseDirectReviewChange,
  parseScheduleReviewChange, scheduleReviewChangePrompt, parseScheduleReviewFeedback,
  scheduleReviewPrompt, scheduleListRange, numberedScheduleListMessage, referencedScheduleNumber,
  parseDeleteExtraction, scheduleDeleteSummary } = require('../src/calendar/chat-schedule.ts');
const { getPendingSchedule, putPendingSchedule, getScheduleListContext, putScheduleListContext } = require('../src/calendar/schedule-chat-store.ts');
const { insertScheduleBatch, listSchedules } = require('../src/calendar/schedule-store.ts');
const { parseMarkdown } = require('../src/chat/markdown.ts');

function database() {
  const raw = new DatabaseSync(':memory:');
  return { raw, execAsync: async sql => raw.exec(sql),
    getFirstAsync: async (sql, ...args) => raw.prepare(sql).get(...args),
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => raw.prepare(sql).run(...args),
    withExclusiveTransactionAsync: async operation => {
      raw.exec('BEGIN');
      try {
        const result = await operation({ runAsync: async (sql, ...args) => raw.prepare(sql).run(...args) });
        raw.exec('COMMIT'); return result;
      } catch (error) { raw.exec('ROLLBACK'); throw error; }
    } };
}

test('schedule requests and confirmations are narrow enough for ordinary chat', () => {
  assert.equal(isScheduleIntent('Create a schedule to water tomatoes tomorrow'), true);
  assert.equal(isScheduleIntent('Remind me to water tomatoes at 6 AM'), true);
  assert.equal(isScheduleIntent('Paalalahanan mo ako bukas'), true);
  assert.equal(isScheduleIntent('Pahinumdumi ko ugma'), true);
  assert.equal(isScheduleIntent('How do I schedule crop rotation?'), false);
  assert.equal(scheduleReply('Correct!'), 'confirm');
  assert.equal(scheduleReply('Yes, all correct'), 'confirm');
  assert.equal(scheduleReply('Make it 7 AM instead'), 'revise');
  assert.equal(scheduleReply('No'), 'ask');
  assert.equal(scheduleReply('Cancel'), 'cancel');
  assert.equal(scheduleReply('Cancel all'), 'cancel');
  assert.equal(relativePhilippineDay('tomorrow', Date.parse('2026-09-25T15:59:00Z')), '2026-09-26');
  assert.equal(relativePhilippineDay('tomorrow', Date.parse('2026-09-25T16:01:00Z')), '2026-09-27');
  assert.equal(relativePhilippineDay('ugma', Date.parse('2026-09-25T00:00:00Z')), '2026-09-26');
});

test('model output is validated, corrected fields merge, and missing values cannot be saved', () => {
  const first = parseScheduleDraft('```json\n{"title":"Water tomatoes","day":"2099-09-27","time":"06:00","reminder":true,"repeatKind":"weekly","intervalDays":1,"language":"en"}\n```');
  assert.ok(first);
  assert.equal(draftProblem(first, Date.parse('2026-09-25T00:00:00Z')), null);
  const changed = parseScheduleDraft('{"time":"07:00"}', first);
  assert.equal(changed.time, '07:00');
  assert.equal(parseScheduleDraft('{"time":"7:00 AM"}', first).time, '07:00');
  assert.equal(changed.day, first.day);
  assert.equal(changed.reminder, true);
  assert.equal(parseScheduleDraft('{"day":"2026-02-30"}', first), null);
  assert.equal(draftProblem(parseScheduleDraft('{"title":"Task","day":null,"time":null}')), 'date');
  assert.match(scheduleSummary(first), /Water tomatoes/);
  assert.match(scheduleSummary({ ...first, time: null }), /Water tomatoes/);
  assert.match(scheduleSummary({ ...first, time: null }), /Time needed/);
  assert.match(scheduleSavedMessage('Water tomatoes', 'en'), /saved to your calendar/);
  assert.match(scheduleExtractionPrompt('tomorrow', first, Date.parse('2026-09-25T00:00:00Z')), /2026-09-25/);
  assert.equal(scheduleFromDraft('schedule-1', first).id, 'schedule-1');
  assert.throws(() => scheduleFromDraft('schedule-2', { ...first, day: '2020-01-01', repeatKind: 'none' }), /future date and time/);
});

test('pending proposals survive migration and disappear with their conversation', async () => {
  const db = database();
  try {
    await migrateChatDatabase(db);
    await insertConversation(db, { id: 'c', title: 'Chat', createdAt: 1, updatedAt: 1 });
    await insertMessage(db, { id: 'm', conversationId: 'c', role: 'user', content: 'Schedule watering', createdAt: 2 });
    const draft = parseScheduleDraft('{"title":"Water tomatoes","day":"2099-09-27","time":"06:00","reminder":true,"repeatKind":"none","intervalDays":1,"language":"en"}');
    const pending = { kind: 'create', id: 'schedule-1', conversationId: 'c', drafts: [draft], stage: 'confirming', updatedAt: 3 };
    await putPendingSchedule(db, pending);
    assert.deepEqual(await getPendingSchedule(db, 'c'), pending);
    const linePending = { ...pending, format: 'lines', updatedAt: 4 };
    await putPendingSchedule(db, linePending);
    assert.deepEqual(await getPendingSchedule(db, 'c'), linePending);
    assert.equal(db.raw.prepare('PRAGMA user_version').get().user_version, 5);
    await insertConversation(db, { id: 'old', title: 'Old chat', createdAt: 1, updatedAt: 1 });
    db.raw.prepare(`INSERT INTO pending_schedule_actions (conversation_id, action_id, stage, draft_json, updated_at)
      VALUES (?, ?, ?, ?, ?)`).run('old', 'old-schedule', 'confirming', JSON.stringify(draft), 4);
    assert.deepEqual(await getPendingSchedule(db, 'old'),
      { kind: 'create', id: 'old-schedule', conversationId: 'old', drafts: [draft], stage: 'confirming', updatedAt: 4 });
    db.raw.exec('PRAGMA foreign_keys = ON; DELETE FROM conversations WHERE id = \'c\';');
    assert.equal(await getPendingSchedule(db, 'c'), null);
  } finally { db.raw.close(); }
});

test('calendar intent routes creation, lookup, and edits without hijacking farming advice', () => {
  assert.equal(calendarIntent('Create two schedules for tomorrow'), 'create');
  assert.equal(calendarIntent('Can you give me all the schedules today?'), 'list');
  assert.equal(calendarIntent('Show all my schedules'), 'list');
  assert.equal(calendarIntent("What's on Thursday?"), 'list');
  assert.equal(calendarIntent('Ano ang iskedyul ko bukas?'), 'list');
  assert.equal(calendarIntent('Unsa akong iskedyul ugma?'), 'list');
  assert.equal(scheduleLanguageForText('Unsa akong iskedyul ugma?'), 'ceb');
  assert.equal(scheduleLanguageForText('Ano ang iskedyul ko bukas?'), 'tl');
  assert.equal(calendarIntent('Move my watering schedule to 7 AM'), 'edit');
  assert.equal(calendarIntent('How do I schedule crop rotation?'), 'chat');
  assert.equal(calendarIntent('Show me how to plant tomatoes today'), 'chat');
  assert.equal(calendarIntent('What is the schedule for crop rotation?'), 'ambiguous');
  assert.equal(calendarIntent('I want to water tomatoes every day at 6 AM'), 'ambiguous');
  assert.equal(parseCalendarIntent('{"intent":"edit"}'), 'edit');
  assert.equal(parseCalendarIntent('{"intent":"delete"}'), 'delete');
  assert.equal(calendarIntent('Delete my watering schedule'), 'delete');
  assert.equal(calendarIntent('Remove feed chickens'), 'ambiguous');
  assert.equal(calendarIntent('Move #2 to 9 AM'), 'edit');
  assert.equal(calendarIntent('Show my schedules at 6 AM and 8 AM'), 'list');
  assert.equal(calendarIntent('Move my watering schedule from 6 AM to 8 AM'), 'edit');
  assert.equal(calendarIntent('Tomorrow water tomatoes at 6 AM and feed chickens at 8 AM'), 'create');
});

test('bulk extraction retains separate times, rejects malformed batches, and reviews all items', () => {
  const raw = JSON.stringify({ items: [
    { title: 'Water tomatoes', day: '2099-09-27', time: '06:00', reminder: true, repeatKind: 'none' },
    { title: 'Feed chickens', day: '2099-09-27', time: '08:30', reminder: false, repeatKind: 'none' },
  ] });
  const drafts = parseScheduleDrafts(raw);
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts.map(item => item.time), ['06:00', '08:30']);
  assert.match(scheduleBulkSummary(drafts), /all/);
  assert.match(scheduleBulkSummary(drafts), /Feed chickens/);
  assert.equal(parseScheduleDrafts(JSON.stringify({ items: Array(11).fill({ title: 'A' }) })), null);
  assert.equal(parseScheduleDrafts('{"items":[{"day":"2099-02-30"}]}'), null);
  assert.equal(parseScheduleDrafts('{"items":[{"time":"07:00"}]}', drafts), null);
});

test('dot is excluded and slash commands route without taking over ordinary punctuation', () => {
  assert.equal(parseScheduleCommand('.'), null);
  assert.equal(parseScheduleCommand('. list tomorrow'), null);
  assert.equal(parseScheduleCommand('. edit Water tomatoes to 7am'), null);
  assert.deepEqual(parseScheduleCommand('/sched view Thursday'), { action: 'list', body: 'Thursday' });
  assert.deepEqual(parseScheduleCommand('/sched add 6am Water'), { action: 'create', body: '6am Water' });
  assert.deepEqual(parseScheduleCommand('/sched delete Water'), { action: 'delete', body: 'Water' });
  assert.equal(parseScheduleCommand('Hello. Schedule watering'), null);
  assert.equal(parseScheduleCommand('.Hello'), null);
});

test('schedule lines preserve every item, PH defaults, and numbered correction', () => {
  const now = Date.parse('2026-09-25T00:00:00Z');
  assert.equal(isStructuredScheduleInput('6am, Water tomatoes\n8am, Feed chickens'), true);
  assert.equal(isStructuredScheduleInput('Water tomatoes tomorrow at 6am\nFeed chickens tomorrow at 8am'), false);
  const parsed = parseScheduleLines('1. 6am, "hello world baby"\n2. 7am, tomorrow "yes baby koo" reminder on\n3. Thursday, 4:30 PM | Check leaves | repeat weekly', now);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.drafts.map(item => [item.title, item.day, item.time, item.reminder, item.repeatKind]), [
    ['hello world baby', '2026-09-25', '06:00', false, 'none'],
    ['yes baby koo', '2026-09-26', '07:00', true, 'none'],
    ['Check leaves', '2026-10-01', '16:30', false, 'weekly'],
  ]);
  const summary = scheduleLineSummary(parsed.drafts, now);
  assert.match(summary, /1\. hello world baby/);
  assert.match(summary, /3\. Check leaves/);
  assert.match(summary, /Reminder: Off/);
  const changed = parseNumberedScheduleChange('change #2 to 10 AM', parsed.drafts);
  assert.equal(changed[1].time, '10:00');
  assert.equal(changed[0].time, '06:00');
  assert.equal(parseNumberedScheduleChange('change #4 to 10 AM', parsed.drafts), null);
});

test('line errors reject the entire batch and past times are flagged', () => {
  const now = Date.parse('2026-09-25T04:00:00Z');
  const incomplete = parseScheduleLines('6am, "Past watering"\n7am, tomorrow "Next watering"', now);
  assert.deepEqual(incomplete.errors, []);
  assert.match(scheduleLineSummary(incomplete.drafts, now), /already passed/);
  assert.match(scheduleLineSummary(incomplete.drafts, now), /Nothing has been saved/);
  const malformed = parseScheduleLines('6am, "Good"\nnot a schedule\n8am, "Also good"', now);
  assert.equal(malformed.drafts.length, 0);
  assert.match(malformed.errors[0], /#2/);
  assert.equal(parseScheduleLines('6am, "Task" reminder maybe', now).drafts.length, 0);
  assert.deepEqual(parseScheduleLines('7am, "Check reminder on label" reminder off', now).drafts
    .map(item => [item.title, item.reminder]), [['Check reminder on label', false]]);
  assert.equal(parseScheduleLines('6am, "Task"\n'.repeat(11), now).drafts.length, 0);
});

test('review replies patch only the requested schedules and always return to review', () => {
  const now = Date.parse('2026-09-25T00:00:00Z');
  const drafts = parseScheduleLines('6pm, "Water tomatoes"\n7pm, "Feed chickens"', now).drafts;
  const both = parseDirectReviewChange('reminder on for both', drafts);
  assert.deepEqual(both.map(item => item.reminder), [true, true]);
  assert.deepEqual(both.map(item => item.time), ['18:00', '19:00']);
  assert.deepEqual(drafts.map(item => item.reminder), [false, false]);
  assert.deepEqual(parseDirectReviewChange('Yes, but turn on reminders for both', drafts)
    .map(item => item.reminder), [true, true]);
  assert.deepEqual(parseDirectReviewChange('make second reminder on', drafts)
    .map(item => item.reminder), [false, true]);
  assert.equal(parseDirectReviewChange('reminder on for both and move #2', drafts), null);
  assert.equal(parseDirectReviewChange('reminder on for #3', drafts), null);
  const raw = JSON.stringify({ updates: [
    { targets: [1, 2], changes: { reminder: true } },
    { targets: [2], changes: { time: '8:00 PM', day: 'tomorrow' } },
  ], question: null });
  const review = parseScheduleReviewChange(raw, drafts, now);
  assert.equal(review.kind, 'updated');
  assert.deepEqual(review.drafts.map(item => [item.title, item.day, item.time, item.reminder]), [
    ['Water tomatoes', '2026-09-25', '18:00', true],
    ['Feed chickens', '2026-09-26', '20:00', true],
  ]);
  assert.match(scheduleReviewChangePrompt('reminder on for both', drafts, now), /even after saying yes\/correct/);
});

test('ambiguous and invalid review patches leave the original proposal untouched', () => {
  const drafts = parseScheduleLines('6pm, "Water tomatoes"\n7pm, "Feed chickens"', Date.parse('2026-09-25T00:00:00Z')).drafts;
  const parse = raw => parseScheduleReviewChange(JSON.stringify(raw), drafts);
  assert.deepEqual(parse({ updates: [], question: 'Which one?' }), { kind: 'clarify', question: 'Which one?' });
  assert.equal(parse({ updates: [{ targets: [3], changes: { reminder: true } }] }), null);
  assert.equal(parse({ updates: [{ targets: [1], changes: { time: '25:00' } }] }), null);
  assert.equal(parse({ updates: [{ targets: [1], changes: { time: null, reminder: true } }] }), null);
  assert.equal(parse({ updates: [{ targets: [1], changes: { imaginary: true } }] }), null);
  assert.equal(parse({ updates: [{ targets: [1], changes: { reminder: false } }] }), null);
  assert.deepEqual(drafts.map(item => item.reminder), [false, false]);
});

test('calendar lookup resolves Philippine dates and formats only supplied occurrences', () => {
  const now = Date.parse('2026-09-25T16:01:00Z'); // Saturday, September 26 in Manila.
  assert.equal(resolveScheduleDay('tomorrow', now), '2026-09-27');
  assert.equal(resolveScheduleDay('Thursday', now), '2026-10-01');
  assert.equal(resolveScheduleDay('next Thursday', now), '2026-10-08');
  const day = '2026-09-27';
  const item = { id: 'a', seriesId: 'a', title: 'Water | tomatoes', day,
    at: Date.parse('2026-09-27T00:00:00Z'), reminder: 1, repeatKind: 'none', intervalDays: 1 };
  const answer = scheduleListMessage(day, [item], now);
  assert.match(answer, /Water \\\| tomatoes/);
  assert.match(answer, /1 schedule total/);
  assert.match(scheduleListMessage(day, [], now), /no schedules/);
  assert.match(scheduleListMessage(day, [], now, 'tl'), /Wala kang iskedyul/);
});

test('edit extraction and matching require a real target and preserve unchanged fields', () => {
  const current = { id: 'a', title: 'Water tomatoes', day: '2099-09-27',
    at: Date.parse('2099-09-26T22:00:00Z'), reminder: 1, notificationId: null,
    repeatKind: 'weekly', intervalDays: 1 };
  const extracted = parseEditExtraction('{"target":"Water tomatoes","changes":{"time":"7:00 AM"},"language":"en"}');
  assert.deepEqual(extracted.changes, { time: '07:00' });
  const draft = { ...draftFromSchedule(current), ...extracted.changes };
  assert.equal(draft.title, 'Water tomatoes');
  assert.equal(scheduleDraftDiffers(current, draft), true);
  assert.equal(scheduleDraftDiffers(current, draftFromSchedule(current)), false);
  assert.deepEqual(matchingScheduleTargets([current], 'Water tomatoes', ''), [current]);
  assert.equal(parseEditExtraction('{"target":"Water tomatoes","changes":{"day":"2026-02-30"}}'), null);
});

test('bulk insertion rolls back every row if a later item conflicts', async () => {
  const db = database();
  const schedule = id => ({ id, title: id, day: '2099-09-27', at: Date.parse('2099-09-26T22:00:00Z'),
    reminder: 0, notificationId: null, repeatKind: 'none', intervalDays: 1 });
  try {
    await insertScheduleBatch(db, [schedule('first'), schedule('second')]);
    await assert.rejects(insertScheduleBatch(db, [schedule('third'), schedule('first')]));
    assert.deepEqual(db.raw.prepare('SELECT id FROM schedules ORDER BY id').all().map(row => row.id), ['first', 'second']);
  } finally { db.raw.close(); }
});

test('an edit review survives restart and queries include recurring occurrences', async () => {
  const db = database();
  const original = { id: 'weekly', title: 'Water tomatoes', day: '2099-09-25',
    at: Date.parse('2099-09-24T22:00:00Z'), reminder: 0, notificationId: null,
    repeatKind: 'weekly', intervalDays: 1 };
  try {
    await migrateChatDatabase(db);
    await insertConversation(db, { id: 'chat', title: 'Chat', createdAt: 1, updatedAt: 1 });
    await insertScheduleBatch(db, [original]);
    const draft = { ...draftFromSchedule(original), time: '07:00' };
    const pending = { kind: 'edit', id: 'edit-1', conversationId: 'chat', stage: 'confirming',
      targetId: original.id, snapshot: original, draft, changes: { time: '07:00' },
      targetQuery: original.title, candidateIds: [], updatedAt: 2 };
    await putPendingSchedule(db, pending);
    assert.deepEqual(await getPendingSchedule(db, 'chat'), pending);
    const day = '2099-10-02';
    assert.equal((await listSchedules(db, day, day))[0].seriesId, original.id);
  } finally { db.raw.close(); }
});

test('semantic review feedback handles contrasting settings like 1 and 2 on and 3 off', () => {
  const drafts = [
    { title: 'Water tomatoes', day: '2026-09-25', time: '06:00', reminder: false, repeatKind: 'none', intervalDays: 1, language: 'en' },
    { title: 'Feed chickens', day: '2026-09-25', time: '07:00', reminder: false, repeatKind: 'none', intervalDays: 1, language: 'en' },
    { title: 'Harvest chili', day: '2026-09-25', time: '17:00', reminder: false, repeatKind: 'none', intervalDays: 1, language: 'en' },
  ];
  const rawUpdate = JSON.stringify({
    intent: 'update',
    operations: [
      { action: 'change', targets: [1, 2], changes: { reminder: true } },
      { action: 'change', targets: [3], changes: { reminder: false } },
    ],
  });
  const result = parseScheduleReviewFeedback(rawUpdate, drafts);
  assert.equal(result.kind, 'updated');
  assert.equal(result.drafts[0].reminder, true);
  assert.equal(result.drafts[1].reminder, true);
  assert.equal(result.drafts[2].reminder, false);
  assert.equal(parseScheduleReviewFeedback(JSON.stringify({ intent: 'update', items: drafts }), drafts), null);

  assert.deepEqual(parseScheduleReviewFeedback('{"intent":"confirm"}', drafts), { kind: 'confirm' });
  assert.deepEqual(parseScheduleReviewFeedback('{"intent":"cancel"}', drafts), { kind: 'cancel' });
  assert.match(scheduleReviewPrompt('make 1 and 2 reminder on and 3 off', drafts), /unsaved schedule/);
});

test('review operations preserve untouched schedules and support removal and addition', () => {
  const now = Date.parse('2026-09-25T00:00:00Z');
  const drafts = parseScheduleLines('6pm, "Water tomatoes"\n7pm, "Feed chickens"', now).drafts;
  const reply = parseScheduleReviewFeedback(JSON.stringify({ intent: 'update', operations: [
    { action: 'change', targets: [1], changes: { reminder: true } },
    { action: 'remove', targets: [2] },
    { action: 'add', item: { title: 'Check field', day: '2026-09-26', time: '08:00', reminder: false } },
  ] }), drafts, now);
  assert.equal(reply.kind, 'updated');
  assert.deepEqual(reply.drafts.map(item => [item.title, item.time, item.reminder]), [
    ['Water tomatoes', '18:00', true], ['Check field', '08:00', false],
  ]);
  assert.deepEqual(drafts.map(item => item.reminder), [false, false]);
  assert.equal(parseScheduleReviewFeedback(JSON.stringify({ intent: 'update', operations: [
    { action: 'remove', targets: 'all' },
  ] }), drafts, now), null);
  assert.equal(parseScheduleReviewFeedback(JSON.stringify({ intent: 'update', operations: [
    { action: 'change', targets: [3], changes: { time: '09:00' } },
  ] }), drafts, now), null);
  assert.equal(parseScheduleReviewFeedback(JSON.stringify({ intent: 'update', operations: [
    { action: 'add', item: { title: 'Check field', day: '2026-09-26', time: '08:00', reminder: 'banana' } },
  ] }), drafts, now), null);
});

test('numbered calendar lists preserve selection across chat reloads', async () => {
  const db = database();
  try {
    await migrateChatDatabase(db);
    await insertConversation(db, { id: 'list-chat', title: 'Calendar', createdAt: 1, updatedAt: 1 });
    await putScheduleListContext(db, 'list-chat', ['series-a', 'series-b']);
    assert.deepEqual(await getScheduleListContext(db, 'list-chat'), ['series-a', 'series-b']);
    assert.equal(referencedScheduleNumber('Move #2 to 9 AM'), 2);
    assert.equal(referencedScheduleNumber('delete the second one'), 2);
    assert.equal(referencedScheduleNumber('2'), 2);
    assert.equal(parseDeleteExtraction('{"target":"Feed chickens"}'), 'Feed chickens');
    const now = Date.parse('2026-09-25T00:00:00Z');
    assert.deepEqual(scheduleListRange('this week', now), { from: '2026-09-21', to: '2026-09-27' });
    assert.deepEqual(scheduleListRange('next 7 days', now), { from: '2026-09-25', to: '2026-10-01' });
    assert.deepEqual(scheduleListRange('all my schedules', now), { from: '2026-09-25', to: '2026-10-24' });
    const item = { id: 'series-a', seriesId: 'series-a', title: 'Water tomatoes', day: '2026-09-26',
      at: Date.parse('2026-09-25T22:00:00Z'), reminder: 0, repeatKind: 'none', intervalDays: 1 };
    assert.match(numberedScheduleListMessage('2026-09-26', '2026-09-26', [item], now), /1\. \*\*Water tomatoes\*\*/);
    assert.match(scheduleDeleteSummary({ ...item, repeatKind: 'weekly' }), /entire weekly series/);
    const pendingDelete = { kind: 'delete', id: 'remove-1', conversationId: 'list-chat', stage: 'confirming',
      targetId: 'series-a', snapshot: item, targetQuery: 'Water tomatoes', candidateIds: [], updatedAt: now };
    await putPendingSchedule(db, pendingDelete);
    assert.deepEqual(await getPendingSchedule(db, 'list-chat'), pendingDelete);
    db.raw.exec("PRAGMA foreign_keys = ON; DELETE FROM conversations WHERE id = 'list-chat';");
    assert.deepEqual(await getScheduleListContext(db, 'list-chat'), []);
  } finally { db.raw.close(); }
});

test('parseScheduleDrafts handles SLM greetings, conversational text, and repeated JSON blocks', () => {
  const slmOutput = 'Hello! How can I assist you today with your agriculture, technology, science, or any other problem-solving needs? ' +
    '{"items":[{"title":"Larga na kay muskwela","day":"2026-09-29","time":"09:00","reminder":true,"repeatKind":"none","language":"en"},' +
    '{"title":"presentation","day":"2026-09-29","time":"22:00","reminder":true,"repeatKind":"none","language":"en"}]}' +
    '{"items":[{"title":"Larga na kay muskwela","day":"2026-09-29","time":"09:00","reminder":true,"repeatKind":"none","language":"en"},' +
    '{"title":"presentation","day":"2026-09-29","time":"22:00","reminder":true,"repeatKind":"none","language":"en"}]}';

  const drafts = parseScheduleDrafts(slmOutput);
  assert.ok(drafts);
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].title, 'Larga na kay muskwela');
  assert.equal(drafts[0].time, '09:00');
  assert.equal(drafts[0].reminder, true);
  assert.equal(drafts[1].title, 'presentation');
  assert.equal(drafts[1].time, '22:00');
  assert.equal(drafts[1].reminder, true);

  const summary = scheduleBulkSummary(drafts);
  assert.match(summary, /Larga na kay muskwela/);
  assert.match(summary, /presentation/);
  assert.match(summary, /09:00/);
  assert.match(summary, /22:00/);
});

test('Markdown tables generate compact content-aware column widths', () => {
  const table = '| # | Task | When | Repeat | Reminder |\n' +
    '|---|---|---|---|---|\n' +
    '| 1 | Larga na kay muskwela | 2026-09-29 09:00 PH | None | On |\n' +
    '| 2 | presentation | 2026-09-29 22:00 PH | None | On |';
  const nodes = parseMarkdown(table);
  const tableNode = nodes.find(n => n.type === 'table');
  assert.ok(tableNode);
  assert.ok(tableNode.widths);
  assert.equal(tableNode.widths.length, 5);
  // Column 0 (#) should be compact 38px
  assert.equal(tableNode.widths[0], 38);
  // Repeat & Reminder columns should be compact (< 85px)
  assert.ok(tableNode.widths[3] <= 85);
  assert.ok(tableNode.widths[4] <= 85);
});


