import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { dayCardColor, dayLabel, frontFirst, monthCells, orderSchedulesForDay } from '@/src/calendar/calendar-time';
import type { ScheduleOccurrence } from '@/src/calendar/schedule-store';
import { Fonts } from '@/constants/Typography';
import { ScheduleCardPreview } from './ScheduleCardPreview';

export type CalendarLayout = 'vertical' | 'wallet' | 'month';
export type CalendarMode = 'compact' | 'spread' | 'list';
type Props = { today: string; selected: string; layout: CalendarLayout; mode: CalendarMode;
  spread: SharedValue<number>; hidden: SharedValue<number>; cardWidth: number; cardHeight: number;
  compactGap: number; spreadHeight: number; schedules: ScheduleOccurrence[]; now: number; active: boolean;
  onTitleHeight: (height: number) => void; onContentHeight: (height: number) => void; onSelect: (day: string) => void };
export function CalendarCards(props: Props) {
  const { selected, layout, schedules, spreadHeight } = props;
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const item of schedules) result.set(item.day, (result.get(item.day) ?? 0) + 1);
    return result;
  }, [schedules]);
  const count = (day: string) => counts.get(day) ?? 0;
  if (layout === 'month') return <MonthCards {...props} count={count} />;
  return <View style={{ height: spreadHeight }}>
    {frontFirst(selected).map((day, i) => <DayCard key={day} {...props} day={day} index={i} count={count(day)} />)}
  </View>;
}
function MonthCards({ today, selected, mode, spread, onSelect, count }: Props & { count: (day: string) => number }) {
  const connectedStyle = useAnimatedStyle(() => ({ opacity: spread.value,
    transform: [{ translateY: -16 * (1 - spread.value) }] }), []);
  return <View>
    <View style={[styles.month, mode === 'spread' && styles.monthConnected]}>
      <Text style={styles.monthTitle}>{dayLabel(today, { month: 'long', year: 'numeric' })}</Text>
      <View style={styles.grid}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((name, i) =>
        <Text key={i} style={styles.weekday}>{name}</Text>)}</View>
      <View style={styles.grid}>{monthCells(today).map((day, i) => <View key={day ?? `blank-${i}`} style={styles.cell}>
        {day && <Pressable accessibilityRole="button" accessibilityLabel={`${dayLabel(day, { weekday: 'long', month: 'long', day: 'numeric' })}, ${count(day)} schedules`}
          accessibilityState={{ selected: day === selected }} onPress={() => onSelect(day)} style={[styles.date, day === selected && styles.today]}>
          <Text style={[styles.dateText, day === selected && styles.white]}>{Number(day.slice(-2))}</Text>
          {!!count(day) && <View style={[styles.dot, day === selected && { backgroundColor: '#FFFFFF' }]} />}
        </Pressable>}
      </View>)}</View>
    </View>
    <Animated.View pointerEvents={mode === 'spread' ? 'auto' : 'none'} accessibilityElementsHidden={mode !== 'spread'}
      importantForAccessibility={mode !== 'spread' ? 'no-hide-descendants' : 'auto'}
      style={[styles.connected, connectedStyle]}>
      <Text style={styles.white}>{selected === today ? 'TODAY' : 'SELECTED DAY'} · {dayLabel(selected, { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
      <Text style={[styles.cardTitle, styles.white]}>{count(selected)} {count(selected) === 1 ? 'schedule' : 'schedules'} for this day</Text>
      <Text style={styles.connectedHint}>Your plans at a glance</Text>
    </Animated.View>
  </View>;
}
function DayCard({ day, index, count, today, selected, layout, spread, cardWidth,
  cardHeight, compactGap, spreadHeight, schedules, now, active, onTitleHeight, onContentHeight, onSelect }: Props & { day: string; index: number; count: number }) {
  const wallet = layout === 'wallet';
  const front = day === selected;
  const dayItems = useMemo(() => front && active ? orderSchedulesForDay(schedules, day, now) : [], [front, active, schedules, day, now]);
  const reducedMotion = useReducedMotion();
  const wasSelected = useRef(front);
  const position = useSharedValue(index);
  const walletSide = useSharedValue(index % 2 ? 34 : 0);
  const lift = useSharedValue(0);
  const animatedHeight = useSharedValue(cardHeight);
  useEffect(() => {
    animatedHeight.value = withTiming(cardHeight, { duration: reducedMotion ? 0 : 300 });
  }, [cardHeight, animatedHeight, reducedMotion]);
  useEffect(() => {
    position.value = withTiming(index, { duration: reducedMotion ? 0 : 340 });
    walletSide.value = withTiming(index % 2 ? 34 : 0, { duration: reducedMotion ? 0 : 340 });
    if (front && !wasSelected.current && !reducedMotion) {
      lift.value = withSequence(withTiming(1, { duration: 100 }), withTiming(0, { duration: 280 }));
    }
    wasSelected.current = front;
  }, [front, index, position, walletSide, lift, reducedMotion]);
  const motion = useAnimatedStyle(() => ({ minHeight: animatedHeight.value, transform: [
    { translateY: (6 - position.value) * (compactGap + (Math.max(0, (spreadHeight - animatedHeight.value) / 6) - compactGap) * spread.value) - lift.value * 16 },
    { translateX: (wallet ? position.value * 4 + (walletSide.value - position.value * 4) * spread.value : 1) - lift.value * 8 },
    { rotate: `${wallet ? (index % 2 ? 2 : -2) * spread.value : 0}deg` },
    { scale: 1 + lift.value * 0.035 },
  ], zIndex: front ? 20 : 7 - Math.round(position.value) }), [compactGap, spreadHeight, wallet, index, front]);
  return <Animated.View style={[styles.bankCard, motion, {
    width: wallet ? cardWidth - 28 : cardWidth,
    backgroundColor: dayCardColor(day), borderColor: front ? '#285E3D' : '#C1D3C3', borderWidth: front ? 2 : 1,
  }]}>
    <Pressable onPress={() => onSelect(day)} accessibilityRole="button"
      onLayout={front && active ? event => onContentHeight(event.nativeEvent.layout.height) : undefined}
      accessibilityState={{ selected: day === selected }}
      accessibilityLabel={`${day === today ? 'Today, ' : ''}${front && day !== today ? 'Selected, ' : ''}${dayLabel(day, { weekday: 'long', month: 'long', day: 'numeric' })}, ${count} schedules`}
      accessibilityHint={front && count > 1 ? 'Schedule previews change every eight seconds. Full schedules are listed below.' : undefined}
      style={styles.cardPress}>
      <Text style={styles.fullDate} numberOfLines={1} adjustsFontSizeToFit>
        {dayLabel(day, { weekday: 'long', month: 'long', day: 'numeric' })}
      </Text>
      <Text style={styles.cardTitle}>{day === today ? 'Today’s plans' : `${dayLabel(day, { weekday: 'long' })}’s plans`}</Text>
      <View style={styles.previewRow}>{front && active ? <ScheduleCardPreview items={dayItems} now={now}
        contentWidth={cardWidth - (wallet ? 28 : 0) - 40} onTitleHeight={onTitleHeight} />
        : <Text style={styles.detail}>{count} {count === 1 ? 'schedule' : 'schedules'}</Text>}</View>
    </Pressable>
  </Animated.View>;
}
const styles = StyleSheet.create({
  bankCard: { position: 'absolute', top: 0, left: 0, borderRadius: 20, borderWidth: 1, borderColor: '#C1D3C3', shadowColor: '#183721', shadowOpacity: 0.12, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  cardPress: { padding: 18 }, fullDate: { fontFamily: Fonts.sansSemiBold, color: '#285E3D', fontSize: 16 },
  cardTitle: { fontFamily: Fonts.sansSemiBold, color: '#20432D', fontSize: 21, marginTop: 12 },
  previewRow: { marginTop: 6, paddingBottom: 2 },
  detail: { fontFamily: Fonts.sansRegular, color: '#536758', fontSize: 14, marginTop: 18 }, white: { color: '#FFFFFF' }, light: { color: '#DCE8DE' },
  month: { backgroundColor: '#F6FAF7', borderRadius: 22, padding: 12, borderWidth: 1, borderColor: '#DCE8DE' },
  monthConnected: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomColor: 'transparent' },
  monthTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 20, color: '#20432D', marginBottom: 12, marginLeft: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: '14.2857%', textAlign: 'center', color: '#536758', fontSize: 12, paddingBottom: 6 },
  cell: { width: '14.2857%', height: 38, alignItems: 'center' }, date: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dateText: { fontFamily: Fonts.sansMedium, fontSize: 15, color: '#20432D' }, today: { backgroundColor: '#285E3D' },
  dot: { position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: 2, backgroundColor: '#32834E' },
  connected: { minHeight: 148, marginTop: -1, padding: 18, borderWidth: 1, borderColor: '#285E3D', borderBottomLeftRadius: 22, borderBottomRightRadius: 22, backgroundColor: '#285E3D' },
  connectedHint: { fontFamily: Fonts.sansRegular, color: '#DCE8DE', fontSize: 14, marginTop: 12 },
});
