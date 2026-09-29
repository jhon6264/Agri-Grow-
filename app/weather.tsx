import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BlurTargetView } from 'expo-blur';
import { Animated, AppState, Easing, RefreshControl, ScrollView, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailEdgeFades, DetailHeader } from '@/components/others/DetailHeader';
import { MainWeatherCard, SmallWeatherCard } from '@/components/others/WeatherCards';
import { Fonts } from '@/constants/Typography';
import { useContent } from '@/src/others/ContentProvider';
import { phNow, weatherWindow, type PeriodId } from '@/src/others/content-model';

type FlipTarget = { index: number; incoming: string; outgoing: string; period: PeriodId; today: boolean };

// Scroll events update React only when a card enters or leaves the viewport.
function useWeatherVisibility() {
  const bounds = useRef<(LayoutRectangle | undefined)[]>([]);
  const viewport = useRef({ y: 0, height: 0, gridY: 0 });
  const [visible, setVisible] = useState([true, false, false, false, false, false, false]);
  const update = useCallback(() => {
    const { y, height, gridY } = viewport.current;
    if (!height) return;
    const next = Array.from({ length: 7 }, (_, index) => {
      const rect = bounds.current[index];
      if (!rect) return false;
      const top = rect.y + (index ? gridY : 0);
      return top < y + height && top + rect.height > y;
    });
    setVisible(previous => previous.every((value, index) => value === next[index]) ? previous : next);
  }, []);
  const measure = useCallback((index: number, rect: LayoutRectangle) => {
    bounds.current[index] = rect; update();
  }, [update]);
  return { visible, viewport, update, measure };
}

