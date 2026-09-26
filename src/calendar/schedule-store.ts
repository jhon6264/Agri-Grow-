import type { SQLiteDatabase } from 'expo-sqlite';
import { expandSchedules, type ScheduleOccurrence, type ScheduleRecord } from './recurrence.ts';
export type Schedule = ScheduleRecord;
export type { RepeatKind, ScheduleOccurrence } from './recurrence';
const initialized = new WeakMap<SQLiteDatabase, Promise<void>>();
export async function initializeSchedules(db: SQLiteDatabase) {
  let pending = initialized.get(db);
  if (!pending) {
    pending = (async () => {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, day TEXT NOT NULL,
        at INTEGER NOT NULL, reminder INTEGER NOT NULL DEFAULT 0, notificationId TEXT
      ); CREATE INDEX IF NOT EXISTS schedules_date ON schedules(day, at);`);
      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(schedules)');
      if (!columns.some(item => item.name === 'repeatKind'))
        await db.execAsync("ALTER TABLE schedules ADD COLUMN repeatKind TEXT NOT NULL DEFAULT 'none'");
      if (!columns.some(item => item.name === 'intervalDays'))
        await db.execAsync('ALTER TABLE schedules ADD COLUMN intervalDays INTEGER NOT NULL DEFAULT 1');
    })();
    initialized.set(db, pending);
  }
  try { await pending; } catch (error) { initialized.delete(db); throw error; }
}
export async function listSchedules(db: SQLiteDatabase, from: string, to: string): Promise<ScheduleOccurrence[]> {
  await initializeSchedules(db);
  const records = await db.getAllAsync<Schedule>(
    "SELECT * FROM schedules WHERE day <= ? AND (day >= ? OR repeatKind != 'none') ORDER BY at, id", to, from);
  return expandSchedules(records, from, to);
}
export async function getSchedule(db: SQLiteDatabase, id: string) {
  await initializeSchedules(db);
  return db.getFirstAsync<Schedule>('SELECT * FROM schedules WHERE id = ?', id);
}
export async function saveSchedule(db: SQLiteDatabase, schedule: Schedule) {
  await initializeSchedules(db);
  await db.runAsync('INSERT INTO schedules (id,title,day,at,reminder,notificationId,repeatKind,intervalDays) VALUES (?,?,?,?,?,?,?,?)',
    schedule.id, schedule.title, schedule.day, schedule.at, schedule.reminder, schedule.notificationId,
    schedule.repeatKind, schedule.intervalDays);
}
export async function insertScheduleBatch(db: SQLiteDatabase, schedules: Schedule[]) {
  await initializeSchedules(db);
  await db.withExclusiveTransactionAsync(async transaction => {
    for (const item of schedules) {
      await transaction.runAsync(`INSERT INTO schedules
        (id,title,day,at,reminder,notificationId,repeatKind,intervalDays) VALUES (?,?,?,?,?,?,?,?)`,
      item.id, item.title, item.day, item.at, item.reminder, item.notificationId, item.repeatKind, item.intervalDays);
    }
  });
}
export async function updateSchedule(db: SQLiteDatabase, schedule: Schedule) {
  await initializeSchedules(db);
  await db.runAsync('UPDATE schedules SET title=?,day=?,at=?,reminder=?,notificationId=?,repeatKind=?,intervalDays=? WHERE id=?',
    schedule.title, schedule.day, schedule.at, schedule.reminder, schedule.notificationId,
    schedule.repeatKind, schedule.intervalDays, schedule.id);
}
export async function deleteSchedule(db: SQLiteDatabase, id: string) {
  await initializeSchedules(db);
  await db.runAsync('DELETE FROM schedules WHERE id = ?', id);
}
