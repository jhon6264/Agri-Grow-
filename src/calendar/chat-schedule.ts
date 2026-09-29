import { dayLabel, phDateKey, phTimestamp, timeLabel } from './calendar-time.ts';
import type { RepeatKind, Schedule, ScheduleOccurrence } from './schedule-store';

export type ScheduleLanguage = 'en' | 'tl' | 'ceb';
export type ScheduleDraft = {
  title: string | null; day: string | null; time: string | null;
  reminder: boolean; repeatKind: RepeatKind; intervalDays: number; language: ScheduleLanguage;
};
type PendingBase = { id: string; conversationId: string; stage: 'clarifying' | 'confirming'; updatedAt: number };
export type PendingSchedule = (PendingBase & { kind: 'create'; drafts: ScheduleDraft[]; format?: 'lines' }) |
  (PendingBase & { kind: 'edit'; targetId: string | null; snapshot: Schedule | null;
    draft: ScheduleDraft | null; changes: Partial<ScheduleDraft>; targetQuery: string | null; candidateIds: string[] }) |
  (PendingBase & { kind: 'delete'; targetId: string | null; snapshot: Schedule | null;
    targetQuery: string | null; candidateIds: string[] });
export type CalendarIntent = 'chat' | 'create' | 'list' | 'edit' | 'delete' | 'ambiguous';
export const MAX_BULK_SCHEDULES = 10;
export type ScheduleCommand = { action: 'menu' | 'create' | 'list' | 'edit' | 'delete'; body: string };

export function parseScheduleCommand(text: string): ScheduleCommand | null {
  const match = /^\/sched\b\s*([\s\S]*)$/i.exec(text.trim());
  if (!match) return null;
  const body = match[1].trim();
  if (!body) return { action: 'menu', body: '' };
  const action = /^(add|create|list|view|edit|delete|remove)\b/i.exec(body);
  if (!action) return { action: 'create', body };
  const kind = action[1].toLowerCase();
  return { action: kind === 'add' || kind === 'create' ? 'create' : kind === 'edit' ? 'edit'
    : kind === 'delete' || kind === 'remove' ? 'delete' : 'list',
    body: body.slice(action[0].length).trim() };
}

export const scheduleCommandHelp = `**Schedule commands**\n\n- **/sched add** followed by one schedule per line to create schedules.\n- **/sched list tomorrow** (or **/sched view Thursday**) to check a day.\n- **/sched edit** followed by a schedule title and change to review an edit.\n- **/sched delete** followed by a schedule title to review removal.\n\nExample:\n\n\`\`\`text\n/sched add\n6am, "Water tomatoes" reminder on\n7am, tomorrow "Feed chickens"\n\`\`\`\n\nA missing day means today (PH); a missing reminder is off. Nothing is saved until you reply **Correct**.`;

const LINE_DAY = '(?:day after tomorrow|today|tomorrow|ngayon|bukas|karon|ugma|next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\\d{4}-\\d{2}-\\d{2})';
const LINE_TIME = '(?:\\d{1,2}(?::[0-5]\\d)?\\s*(?:am|pm)|(?:[01]?\\d|2[0-3]):[0-5]\\d)';
const lineStart = new RegExp(`^(?:(${LINE_DAY})\\s*[,|]\\s*|(${LINE_DAY})\\s+)?(${LINE_TIME})\\s*(?:[,|]\\s*|\\s+)(.+)$`, 'i');
const lineDay = new RegExp(`^(${LINE_DAY})(?:\\s*[,|]\\s*|\\s+)(.+)$`, 'i');
const lineEnd = new RegExp(`^(?:(${LINE_DAY})\\s*[,|]\\s*)?(.+?)(?:\\s+at\\s+|\\s+[,|]\\s*|\\s+)(${LINE_TIME})(?:\\s+(${LINE_DAY}))?(.*)$`, 'i');

export function parseScheduleLines(body: string, now = Date.now()): { drafts: ScheduleDraft[]; errors: string[] } {
  const lines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return { drafts: [], errors: ['Add one schedule per line.'] };
  if (lines.length > MAX_BULK_SCHEDULES) return { drafts: [], errors: [`You can review up to ${MAX_BULK_SCHEDULES} schedules at once.`] };
  const drafts: ScheduleDraft[] = []; const errors: string[] = [];
  lines.forEach((raw, index) => {
    const line = raw.replace(/^[-*•]\s*|^\d{1,2}[.)]\s*/, '');
    let time: string | null = null;
    let dayText = '';
    let rest = '';
    const start = lineStart.exec(line);
    if (start) {
      time = normalizedTime(start[3]);
      dayText = start[1] ?? start[2] ?? '';
      rest = start[4].trim();
      const afterTimeDay = lineDay.exec(rest);
      if (afterTimeDay) {
        if (dayText) { errors.push(`#${index + 1}: use only one day.`); return; }
        dayText = afterTimeDay[1]; rest = afterTimeDay[2].trim();
      }
    } else {
      const endMatch = lineEnd.exec(line);
      if (endMatch) {
        time = normalizedTime(endMatch[3]);
        dayText = endMatch[1] ?? endMatch[4] ?? '';
        rest = endMatch[2].trim() + (endMatch[5] ? ' ' + endMatch[5].trim() : '');
      }
    }
    if (!start && !time) { errors.push(`#${index + 1}: start with a time, such as 6am, or a day and time.`); return; }
    const day = dayText ? resolveScheduleDay(dayText, now) : phDateKey(now);
    if (!day) { errors.push(`#${index + 1}: that date is invalid.`); return; }
    rest = rest.replace(/^[\s,|]+/, '');
    const quoted = /^["“]([^"”]+)["”](.*)$/s.exec(rest);
    if (quoted) rest = quoted[2];
    const reminderMatches = [...rest.matchAll(/\breminder\s+(on|off)\b/gi)];
    if (reminderMatches.length > 1) { errors.push(`#${index + 1}: use only one reminder setting.`); return; }
    const reminder = reminderMatches[0]?.[1].toLowerCase() === 'on';
    rest = rest.replace(/\breminder\s+(?:on|off)\b/gi, '').trim();
    if (/\breminder\b/i.test(rest)) { errors.push(`#${index + 1}: write reminder on or reminder off.`); return; }
    const repeatMatch = /\brepeat\s+(daily|weekly|none|every\s+\d{1,3}\s+days?)\b/i.exec(rest);
    const repeatKind: RepeatKind = repeatMatch?.[1].toLowerCase().startsWith('every') ? 'interval'
      : repeatMatch?.[1].toLowerCase() === 'daily' ? 'daily'
        : repeatMatch?.[1].toLowerCase() === 'weekly' ? 'weekly' : 'none';
    const intervalDays = repeatKind === 'interval' ? Number(/\d+/.exec(repeatMatch![1])?.[0]) : 1;
    rest = rest.replace(/\brepeat\s+(?:daily|weekly|none|every\s+\d{1,3}\s+days?)\b/gi, '').trim();
    if (/\brepeat\b/i.test(rest) || (repeatKind === 'interval' && (intervalDays < 2 || intervalDays > 365))) {
      errors.push(`#${index + 1}: use repeat daily, weekly, or every 2–365 days.`); return;
    }
    const leftover = rest.replace(/^[\s,|]+|[\s,|]+$/g, '');
    const title = quoted ? quoted[1].trim() : leftover.replace(/^["“](.*)["”]$/s, '$1').trim();
    if (quoted && leftover) { errors.push(`#${index + 1}: I could not understand the text after the title.`); return; }
    if (!title || title.length > 120 || !time || reminderMatches.length > 1) {
      errors.push(`#${index + 1}: check its time, title, and reminder.`); return;
    }
    drafts.push({ title, day, time, reminder, repeatKind, intervalDays, language: scheduleLanguageForText(raw) });
  });
  return { drafts: errors.length ? [] : drafts, errors };
}

