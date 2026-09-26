import type { SQLiteDatabase } from 'expo-sqlite';

import type { ChatMessage, ChatRole, Conversation } from '@/src/chat/chat-types';
import type { MessageCursor } from '@/src/chat/message-data';

const DATABASE_VERSION = 4;
export const MESSAGE_PAGE_SIZE = 50;

type ConversationRow = {
  id: string;
  title: string;
  is_pinned: number;
  pinned_at: number | null;
  created_at: number;
  updated_at: number;
  last_message_preview: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  created_at: number;
  status?: ChatMessage['status'];
  attachment_json?: string | null;
};

const mapConversation = (row: ConversationRow): Conversation => ({
  id: row.id,
  title: row.title,
  isPinned: row.is_pinned === 1,
  pinnedAt: row.pinned_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastMessagePreview: row.last_message_preview,
});

const mapMessage = (row: MessageRow): ChatMessage => ({
  id: row.id,
  conversationId: row.conversation_id,
  role: row.role,
  content: row.content,
  createdAt: row.created_at,
  ...(row.status && row.status !== 'complete' ? { status: row.status } : {}),
  ...(row.attachment_json ? { attachment: JSON.parse(row.attachment_json) } : {}),
});

const migrations = new WeakMap<SQLiteDatabase, Promise<void>>();

export function migrateChatDatabase(db: SQLiteDatabase): Promise<void> {
  const pending = migrations.get(db);
  if (pending) return pending;
  const task = initializeChatDatabase(db).finally(() => {
    migrations.delete(db);
  });
  migrations.set(db, task);
  return task;
}

async function initializeChatDatabase(db: SQLiteDatabase) {
  // Configure this connection before any operation that can encounter another writer.
  await db.execAsync('PRAGMA busy_timeout = 2500; PRAGMA foreign_keys = ON;');
  for (let attempt = 0; ; attempt++) {
    try {
      await applyChatMigration(db);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= 2 || !/database (?:table |schema )?is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(message)) throw error;
      // Some journal/schema locks return immediately despite busy_timeout.
      // Every migration statement is idempotent, so partial attempts are safe to retry.
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}

async function applyChatMigration(db: SQLiteDatabase) {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  // Journal mode is persistent. Existing databases must not acquire an exclusive
  // journal-mode lock on every startup (including development reloads).
  if (currentVersion === 0) {
    const mode = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
    if (mode?.journal_mode.toLowerCase() !== 'wal') {
      await db.execAsync('PRAGMA journal_mode = WAL;');
    }
  }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      pinned_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_message_preview TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
      ON messages (conversation_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS messages_conversation_cursor_idx
      ON messages (conversation_id, created_at ASC, id ASC);
  `);

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(messages)');
  if (!columns.some((column) => column.name === 'status')) {
    await db.execAsync("ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'complete'");
  }
  await db.execAsync(`CREATE TABLE IF NOT EXISTS message_attachments (
    message_id TEXT PRIMARY KEY NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    attachment_json TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS pending_schedule_actions (
    conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    action_id TEXT NOT NULL,
    stage TEXT NOT NULL CHECK (stage IN ('clarifying', 'confirming')),
    draft_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  ); PRAGMA user_version = ${DATABASE_VERSION}`);
}

export async function listConversations(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<ConversationRow>(`
    SELECT id, title, is_pinned, pinned_at, created_at, updated_at, last_message_preview
    FROM conversations
    ORDER BY is_pinned DESC,
      CASE WHEN is_pinned = 1 THEN pinned_at ELSE updated_at END DESC,
      updated_at DESC
  `);

  return rows.map(mapConversation);
}

export async function listMessages(db: SQLiteDatabase, conversationId: string, before?: MessageCursor) {
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT id, conversation_id, role, content, created_at, status,
       (SELECT attachment_json FROM message_attachments WHERE message_id = messages.id) AS attachment_json
     FROM messages
     WHERE conversation_id = ? ${before ? 'AND (created_at, id) < (?, ?)' : ''}
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    conversationId,
    ...(before ? [before.createdAt, before.id] : []),
    MESSAGE_PAGE_SIZE + 1,
  );

  return { messages: rows.slice(0, MESSAGE_PAGE_SIZE).reverse().map(mapMessage), hasOlder: rows.length > MESSAGE_PAGE_SIZE };
}

export async function insertConversation(
  db: SQLiteDatabase,
  conversation: Pick<Conversation, 'id' | 'title' | 'createdAt' | 'updatedAt'>,
) {
  await db.runAsync(
    `INSERT INTO conversations (id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    conversation.id,
    conversation.title,
    conversation.createdAt,
    conversation.updatedAt,
  );
}

export async function insertMessage(db: SQLiteDatabase, message: ChatMessage) {
  await db.runAsync(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    message.id,
    message.conversationId,
    message.role,
    message.content,
    message.createdAt,
    message.status ?? 'complete',
  );
  if (message.attachment) {
    try { await db.runAsync('INSERT INTO message_attachments (message_id, attachment_json) VALUES (?, ?)', message.id, JSON.stringify(message.attachment)); }
    catch (error) { await db.runAsync('DELETE FROM messages WHERE id = ?', message.id); throw error; }
  }
}

export async function updateMessage(db: SQLiteDatabase, message: ChatMessage) {
  await db.runAsync('UPDATE messages SET content = ?, status = ? WHERE id = ? AND conversation_id = ?',
    message.content, message.status ?? 'complete', message.id, message.conversationId);
}
export async function recoverInterruptedMessages(db: SQLiteDatabase) {
  await db.runAsync("UPDATE messages SET status = 'interrupted' WHERE status = 'streaming'");
}
export async function attachmentUris(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ attachment_json: string }>('SELECT attachment_json FROM message_attachments');
  return rows.flatMap((row) => { const photo = JSON.parse(row.attachment_json); return [photo.uri, photo.thumbnailUri] as string[]; });
}

export async function updateConversationAfterMessage(
  db: SQLiteDatabase,
  conversationId: string,
  title: string,
  preview: string,
  updatedAt: number,
) {
  await db.runAsync(
    `UPDATE conversations
     SET title = ?, last_message_preview = ?, updated_at = ?
     WHERE id = ?`,
    title,
    preview,
    updatedAt,
    conversationId,
  );
}

export async function updateConversationActivity(
  db: SQLiteDatabase,
  conversationId: string,
  preview: string,
  updatedAt: number,
) {
  await db.runAsync(
    `UPDATE conversations
     SET last_message_preview = ?, updated_at = ?
     WHERE id = ?`,
    preview,
    updatedAt,
    conversationId,
  );
}

export async function renameConversation(db: SQLiteDatabase, id: string, title: string) {
  await db.runAsync(
    'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
    title,
    Date.now(),
    id,
  );
}

export async function setConversationPinned(
  db: SQLiteDatabase,
  id: string,
  isPinned: boolean,
) {
  await db.runAsync(
    'UPDATE conversations SET is_pinned = ?, pinned_at = ? WHERE id = ?',
    isPinned ? 1 : 0,
    isPinned ? Date.now() : null,
    id,
  );
}

export async function removeConversation(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM conversations WHERE id = ?', id);
}
