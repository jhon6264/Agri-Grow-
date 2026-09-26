export type RepeatKind = 'none' | 'daily' | 'weekly' | 'interval';
export type ScheduleRecord = {
  id: string; title: string; day: string; at: number; reminder: number;
  notificationId: string | null; repeatKind: RepeatKind; intervalDays: number;
};
export type ScheduleOccurrence = ScheduleRecord & { seriesId: string };
const DAY = 86400000;
const PH_OFFSET = 8 * 3600000;
const stamp = (day: string) => Date.parse(`${day}T00:00:00Z`);
const dayKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

export function occursOn(schedule: ScheduleRecord, day: string) {
  const distance = Math.round((stamp(day) - stamp(schedule.day)) / DAY);
  if (distance < 0) return false;
  if (schedule.repeatKind === 'none') return distance === 0;
  if (schedule.repeatKind === 'daily') return true;
  const interval = schedule.repeatKind === 'weekly' ? 7 : Math.max(2, schedule.intervalDays);
  return distance % interval === 0;
}

export function expandSchedules(schedules: ScheduleRecord[], from: string, to: string): ScheduleOccurrence[] {
  const result: ScheduleOccurrence[] = [];
  if (from > to) return result;
  for (const schedule of schedules) {
    if (schedule.day > to) continue;
    const local = new Date(schedule.at + PH_OFFSET);
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const start = Math.max(stamp(from), stamp(schedule.day));
    for (let date = start; date <= stamp(to); date += DAY) {
      const day = dayKey(date);
      if (!occursOn(schedule, day)) continue;
      result.push({ ...schedule, id: schedule.repeatKind === 'none' ? schedule.id : `${schedule.id}:${day}`,
        seriesId: schedule.id, day, at: Date.parse(`${day}T00:00:00+08:00`) + minutes * 60000 });
    }
  }
  return result.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
