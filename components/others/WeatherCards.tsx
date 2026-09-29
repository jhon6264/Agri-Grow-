import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Fonts } from '@/constants/Typography';
import { dayLabel, timeLabel } from '@/src/calendar/calendar-time';
import { CONDITIONS, PERIODS, type PeriodId, type WeatherDay } from '@/src/others/content-model';
import { WeatherArt } from './WeatherArt';
import { WeatherWash } from './WeatherWash';

export function MainWeatherCard({ day, date, period, onPeriod, onNow, now, loading = false, animate = true }: {
  day?: WeatherDay; date: string; period: PeriodId; onPeriod: (period: PeriodId) => void;
  onNow?: () => void; now: boolean; loading?: boolean; animate?: boolean;
}) {
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const artSize = Math.min(145, Math.max(110, Math.round(width * 0.4)));
  const weather = day?.periods[period];
  return <View style={styles.main}>
    <WeatherWash condition={weather?.condition} radius={25} />
    <View style={styles.heading}><Text style={styles.date}>{now ? 'Today, ' : ''}{dayLabel(date, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
      {onNow && <Pressable accessibilityRole="button" onPress={onNow} style={styles.now}><Text style={styles.nowText}>Now</Text></Pressable>}
    </View>
    <Text style={styles.location}>DAVAO DEL SUR · PHILIPPINE TIME</Text>
    {weather ? <>
      <View style={styles.hero}>
        <WeatherArt condition={weather.condition} size={artSize} animate={focused && animate} />
        <View style={styles.reading}><Text style={styles.period}>{PERIODS.find(item => item.id === period)?.label}</Text>
          <Text style={styles.condition}>{CONDITIONS[weather.condition]}</Text>
          <Text style={styles.temp}>{weather.temperatureC}°C</Text>
          <Text style={styles.range}>Low {day.minTemperatureC}° · High {day.maxTemperatureC}°</Text>
        </View>
      </View>
      <View style={styles.metrics}>
        <Metric label="Rain chance" value={`${weather.rainChancePct}%`} />
        <Metric label="Humidity" value={`${weather.humidityPct}%`} />
        <Metric label="Wind" value={`${weather.windKph} km/h`} />
      </View>
      <Text style={styles.saved}>{weather.overridden ? 'Admin override · ' : ''}{day.updatedAt ? `Saved ${timeLabel(day.updatedAt)}` : 'Saved forecast'}</Text>
    </> : <Text style={styles.unavailable}>{loading ? 'Loading saved weather…' : 'Weather unavailable for this date. Connect to load the saved forecast.'}</Text>}
    <View style={styles.periods}>{PERIODS.map(item => <Pressable key={item.id} accessibilityRole="button"
      accessibilityState={{ selected: item.id === period }} onPress={() => onPeriod(item.id)}
      style={[styles.periodButton, item.id === period && styles.periodSelected]}>
      <Text style={[styles.periodText, item.id === period && styles.periodTextSelected]} numberOfLines={1}>{item.label}</Text>
    </Pressable>)}</View>
  </View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

export function SmallWeatherCard({ date, day, isToday, onPress, animate = true }: { date: string; day?: WeatherDay; isToday: boolean; onPress: () => void; animate?: boolean }) {
  const focused = useIsFocused();
  const afternoon = day?.periods.afternoon;
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${dayLabel(date, { weekday: 'long', month: 'long', day: 'numeric' })} weather`}
    onPress={onPress} style={styles.small}>
    <WeatherWash condition={afternoon?.condition} radius={19} />
    <View style={styles.smallTop}><View style={styles.smallDateBlock}>
      <Text style={styles.smallDate}>{dayLabel(date, { month: 'short', day: 'numeric' })}</Text>
      <Text style={styles.smallWeekday}>{dayLabel(date, { weekday: 'short' })}</Text>
      {isToday && <Text style={styles.smallToday}>Today</Text>}
    </View>
      {afternoon && <WeatherArt condition={afternoon.condition} size={72} animate={focused && animate} />}</View>
    <Text style={styles.smallCondition} numberOfLines={2}>{afternoon ? CONDITIONS[afternoon.condition] : 'Unavailable'}</Text>
    <Text style={styles.smallRange}>{day ? `${day.minTemperatureC}° / ${day.maxTemperatureC}°C` : 'Connect to load'}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  main: { backgroundColor: '#FFFCF2', borderColor: '#D6E4D0', borderWidth: 1, borderRadius: 25, padding: 18, overflow: 'hidden' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  date: { flex: 1, fontFamily: Fonts.sansSemiBold, color: '#174C30', fontSize: 18, lineHeight: 24 },
  now: { borderRadius: 10, backgroundColor: '#E1F0DF', paddingHorizontal: 11, paddingVertical: 7 },
  nowText: { fontFamily: Fonts.sansMedium, color: '#1A693A', fontSize: 13 },
  location: { fontFamily: Fonts.monoMedium, color: '#6C806D', fontSize: 10, letterSpacing: 1, marginTop: 4 },
  hero: { flexDirection: 'row', alignItems: 'center', marginTop: 13, minHeight: 155 },
  reading: { flex: 1, minWidth: 0, paddingLeft: 3 },
  period: { fontFamily: Fonts.sansMedium, fontSize: 13, color: '#628366' },
  condition: { fontFamily: Fonts.sansSemiBold, color: '#174C30', fontSize: 20, lineHeight: 25, marginTop: 2 },
  temp: { fontFamily: Fonts.sansMedium, color: '#103E29', fontSize: 42, lineHeight: 50 },
  range: { fontFamily: Fonts.sansRegular, color: '#5C745E', fontSize: 13 },
  metrics: { flexDirection: 'row', borderTopColor: '#DDE9D8', borderTopWidth: 1, paddingTop: 13, marginTop: 5 },
  metric: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  metricLabel: { fontFamily: Fonts.sansRegular, color: '#6B7C6D', fontSize: 11, textAlign: 'center' },
  metricValue: { fontFamily: Fonts.sansMedium, color: '#24583A', fontSize: 14, marginTop: 3, textAlign: 'center' },
  saved: { fontFamily: Fonts.sansRegular, color: '#758476', fontSize: 11, marginTop: 16 },
  unavailable: { fontFamily: Fonts.sansRegular, color: '#647566', fontSize: 14, lineHeight: 21, paddingVertical: 42 },
  periods: { flexDirection: 'row', borderTopColor: '#DDE9D8', borderTopWidth: 1, marginTop: 16, paddingTop: 10 },
  periodButton: { flex: 1, alignItems: 'center', minWidth: 0, paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  periodSelected: { borderBottomColor: '#238045' },
  periodText: { fontFamily: Fonts.sansRegular, color: '#6E806E', fontSize: 10 },
  periodTextSelected: { fontFamily: Fonts.sansMedium, color: '#176036' },
  small: { width: '100%', minHeight: 146, backgroundColor: '#FFFFFF', borderColor: '#E6ECE3', borderWidth: 1, borderRadius: 19, padding: 13, justifyContent: 'space-between', shadowColor: '#173F2B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.09, shadowRadius: 9, elevation: 3 },
  smallTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 },
  smallDateBlock: { flex: 1, minWidth: 0, paddingTop: 2 },
  smallDate: { fontFamily: Fonts.sansMedium, color: '#547460', fontSize: 12, lineHeight: 16 },
  smallWeekday: { fontFamily: Fonts.sansSemiBold, color: '#245338', fontSize: 22, lineHeight: 27, marginTop: 1 },
  smallToday: { alignSelf: 'flex-start', fontFamily: Fonts.sansMedium, color: '#1F7541', fontSize: 10, marginTop: 2 },
  smallCondition: { fontFamily: Fonts.sansMedium, color: '#1B4B32', fontSize: 14, lineHeight: 17 },
  smallRange: { fontFamily: Fonts.sansRegular, color: '#627967', fontSize: 12 },
});
