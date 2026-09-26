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
