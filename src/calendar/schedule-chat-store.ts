import type { SQLiteDatabase } from 'expo-sqlite';
import { MAX_BULK_SCHEDULES, parseScheduleDraft, type PendingSchedule, type ScheduleDraft } from './chat-schedule.ts';
import type { Schedule } from './schedule-store.ts';

export async function getPendingSchedule(db: SQLiteDatabase, conversationId: string): Promise<PendingSchedule | null> {
  const row = await db.getFirstAsync<{ action_id: string; stage: PendingSchedule['stage']; draft_json: string; updated_at: number }>(
    'SELECT action_id, stage, draft_json, updated_at FROM pending_schedule_actions WHERE conversation_id = ?', conversationId);
  if (!row) return null;
  if (row.stage !== 'clarifying' && row.stage !== 'confirming') return null;
  let value: Record<string, unknown>;
  try { value = JSON.parse(row.draft_json); } catch { return null; }
  if (value.kind === 'create' && Array.isArray(value.drafts) && value.drafts.length > 0 && value.drafts.length <= MAX_BULK_SCHEDULES) {
    const drafts = value.drafts.map(item => parseScheduleDraft(JSON.stringify(item)));
    if (drafts.some(item => !item)) return null;
    return { kind: 'create', id: row.action_id, conversationId, stage: row.stage,
      drafts: drafts as NonNullable<typeof drafts[number]>[], updatedAt: row.updated_at,
      ...(value.format === 'lines' ? { format: 'lines' as const } : {}) };
  }
  if (value.kind === 'edit' && (value.targetId === null || typeof value.targetId === 'string')
    && (value.targetQuery === null || typeof value.targetQuery === 'string') && Array.isArray(value.candidateIds)) {
    const draft = value.draft ? parseScheduleDraft(JSON.stringify(value.draft)) : null;
    if (value.draft && !draft) return null;
    return { kind: 'edit', id: row.action_id, conversationId, stage: row.stage,
      targetId: value.targetId as string | null, targetQuery: value.targetQuery as string | null,
      snapshot: value.snapshot && typeof value.snapshot === 'object' ? value.snapshot as Schedule : null,
      draft, changes: value.changes && typeof value.changes === 'object' && !Array.isArray(value.changes)
        ? value.changes as Partial<ScheduleDraft> : {},
      candidateIds: value.candidateIds.filter((id): id is string => typeof id === 'string'), updatedAt: row.updated_at };
  }
  if (value.kind === 'delete' && (value.targetId === null || typeof value.targetId === 'string')
    && (value.targetQuery === null || typeof value.targetQuery === 'string') && Array.isArray(value.candidateIds)) {
    return { kind: 'delete', id: row.action_id, conversationId, stage: row.stage,
      targetId: value.targetId as string | null, targetQuery: value.targetQuery as string | null,
      snapshot: value.snapshot && typeof value.snapshot === 'object' ? value.snapshot as Schedule : null,
      candidateIds: value.candidateIds.filter((id): id is string => typeof id === 'string'), updatedAt: row.updated_at };
  }
  // Version 4 stored a single draft directly. Keep that proposal after upgrade.
  if (value.kind !== undefined) return null;
  const draft = parseScheduleDraft(row.draft_json);
  return draft ? { kind: 'create', id: row.action_id, conversationId, stage: row.stage,
    drafts: [draft], updatedAt: row.updated_at } : null;
}

export async function putPendingSchedule(db: SQLiteDatabase, pending: PendingSchedule) {
  await db.runAsync(`INSERT INTO pending_schedule_actions (conversation_id, action_id, stage, draft_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(conversation_id) DO UPDATE SET action_id=excluded.action_id, stage=excluded.stage,
      draft_json=excluded.draft_json, updated_at=excluded.updated_at`,
  pending.conversationId, pending.id, pending.stage, JSON.stringify(pending), pending.updatedAt);
}

export async function clearPendingSchedule(db: SQLiteDatabase, conversationId: string, actionId: string) {
  await db.runAsync('DELETE FROM pending_schedule_actions WHERE conversation_id = ? AND action_id = ?', conversationId, actionId);
}

async function ensureListContext(db: SQLiteDatabase) {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS chat_calendar_list_context (
    conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    ids_json TEXT NOT NULL, updated_at INTEGER NOT NULL
  )`);
}

export async function putScheduleListContext(db: SQLiteDatabase, conversationId: string, ids: string[]) {
  await ensureListContext(db);
  await db.runAsync(`INSERT INTO chat_calendar_list_context (conversation_id, ids_json, updated_at)
    VALUES (?, ?, ?) ON CONFLICT(conversation_id) DO UPDATE SET
    ids_json=excluded.ids_json, updated_at=excluded.updated_at`, conversationId, JSON.stringify(ids.slice(0, 30)), Date.now());
}

export async function getScheduleListContext(db: SQLiteDatabase, conversationId: string): Promise<string[]> {
  await ensureListContext(db);
  const row = await db.getFirstAsync<{ ids_json: string }>(
    'SELECT ids_json FROM chat_calendar_list_context WHERE conversation_id = ?', conversationId);
  if (!row) return [];
  try {
    const ids: unknown = JSON.parse(row.ids_json);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string').slice(0, 30) : [];
  } catch { return []; }
}