export function scheduleLineSummary(drafts: ScheduleDraft[], now = Date.now()) {
  const lines = drafts.map((draft, index) => {
    const [hour, minute] = (draft.time ?? '00:00').split(':').map(Number);
    const when = draft.day && draft.time ? `${dayLabel(draft.day, { weekday: 'long', month: 'long', day: 'numeric' })}, ${timeLabel(phTimestamp(draft.day, hour, minute))} PH` : 'Date or time needed';
    const repeat = draft.repeatKind === 'interval' ? `every ${draft.intervalDays} days` : draft.repeatKind;
    const past = draft.day && draft.time && draft.repeatKind === 'none' && phTimestamp(draft.day, hour, minute) <= now;
    return `**${index + 1}. ${escapeMarkdown(draft.title ?? 'Title needed')}**\n${when}\nReminder: ${draft.reminder ? 'On' : 'Off'} · Repeat: ${repeat}${past ? '\n⚠️ This time has already passed. Please change it before saving.' : ''}`;
  });
  const incomplete = drafts.some(draft => draftProblem(draft, now));
  return `I’ll create ${drafts.length} ${drafts.length === 1 ? 'schedule' : 'schedules'}:\n\n${lines.join('\n\n')}\n\n${incomplete
    ? 'Please correct the marked or missing details. Nothing has been saved.'
    : 'Is everything correct? Reply **Correct** to save, or tell me what to change—for example, **reminder on for both**.'}`;
}

export function parseNumberedScheduleChange(text: string, drafts: ScheduleDraft[]): ScheduleDraft[] | null {
  const match = /^(?:change|move|set)\s*#?(\d{1,2})\s+(?:to\s+)?(\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d)(?:\s+instead)?[.!]?$/i.exec(text.trim());
  if (!match) return null;
  const index = Number(match[1]) - 1; const time = normalizedTime(match[2]);
  if (index < 0 || index >= drafts.length || !time) return null;
  return drafts.map((draft, position) => position === index ? { ...draft, time } : draft);
}

export function parseDirectReviewChange(text: string, drafts: ScheduleDraft[]): ScheduleDraft[] | null {
  const value = text.trim().replace(/^(?:yes|correct|okay)[,\s]+(?:but|and)\s+/i, '')
    .replace(/(?:\s+please)?[.!]?$/i, '').trim();
  const targetPattern = '(both|all|#?\\d{1,2}|first|second|third)';
  const forms = [
    new RegExp(`^reminders?\\s+(on|off)\\s+(?:for\\s+)?${targetPattern}$`, 'i'),
    new RegExp(`^(?:turn|switch|set)\\s+(?:the\\s+)?reminders?\\s+(on|off)\\s+(?:for\\s+)?${targetPattern}$`, 'i'),
    new RegExp(`^(?:turn|switch|set)\\s+(on|off)\\s+(?:the\\s+)?reminders?\\s+(?:for\\s+)?${targetPattern}$`, 'i'),
    new RegExp(`^(?:make|set)\\s+${targetPattern}\\s+reminders?\\s+(on|off)$`, 'i'),
  ];
  const match = forms.map(form => form.exec(value)).find(Boolean);
  if (!match) return null;
  const reversed = match[1].toLowerCase() !== 'on' && match[1].toLowerCase() !== 'off';
  const target = (reversed ? match[1] : match[2]).toLowerCase();
  const enabled = (reversed ? match[2] : match[1]).toLowerCase() === 'on';
  const number = target === 'first' ? 1 : target === 'second' ? 2 : target === 'third' ? 3 : Number(target.replace('#', ''));
  const indexes = target === 'all' || target === 'both' && drafts.length === 2
    ? drafts.map((_, index) => index) : target === 'both' ? [] : [number - 1];
  if (!indexes.length || indexes.some(index => index < 0 || index >= drafts.length)) return null;
  return drafts.map((draft, index) => indexes.includes(index) ? { ...draft, reminder: enabled } : draft);
}

export function scheduleReviewPrompt(message: string, drafts: ScheduleDraft[], now = Date.now()) {
  const current = drafts.map((draft, index) => ({ number: index + 1, title: draft.title,
    day: draft.day, time: draft.time, reminder: draft.reminder,
    repeat: draft.repeatKind, intervalDays: draft.intervalDays }));
  return `The user is reviewing ${drafts.length} unsaved schedule(s). Philippine date today: ${phDateKey(now)}.
Current schedules: ${JSON.stringify(current)}.
User reply: ${JSON.stringify(message)}.

Evaluate the user's feedback with common sense:
1. If user confirms, agrees, or tells to save/proceed without changes: return {"intent":"confirm"}
2. If user cancels, discards, or abandons: return {"intent":"cancel"}
3. If user requests changes, even after saying yes/correct, return {"intent":"update","operations":[...]}. Operations are:
   {"action":"change","targets":[1],"changes":{"time":"07:00"}} for only fields explicitly changed;
   {"action":"remove","targets":[2]} to remove a reviewed item;
   {"action":"add","item":{"title":"...","day":"YYYY-MM-DD","time":"HH:mm","reminder":false,"repeatKind":"none","intervalDays":1}} to add an item.
   Targets use the displayed 1-based numbers; "all" is allowed. For "1 and 2 on, 3 off", emit two change operations. Never rewrite unchanged items. If an added item lacks a date or time, use null.
4. If user asks a question or reply is completely unclear: return {"intent":"clarify","question":"short clarification"}

Return ONLY valid JSON.`;
}

export function scheduleReviewChangePrompt(message: string, drafts: ScheduleDraft[], now = Date.now()) {
  return scheduleReviewPrompt(message, drafts, now);
}

export type ScheduleReviewFeedback =
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'updated'; drafts: ScheduleDraft[] }
  | { kind: 'clarify'; question: string };

export type ScheduleReviewChange = { kind: 'updated'; drafts: ScheduleDraft[] } |
  { kind: 'clarify'; question: string };

