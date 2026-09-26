import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatDatabaseProvider, useChatDatabase } from '@/src/database/ChatDatabaseProvider';
import { dayLabel, phDateKey, phTimestamp, timeLabel } from '@/src/calendar/calendar-time';
import { deleteSchedule, getSchedule, type RepeatKind, type Schedule } from '@/src/calendar/schedule-store';
import { cancelScheduleReminders, scheduleScheduleReminders } from '@/src/calendar/reminders';
import { saveScheduleWithReminder } from '@/src/calendar/schedule-service';
import { SchedulePickerModal } from '@/components/calendar/SchedulePickerModal';
import { TactileSwitch } from '@/components/calendar/TactileSwitch';
import { Fonts } from '@/constants/Typography';

const repeatOptions: { value: RepeatKind; label: string }[] = [
  { value: 'none', label: 'Once' }, { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' }, { value: 'interval', label: 'Custom' },
];
function initialDate(day: string) {
  if (day !== phDateKey()) return { day, hour: 8, minute: 0 };
  const rounded = Math.ceil((Date.now() + 5 * 60000) / (15 * 60000)) * 15 * 60000;
  const date = new Date(rounded + 8 * 3600000);
  return { day: date.toISOString().slice(0, 10), hour: date.getUTCHours(), minute: date.getUTCMinutes() };
}
export default function AddScheduleScreen() {
  return <ChatDatabaseProvider fallback={<ActivityIndicator />}><ScheduleForm /></ChatDatabaseProvider>;
}
function ScheduleForm() {
  const db = useChatDatabase(); const router = useRouter(); const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ day?: string; id?: string }>();
  const starting = useRef(initialDate(/^\d{4}-\d{2}-\d{2}$/.test(params.day ?? '') ? params.day! : phDateKey())).current;
  const [day, setDay] = useState(starting.day); const [hour, setHour] = useState(starting.hour); const [minute, setMinute] = useState(starting.minute);
  const [title, setTitle] = useState(''); const [reminder, setReminder] = useState(false);
  const [repeatKind, setRepeatKind] = useState<RepeatKind>('none'); const [intervalText, setIntervalText] = useState('2');
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [existing, setExisting] = useState<Schedule | null>(null); const [loading, setLoading] = useState(!!params.id);
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false); const [deleteError, setDeleteError] = useState('');
  const busy = useRef(false); const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!params.id) return;
    let active = true;
    void getSchedule(db, params.id).then(schedule => {
      if (!active) return;
      if (!schedule) { setError('This schedule is no longer available.'); return; }
      const local = new Date(schedule.at + 8 * 3600000);
      setExisting(schedule); setDay(schedule.day); setHour(local.getUTCHours()); setMinute(local.getUTCMinutes());
      setTitle(schedule.title); setReminder(!!schedule.reminder); setRepeatKind(schedule.repeatKind);
      setIntervalText(String(schedule.intervalDays));
    }, () => { if (active) setError('Unable to load this schedule.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, params.id]);
  const intervalDays = Number(intervalText);
  const buildSchedule = (): Schedule => ({
    id: existing?.id ?? `schedule-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: title.trim(), day, at: phTimestamp(day, hour, minute), reminder: reminder ? 1 : 0,
    notificationId: null, repeatKind, intervalDays: repeatKind === 'interval' ? intervalDays : 1,
  });
  const save = async () => {
    if (busy.current) return;
    if (!title.trim()) { setError('Enter a schedule title.'); return; }
    if (repeatKind === 'interval' && (!Number.isInteger(intervalDays) || intervalDays < 2 || intervalDays > 365)) {
      setError('Choose a repeat interval from 2 to 365 days.'); return;
    }
    busy.current = true; setSaving(true); setError('');
    const schedule = buildSchedule();
    try {
      await saveScheduleWithReminder(db, schedule, existing);
      if (live.current) router.back();
    } catch (reason) {
      if (live.current) setError(reason instanceof Error ? reason.message : 'Unable to save. Please try again.');
    } finally { busy.current = false; if (live.current) setSaving(false); }
  };
  const remove = async () => {
    if (!existing || busy.current) return;
    busy.current = true; setSaving(true); setDeleteError('');
    try {
      await cancelScheduleReminders(existing);
      await deleteSchedule(db, existing.id);
      if (live.current) router.back();
    } catch (reason) {
      if (existing.reminder) await scheduleScheduleReminders(existing, false).catch(() => undefined);
      if (live.current) setDeleteError(reason instanceof Error ? reason.message : 'Unable to delete. Please try again.');
    } finally { busy.current = false; if (live.current) setSaving(false); }
  };
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Stack.Screen options={{ title: existing ? 'Edit Schedule' : 'Add Schedule', headerShown: true, headerTintColor: '#20432D', headerShadowVisible: false }} />
    {loading ? <ActivityIndicator style={{ flex: 1 }} color="#32834E" /> : <>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{existing ? 'Your schedule' : 'Plan a task'}</Text>
        {existing?.repeatKind !== 'none' && existing && <Text style={styles.helper}>Editing this schedule changes the entire series, starting {dayLabel(existing.day, { month: 'long', day: 'numeric', year: 'numeric' })}.</Text>}
        <Text style={styles.label}>What needs to be done?</Text>
        <TextInput accessibilityLabel="Schedule title" editable={!saving} value={title} onChangeText={setTitle} maxLength={120}
          placeholder="e.g. Water the tomatoes" placeholderTextColor="#738277" style={styles.input} />
        <View style={styles.pickerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Date, ${dayLabel(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`} disabled={saving}
            onPress={() => setPicker('date')} style={styles.pickerTile}>
            <Text style={styles.tileLabel}>DATE</Text><Text style={styles.tileValue}>{dayLabel(day, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Time, ${timeLabel(phTimestamp(day, hour, minute))}, Philippine time`} disabled={saving}
            onPress={() => setPicker('time')} style={styles.pickerTile}>
            <Text style={styles.tileLabel}>TIME · PH</Text><Text style={styles.tileValue}>{timeLabel(phTimestamp(day, hour, minute))}</Text>
          </Pressable>
        </View>
        <Text style={styles.label}>Repeat</Text>
        <View style={styles.repeatRow}>{repeatOptions.map(option => <Pressable key={option.value} accessibilityRole="button"
          accessibilityState={{ selected: repeatKind === option.value }} disabled={saving} onPress={() => setRepeatKind(option.value)}
          style={[styles.repeatChip, repeatKind === option.value && styles.repeatSelected]}>
          <Text style={[styles.repeatText, repeatKind === option.value && styles.repeatSelectedText]}>{option.label}</Text>
        </Pressable>)}</View>
        {repeatKind === 'interval' && <View style={styles.intervalRow}><Text style={styles.note}>Every</Text>
          <TextInput accessibilityLabel="Repeat every number of days" keyboardType="number-pad" maxLength={3} value={intervalText} onChangeText={setIntervalText}
            style={styles.intervalInput} /><Text style={styles.note}>days</Text></View>}
        <View style={styles.reminderCard}><View style={{ flex: 1 }}><Text style={styles.label}>Reminder</Text>
          <Text style={styles.note}>Notify me at the scheduled time.</Text></View>
          <TactileSwitch value={reminder} disabled={saving} onChange={setReminder} />
        </View>
        {repeatKind !== 'none' && reminder && <Text style={styles.helper}>Recurring reminders are scheduled ahead. Open AgriGrow periodically to renew them.</Text>}
        <Text style={styles.summary}>{dayLabel(day, { weekday: 'long', month: 'short', day: 'numeric' })} · {timeLabel(phTimestamp(day, hour, minute))} · {repeatOptions.find(item => item.value === repeatKind)?.label}</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.footerRow}>
          {!!existing && <Pressable accessibilityRole="button" accessibilityLabel={existing.repeatKind === 'none' ? 'Delete schedule' : 'Delete entire repeating series'}
            disabled={saving} onPress={() => { Keyboard.dismiss(); setDeleteError(''); setConfirmDelete(true); }} style={[styles.delete, saving && styles.disabledAction]}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>}
          <Pressable accessibilityRole="button" disabled={saving || (!!params.id && !existing)} onPress={() => void save()}
            style={[styles.save, existing && styles.editSave, saving && styles.disabledAction]}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Save schedule'}</Text>
          </Pressable>
        </View>
      </View>
    </>}
    {picker && <SchedulePickerModal mode={picker} day={day} hour={hour} minute={minute} onCancel={() => setPicker(null)}
      onConfirm={value => { setDay(value.day); setHour(value.hour); setMinute(value.minute); setPicker(null); }} />}
    <Modal visible={confirmDelete} transparent animationType="fade" statusBarTranslucent
      onRequestClose={() => { if (!saving) setConfirmDelete(false); }}>
      <View style={[styles.deleteOverlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.deletePanel} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.deleteTitle}>{existing?.repeatKind === 'none' ? 'Delete schedule?' : 'Delete entire series?'}</Text>
          <Text style={styles.deleteBody}>{existing?.repeatKind === 'none'
            ? `“${existing?.title}” will be removed from your calendar.`
            : `“${existing?.title}” and all its repeating dates will be removed.`}</Text>
          {!!deleteError && <Text accessibilityRole="alert" style={styles.error}>{deleteError}</Text>}
          <View style={styles.deleteActions}>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => setConfirmDelete(false)} style={styles.keepButton}>
              <Text style={styles.keepText}>Keep</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void remove()} style={[styles.confirmDeleteButton, saving && styles.disabledAction]}>
              <Text style={styles.confirmDeleteText}>{saving ? 'Deleting…' : existing?.repeatKind === 'none' ? 'Delete' : 'Delete series'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, content: { padding: 22, gap: 15, paddingBottom: 30 },
  heading: { fontFamily: Fonts.sansBold, fontSize: 26, color: '#20432D' },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: '#20432D' },
  input: { borderWidth: 1, borderColor: '#BFD4C2', borderRadius: 16, padding: 16, minHeight: 56, fontFamily: Fonts.sansRegular, fontSize: 16, color: '#20432D', backgroundColor: '#F6FAF7' },
  pickerRow: { flexDirection: 'row', gap: 10 }, pickerTile: { flex: 1, minWidth: 0, padding: 14, borderWidth: 1, borderColor: '#BFD4C2', borderRadius: 16, backgroundColor: '#F6FAF7', gap: 8 },
  tileLabel: { color: '#536758', fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 0.8 }, tileValue: { color: '#20432D', fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  repeatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, repeatChip: { borderRadius: 13, backgroundColor: '#EDF4ED', paddingHorizontal: 13, paddingVertical: 10 },
  repeatSelected: { backgroundColor: '#32834E' }, repeatText: { fontFamily: Fonts.sansMedium, color: '#285E3D' }, repeatSelectedText: { color: '#FFFFFF' },
  intervalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, intervalInput: { width: 65, textAlign: 'center', borderWidth: 1, borderColor: '#BFD4C2', borderRadius: 12, padding: 10, color: '#20432D', backgroundColor: '#F6FAF7', fontSize: 16 },
  reminderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#BFD4C2', borderRadius: 16, padding: 14, backgroundColor: '#F6FAF7' },
  note: { fontFamily: Fonts.sansRegular, fontSize: 14, color: '#536758', marginTop: 4 }, helper: { color: '#647566', fontSize: 12, lineHeight: 18 },
  summary: { fontFamily: Fonts.sansMedium, color: '#285E3D', fontSize: 14 }, error: { color: '#A83030', lineHeight: 22 },
  footer: { paddingHorizontal: 22, paddingTop: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E1EBE2' },
  footerRow: { flexDirection: 'row', gap: 10 },
  delete: { flex: 1, backgroundColor: '#8F2F2F', borderBottomWidth: 4, borderColor: '#611F1F', borderRadius: 16, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#FFFFFF', fontFamily: Fonts.sansBold, fontSize: 16 },
  save: { flex: 1, backgroundColor: '#32834E', borderColor: '#205936', borderBottomWidth: 4, borderRadius: 16, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  editSave: { flex: 1.4 }, disabledAction: { opacity: 0.6 },
  saveText: { fontFamily: Fonts.sansBold, color: '#FFFFFF', fontSize: 17 },
  deleteOverlay: { flex: 1, backgroundColor: 'rgba(17,37,24,0.48)', paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  deletePanel: { width: '100%', maxWidth: 340, padding: 20, gap: 14, backgroundColor: '#FFFBEF', borderColor: '#315E3E', borderWidth: 2, borderBottomWidth: 4, borderRadius: 20 },
  deleteTitle: { fontFamily: Fonts.sansBold, fontSize: 21, color: '#20432D', textAlign: 'center' },
  deleteBody: { fontFamily: Fonts.sansRegular, fontSize: 15, lineHeight: 22, color: '#26382C', textAlign: 'center' },
  deleteActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  keepButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#E7EFE5' },
  keepText: { fontFamily: Fonts.sansSemiBold, color: '#285E3D', fontSize: 16 },
  confirmDeleteButton: { flex: 1.3, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderBottomWidth: 4, borderColor: '#611F1F', backgroundColor: '#8F2F2F' },
  confirmDeleteText: { fontFamily: Fonts.sansBold, color: '#FFFFFF', fontSize: 16 },
});
