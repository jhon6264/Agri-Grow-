import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Schedule } from './schedule-store';
import { expandSchedules } from './recurrence';
import type { SQLiteDatabase } from 'expo-sqlite';
import { initializeSchedules } from './schedule-store';

const REMINDER_CHANNEL = 'crop-schedules-chicken-v2';
const REMINDER_SOUND = 'chicken_notification.wav';

function reminderContent(schedule: Schedule) {
  return {
    title: schedule.title,
    body: `Scheduled task: ${schedule.title}`,
    data: { scheduleId: schedule.id },
    sound: REMINDER_SOUND,
  };
}

function isCurrentReminder(request: Notifications.NotificationRequest | undefined, schedule: Schedule) {
  const channelId = request?.trigger && 'channelId' in request.trigger ? request.trigger.channelId : undefined;
  return request?.content.title === schedule.title &&
    request.content.body === `Scheduled task: ${schedule.title}` &&
    request.content.sound === 'custom' &&
    (Platform.OS !== 'android' || channelId === undefined || channelId === REMINDER_CHANNEL);
}

async function prepareReminders(askPermission: boolean) {
  if (Platform.OS === 'web') throw new Error('Phone reminders are available in the Android app.');
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: 'Crop schedules', importance: Notifications.AndroidImportance.DEFAULT,
    sound: REMINDER_SOUND,
  });
  const permission = await Notifications.getPermissionsAsync();
  const granted = permission.granted || (askPermission && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) throw new Error('Notifications are not allowed. Enable them in phone settings, or turn Reminder off to save.');
}

function upcoming(schedule: Schedule, now: number) {
  if (schedule.repeatKind === 'none') return schedule.at > now ? [{ ...schedule, seriesId: schedule.id }] : [];
  const end = Math.max(now, schedule.at) + 400 * 86400000;
  const from = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  const to = new Date(end + 8 * 3600000).toISOString().slice(0, 10);
  return expandSchedules([schedule], from, to).filter(item => item.at > now).slice(0, 32);
}

export async function scheduleScheduleReminders(schedule: Schedule, askPermission = true) {
  if (!schedule.reminder) return null;
  const now = Date.now();
  const dates = upcoming(schedule, now);
  if (!dates.length) throw new Error('Choose a future time for your reminder.');
  await prepareReminders(askPermission);
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const pending = new Map(existing.map(item => [item.identifier, item]));
  if ((schedule.repeatKind === 'daily' || schedule.repeatKind === 'weekly') &&
    Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Manila') {
    const local = new Date(schedule.at + 8 * 3600000);
    const hour = local.getUTCHours(); const minute = local.getUTCMinutes();
    const trigger = schedule.repeatKind === 'daily'
      ? { type: Notifications.SchedulableTriggerInputTypes.DAILY as const, hour, minute, channelId: REMINDER_CHANNEL }
      : { type: Notifications.SchedulableTriggerInputTypes.WEEKLY as const,
          weekday: new Date(`${schedule.day}T00:00:00Z`).getUTCDay() + 1, hour, minute, channelId: REMINDER_CHANNEL };
    const next = await Notifications.getNextTriggerDateAsync(trigger).catch(() => null);
    if (next !== null && Math.abs(next - dates[0].at) < 60000) {
      const identifier = `${schedule.id}:repeat`;
      if (pending.has(identifier) && !isCurrentReminder(pending.get(identifier), schedule))
        await Notifications.cancelScheduledNotificationAsync(identifier);
      if (!isCurrentReminder(pending.get(identifier), schedule)) await Notifications.scheduleNotificationAsync({
        identifier,
        content: reminderContent(schedule),
        trigger,
      });
      await Promise.all(existing.filter(item => item.content.data?.scheduleId === schedule.id && item.identifier !== identifier)
        .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
      return identifier;
    }
  }
  const repeatIdentifier = `${schedule.id}:repeat`;
  if (pending.has(repeatIdentifier)) {
    await Notifications.cancelScheduledNotificationAsync(repeatIdentifier);
    pending.delete(repeatIdentifier);
  }
  const created: string[] = [];
  try {
    for (const occurrence of dates) {
      const identifier = occurrence.id;
      if (isCurrentReminder(pending.get(identifier), schedule)) continue;
      if (pending.has(identifier)) await Notifications.cancelScheduledNotificationAsync(identifier);
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: reminderContent(schedule),
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: occurrence.at, channelId: REMINDER_CHANNEL },
      });
      created.push(identifier);
    }
  } catch (error) {
    await Promise.allSettled(created.map(id => Notifications.cancelScheduledNotificationAsync(id)));
    throw error;
  }
  return schedule.repeatKind === 'none' ? schedule.id : JSON.stringify(dates.map(item => item.id));
}

export async function cancelScheduleReminders(schedule: Schedule) {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const pendingIds = new Set(pending.map(item => item.identifier));
  const ids = pending.filter(item => item.identifier === schedule.id || item.content.data?.scheduleId === schedule.id)
    .map(item => item.identifier);
  if (schedule.notificationId) {
    try { const stored = JSON.parse(schedule.notificationId); if (Array.isArray(stored)) ids.push(...stored.filter(id => pendingIds.has(id))); }
    catch { if (pendingIds.has(schedule.notificationId)) ids.push(schedule.notificationId); }
  }
  await Promise.all([...new Set(ids)].map(id => Notifications.cancelScheduledNotificationAsync(id)));
}

export async function reconcileScheduleReminders(db: SQLiteDatabase) {
  await initializeSchedules(db);
  const schedules = await db.getAllAsync<Schedule>(
    "SELECT * FROM schedules WHERE reminder = 1 AND (repeatKind != 'none' OR at > ?)", Date.now());
  for (const schedule of schedules) {
    try { await scheduleScheduleReminders(schedule, false); }
    catch { /* Keep the saved series; the form exposes notification errors on changes. */ }
  }
}

export async function scheduleReminder(schedule: Schedule) {
  return scheduleScheduleReminders(schedule);
}
export const cancelReminder = Notifications.cancelScheduledNotificationAsync;
export function enableForegroundReminders() {
  try {
    Notifications.setNotificationHandler({ handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
    }) });
  } catch (error) {
    console.warn('Could not initialize foreground reminders:', error);
  }
}