export function parseScheduleReviewFeedback(raw: string, drafts: ScheduleDraft[], now = Date.now()): ScheduleReviewFeedback | null {
  const value = parseObject(raw);
  if (!value) return null;

  const intent = typeof value.intent === 'string' ? value.intent.toLowerCase().trim() : null;
  if (intent === 'confirm') return { kind: 'confirm' };
  if (intent === 'cancel') return { kind: 'cancel' };
  if (intent === 'clarify') {
    const question = typeof value.question === 'string' && value.question.trim()
      ? value.question.trim().slice(0, 240)
      : typeof value.message === 'string' && value.message.trim()
        ? value.message.trim().slice(0, 240)
        : 'Which schedule would you like to change, and how?';
    return { kind: 'clarify', question };
  }

  if (intent === 'update' && Array.isArray(value.operations)) {
    if (!value.operations.length || value.operations.length > MAX_BULK_SCHEDULES * 2) return null;
    const updated = drafts.map(draft => ({ ...draft }));
    const removed = new Set<number>();
    const added: ScheduleDraft[] = [];
    const allowed = new Set(['title', 'day', 'time', 'reminder', 'repeatKind', 'intervalDays']);
    for (const operation of value.operations) {
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return null;
      const op = operation as Record<string, unknown>;
      if (op.action === 'add') {
        if (!op.item || typeof op.item !== 'object' || Array.isArray(op.item)) return null;
        const source = op.item as Record<string, unknown>;
        if (typeof source.title !== 'string' || !source.title.trim()) return null;
        if (Object.keys(source).some(field => !['title', 'day', 'time', 'reminder', 'repeatKind', 'intervalDays', 'language'].includes(field))
          || source.day !== undefined && source.day !== null && typeof source.day !== 'string'
          || source.time !== undefined && source.time !== null && typeof source.time !== 'string'
          || source.reminder !== undefined && typeof source.reminder !== 'boolean'
          || source.repeatKind !== undefined && !['none', 'daily', 'weekly', 'interval'].includes(String(source.repeatKind))
          || source.intervalDays !== undefined && (!Number.isInteger(source.intervalDays) || (source.intervalDays as number) < 1 || (source.intervalDays as number) > 365)) return null;
        const item = parseScheduleDraft(JSON.stringify(source), undefined, now);
        if (!item) return null;
        added.push({ ...item, language: drafts[0]?.language ?? 'en' });
        continue;
      }
      if (op.action !== 'change' && op.action !== 'remove') return null;
      const targets = op.targets === 'all' || op.targets === 'both' && drafts.length === 2
        ? drafts.map((_, index) => index + 1) : op.targets;
      if (!Array.isArray(targets) || !targets.length || targets.some(target => !Number.isInteger(target) || target < 1 || target > drafts.length)) return null;
      if (op.action === 'remove') {
        for (const target of targets) removed.add(target as number);
        continue;
      }
      if (!op.changes || typeof op.changes !== 'object' || Array.isArray(op.changes)) return null;
      const changes = op.changes as Record<string, unknown>;
      const fields = Object.keys(changes);
      if (!fields.length || fields.some(field => !allowed.has(field))) return null;
      if (changes.title !== undefined && (typeof changes.title !== 'string' || !changes.title.trim())) return null;
      if (changes.day !== undefined && (typeof changes.day !== 'string' || !changes.day.trim())) return null;
      if (changes.time !== undefined && (typeof changes.time !== 'string' || !changes.time.trim())) return null;
      if (changes.reminder !== undefined && typeof changes.reminder !== 'boolean') return null;
      if (changes.repeatKind !== undefined && !['none', 'daily', 'weekly', 'interval'].includes(String(changes.repeatKind))) return null;
      if (changes.intervalDays !== undefined && (!Number.isInteger(changes.intervalDays) || (changes.intervalDays as number) < 2 || (changes.intervalDays as number) > 365)) return null;
      for (const target of targets) {
        const index = (target as number) - 1;
        const parsed = parseScheduleDraft(JSON.stringify(changes), updated[index], now);
        if (!parsed) return null;
        updated[index] = parsed;
      }
    }
    const result = updated.filter((_, index) => !removed.has(index + 1)).concat(added);
    if (!result.length || result.length > MAX_BULK_SCHEDULES ||
      JSON.stringify(result) === JSON.stringify(drafts)) return null;
    return { kind: 'updated', drafts: result };
  }

  // Older model replies may use the patch-only updates format.
  if (Array.isArray(value.updates)) {
    if (!value.updates.length) {
      const question = typeof value.question === 'string' ? value.question.trim().slice(0, 240) : '';
      return { kind: 'clarify', question: question || 'Which schedule would you like to change, and how?' };
    }
    let updated = drafts.map(draft => ({ ...draft }));
    const allowed = new Set(['title', 'day', 'time', 'reminder', 'repeatKind', 'intervalDays']);
    for (const item of value.updates) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const patch = item as Record<string, unknown>;
      const changes = patch.changes;
      if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
      const fields = Object.keys(changes);
      if (!fields.length || fields.some(field => !allowed.has(field))) return null;
      const source = changes as Record<string, unknown>;
      if (source.title !== undefined && (typeof source.title !== 'string' || !source.title.trim())) return null;
      if (source.day !== undefined && (typeof source.day !== 'string' || !source.day.trim())) return null;
      if (source.time !== undefined && (typeof source.time !== 'string' || !source.time.trim())) return null;
      if (source.reminder !== undefined && typeof source.reminder !== 'boolean') return null;
      if (source.intervalDays !== undefined && (!Number.isInteger(source.intervalDays) || (source.intervalDays as number) < 2 || (source.intervalDays as number) > 365)) return null;
      if (source.repeatKind !== undefined && !['none', 'daily', 'weekly', 'interval'].includes(String(source.repeatKind))) return null;
      const targets = patch.targets === 'all' ? drafts.map((_, index) => index + 1)
        : patch.targets === 'both' && drafts.length === 2 ? [1, 2] : patch.targets;
      if (!Array.isArray(targets) || !targets.length || targets.some(target => !Number.isInteger(target) || target < 1 || target > drafts.length)) return null;
      for (const target of new Set<number>(targets as number[])) {
        const previous = updated[target - 1];
        if (source.intervalDays !== undefined && source.repeatKind !== 'interval' && previous.repeatKind !== 'interval') return null;
        const day = typeof source.day === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(source.day)
          ? resolveScheduleDay(source.day, now) : source.day;
        if (source.day !== undefined && !day) return null;
        const next = parseScheduleDraft(JSON.stringify({ ...source, ...(source.day !== undefined ? { day } : {}) }), previous, now);
        if (!next) return null;
        updated[target - 1] = next;
      }
    }
    if (updated.every((draft, index) => JSON.stringify(draft) === JSON.stringify(drafts[index]))) return null;
    return { kind: 'updated', drafts: updated };
  }

  return null;
}

export function parseScheduleReviewChange(raw: string, drafts: ScheduleDraft[], now = Date.now()): ScheduleReviewChange | null {
  const result = parseScheduleReviewFeedback(raw, drafts, now);
  if (!result) return null;
  if (result.kind === 'updated') return { kind: 'updated', drafts: result.drafts };
  if (result.kind === 'clarify') return { kind: 'clarify', question: result.question };
  return null;
}
export function scheduleLanguageForText(text: string): ScheduleLanguage {
  if (/\b(?:unsa|akong|ugma|karon|palihog|usba|pahinumdom|buhat|himo)\b/i.test(text)) return 'ceb';
  if (/\b(?:ano|bukas|ngayon|pakita|paki|baguhin|paalala|iskedyul|gusto)\b/i.test(text)) return 'tl';
  return 'en';
}

