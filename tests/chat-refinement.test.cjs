const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { migrateChatDatabase, insertConversation, insertMessage, listMessages } = require('../src/database/chatDatabase.ts');
const { mergeMessages, messageBlocks, acceptsMessageLoad, shouldFollowMessage } = require('../src/chat/message-data.ts');
const { wallpaperCover, bottomFadeBounds } = require('../src/chat/wallpaper-geometry.ts');

const message = (i, content = `Message ${i}`) => ({ id: `m-${String(i).padStart(4, '0')}`, conversationId: 'a', role: 'user', createdAt: Math.floor(i / 7), content });
function database(path = ':memory:') {
  const raw = new DatabaseSync(path);
  return { raw, execAsync: async (sql) => raw.exec(sql),
    getFirstAsync: async (sql, ...args) => raw.prepare(sql).get(...args),
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => raw.prepare(sql).run(...args) };
}

test('non-destructive migration and stable 50-message cursor pages with timestamp ties', async () => {
  const db = database();
  try {
    await migrateChatDatabase(db);
    await insertConversation(db, { id: 'a', title: 'Existing', createdAt: 0, updatedAt: 0 });
    const expected = Array.from({ length: 137 }, (_, i) => message(i));
    for (const item of expected) await insertMessage(db, item);
    // Simulate the pre-index database and rerun the actual migration.
    db.raw.exec('DROP INDEX messages_conversation_cursor_idx; PRAGMA user_version=1;');
    await migrateChatDatabase(db);
    assert.equal(db.raw.prepare('PRAGMA user_version').get().user_version, 4);
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 137);
    assert.ok(db.raw.prepare("SELECT name FROM sqlite_master WHERE name='messages_conversation_cursor_idx'").get());
    let page = await listMessages(db, 'a');
    assert.equal(page.messages.length, 50);
    assert.deepEqual(page.messages, expected.slice(-50));
    let all = page.messages;
    await insertMessage(db, message(200)); // Concurrent append must not shift older pages.
    while (page.hasOlder) {
      page = await listMessages(db, 'a', page.messages[0]);
      assert.ok(page.messages.length <= 50);
      all = mergeMessages(all, page.messages);
    }
    assert.deepEqual(all, expected);
    assert.deepEqual((await listMessages(db, 'missing')).messages, []);
  } finally { db.raw.close(); }
});

test('overlapping results deduplicate and preserve existing object identity', () => {
  const first = message(1), second = message(2), current = [second];
  assert.equal(mergeMessages(current, [{ ...second }]), current);
  const merged = mergeMessages(current, [first, { ...second }, first]);
  assert.deepEqual(merged, [first, second]);
  assert.equal(merged[1], second);
  assert.equal(acceptsMessageLoad(1, 2, 'a', 'a'), false);
  assert.equal(acceptsMessageLoad(2, 2, 'a', 'b'), false);
  assert.equal(acceptsMessageLoad(2, 2, 'a', 'a'), true);
});

test('initialization shares concurrent work and retries a transient native database lock', async () => {
  const db = database();
  const exec = db.execAsync;
  let schemaAttempts = 0;
  db.execAsync = async (sql) => {
    if (sql.includes('CREATE TABLE')) {
      schemaAttempts++;
      if (schemaAttempts === 1) throw new Error('NativeDatabase.execAsync: database is locked');
    }
    return exec(sql);
  };
  try {
    const first = migrateChatDatabase(db);
    assert.equal(migrateChatDatabase(db), first);
    await first;
    assert.equal(schemaAttempts, 3);
    assert.equal(db.raw.prepare('PRAGMA busy_timeout').get().timeout, 2500);
    assert.equal(db.raw.prepare('PRAGMA user_version').get().user_version, 4);
    await migrateChatDatabase(db);
    assert.equal(schemaAttempts, 3);
  } finally { db.raw.close(); }
});

test('initialization does not retry unrelated errors or leave a rejected cached task', async () => {
  const db = database();
  const read = db.getFirstAsync;
  let attempts = 0;
  db.getFirstAsync = async () => { attempts++; throw new Error('disk I/O error'); };
  try {
    await assert.rejects(migrateChatDatabase(db), /disk I\/O error/);
    assert.equal(attempts, 1);
    db.getFirstAsync = read;
    await migrateChatDatabase(db);
  } finally { db.raw.close(); }
});

test('existing database opens with another connection holding a real journal-mode lock', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'agrigrow-lock-'));
  const path = join(directory, 'chat.db');
  const db = database(path);
  let reader;
  try {
    await migrateChatDatabase(db);
    await insertConversation(db, { id: 'a', title: 'Preserved', createdAt: 0, updatedAt: 0 });
    await insertMessage(db, message(1));
    db.raw.exec('PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=0;');
    reader = new DatabaseSync(path);
    reader.exec('BEGIN;');
    reader.prepare('SELECT * FROM messages').all();
    // Reproduce the previous startup failure with an actual second connection.
    assert.throws(() => db.raw.exec('PRAGMA journal_mode=WAL;'), /database is locked/);
    // Startup must leave an existing journal mode alone and preserve the chat.
    await migrateChatDatabase(db);
    assert.deepEqual((await listMessages(db, 'a')).messages, [message(1)]);
    assert.equal(db.raw.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
  } finally {
    reader?.close();
    db.raw.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('display blocks reconstruct every character and retain the full copy source', () => {
  for (const content of ['', 'short', 'word '.repeat(701), 'paragraph\n\n'.repeat(401), 'x'.repeat(999) + '🌱'.repeat(1500)]) {
    const original = message(1, content), blocks = messageBlocks(original);
    assert.equal(blocks.map((block) => block.text).join(''), content);
    assert.equal(messageBlocks(original), blocks);
    assert.equal(blocks.filter((block) => block.first).length, 1);
    assert.equal(blocks.filter((block) => block.last).length, 1);
    assert.equal(new Set(blocks.map((block) => block.key)).size, blocks.length);
    for (const block of blocks) {
      assert.ok(block.text.length <= 1000);
      assert.equal(block.message, original);
      assert.equal(block.message.content, content);
      assert.ok(!/[\uD800-\uDBFF]$/.test(block.text));
    }
  }
});

test('follow latest only on opening, explicit send, or reply while at end', () => {
  assert.equal(shouldFollowMessage(true, 'assistant', false), true);
  assert.equal(shouldFollowMessage(false, 'user', false), true);
  assert.equal(shouldFollowMessage(false, 'assistant', true), true);
  assert.equal(shouldFollowMessage(false, 'assistant', false), false);
});

test('wallpaper cover alignment and 32-point fades track keyboard and composer growth', () => {
  for (const [width, height] of [[390, 844], [844, 390], [1080, 1920]]) {
    const cover = wallpaperCover(width, height);
    assert.ok(cover.width >= width && cover.height >= height);
    assert.equal(cover.x * 2 + cover.width, width);
    assert.equal(cover.y * 2 + cover.height, height);
  }
  assert.deepEqual(bottomFadeBounds(844, 92, 7, 0), { start: 759, border: 791 });
  assert.deepEqual(bottomFadeBounds(844, 92, 7, -300), { start: 459, border: 491 });
  assert.deepEqual(bottomFadeBounds(844, 132, 7, -300), { start: 419, border: 451 });
});
