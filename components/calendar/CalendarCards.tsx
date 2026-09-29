import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { dayCardColor, dayLabel, frontFirst, monthCells, orderSchedulesForDay } from '@/src/calendar/calendar-time';
import type { ScheduleOccurrence } from '@/src/calendar/schedule-store';
import { Fonts } from '@/constants/Typography';
import { WeatherArt } from '@/components/others/WeatherArt';
import { WeatherWash } from '@/components/others/WeatherWash';
import { CONDITIONS, phNow, type WeatherDay } from '@/src/others/content-model';
import { ScheduleCardPreview } from './ScheduleCardPreview';

export type CalendarLayout = 'vertical' | 'wallet' | 'month';
export type CalendarMode = 'compact' | 'spread' | 'list';
type Props = { today: string; selected: string; layout: CalendarLayout; mode: CalendarMode;
  spread: SharedValue<number>; hidden: SharedValue<number>; cardWidth: number; cardHeight: number;
  compactGap: number; spreadHeight: number; schedules: ScheduleOccurrence[]; now: number; active: boolean;
  weather: WeatherDay[];
  settling: boolean;
  onTitleHeight?: (height: number) => void; onContentHeight?: (height: number) => void; onSelect: (day: string) => void };
export const CalendarCards = memo(function CalendarCards(props: Props) {
  const { today, selected, layout, schedules, spreadHeight, weather } = props;
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const item of schedules) result.set(item.day, (result.get(item.day) ?? 0) + 1);
    return result;
  }, [schedules]);
  const weatherByDate = useMemo(() => new Map(weather.map(day => [day.forecastDate, day])), [weather]);
  const deckDays = useMemo(() => frontFirst(today), [today]);
  const orderedDays = useMemo(() => deckDays.includes(selected)
    ? [selected, ...deckDays.filter(day => day !== selected)] : deckDays, [deckDays, selected]);
  const count = (day: string) => counts.get(day) ?? 0;
  if (layout === 'month') return <MonthCards {...props} count={count} forecast={weatherByDate.get(selected)} />;
  return <View style={{ height: spreadHeight }}>
    {deckDays.map(day => <DayCard key={day} {...props} day={day} index={orderedDays.indexOf(day)} count={count(day)} forecast={weatherByDate.get(day)} />)}
  </View>;
});
function MonthCards({ today, selected, mode, spread, onSelect, count, forecast, now, active, settling, cardWidth }: Props & { count: (day: string) => number; forecast?: WeatherDay }) {
  const weather = forecast?.periods[selected === today ? phNow(now).period : 'afternoon'];
  const weatherExpected = frontFirst(today).includes(selected);
  const artSize = Math.min(140, Math.max(112, Math.round(cardWidth * 0.4)));
  const weatherMetaWidth = Math.min(108, Math.max(78, Math.round((cardWidth - 36) * 0.32)));
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
      style={[styles.connected, { minHeight: weatherExpected ? 172 : 148 }, connectedStyle]}>
      <WeatherWash condition={weather?.condition} radius={{ bottomLeft: 22, bottomRight: 22, topLeft: 0, topRight: 0 }} placement="right" />
      {weather && <View pointerEvents="none" style={styles.floatingArt}>
        <WeatherArt condition={weather.condition} size={artSize} animate={active && mode === 'spread' && !settling} />
      </View>}
      <Text style={styles.white}>{selected === today ? 'TODAY' : 'SELECTED DAY'} · {dayLabel(selected, { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
      <Text style={[styles.cardTitle, styles.white, weather && { width: Math.max(130, cardWidth - 36 - weatherMetaWidth - 8) }]}>
        {count(selected)} {count(selected) === 1 ? 'schedule' : 'schedules'} for this day
      </Text>
      <Text style={[styles.connectedHint, weather && { width: Math.max(130, cardWidth - 36 - weatherMetaWidth - 8) }]}>Your plans at a glance</Text>
      {weather && <View pointerEvents="none" style={[styles.floatingWeather, { width: weatherMetaWidth }]}>
        <Text style={[styles.weatherCondition, styles.white, styles.weatherRight]}>{CONDITIONS[weather.condition]}</Text>
        <Text style={[styles.weatherTemperature, styles.white, styles.weatherRight]}>{weather.temperatureC}°C</Text>
      </View>}
      {weatherExpected && !weather && <View pointerEvents="none" style={[styles.floatingWeather, { width: weatherMetaWidth }]}>
        <Text style={[styles.weatherCondition, styles.white, styles.weatherRight]}>Weather unavailable</Text>
      </View>}
    </Animated.View>
  </View>;
}
const DayCard = memo(function DayCard({ day, index, count, today, selected, layout, spread, hidden, cardWidth,
  cardHeight, compactGap, spreadHeight, schedules, now, active, mode, settling, forecast, onTitleHeight, onContentHeight, onSelect }: Props & { day: string; index: number; count: number; forecast?: WeatherDay }) {
  const wallet = layout === 'wallet';
  const front = day === selected;
  const weather = forecast?.periods[day === today ? phNow(now).period : 'afternoon'];
  const artSize = Math.min(148, Math.max(116, Math.round((cardWidth - (wallet ? 28 : 0)) * 0.43)));
  const cardInnerWidth = cardWidth - (wallet ? 28 : 0) - 36;
  const weatherMetaWidth = Math.min(108, Math.max(78, Math.round(cardInnerWidth * 0.32)));
  const previewWidth = cardInnerWidth - weatherMetaWidth - 10;
  const dayItems = useMemo(() => front && active ? orderSchedulesForDay(schedules, day, now) : [], [front, active, schedules, day, now]);
  const reducedMotion = useReducedMotion();
  const wasSelected = useRef(front);
  const position = useSharedValue(index);
  const walletSide = useSharedValue(index % 2 ? 34 : 0);
  const tilt = useSharedValue(index % 2 ? 2 : -2);
  const lift = useSharedValue(0);
  useLayoutEffect(() => {
    if (position.value !== index) {
      position.value = withTiming(index, { duration: reducedMotion ? 0 : 340 });
    }
    const targetWalletSide = index % 2 ? 34 : 0;
    const targetTilt = index % 2 ? 2 : -2;
    if (mode === 'spread' && !reducedMotion) {
      if (walletSide.value !== targetWalletSide) walletSide.value = withTiming(targetWalletSide, { duration: 340 });
      if (tilt.value !== targetTilt) tilt.value = withTiming(targetTilt, { duration: 340 });
    } else {
      walletSide.value = targetWalletSide;
      tilt.value = targetTilt;
    }
    if (front && !wasSelected.current && !reducedMotion) {
      lift.value = withSequence(withTiming(1, { duration: 100 }), withTiming(0, { duration: 280 }));
    }
    wasSelected.current = front;
  }, [front, index, position, walletSide, tilt, lift, reducedMotion, mode]);
  const motion = useAnimatedStyle(() => {
    const hideOffset = -hidden.value * 50;
    const cardOpacity = front ? 1 : Math.max(0, 1 - hidden.value * 3.5);
    return {
      opacity: cardOpacity,
      transform: [
        { translateY: (6 - position.value) * (compactGap + (Math.max(0, (spreadHeight - cardHeight) / 6) - compactGap) * spread.value) - lift.value * 16 + hideOffset },
        { translateX: (wallet ? position.value * 4 + (walletSide.value - position.value * 4) * spread.value : 1) - lift.value * 8 },
        { rotate: `${wallet ? tilt.value * spread.value : 0}deg` },
        { scale: (1 + lift.value * 0.035) * (1 - hidden.value * 0.05) },
      ],
    };
  }, [compactGap, spreadHeight, cardHeight, wallet, front]);
  return <Animated.View renderToHardwareTextureAndroid={true} style={[styles.bankCard, motion, {
    minHeight: cardHeight, height: cardHeight, zIndex: front ? 20 : 7 - index,
    elevation: front ? 3 : 1,
    width: wallet ? cardWidth - 28 : cardWidth,
    backgroundColor: dayCardColor(day), borderColor: front ? '#285E3D' : '#C1D3C3', borderWidth: front ? 2 : 1,
  }]}>
    <WeatherWash condition={weather?.condition} radius={20} placement="right" />
    {weather && <View pointerEvents="none" style={styles.floatingArt}>
      <WeatherArt condition={weather.condition} size={artSize} animate={front && active && !settling && mode !== 'list'} />
    </View>}
    <Pressable onPress={() => onSelect(day)} accessibilityRole="button"
      onLayout={front && active && onContentHeight ? event => onContentHeight(event.nativeEvent.layout.height) : undefined}
      accessibilityState={{ selected: day === selected }}
      accessibilityLabel={`${day === today ? 'Today, ' : ''}${front && day !== today ? 'Selected, ' : ''}${dayLabel(day, { weekday: 'long', month: 'long', day: 'numeric' })}, ${count} schedules`}
      accessibilityHint={front && count > 1 ? 'Schedule previews change every eight seconds. Full schedules are listed below.' : undefined}
      style={[styles.cardPress, styles.weatherCardPress]}>
      <Text style={styles.fullDate} numberOfLines={1} adjustsFontSizeToFit>
        {dayLabel(day, { weekday: 'long', month: 'long', day: 'numeric' })}
      </Text>
      <Text style={styles.cardTitle}>{day === today ? 'Today’s plans' : `${dayLabel(day, { weekday: 'long' })}’s plans`}</Text>
      <View style={[styles.previewRow, { width: previewWidth }]}>
        {front && active ? <ScheduleCardPreview items={dayItems} now={now}
          playing={!settling} contentWidth={previewWidth} onTitleHeight={onTitleHeight} />
          : <Text style={styles.detail}>{count} {count === 1 ? 'schedule' : 'schedules'}</Text>}
      </View>
      {weather && <View pointerEvents="none" style={[styles.floatingWeather, { width: weatherMetaWidth }]}>
        <Text style={[styles.weatherCondition, styles.weatherRight]}>{CONDITIONS[weather.condition]}</Text>
        <Text style={[styles.weatherTemperature, styles.weatherRight]}>{weather.temperatureC}°C</Text>
      </View>}
      {!weather && <View pointerEvents="none" style={[styles.floatingWeather, { width: weatherMetaWidth }]}>
        <Text style={[styles.weatherCondition, styles.weatherRight]}>Weather unavailable</Text>
      </View>}
    </Pressable>
  </Animated.View>;
}, (prev, next) => {
  const prevFront = prev.day === prev.selected;
  const nextFront = next.day === next.selected;
  if (prevFront !== nextFront) return false;
  if (prev.index !== next.index) return false;
  if (prev.mode !== next.mode) return false;
  if (prev.layout !== next.layout) return false;
  if (prev.cardWidth !== next.cardWidth || prev.cardHeight !== next.cardHeight) return false;
  if (prev.active !== next.active) return false;
  if (prev.count !== next.count) return false;
  if (nextFront) {
    if (prev.settling !== next.settling) return false;
    if (prev.schedules !== next.schedules) return false;
  }
  return true;
});
const styles = StyleSheet.create({
  bankCard: { position: 'absolute', top: 0, left: 0, borderRadius: 20, borderWidth: 1, borderColor: '#C1D3C3', shadowColor: '#183721', shadowOpacity: 0.12, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  cardPress: { padding: 18 }, weatherCardPress: { minHeight: 190 },
  floatingArt: { position: 'absolute', top: -4, right: 6 },
  floatingWeather: { position: 'absolute', right: 18, bottom: 14, alignItems: 'flex-end' },
  weatherCondition: { fontFamily: Fonts.sansSemiBold, fontSize: 13, lineHeight: 17, color: '#285E3D' },
  weatherTemperature: { fontFamily: Fonts.sansMedium, fontSize: 22, color: '#20432D', marginTop: 3 },
  weatherRight: { textAlign: 'right' },
  fullDate: { fontFamily: Fonts.sansSemiBold, color: '#285E3D', fontSize: 16 },
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