export default function WeatherScreen() {
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const blurTarget = useRef<View | null>(null);
  const { content, checking, online, error, checkForUpdates } = useContent();
  const [clock, setClock] = useState(() => Date.now());
  const [selectedDate, setSelectedDate] = useState(() => phNow().date);
  const [slots, setSlots] = useState(() => weatherWindow().slice(1));
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodId>(() => phNow().period);
  const [followCurrent, setFollowCurrent] = useState(true);
  const [target, setTarget] = useState<FlipTarget | null>(null);
  const mainHeight = useRef(340);
  const flipLocked = useRef(false);
  const flip = useRef(new Animated.Value(0)).current;
  const scroll = useRef<ScrollView>(null);
  const lastDate = useRef(phNow().date);
  const visibility = useWeatherVisibility();

  useEffect(() => {
    const tick = () => setClock(Date.now());
    const timer = setInterval(tick, 30000);
    const app = AppState.addEventListener('change', state => { if (state === 'active') tick(); });
    void checkForUpdates();
    return () => { clearInterval(timer); app.remove(); };
  }, [checkForUpdates]);

  const current = phNow(clock);
  useEffect(() => {
    if (lastDate.current !== current.date) {
      flip.stopAnimation(); setTarget(null); flipLocked.current = false;
      lastDate.current = current.date;
      setSelectedDate(current.date); setSlots(weatherWindow(clock).slice(1));
      setSelectedPeriod(current.period); setFollowCurrent(true);
    } else if (followCurrent && selectedDate === current.date) setSelectedPeriod(current.period);
  }, [clock, current.date, current.period, followCurrent, selectedDate, flip]);

  useLayoutEffect(() => {
    if (!target) { flip.setValue(0); flipLocked.current = false; }
  }, [target, flip]);

  useEffect(() => {
    if (!target) return;
    const animation = Animated.timing(flip, {
      toValue: 1, duration: reduceMotion ? 0 : 440, easing: Easing.inOut(Easing.cubic), useNativeDriver: true, isInteraction: false,
    });
    const frame = requestAnimationFrame(() => {
      scroll.current?.scrollTo({ y: 0, animated: true });
      animation.start(({ finished }) => {
        if (!finished) return;
        setSlots(previous => previous.map((date, index) => index === target.index ? target.outgoing : date));
        setSelectedDate(target.incoming); setSelectedPeriod(target.period); setFollowCurrent(target.today);
        setTarget(null);
      });
    });
    return () => { cancelAnimationFrame(frame); animation.stop(); };
  }, [target, flip, reduceMotion]);

  const switchDay = useCallback((index: number) => {
    if (flipLocked.current) return;
    const incoming = slots[index];
    if (!incoming) return;
    if (reduceMotion) {
      flip.stopAnimation(); flip.setValue(0);
      setSlots(previous => previous.map((day, slot) => slot === index ? selectedDate : day));
      setSelectedDate(incoming);
      setSelectedPeriod(incoming === current.date ? current.period : 'afternoon');
      setFollowCurrent(incoming === current.date);
      scroll.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    flipLocked.current = true;
    setTarget({ index, incoming, outgoing: selectedDate,
      period: incoming === current.date ? current.period : 'afternoon', today: incoming === current.date });
  }, [current.date, current.period, flip, reduceMotion, selectedDate, slots]);

  const rotation = useMemo(() => flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }), [flip]);
  const incomingRotation = useMemo(() => flip.interpolate({ inputRange: [0, 1], outputRange: ['-180deg', '0deg'] }), [flip]);
  const mainOutgoingOpacity = useMemo(() => flip.interpolate({ inputRange: [0, 0.48, 0.52, 1], outputRange: [1, 1, 0, 0] }), [flip]);
  const mainIncomingOpacity = useMemo(() => flip.interpolate({ inputRange: [0, 0.48, 0.52, 1], outputRange: [0, 0, 1, 1] }), [flip]);
  const smallCardScale = useMemo(() => flip.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 0.94, 1] }), [flip]);
  const smallOutgoingOpacity = useMemo(() => flip.interpolate({ inputRange: [0, 0.4, 0.55, 1], outputRange: [1, 0, 0, 0] }), [flip]);
  const smallIncomingOpacity = useMemo(() => flip.interpolate({ inputRange: [0, 0.45, 0.6, 1], outputRange: [0, 0, 1, 1] }), [flip]);

  const day = content.weather.find(item => item.forecastDate === selectedDate);
  return <View style={styles.screen}>
    <BlurTargetView ref={blurTarget} style={styles.scrollSurface}>
    <ScrollView ref={scroll} contentContainerStyle={[styles.body, { paddingTop: insets.top + 84, paddingBottom: insets.bottom + 56 }]} showsVerticalScrollIndicator={false}
      scrollEventThrottle={64}
      onLayout={event => { visibility.viewport.current.height = event.nativeEvent.layout.height; visibility.update(); }}
      onScroll={event => { visibility.viewport.current.y = event.nativeEvent.contentOffset.y; visibility.update(); }}
      refreshControl={<RefreshControl refreshing={checking} onRefresh={() => void checkForUpdates(true)} tintColor="#236D40" />}>
      <View onLayout={event => visibility.measure(0, event.nativeEvent.layout)} pointerEvents={target ? 'none' : 'auto'}
        style={target ? { minHeight: mainHeight.current } : undefined}>
      <Animated.View onLayout={event => { mainHeight.current = event.nativeEvent.layout.height; }}
        style={[styles.face, { opacity: target ? mainOutgoingOpacity : 1, transform: [{ perspective: 1000 }, { rotateY: rotation }] }]}>
        <MainWeatherCard date={selectedDate} day={day} period={selectedPeriod} now={selectedDate === current.date}
          animate={visibility.visible[0]}
          onPeriod={period => { setSelectedPeriod(period); setFollowCurrent(false); }}
          onNow={selectedDate === current.date ? () => { setSelectedPeriod(current.period); setFollowCurrent(true); } : undefined} />
      </Animated.View>
      {target && <Animated.View pointerEvents="none"
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.face, styles.backFace, { opacity: mainIncomingOpacity, transform: [{ perspective: 1000 }, { rotateY: incomingRotation }] }]}>
        <MainWeatherCard date={target.incoming} day={content.weather.find(item => item.forecastDate === target.incoming)}
          period={target.period} now={target.today} animate={false} onPeriod={() => undefined}
          onNow={target.today ? () => undefined : undefined} />
      </Animated.View>}
      </View>
      <View style={styles.below}><Text style={styles.heading}>{selectedDate === current.date ? 'Next six days' : 'Other days'}</Text>
        <Text style={styles.hint}>Tap a day to see its full forecast.</Text></View>
      <View style={styles.grid} onLayout={event => { visibility.viewport.current.gridY = event.nativeEvent.layout.y; visibility.update(); }}>
        {slots.map((date, index) => {
          const isTarget = target?.index === index;
          return (
            <View key={index} style={styles.cell} onLayout={event => visibility.measure(index + 1, event.nativeEvent.layout)}>
              <Animated.View style={[
                isTarget && {
                  opacity: smallOutgoingOpacity,
                  transform: [{ scale: smallCardScale }],
                },
              ]}>
                <SmallWeatherCard
                  date={date}
                  day={content.weather.find(item => item.forecastDate === date)}
                  isToday={date === current.date}
                  animate={!isTarget && visibility.visible[index + 1]}
                  onPress={() => switchDay(index)}
                />
              </Animated.View>
              {isTarget && (
                <Animated.View pointerEvents="none" style={[
                  StyleSheet.absoluteFill,
                  {
                    opacity: smallIncomingOpacity,
                    transform: [{ scale: smallCardScale }],
                  },
                ]}>
                  <SmallWeatherCard
                    date={target.outgoing}
                    day={day}
                    isToday={target.outgoing === current.date}
                    animate={false}
                    onPress={() => undefined}
                  />
                </Animated.View>
              )}
            </View>
          );
        })}
      </View>
      <Text style={styles.status}>{online === false ? 'Offline · Showing saved weather' : 'Davao del Sur · Saved forecast'}{error ? `\n${error}` : ''}</Text>
    </ScrollView>
    </BlurTargetView>
    <DetailEdgeFades />
    <DetailHeader title="Weather" blurTarget={blurTarget} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7FAF4' },
  scrollSurface: { flex: 1 },
  body: { paddingHorizontal: 16 },
  below: { marginTop: 25, marginBottom: 13 },
  heading: { fontFamily: Fonts.sansSemiBold, fontSize: 21, color: '#17452E' },
  hint: { fontFamily: Fonts.sansRegular, fontSize: 13, color: '#657868', marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, paddingTop: 3, paddingBottom: 7 },
  cell: { width: '48.5%' },
  face: { backfaceVisibility: 'hidden' },
  backFace: { position: 'absolute', top: 0, left: 0, right: 0 },
  status: { fontFamily: Fonts.sansRegular, color: '#718373', fontSize: 11, textAlign: 'center', marginTop: 22 },
});
