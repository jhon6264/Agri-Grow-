export const PH_ZONE = 'Asia/Manila';
const DAY = 86400000;
const OFFSET = 8 * 3600000;
export function phDateKey(now = Date.now()) { return new Date(now + OFFSET).toISOString().slice(0, 10); }
export function phGreeting(now = Date.now()) {
  const hour = new Date(now + OFFSET).getUTCHours();
  return hour < 12 ? 'Good Morning, Jhon' : hour < 18 ? 'Good Afternoon, Jhon' : 'Good Evening, Jhon';
}
export function nextPhGreetingChange(now = Date.now()) {
  const todayStart = Math.floor((now + OFFSET) / DAY) * DAY - OFFSET;
  return [todayStart + 12 * 3600000, todayStart + 18 * 3600000, todayStart + DAY]
    .find(boundary => boundary > now) ?? todayStart + DAY;
}
export function phTimestamp(day: string, hour: number, minute: number) {
  return Date.parse(`${day}T00:00:00+08:00`) + (hour * 60 + minute) * 60000;
}
export function weekDays(today: string) {
  const stamp = Date.parse(`${today}T00:00:00Z`);
  const sunday = stamp - new Date(stamp).getUTCDay() * DAY;
  return Array.from({ length: 7 }, (_, i) => new Date(sunday + i * DAY).toISOString().slice(0, 10));
}
export function frontFirst(day: string) {
  const start = Date.parse(`${day}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => new Date(start + index * DAY).toISOString().slice(0, 10));
}
const DAY_CARD_COLORS = ['#DFEBDD', '#E8E3D3', '#DDE9E7', '#E9E6D9', '#D9E8DC', '#E7E1D7', '#DEE8D5'];
export function dayCardColor(day: string) {
  return DAY_CARD_COLORS[new Date(`${day}T00:00:00Z`).getUTCDay()];
}
export function monthCells(today: string) {
  const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let day = 1; day <= days; day++) cells.push(`${today.slice(0, 7)}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
export function dayLabel(day: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-PH', { ...options, timeZone: PH_ZONE }).format(phTimestamp(day, 12, 0));
}
export function timeLabel(timestamp: number) {
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: PH_ZONE }).format(timestamp);
}
export function scheduleTimeParts(timestamp: number) {
  const parts = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: PH_ZONE }).formatToParts(timestamp);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return { time: `${part('hour')}:${part('minute')}`, period: part('dayPeriod').toUpperCase() };
}
export function orderSchedulesForDay<T extends { id: string; day: string; at: number }>(schedules: T[], selected: string, now: number) {
  const isToday = selected === phDateKey(now);
  return schedules.filter(item => item.day === selected).sort((a, b) => {
    if (isToday) {
      const aPast = a.at < now; const bPast = b.at < now;
      if (aPast !== bPast) return aPast ? 1 : -1;
      if (aPast) return a.at - b.at || a.id.localeCompare(b.id);
    }
    return a.at - b.at || a.id.localeCompare(b.id);
  });
}
