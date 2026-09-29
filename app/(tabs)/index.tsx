import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, FlatList, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useIsFocused, useRouter, type Href } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { CalendarCards, type CalendarLayout, type CalendarMode } from '@/components/calendar/CalendarCards';
import { calendarCornerLayout } from '@/assets/mascot/calendar-corner-layout';
import { dayLabel, frontFirst, monthCells, orderSchedulesForDay, phDateKey, phGreeting, scheduleTimeParts } from '@/src/calendar/calendar-time';
import { listSchedules, type ScheduleOccurrence } from '@/src/calendar/schedule-store';
import { reconcileScheduleReminders } from '@/src/calendar/reminders';
import { useChatDatabase } from '@/src/database/ChatDatabaseProvider';
import { Fonts } from '@/constants/Typography';
import { useContent } from '@/src/others/ContentProvider';

const layouts: CalendarLayout[] = ['vertical', 'wallet', 'month'];
const scheduleTones = [
  { backgroundColor: '#398153', borderColor: '#28683E' },
  { backgroundColor: '#76AC84', borderColor: '#5D9770' },
  { backgroundColor: '#A6CEAE', borderColor: '#8EBE99' },
  { backgroundColor: '#D1E6D5', borderColor: '#B9D9C0' },
];
const pastScheduleTone = { backgroundColor: '#EFF2EC', borderColor: '#D6DED5' };
let preferredLayout: CalendarLayout = 'wallet';
const ScheduleRowItem = memo(function ScheduleRowItem({ item, index, now, onSelect }: {
  item: ScheduleOccurrence; index: number; now: number; onSelect: (seriesId: string) => void;
}) {
  const { time, period } = scheduleTimeParts(item.at);
  const past = item.at < now;
  const featured = !past && index === 0;
  return <Pressable accessibilityRole="button" disabled={past} accessibilityState={{ disabled: past }}
    accessibilityHint={past ? undefined : item.repeatKind === 'none' ? 'Edit or delete this schedule' : 'Edit or delete the repeating series'}
    accessibilityLabel={`${item.title}, ${time} ${period}, reminder ${item.reminder ? 'on' : 'off'}${past ? ', past schedule' : ''}`}
    onPress={() => onSelect(item.seriesId)}
    style={[styles.scheduleRow, past ? pastScheduleTone : scheduleTones[Math.min(index, scheduleTones.length - 1)]]}>
    <View style={styles.timeColumn}><Text style={[styles.time, featured && styles.featuredText, past && styles.pastText]}>{time}</Text><Text style={[styles.period, featured && styles.featuredText, past && styles.pastText]}>{period}</Text></View>
    <Text style={[styles.scheduleTitle, featured && styles.featuredText, past && styles.pastText]}>{item.title}</Text>
    <View style={[styles.clockIcon, past && styles.pastClock]} accessibilityElementsHidden importantForAccessibility="no">
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={9} stroke={featured ? item.reminder ? '#FFFFFF' : '#AECBB6' : item.reminder ? '#285E3D' : '#849D89'} strokeWidth={1.8} />
        <Path d="M12 7v5l3 2" stroke={featured ? item.reminder ? '#FFFFFF' : '#AECBB6' : item.reminder ? '#285E3D' : '#849D89'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  </Pressable>;
});

const GreetingTitle = memo(function GreetingTitle({ greeting }: { greeting: string }) {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState(() => (reduce ? greeting : ''));

  useFocusEffect(
    useCallback(() => {
      if (reduce) {
        setTyped(greeting);
        return;
      }
      let count = 0;
      setTyped('');
      const timer = setInterval(() => {
        count++;
        setTyped(greeting.slice(0, count));
        if (count >= greeting.length) clearInterval(timer);
      }, 38);
      return () => clearInterval(timer);
    }, [greeting, reduce]),
  );

  return <Text accessible={false} style={styles.greeting}>{typed || ' '}</Text>;
});

export default function CalendarScreen() {
  const db = useChatDatabase(); const router = useRouter(); const reduce = useReducedMotion();
  const { content } = useContent();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets(); const { width, height, fontScale } = useWindowDimensions();
  const [now, setNow] = useState(Date.now()); const today = phDateKey(now); const greeting = phGreeting(now);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [layout, setLayout] = useState<CalendarLayout>(preferredLayout);
  const [mode, setMode] = useState<CalendarMode>('compact'); const [selected, setSelected] = useState(today);
  const [settledDay, setSettledDay] = useState(today);
  const settling = !reduce && selected !== settledDay;
  useEffect(() => {
    const timer = setTimeout(() => setSettledDay(selected), reduce ? 0 : 400);
    return () => clearTimeout(timer);
  }, [selected, reduce]);
  const [schedules, setSchedules] = useState<ScheduleOccurrence[]>([]); const [error, setError] = useState('');
  const [loading, setLoading] = useState(true); const [reload, setReload] = useState(0);
  const [workHeight, setWorkHeight] = useState(height * 0.7);
  const spread = useSharedValue(0); const hidden = useSharedValue(0); const scrollY = useRef(0);
  const list = useRef<FlatList<ScheduleOccurrence>>(null);
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { const current = Date.now(); setNow(current);
      timer = setTimeout(tick, 60000 - current % 60000 + 20); };
    tick();
    const sub = AppState.addEventListener('change', state => {
      setAppActive(state === 'active');
      clearTimeout(timer);
      if (state === 'active') { tick(); setReload(value => value + 1); }
    });
    return () => { clearTimeout(timer); sub.remove(); };
  }, []));
  useEffect(() => { setSelected(today); }, [today]);
  useFocusEffect(useCallback(() => {
    let live = true;
    setLoading(previous => (schedules.length === 0 ? true : previous));
    setError('');
    const cards = frontFirst(today); const cells = monthCells(today).filter((day): day is string => day !== null);
    const from = [cards[0], cells[0]].sort()[0]; const to = [cards[6], cells[cells.length - 1]].sort().at(-1)!;
    void listSchedules(db, from, to).then(items => { if (live) setSchedules(items); }, () => { if (live) setError('Unable to load schedules. Tap to retry.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [db, today, reload]));
  useFocusEffect(useCallback(() => {
    void reconcileScheduleReminders(db).catch(() => undefined);
  }, [db, reload]));
  useEffect(() => {
    spread.value = withTiming(mode === 'spread' ? 1 : 0, { duration: reduce ? 0 : 330 });
    hidden.value = withTiming(mode === 'list' ? 1 : 0, { duration: reduce ? 0 : 360, easing: Easing.inOut(Easing.cubic) });
  }, [mode, reduce, spread, hidden]);
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (mode === 'compact') return false;
      setMode('compact'); return true;
    });
    return () => sub.remove();
  }, [mode]));
  const cardGestures = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      (Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3) ||
      (Math.abs(g.dy) > 14 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4 && mode !== 'list'),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 55 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3) {
        const direction = g.dx < 0 ? 1 : -1;
        const next = layouts[(layouts.indexOf(layout) + direction + layouts.length) % layouts.length];
        preferredLayout = next; setLayout(next);
        if ((next !== 'month' && !frontFirst(today).includes(selected)) ||
          (next === 'month' && selected.slice(0, 7) !== today.slice(0, 7))) setSelected(today);
        return;
      }
      if (g.dy > 35) setMode('spread');
      else if (g.dy < -35 && mode === 'spread') setMode('compact');
      else if (g.dy < -35 && mode === 'compact') {
        list.current?.scrollToOffset({ offset: 0, animated: false });
        scrollY.current = 0;
        setMode('list');
      }
    },
  }), [mode, layout, today, selected]);
  const listGestures = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 14 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4 &&
      mode === 'list' && g.dy > 0 && scrollY.current <= 0,
    onPanResponderRelease: (_, g) => { if (g.dy > 35) setMode('compact'); },
  }), [mode]);
  const cardWidth = Math.max(180, width - 34);
  const cornerMascot = calendarCornerLayout(width);
  const cardHeight = Math.max(194, Math.round(Math.min(cardWidth / 1.85, 210) * Math.max(1, fontScale)));
  const compactGap = Math.max(8, Math.min(18, (workHeight - cardHeight - 150) / 6));
  const compactHeight = layout === 'month' ? 96 + monthCells(today).length / 7 * 38 : cardHeight + 6 * compactGap;
  const monthPanelHeight = frontFirst(today).includes(selected) ? 172 : 148;
  const spreadHeight = layout === 'month' ? compactHeight + monthPanelHeight : Math.max(cardHeight + 6 * 20, workHeight - 42);
  const compactHeightValue = useSharedValue(compactHeight);
  const spreadHeightValue = useSharedValue(spreadHeight);
  useEffect(() => {
    compactHeightValue.value = compactHeight;
    spreadHeightValue.value = spreadHeight;
  }, [compactHeight, spreadHeight, compactHeightValue, spreadHeightValue]);
  const calendarStyle = useAnimatedStyle(() => {
    const visible = 1 - hidden.value;
    return {
      height: (compactHeightValue.value + (spreadHeightValue.value - compactHeightValue.value) * spread.value) * visible,
      opacity: visible * visible,
    };
  }, []);
  const scheduleStyle = useAnimatedStyle(() => {
    return {
      opacity: Math.max(0, Math.min(1, 1 - spread.value + hidden.value)),
      transform: [{ translateY: spread.value * (1 - hidden.value) * workHeight }],
    };
  }, [workHeight]);
  const items = useMemo(() => orderSchedulesForDay(schedules, selected, now), [schedules, selected, now]);
  const onEditSchedule = useCallback((seriesId: string) => {
    router.push({ pathname: '/add-schedule', params: { id: seriesId } } as Href);
  }, [router]);
  const renderScheduleRow = useCallback(({ item, index }: { item: ScheduleOccurrence; index: number }) => (
    <ScheduleRowItem item={item} index={index} now={now} onSelect={onEditSchedule} />
  ), [now, onEditSchedule]);
  const onSelectDay = useCallback((day: string) => {
    setSelected(day);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);
  const add = () => router.push({ pathname: '/add-schedule', params: { day: selected } } as Href);
  return <View style={styles.screen}>
    <View style={styles.topArea}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${greeting}. Calendar layout: ${layout}. Tap to change layout.`}
        accessibilityHint="Cycles vertical cards, wallet cards, and the current month"
        onPress={() => { const next = layouts[(layouts.indexOf(layout) + 1) % layouts.length]; preferredLayout = next; setLayout(next); setSelected(today); setMode('compact'); }}
        style={styles.greetingArea}>
        <GreetingTitle greeting={greeting} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Return to today" onPress={() => {
        setSelected(today); list.current?.scrollToOffset({ offset: 0, animated: false }); setMode('compact');
      }} style={styles.dateReset}>
        <Text style={styles.subtitle}>{dayLabel(today, { weekday: 'long', month: 'long', day: 'numeric' })}  ↻</Text>
      </Pressable>
    </View>
    <View style={styles.workArea} onLayout={event => {
      const next = event.nativeEvent.layout.height;
      setWorkHeight(current => Math.abs(current - next) > 2 ? next : current);
    }}>
      <Animated.View pointerEvents={mode === 'list' ? 'none' : 'auto'} accessibilityElementsHidden={mode === 'list'} importantForAccessibility={mode === 'list' ? 'no-hide-descendants' : 'auto'}
        style={[styles.cardArea, { overflow: mode === 'spread' ? 'visible' : 'hidden' }, calendarStyle]} {...cardGestures.panHandlers}>
        <CalendarCards today={today} selected={selected} layout={layout} mode={mode} spread={spread} hidden={hidden}
          now={now} active={focused && appActive} settling={settling}
          cardWidth={cardWidth} cardHeight={cardHeight} compactGap={compactGap} spreadHeight={spreadHeight}
          schedules={schedules} weather={content.weather}
          onSelect={onSelectDay} />
      </Animated.View>
      <Pressable accessibilityRole="button" onPress={() => setMode(mode === 'compact' ? 'spread' : 'compact')} style={styles.handleButton}>
        <View style={styles.handle} /><Text style={styles.handleLabel}>{mode === 'compact' ? 'Spread calendar' : 'Back to calendar'}</Text>
      </Pressable>
      <Animated.View pointerEvents={mode === 'spread' ? 'none' : 'auto'} accessibilityElementsHidden={mode === 'spread'} importantForAccessibility={mode === 'spread' ? 'no-hide-descendants' : 'auto'}
        style={[styles.scheduleArea, scheduleStyle]} {...listGestures.panHandlers}>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{selected === today ? 'Today’s Schedule' : dayLabel(selected, { month: 'short', day: 'numeric' }) + ' Schedule'}</Text>
          <Pressable accessibilityRole="button" onPress={() => setMode(mode === 'list' ? 'compact' : 'list')} hitSlop={8}>
            <Text style={styles.link}>{mode === 'list' ? 'Show calendar' : 'View all'}</Text>
          </Pressable>
        </View>
        {!!error && <Pressable onPress={() => setReload(value => value + 1)} accessibilityRole="button"><Text style={styles.error}>{error}</Text></Pressable>}
        <FlatList ref={list} data={items} keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={<View style={styles.empty}>{loading ? <Text style={styles.emptyCopy}>Loading schedules…</Text> : <>
            <Text style={styles.emptyCopy}>No schedules for this day yet.</Text><Pressable accessibilityRole="button" onPress={add} style={styles.add}><Text style={styles.addText}>+ Add schedule</Text></Pressable></>}
          </View>}
          renderItem={renderScheduleRow} />
      </Animated.View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 12, position: 'relative', overflow: 'visible' },
    greetingArea: { paddingTop: 10 },
  topArea: { position: 'relative', zIndex: 3 },
  greeting: { fontFamily: Fonts.sansBold, fontSize: 27, lineHeight: 36, color: '#20432D' },
  dateReset: { paddingBottom: 14, paddingTop: 3, alignSelf: 'flex-start' }, subtitle: { fontFamily: Fonts.sansRegular, fontSize: 13, color: '#647566', marginTop: 4 },
  workArea: { flex: 1, overflow: 'visible' }, cardArea: { overflow: 'visible', zIndex: 3 }, scheduleArea: { flex: 1, zIndex: 2, backgroundColor: '#FFFFFF' },
  handleButton: { alignItems: 'center', paddingVertical: 9, gap: 4, minHeight: 42 }, handle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#CBDACD' }, handleLabel: { color: '#647566', fontSize: 11 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 12 },
  sectionTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 20, color: '#20432D', flexShrink: 1 }, link: { fontFamily: Fonts.sansMedium, fontSize: 13, color: '#32834E', paddingVertical: 8 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 15, gap: 14, minHeight: 76, marginBottom: 10 },
  timeColumn: { width: 66, alignItems: 'flex-start' }, time: { fontFamily: Fonts.monoMedium, fontSize: 17, color: '#20432D' },
  period: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1, color: '#536758', marginTop: 2 },
  scheduleTitle: { flex: 1, fontFamily: Fonts.sansSemiBold, fontSize: 16, lineHeight: 22, color: '#20432D' },
  featuredText: { color: '#FFFFFF' },
  pastText: { color: '#788A7B', textDecorationLine: 'line-through' },
  pastClock: { opacity: 0.45 },
  clockIcon: { width: 28, alignItems: 'center' },
  empty: { alignItems: 'center', padding: 24, gap: 8 }, emptyCopy: { color: '#647566', fontSize: 14 },
  add: { backgroundColor: '#EDF4ED', borderRadius: 14, padding: 14, marginTop: 8 }, addText: { color: '#285E3D', fontFamily: Fonts.sansSemiBold, fontSize: 15 }, error: { color: '#A83030', paddingVertical: 12 },
});
