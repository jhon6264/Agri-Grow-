import type { SQLiteDatabase } from 'expo-sqlite';
import { getSchedule, initializeSchedules, insertScheduleBatch, saveSchedule, updateSchedule, type Schedule } from './schedule-store';
import { cancelScheduleReminders, scheduleScheduleReminders } from './reminders';

/** One save path for the form and confirmed chat proposals. The ID also makes retries idempotent. */
export async function saveScheduleWithReminder(db: SQLiteDatabase, schedule: Schedule, existing?: Schedule | null,
  canCommit?: () => boolean) {
  if (!existing) {
    const saved = await getSchedule(db, schedule.id);
    if (saved) return saved;
  }
  try {
    if (existing) await cancelScheduleReminders(existing);
    const next = { ...schedule, notificationId: await scheduleScheduleReminders(schedule) };
    if (canCommit && !canCommit()) throw new Error('Sending stopped. Your schedule was not changed.');
    if (existing) await updateSchedule(db, next); else await saveSchedule(db, next);
    return next;
  } catch (error) {
    await cancelScheduleReminders(schedule).catch(() => undefined);
    if (existing?.reminder) await scheduleScheduleReminders(existing, false).catch(() => undefined);
    const saved = !existing ? await getSchedule(db, schedule.id).catch(() => null) : null;
    if (saved) return saved;
    throw error;
  }
}

/** Stage reminders, then insert the entire reviewed batch in one SQLite transaction. */
export async function saveScheduleBatchWithReminders(db: SQLiteDatabase, schedules: Schedule[], canCommit?: () => boolean) {
  if (!schedules.length || schedules.length > 10 || new Set(schedules.map(item => item.id)).size !== schedules.length)
    throw new Error('Choose between 1 and 10 distinct schedules.');
  await initializeSchedules(db);
  const existing = await Promise.all(schedules.map(item => getSchedule(db, item.id)));
  if (existing.every(Boolean)) return existing as Schedule[];
  if (existing.some(Boolean)) throw new Error('This schedule batch was only partly saved. Review the calendar before retrying.');
  const staged: Schedule[] = [];
  try {
    for (const schedule of schedules) {
      if (canCommit && !canCommit()) throw new Error('Sending stopped. Your schedules were not saved.');
      staged.push({ ...schedule, notificationId: await scheduleScheduleReminders(schedule) });
    }
    if (canCommit && !canCommit()) throw new Error('Sending stopped. Your schedules were not saved.');
    await insertScheduleBatch(db, staged);
    return staged;
  } catch (error) {
    await Promise.allSettled(schedules.map(item => cancelScheduleReminders(item)));
    throw error;
  }
}

export async function deleteScheduleWithReminder(db: SQLiteDatabase, schedule: Schedule, canCommit?: () => boolean) {
  await initializeSchedules(db);
  if (canCommit && !canCommit()) throw new Error('Sending stopped. Your schedule was not removed.');
  try {
    await cancelScheduleReminders(schedule);
    if (canCommit && !canCommit()) throw new Error('Sending stopped. Your schedule was not removed.');
    const result = await db.runAsync(`DELETE FROM schedules WHERE id=? AND title=? AND day=? AND at=?
      AND reminder=? AND repeatKind=? AND intervalDays=?`, schedule.id, schedule.title, schedule.day,
    schedule.at, schedule.reminder, schedule.repeatKind, schedule.intervalDays);
    if (result.changes !== 1) throw new Error('This schedule changed since the review. Please start a new delete request.');
  } catch (error) {
    const current = await getSchedule(db, schedule.id).catch(() => null);
    if (current?.reminder) await scheduleScheduleReminders(current, false).catch(() => undefined);
    throw error;
  }
}
