const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { insertConversation, insertMessage, listMessages, migrateChatDatabase, parseMessageCards } = require('../src/database/chatDatabase.ts');

const weather = { version: 1, kind: 'weather', period: 'afternoon', loadedAt: 100,
  day: { forecastDate: '2026-09-26', periods: { afternoon: { condition: 'rainy', temperatureC: 27 } } } };
const prices = { version: 1, kind: 'prices', loadedAt: 100,
  rows: [{ id: 'eggplant', commodityName: 'Eggplant', category: 'vegetable', amount: 75,
    previousAmount: 60, observedAt: '2026-09-24' }] };
const crop = { version: 1, kind: 'crop', cropId: 'kamatis' };

test('version 4 migration stores cards and reloads them from SQLite', async () => {
  const raw = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql) => raw.exec(sql),
    getFirstAsync: async (sql, ...args) => raw.prepare(sql).get(...args),
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => raw.prepare(sql).run(...args),
  };
  try {
    await migrateChatDatabase(db);
    raw.exec('DROP TABLE message_cards; PRAGMA user_version = 4;');
    await migrateChatDatabase(db);
    assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 5);
    await insertConversation(db, { id: 'c1', title: 'Data cards', createdAt: 100, updatedAt: 100 });
    await insertMessage(db, { id: 'm1', conversationId: 'c1', role: 'assistant',
      content: 'Here is the data.', createdAt: 123, cards: [weather, prices, crop] });
    const loaded = await listMessages(db, 'c1');
    assert.deepEqual(loaded.messages[0].cards, [weather, prices, crop]);
    assert.equal(loaded.hasOlder, false);
  } finally { raw.close(); }
});

test('card parser ignores damaged or unsupported saved payloads', () => {
  assert.equal(parseMessageCards('{invalid'), undefined);
  assert.equal(parseMessageCards(JSON.stringify([{ version: 2, kind: 'crop', cropId: 'kamatis' }])), undefined);
  assert.deepEqual(parseMessageCards(JSON.stringify([crop, { version: 1, kind: 'prices', rows: [{}] }])), [crop]);
});