export const emptyDraft = (): ScheduleDraft => ({ title: null, day: null, time: null,
  reminder: false, repeatKind: 'none', intervalDays: 1, language: 'en' });

export function isScheduleIntent(text: string) {
  const value = text.trim().toLowerCase();
  if (/^(?:how|what|why|when|unsa|ano|paano)\b/.test(value)) return false;
  return /\bremind me\b|\b(?:paalalahanan|ipaalala|pahinumdumi|pahinumdomi)\b|\b(?:create|add|make|set up|set|put|plan)\b.{0,100}\b(?:schedule|reminder|event|task)s?\b|^schedules?\b|\b(?:gumawa|magdagdag|mag-set|itakda)\b.{0,100}\b(?:iskedyul|schedule|paalala)\b|\b(?:himo|buhat|butang|maghimo)\b.{0,100}\b(?:iskedyul|schedule|pahinumdom)\b/i.test(value);
}

export function scheduleReply(text: string): 'confirm' | 'cancel' | 'ask' | 'revise' {
  const value = text.trim().toLowerCase().replace(/[.!]+$/, '').trim();
  if (/^(?:correct|correct[, ]+save (?:all|them)|yes|yes please|yes[, ]+correct|yes[, ]+all correct|that's correct|that is correct|that's right|confirm|confirm all|save it|save them|save all|save|save please|please save|save now|looks good|looks good to me|looks great|all good|all looks good|proceed|go ahead|sure|ok|okay|ok save|okay save|tama|oo|opo|oo[, ]+tama|sakto|oo[, ]+sakto|sige|cge|sige save|cge save|i-save na|save na|ayos|ayus|ayos na|pwede na|ok na|husto|husto na)$/.test(value)) return 'confirm';
  if (/^(?:cancel|cancel all|cancel them|never mind|nevermind|forget it|don't create it|do not create it|don't save|do not save|discard|abort|stop|huwag na|wag na|ayaw na|kanselahin)$/.test(value)) return 'cancel';
  if (/^(?:no|nope|not yet|hindi|dili)$/.test(value)) return 'ask';
  return 'revise';
}

/** Resolve unambiguous relative days locally; never rely on the model's calendar arithmetic. */
export function relativePhilippineDay(text: string, now = Date.now()): string | null {
  const value = text.toLowerCase();
  const days = /\b(?:day after tomorrow|makalawa)\b/.test(value) ? 2
    : /\b(?:tomorrow|bukas|ugma)\b/.test(value) ? 1
    : /\b(?:today|ngayon|karon)\b/.test(value) ? 0 : null;
  return days === null ? null : phDateKey(now + days * 86400000);
}

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function normalizedTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = value.trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return time;
  const clock = /^(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)$/i.exec(time);
  if (clock) {
    const hour = Number(clock[1]);
    if (hour < 1 || hour > 12) return null;
    return `${String(hour % 12 + (clock[3].toUpperCase() === 'PM' ? 12 : 0)).padStart(2, '0')}:${clock[2] ?? '00'}`;
  }
  const twentyFourHour = /^(\d{1,2}):([0-5]\d)$/.exec(time);
  if (twentyFourHour && Number(twentyFourHour[1]) < 24) {
    return `${twentyFourHour[1].padStart(2, '0')}:${twentyFourHour[2]}`;
  }
  return null;
}

export function parseScheduleDraft(raw: string, previous?: ScheduleDraft, now = Date.now()): ScheduleDraft | null {
  const value = parseObject(raw);
  if (!value) return null;





  const base = previous ?? emptyDraft();
  const title = value.title === null ? base.title : typeof value.title === 'string'
    ? value.title.replace(/\s+/g, ' ').trim() : base.title;
  if (title && title.length > 120) return null;
  const rawDay = value.day ?? value.date;
  const dayStr = typeof rawDay === 'string' ? rawDay.trim() : null;
  const resolvedDay = dayStr ? (validDay(dayStr) ? dayStr : resolveScheduleDay(dayStr, now)) : null;
  if (dayStr != null && !resolvedDay) return null;
  const rawTime = value.time ?? value.at;
  const parsedTime = normalizedTime(rawTime);
  if (rawTime != null && !parsedTime) return null;
  const day = value.day === null ? base.day : resolvedDay ?? base.day;
  const time = value.time === null ? base.time : parsedTime ?? base.time;
  const rawReminder = value.reminder;
  const reminder = typeof rawReminder === 'boolean' ? rawReminder
    : typeof rawReminder === 'string' ? (rawReminder.toLowerCase() === 'on' || rawReminder.toLowerCase() === 'true')
    : typeof rawReminder === 'number' ? rawReminder === 1
    : base.reminder;
  const rawRepeat = value.repeatKind ?? value.repeat;
  const repeatKind: RepeatKind = rawRepeat === 'daily' || rawRepeat === 'weekly' || rawRepeat === 'interval'
    || rawRepeat === 'none' ? (rawRepeat as RepeatKind) : base.repeatKind;
  const intervalDays = repeatKind === 'interval' && Number.isInteger(value.intervalDays) &&
    (value.intervalDays as number) >= 2 && (value.intervalDays as number) <= 365
    ? value.intervalDays as number : repeatKind === 'interval' ? base.intervalDays : 1;
  const language: ScheduleLanguage = value.language === 'tl' || value.language === 'ceb' || value.language === 'en'
    ? value.language : base.language;
  return { title: title || null, day, time, reminder, repeatKind, intervalDays, language };
}

export function draftProblem(draft: ScheduleDraft, now = Date.now()): string | null {
  if (!draft.title) return 'title';
  if (!draft.day) return 'date';
  if (!draft.time) return 'time';
  if (draft.repeatKind === 'interval' && (draft.intervalDays < 2 || draft.intervalDays > 365)) return 'repeat interval';
  const [hour, minute] = draft.time.split(':').map(Number);
  if (draft.repeatKind === 'none' && phTimestamp(draft.day, hour, minute) <= now) return 'future date and time';
  return null;
}

export function scheduleFromDraft(id: string, draft: ScheduleDraft): Schedule {
  const problem = draftProblem(draft);
  if (problem) throw new Error(`Please provide a valid ${problem} before saving.`);
  const [hour, minute] = draft.time!.split(':').map(Number);
  return { id, title: draft.title!, day: draft.day!, at: phTimestamp(draft.day!, hour, minute),
    reminder: draft.reminder ? 1 : 0, notificationId: null, repeatKind: draft.repeatKind,
    intervalDays: draft.repeatKind === 'interval' ? draft.intervalDays : 1 };
}

