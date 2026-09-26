import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayLabel, monthCells, phDateKey } from '@/src/calendar/calendar-time';
import { Fonts } from '@/constants/Typography';

type Props = { mode: 'date' | 'time'; day: string; hour: number; minute: number;
  onCancel: () => void; onConfirm: (value: { day: string; hour: number; minute: number }) => void };
function shiftedMonth(month: string, delta: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}
export function SchedulePickerModal({ mode, day, hour, minute, onCancel, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const [draftDay, setDraftDay] = useState(day);
  const [month, setMonth] = useState(day.slice(0, 7));
  const [hourText, setHourText] = useState(String(hour % 12 || 12));
  const [minuteText, setMinuteText] = useState(String(minute).padStart(2, '0'));
  const [period, setPeriod] = useState<'AM' | 'PM'>(hour < 12 ? 'AM' : 'PM');
  const [error, setError] = useState('');
  const confirm = () => {
    if (mode === 'date') { onConfirm({ day: draftDay, hour, minute }); return; }
    const h = Number(hourText); const m = Number(minuteText);
    if (!hourText.trim() || !minuteText.trim() || !Number.isInteger(h) || h < 1 || h > 12 || !Number.isInteger(m) || m < 0 || m > 59) {
      setError('Enter an hour from 1–12 and minutes from 00–59.'); return;
    }
    onConfirm({ day, hour: h % 12 + (period === 'PM' ? 12 : 0), minute: m });
  };
  return <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
    <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{mode === 'date' ? 'Choose a date' : 'Choose a time'}</Text>
          {mode === 'date' ? <>
            <View style={styles.monthHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(value => shiftedMonth(value, -1))} style={styles.arrow}><Text style={styles.arrowText}>‹</Text></Pressable>
              <Text style={styles.monthTitle}>{dayLabel(`${month}-01`, { month: 'long', year: 'numeric' })}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonth(value => shiftedMonth(value, 1))} style={styles.arrow}><Text style={styles.arrowText}>›</Text></Pressable>
            </View>
            <View style={styles.grid}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((name, index) =>
              <Text key={index} style={styles.weekday}>{name}</Text>)}</View>
            <View style={styles.grid}>{monthCells(`${month}-01`).map((date, index) => <View key={date ?? `blank-${index}`} style={styles.cell}>
              {date && <Pressable accessibilityRole="button" accessibilityLabel={dayLabel(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                accessibilityState={{ selected: date === draftDay }} onPress={() => setDraftDay(date)} style={[styles.date, date === draftDay && styles.selectedDate]}>
                <Text style={[styles.dateText, date === draftDay && styles.selectedDateText]}>{Number(date.slice(-2))}</Text>
                {date === phDateKey() && <View style={[styles.todayDot, date === draftDay && { backgroundColor: '#FFFFFF' }]} />}
              </Pressable>}
            </View>)}</View>
          </> : <>
            <Text style={styles.hint}>Philippine time</Text>
            <View style={styles.timeRow}>
              <View><Text style={styles.fieldLabel}>Hour</Text><TextInput accessibilityLabel="Hour" keyboardType="number-pad" maxLength={2} selectTextOnFocus value={hourText}
                onChangeText={setHourText} style={styles.timeInput} /></View>
              <Text style={styles.colon}>:</Text>
              <View><Text style={styles.fieldLabel}>Minute</Text><TextInput accessibilityLabel="Minute" keyboardType="number-pad" maxLength={2} selectTextOnFocus value={minuteText}
                onChangeText={setMinuteText} style={styles.timeInput} /></View>
            </View>
            <View style={styles.periodRow}>{(['AM', 'PM'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: value === period }}
              onPress={() => setPeriod(value)} style={[styles.periodButton, value === period && styles.periodSelected]}>
              <Text style={[styles.periodText, value === period && styles.selectedDateText]}>{value}</Text>
            </Pressable>)}</View>
          </>}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={confirm} style={styles.confirm}><Text style={styles.confirmText}>Set {mode}</Text></Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 18 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 350, backgroundColor: '#FFFBEF', borderColor: '#315E3E', borderWidth: 2, borderBottomWidth: 4, borderRadius: 20, padding: 18, gap: 14 },
  title: { fontFamily: Fonts.sansBold, fontSize: 21, color: '#20432D', textAlign: 'center' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 17, color: '#20432D' },
  arrow: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#E9F1E7' },
  arrowText: { fontSize: 28, lineHeight: 34, color: '#285E3D' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: '14.2857%', textAlign: 'center', color: '#536758', marginBottom: 4 },
  cell: { width: '14.2857%', height: 42, alignItems: 'center' }, date: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  selectedDate: { backgroundColor: '#32834E' }, dateText: { color: '#20432D', fontFamily: Fonts.sansMedium, fontSize: 15 },
  selectedDateText: { color: '#FFFFFF' }, todayDot: { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: '#32834E' },
  hint: { textAlign: 'center', color: '#536758' }, timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  fieldLabel: { color: '#536758', textAlign: 'center', marginBottom: 5 }, timeInput: { width: 76, height: 66, borderWidth: 1, borderColor: '#9FC4A7', borderRadius: 14, backgroundColor: '#FFFFFF', textAlign: 'center', fontFamily: Fonts.monoSemiBold, fontSize: 26, color: '#20432D' },
  colon: { fontSize: 28, color: '#20432D', marginTop: 18 }, periodRow: { flexDirection: 'row', gap: 8, alignSelf: 'center' },
  periodButton: { minWidth: 76, padding: 11, borderRadius: 12, alignItems: 'center', backgroundColor: '#E7F1E7' }, periodSelected: { backgroundColor: '#32834E' },
  periodText: { color: '#20432D', fontFamily: Fonts.sansSemiBold }, error: { color: '#A83030' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 }, cancel: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#E7EFE5' },
  cancelText: { fontFamily: Fonts.sansSemiBold, color: '#285E3D' }, confirm: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderBottomWidth: 4, borderColor: '#205936', backgroundColor: '#32834E' },
  confirmText: { fontFamily: Fonts.sansBold, color: '#FFFFFF' },
});