const escapeMarkdown = (value: string) => value.replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&');
export function scheduleSummary(draft: ScheduleDraft) {
  const problem = draftProblem(draft);
  if (problem) {
    const known = `**${escapeMarkdown(draft.title ?? 'Title needed')}** · ${draft.day ?? 'Date needed'} · ${draft.time ?? 'Time needed'} PH · Reminder ${draft.reminder ? 'On' : 'Off'}`;
    if (draft.language === 'tl') return `Ito ang draft:\n\n${known}\n\nKailangan ko pa ang ${problem}. Ano ang gusto mong ilagay? Wala pang na-save.`;
    if (draft.language === 'ceb') return `Mao ni ang draft:\n\n${known}\n\nKinahanglan pa nako ang ${problem}. Unsa ang imong ibutang? Wala pay na-save.`;
    return `Here’s the draft:\n\n${known}\n\nI still need a valid ${problem}. What should it be? Nothing has been saved.`;
  }
  const [hour, minute] = draft.time!.split(':').map(Number);
  const date = draft.language === 'en'
    ? dayLabel(draft.day!, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : draft.day!;
  const when = `${date}, ${timeLabel(phTimestamp(draft.day!, hour, minute))} (PH)`;
  const repeat = draft.language === 'tl'
    ? draft.repeatKind === 'interval' ? `Tuwing ${draft.intervalDays} araw` : draft.repeatKind === 'daily' ? 'Araw-araw'
      : draft.repeatKind === 'weekly' ? 'Linggo-linggo' : 'Wala'
    : draft.language === 'ceb'
      ? draft.repeatKind === 'interval' ? `Matag ${draft.intervalDays} ka adlaw` : draft.repeatKind === 'daily' ? 'Adlaw-adlaw'
        : draft.repeatKind === 'weekly' ? 'Kada semana' : 'Wala'
      : draft.repeatKind === 'interval' ? `Every ${draft.intervalDays} days` :
        draft.repeatKind === 'daily' ? 'Daily' : draft.repeatKind === 'weekly' ? 'Weekly' : 'None';
  const title = `**${escapeMarkdown(draft.title!)}**`;
  if (draft.language === 'tl') return `Gagawa ako ng iskedyul:\n\n${title}\n\n${when}\n\nUlit: ${repeat} · Paalala: ${draft.reminder ? 'Naka-on' : 'Naka-off'}\n\nTama ba ito? Sagutin ng **Tama** para i-save, o sabihin ang babaguhin.`;
  if (draft.language === 'ceb') return `Maghimo ko og iskedyul:\n\n${title}\n\n${when}\n\nBalik: ${repeat} · Pahinumdom: ${draft.reminder ? 'Naka-on' : 'Naka-off'}\n\nSakto ba kini? Tubaga og **Sakto** aron i-save, o isulti ang usbon.`;
  return `I’ll create this schedule:\n\n${title}\n\n${when}\n\nRepeat: ${repeat} · Reminder: ${draft.reminder ? 'On' : 'Off'}\n\nIs that correct? Reply **Correct** to save it, or tell me what to change.`;
}

export function scheduleSavedMessage(title: string, language: ScheduleLanguage) {
  const safe = escapeMarkdown(title);
  if (language === 'tl') return `Tapos na — naka-save ang **${safe}** sa kalendaryo mo.`;
  if (language === 'ceb') return `Nahuman na — na-save ang **${safe}** sa imong kalendaryo.`;
  return `Done — **${safe}** is saved to your calendar.`;
}
export function scheduleEditedMessage(title: string, language: ScheduleLanguage) {
  const safe = escapeMarkdown(title);
  if (language === 'tl') return `Tapos na — na-update ang **${safe}** sa kalendaryo mo.`;
  if (language === 'ceb') return `Nahuman na — na-update ang **${safe}** sa imong kalendaryo.`;
  return `Done — **${safe}** was updated in your calendar.`;
}

export function scheduleCancelledMessage(language: ScheduleLanguage) {
  return language === 'tl' ? 'Sige, kinansela ko ang iskedyul.' : language === 'ceb'
    ? 'Sige, gikansela nako ang iskedyul.' : 'Okay, I cancelled that schedule.';
}

export function scheduleChangeQuestion(language: ScheduleLanguage) {
  return language === 'tl' ? 'Ano ang gusto mong baguhin? Wala pang nai-save.' : language === 'ceb'
    ? 'Unsa ang imong gustong usbon? Wala pay na-save.' : 'What would you like to change? Nothing has been saved yet.';
}

export function scheduleExtractionPrompt(message: string, previous?: ScheduleDraft, now = Date.now()) {
  const phNow = new Date(now + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  return `Extract a single farming schedule from the user's request. Current Philippine time: ${phNow} (UTC+08:00); today is ${phDateKey(now)}. Resolve relative days using this date, not the device locale. Return ONLY one JSON object with keys: title (string or null), day (YYYY-MM-DD or null), time (24-hour HH:mm or null), reminder (boolean), repeatKind (none, daily, weekly, interval), intervalDays (integer, 1 unless interval), language (en, tl, ceb). Include all keys. Do not guess a missing date or time. For a correction, preserve unchanged fields from the previous draft. A reminder is on only when requested or already on in the previous draft. Do not output Markdown or explanations. Previous draft: ${JSON.stringify(previous ?? null)}. User message: ${JSON.stringify(message)}.`;
}

export function calendarIntent(text: string): CalendarIntent {
  const value = text.trim().toLowerCase();
  if (/^(?:how|why|paano|unsaon)\b/.test(value)) return 'chat';
  if (/\bhow to\b/.test(value) && !/\b(?:schedules?|reminders?|calendar|iskedyul)\b/.test(value)) return 'chat';
  if (/\b(?:delete|remove|erase|cancel|tanggalin|burahin|alisin|kuhaa|tangtanga)\b.{0,100}\b(?:schedule|reminder|event|task|calendar|iskedyul|paalala|pahinumdom)\b/i.test(value)
    || /^(?:delete|remove|erase)\s+(?:#\d+|number\s+\d+|the\s+\w+\s+schedule)\b/i.test(value)) return 'delete';
  if (/^(?:move|edit|change|reschedule|update)\s+(?:#\d+|number\s+\d+)\b/i.test(value)) return 'edit';

  if (/\b(?:edit|change|reschedule|move|update|adjust|modify|baguhin|palitan|ilipat|usba|balhin)\b.{0,100}\b(?:schedule|reminder|task|event|plan|time|date|watering|planting|harvest)\b/i.test(value)) return 'edit';
  if (/^(?:delete|remove|erase|cancel|move|edit|change|reschedule|update)\b/.test(value)) return 'ambiguous';
  const listWords = /\b(?:show|list|check|view|give me|tell me|what(?:'s| is| are| do i have)|ano(?: ang)?|unsa(?: ang| akong)?|ipakita|pakita|tingnan|tan-awa)\b.{0,100}\b(?:(?:schedule|reminder|plan|task)s?|calendar|iskedyul|paalala|pahinumdom|plano)\b/i.test(value);
  if (listWords || /\ball (?:my )?schedules\b/.test(value)) {
    const personalOrDated = /\b(?:my|our|mine|saved|ako|ko|akong|calendar|today|tomorrow|bukas|ugma|ngayon|karon|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(value);
    return personalOrDated || /^(?:show|list|check|view|give me|tell me|ipakita|pakita|tingnan|tan-awa)\b/.test(value)
      ? 'list' : 'ambiguous';
  }
  if (/\b(?:what do i have|what's on|what is on|ano ang|unsa akong)\b.{0,70}\b(?:today|tomorrow|bukas|ugma|ngayon|karon|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(value)) return 'list';
  // Multi-task creation is considered after read and edit wording.
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const timePattern = /(?:\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d)/i;
  if (lines.length >= 2 && lines.filter(line => timePattern.test(line)).length >= 2) return 'create';
  const times = value.match(/(?:\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d)/gi);
  if (times && times.length >= 2 && /\b(?:and|then)\b|,/.test(value)) return 'create';
  if (isScheduleIntent(value)) return 'create';
  if (/\b(?:schedule|reminder|plan|task)s?\b.{0,35}\b(?:today|tomorrow|bukas|ugma|ngayon|karon|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(value)) return 'list';
  if (/\b(?:today|tomorrow|bukas|ugma|monday|tuesday|wednesday|thursday|friday|saturday|sunday|daily|weekly|every day|at \d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i.test(value)
    && /\b(?:i want to|i need to|please|can you|could you|water|fertilize|harvest|plant|feed)\b/i.test(value)) return 'ambiguous';
  if (/\b(?:schedules?|reminders?|calendar|plans?|iskedyul|paalala|pahinumdom|today|tomorrow|bukas|ugma)\b/i.test(value)
    && /\b(?:can you|could you|please|i want|i need|what|when|set|move|add|have|for|on|at|ano|unsa|gusto|palihog)\b/i.test(value)) return 'ambiguous';
  return 'chat';
}

export function parseObject(raw: string): Record<string, unknown> | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          const candidate = raw.slice(start, i + 1);
          if (candidate.length <= 16000) {
            try {
              const value: unknown = JSON.parse(candidate);
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                return value as Record<string, unknown>;
              }
            } catch {
              // Ignore invalid candidate and continue scanning
            }
          }
          start = -1;
        }
      }
    }
  }
  return null;





}

export function parseCalendarIntent(raw: string): Exclude<CalendarIntent, 'ambiguous'> | null {
  const intent = parseObject(raw)?.intent;
  return intent === 'chat' || intent === 'create' || intent === 'list' || intent === 'edit' || intent === 'delete' ? intent : null;
}

export function isStructuredScheduleInput(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return lines.length > 0 && lines.every(line =>
    /^(?:[-*•]\s*|\d{1,2}[.)]\s*)?(?:\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)\b|(?:[01]?\d|2[0-3]):[0-5]\d\b)/i.test(line));
}
export function scheduleDeleteSummary(schedule: Schedule) {
  return `I’ll remove **${escapeMarkdown(schedule.title)}** — ${schedule.day}, ${timeLabel(schedule.at)} PH${schedule.repeatKind === 'none' ? '' : ` · entire ${schedule.repeatKind} series`}.\n\nReply **Correct** to delete it, or **Cancel** to keep it. Nothing has changed yet.`;
}
export function scheduleDeletedMessage(title: string) {
  return `Done — **${escapeMarkdown(title)}** was removed from your calendar.`;
}

export function calendarClassificationPrompt(message: string, titles: string[] = []) {
  return `Classify the user's request for an offline farming assistant. Return ONLY {"intent":"chat|create|list|edit|delete"}. create means add a calendar schedule/reminder, list means read saved schedules, edit means change a saved schedule, delete means remove a saved schedule, chat means ordinary advice or any other request. A bare action verb may refer to one of these saved schedule titles: ${JSON.stringify(titles.slice(0, 30))}. Never infer a calendar action from a general farming question. Message: ${JSON.stringify(message)}.`;
}

export function bulkScheduleExtractionPrompt(message: string, previous?: ScheduleDraft[], now = Date.now()) {
  const phNow = new Date(now + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  return `Extract EVERY distinct task the user asks to put on the calendar, maximum ${MAX_BULK_SCHEDULES}. Philippine time now: ${phNow} (UTC+08:00), today ${phDateKey(now)}. Return ONLY {"items":[{"title":string|null,"day":"YYYY-MM-DD"|null,"time":"HH:mm"|null,"reminder":boolean,"repeatKind":"none|daily|weekly|interval","intervalDays":integer,"language":"en|tl|ceb"}]}. One separate item per task, in the user's order, including tasks joined by commas or "and". Shared dates or reminder instructions apply to each relevant item; individual times stay with their tasks. One repeating task is one item. Do not invent a missing date or time. Previous list: ${JSON.stringify(previous ?? null)}. User message: ${JSON.stringify(message)}.`;
}

export function parseScheduleDrafts(raw: string, previous?: ScheduleDraft[]): ScheduleDraft[] | null {
  const value = parseObject(raw);
  if (!Array.isArray(value?.items) || value.items.length < 1 || value.items.length > MAX_BULK_SCHEDULES) return null;
  if (previous && value.items.length !== previous.length) return null;
  const drafts = value.items.map((item, index) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? parseScheduleDraft(JSON.stringify(item), previous?.[index]) : null);
  return drafts.every((item): item is ScheduleDraft => item !== null) ? drafts : null;
}

export function scheduleBulkSummary(drafts: ScheduleDraft[]) {
  if (drafts.length === 1) return scheduleSummary(drafts[0]);
  const language = drafts[0].language;
  const rows = drafts.map((draft, index) => {
    const when = draft.day && draft.time ? `${draft.day} ${draft.time} PH` : [draft.day ?? 'date needed', draft.time ?? 'time needed'].join(' · ');
    const repeat = draft.repeatKind === 'interval' ? (language === 'tl' ? `Tuwing ${draft.intervalDays} araw` : language === 'ceb'
      ? `Matag ${draft.intervalDays} ka adlaw` : `Every ${draft.intervalDays} days`)
      : draft.repeatKind === 'none' ? (language === 'en' ? 'None' : 'Wala')
        : draft.repeatKind === 'daily' ? (language === 'tl' ? 'Araw-araw' : language === 'ceb' ? 'Kada adlaw' : 'Daily')
          : (language === 'tl' ? 'Linggo-linggo' : language === 'ceb' ? 'Kada semana' : 'Weekly');
    const reminder = draft.reminder ? (language === 'tl' ? 'Naka-on' : language === 'ceb' ? 'Naka-on' : 'On')
      : (language === 'en' ? 'Off' : 'Naka-off');
    return `| ${index + 1} | ${escapeMarkdown(draft.title ?? 'Title needed')} | ${when} | ${repeat} | ${reminder} |`;
  });
  const introduction = language === 'tl' ? `Gagawa ako ng ${drafts.length} iskedyul:` : language === 'ceb'
    ? `Maghimo ko og ${drafts.length} ka iskedyul:` : `I’ll create these ${drafts.length} schedules:`;
  const header = language === 'tl' ? '| # | Gawain | Kailan | Ulit | Paalala |'
    : language === 'ceb' ? '| # | Buhaton | Kanus-a | Balik | Pahinumdom |'
      : '| # | Task | When | Repeat | Reminder |';
  const table = `${introduction}\n\n${header}\n|---|---|---|---|---|\n${rows.join('\n')}`;
  const incomplete = drafts.map((draft, index) => ({ number: index + 1, problem: draftProblem(draft) })).filter(row => row.problem);
  if (incomplete.length) return `${table}\n\n${language === 'tl' ? 'Kailangan pa ang detalye para sa' : language === 'ceb'
    ? 'Kinahanglan pa ang detalye para sa' : 'Please provide'} ${incomplete.map(row => `#${row.number}: ${row.problem}`).join(', ')}. ${language === 'en' ? 'Nothing has been saved.' : language === 'tl' ? 'Wala pang na-save.' : 'Wala pay na-save.'}`;
  return `${table}\n\n${language === 'tl'
    ? 'Tama ba ang lahat? Sagutin ng **Tama** para i-save, o sabihin kung aling numero ang babaguhin.'
    : language === 'ceb' ? 'Sakto ba ang tanan? Tubaga og **Sakto** aron i-save, o isulti ang numero nga usbon.'
      : 'Is everything correct? Reply **Correct** to save all, or tell me what to change in one or more schedules.'}`;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const PH_WEEKDAYS = ['linggo', 'lunes', 'martes', 'miyerkules', 'huwebes', 'biyernes', 'sabado'];
export function resolveScheduleDay(text: string, now = Date.now()): string | null {
  const value = text.trim().toLowerCase();
  const iso = /\b\d{4}-\d{2}-\d{2}\b/.exec(value)?.[0];
  if (iso) return validDay(iso) ? iso : null;
  const relative = relativePhilippineDay(value, now);
  if (relative) return relative;
  const today = phDateKey(now);
  const index = WEEKDAYS.findIndex((day, i) => new RegExp(`\\b(?:${day}|${PH_WEEKDAYS[i]})\\b`).test(value));
  if (index < 0) return null;
  const stamp = Date.parse(`${today}T00:00:00Z`);
  let offset = (index - new Date(stamp).getUTCDay() + 7) % 7;
  if (/\bnext\b/.test(value)) offset = offset === 0 ? 7 : offset + 7;
  return new Date(stamp + offset * 86400000).toISOString().slice(0, 10);
}

export function scheduleListMessage(day: string, items: ScheduleOccurrence[], now = Date.now(), language: ScheduleLanguage = 'en') {
  const label = dayLabel(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  if (!items.length) return language === 'tl' ? `Wala kang iskedyul sa **${label}** (oras sa Pilipinas).`
    : language === 'ceb' ? `Wala kay iskedyul sa **${label}** (oras sa Pilipinas).`
      : `You have no schedules for **${label}** (Philippine time).`;
  const rows = [...items].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).map(item =>
    `| ${timeLabel(item.at)} | ${escapeMarkdown(item.title)} | ${item.reminder ? language === 'en' ? 'On' : 'Naka-on' : language === 'en' ? 'Off' : 'Naka-off'} | ${item.at < now
      ? language === 'tl' ? 'Lumipas na' : language === 'ceb' ? 'Nilabay na' : 'Past'
      : language === 'tl' ? 'Paparating' : language === 'ceb' ? 'Umaabot' : 'Upcoming'} |`);
  const header = language === 'tl' ? '| Oras | Iskedyul | Paalala | Kalagayan |'
    : language === 'ceb' ? '| Oras | Iskedyul | Pahinumdom | Kahimtang |'
      : '| Time | Schedule | Reminder | Status |';
  const total = language === 'tl' ? `${items.length} iskedyul lahat.` : language === 'ceb'
    ? `${items.length} ka iskedyul tanan.` : `${items.length} ${items.length === 1 ? 'schedule' : 'schedules'} total.`;
  return `### ${label} · ${language === 'en' ? 'Philippine time' : 'Oras sa Pilipinas'}\n\n${header}\n|---|---|---|---|\n${rows.join('\n')}\n\n${total}`;
}

export function numberedScheduleListMessage(from: string, to: string, items: ScheduleOccurrence[], now = Date.now()) {
  const label = from === to ? dayLabel(from, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : `${from} to ${to}`;
  if (!items.length) return `You have no schedules for **${label}** (Philippine time).`;
  const shown = items.slice(0, 30);
  const rows = shown.map((item, index) =>
    `${index + 1}. **${escapeMarkdown(item.title)}** — ${item.day}, ${timeLabel(item.at)} PH${item.repeatKind === 'none' ? '' : ` · ${item.repeatKind} series`}${item.at < now ? ' · past' : ''}`);
  return `### ${label} · Philippine time\n\n${rows.join('\n')}\n\n${items.length} ${items.length === 1 ? 'schedule' : 'schedules'} total.${items.length > shown.length ? ` Showing the first ${shown.length}.` : ''} You can say **move #2 to 9 AM** or **delete #2**.`;
}

export function scheduleListRange(text: string, now = Date.now()): { from: string; to: string } | null {
  const value = text.toLowerCase();
  const today = phDateKey(now);
  const stamp = Date.parse(`${today}T00:00:00Z`);
  const add = (days: number) => new Date(stamp + days * 86400000).toISOString().slice(0, 10);
  if (/\b(?:this week|current week)\b/.test(value)) {
    const mondayOffset = (new Date(stamp).getUTCDay() + 6) % 7;
    return { from: add(-mondayOffset), to: add(6 - mondayOffset) };
  }
  if (/\b(?:next week)\b/.test(value)) {
    const mondayOffset = (new Date(stamp).getUTCDay() + 6) % 7;
    return { from: add(7 - mondayOffset), to: add(13 - mondayOffset) };
  }
  if (/\b(?:next seven days|next 7 days)\b/.test(value)) return { from: today, to: add(6) };
  if (/\b(?:upcoming|all my schedules|all schedules)\b/.test(value)
    && !/\b(?:today|tomorrow|day after tomorrow|ngayon|bukas|karon|ugma|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b\d{4}-\d{2}-\d{2}\b/.test(value))
    return { from: today, to: add(29) };
  const day = resolveScheduleDay(value, now);
  return day ? { from: day, to: day } : null;
}

export function referencedScheduleNumber(text: string): number | null {
  const match = /(?:#\s*|\bnumber\s+)(\d{1,2})\b/i.exec(text)
    ?? /^(?:\s*)(\d{1,2})(?:\s*[.!]?\s*)$/.exec(text);
  if (match) return Number(match[1]);
  const ordinal = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i.exec(text)?.[1]?.toLowerCase();
  return ordinal ? ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'].indexOf(ordinal) + 1 : null;
}

export function draftFromSchedule(schedule: Schedule, language: ScheduleLanguage = 'en'): ScheduleDraft {
  const local = new Date(schedule.at + 8 * 3600000);
  return { title: schedule.title, day: schedule.day,
    time: `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`,
    reminder: !!schedule.reminder, repeatKind: schedule.repeatKind, intervalDays: schedule.intervalDays, language };
}

export type EditExtraction = { target: string | null; changes: Partial<ScheduleDraft>; language: ScheduleLanguage };
export function editScheduleExtractionPrompt(message: string, previous?: ScheduleDraft, now = Date.now()) {
  return `Extract an EDIT to a saved calendar schedule. Philippine date today: ${phDateKey(now)}. Return ONLY {"target":string|null,"changes":object,"language":"en|tl|ceb"}. target is the existing schedule title the user identifies; null if omitted. changes contains ONLY fields explicitly changed: title, day (YYYY-MM-DD), time (24-hour HH:mm), reminder (boolean), repeatKind (none/daily/weekly/interval), intervalDays. Do not invent fields. If this is a correction to a reviewed edit, preserve the existing target and return only newly changed fields. Existing proposal: ${JSON.stringify(previous ?? null)}. User message: ${JSON.stringify(message)}.`;
}
export function deleteScheduleExtractionPrompt(message: string) {
  return `Identify which EXISTING calendar schedule the user wants removed. Return ONLY {"target":string|null}. Use the title or identifying words, or null if no specific schedule is named. Do not claim it was deleted. User message: ${JSON.stringify(message)}.`;
}
export function parseDeleteExtraction(raw: string): string | null {
  const target = parseObject(raw)?.target;
  return typeof target === 'string' && target.trim() ? target.trim().slice(0, 120) : null;
}

export function parseEditExtraction(raw: string): EditExtraction | null {
  const value = parseObject(raw);
  if (!value || !value.changes || typeof value.changes !== 'object' || Array.isArray(value.changes)) return null;
  const source = value.changes as Record<string, unknown>;
  const parsed = parseScheduleDraft(JSON.stringify(source));
  if (!parsed) return null;
  const changes: Partial<ScheduleDraft> = {};
  if (typeof source.title === 'string' && parsed.title) changes.title = parsed.title;
  if (typeof source.day === 'string' && parsed.day) changes.day = parsed.day;
  if (typeof source.time === 'string' && parsed.time) changes.time = parsed.time;
  if (typeof source.reminder === 'boolean') changes.reminder = source.reminder;
  if (source.repeatKind === 'none' || source.repeatKind === 'daily' || source.repeatKind === 'weekly' || source.repeatKind === 'interval') changes.repeatKind = source.repeatKind;
  if (Number.isInteger(source.intervalDays) && (source.intervalDays as number) >= 2 && (source.intervalDays as number) <= 365) changes.intervalDays = source.intervalDays as number;
  const target = typeof value.target === 'string' ? value.target.trim().slice(0, 120) : null;
  const language: ScheduleLanguage = value.language === 'tl' || value.language === 'ceb' ? value.language : 'en';
  return { target: target || null, changes, language };
}

export function scheduleEditSummary(current: Schedule, draft: ScheduleDraft) {
  const old = draftFromSchedule(current);
  if (!scheduleDraftDiffers(current, draft))
    return draft.language === 'tl' ? 'Ano ang gusto mong baguhin sa iskedyul? Wala pang na-save.'
      : draft.language === 'ceb' ? 'Unsa ang imong gustong usbon sa iskedyul? Wala pay na-save.'
        : 'What would you like to change about this schedule? Nothing has been saved.';
  const describe = (item: ScheduleDraft) => {
    const reminder = draft.language === 'tl' ? 'Paalala' : draft.language === 'ceb' ? 'Pahinumdom' : 'Reminder';
    const repeat = draft.language === 'tl' ? 'Ulit' : draft.language === 'ceb' ? 'Balik' : 'Repeat';
    const repeatValue = item.repeatKind === 'interval' ? (draft.language === 'tl' ? `tuwing ${item.intervalDays} araw`
      : draft.language === 'ceb' ? `matag ${item.intervalDays} ka adlaw` : `every ${item.intervalDays} days`)
      : item.repeatKind === 'none' ? (draft.language === 'en' ? 'none' : 'wala')
        : item.repeatKind === 'daily' ? (draft.language === 'tl' ? 'araw-araw' : draft.language === 'ceb' ? 'kada adlaw' : 'daily')
          : draft.language === 'tl' ? 'linggo-linggo' : draft.language === 'ceb' ? 'kada semana' : 'weekly';
    return `${item.day} ${item.time} PH · ${reminder} ${item.reminder ? draft.language === 'en' ? 'On' : 'Naka-on' : draft.language === 'en' ? 'Off' : 'Naka-off'} · ${repeat} ${repeatValue}`;
  };
  const problem = draftProblem(draft);
  const intro = draft.language === 'tl' ? `Babaguhin ko ang **${escapeMarkdown(current.title)}**:`
    : draft.language === 'ceb' ? `Usbon nako ang **${escapeMarkdown(current.title)}**:`
      : `I’ll edit **${escapeMarkdown(current.title)}**:`;
  const currentLabel = draft.language === 'tl' ? 'Kasalukuyan' : draft.language === 'ceb' ? 'Karon' : 'Current';
  const proposedLabel = draft.language === 'tl' ? 'Iminungkahi' : draft.language === 'ceb' ? 'Gisugyot' : 'Proposed';
  const series = current.repeatKind === 'none' ? '' : draft.language === 'tl' ? 'Mababago ang buong paulit-ulit na iskedyul.\n\n'
    : draft.language === 'ceb' ? 'Mausab ang tibuok balik-balik nga iskedyul.\n\n' : 'This changes the repeating series.\n\n';
  const ending = problem ? `Please provide a valid ${problem}. Nothing has been changed.`
    : draft.language === 'tl' ? 'Tama ba ito? Sagutin ng **Tama** para i-save, o sabihin ang babaguhin.'
      : draft.language === 'ceb' ? 'Sakto ba kini? Tubaga og **Sakto** aron i-save, o isulti ang usbon.'
        : 'Is that correct? Reply **Correct** to save, or tell me what to change.';
  return `${intro}\n\n${currentLabel}: ${describe(old)}\n\n${proposedLabel}: **${escapeMarkdown(draft.title ?? '')}** · ${describe(draft)}\n\n${series}${ending}`;
}

export function scheduleDraftDiffers(current: Schedule, draft: ScheduleDraft) {
  const old = draftFromSchedule(current);
  return old.title !== draft.title || old.day !== draft.day || old.time !== draft.time ||
    old.reminder !== draft.reminder || old.repeatKind !== draft.repeatKind ||
    (draft.repeatKind === 'interval' && old.intervalDays !== draft.intervalDays);
}

export function matchingScheduleTargets(records: Schedule[], query: string | null, message: string) {
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const needle = clean(query ?? '');
  if (!needle) return records;
  const exact = records.filter(item => clean(item.title) === needle);
  if (exact.length) return exact;
  const included = records.filter(item => clean(item.title).includes(needle) || clean(message).includes(clean(item.title)));
  if (included.length) return included;
  const key = needle.split(' ').find(word => word.length >= 4)?.slice(0, 4);
  return key ? records.filter(item => clean(item.title).split(' ').some(word => word.startsWith(key))) : [];
}

export function scheduleTargetChoices(records: Schedule[], action: 'edit' | 'delete' = 'edit') {
  if (!records.length) return 'I could not find a matching saved schedule. Tell me its exact title, or check your calendar.';
  return `Which schedule should I ${action}? Reply with its number or exact title:\n\n${records.slice(0, 10)
    .map((item, index) => `${index + 1}. **${escapeMarkdown(item.title)}** — ${item.day}, ${timeLabel(item.at)} PH${item.repeatKind === 'none' ? '' : ` · ${item.repeatKind} series`}`)
    .join('\n')}\n\nNothing has been changed.`;
}

export function sameScheduleRecord(a: Schedule, b: Schedule) {
  return a.id === b.id && a.title === b.title && a.day === b.day && a.at === b.at &&
    a.reminder === b.reminder && a.repeatKind === b.repeatKind && a.intervalDays === b.intervalDays;
}
