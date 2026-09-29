import { useRouter, type Href } from 'expo-router';
import { BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { AppState, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainWeatherCard } from '@/components/others/WeatherCards';
import { ParchmentCardTexture } from '@/components/others/ParchmentCardTexture';
import { Fonts } from '@/constants/Typography';
import { useChatSurface } from '@/src/chat/ChatSurfaceContext';
import { useContent } from '@/src/others/ContentProvider';
import { percentText, phNow, peso, topMovers, type PeriodId, type PriceRecord } from '@/src/others/content-model';
import { PREVIEW_CROPS } from '@/src/others/almanac-data';

export default function OthersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { headerHeight, glassTargetRef } = useChatSurface();
  const { content, online, ready, error, checkForUpdates } = useContent();
  const [clock, setClock] = useState(() => Date.now());
  const [manualPeriod, setManualPeriod] = useState<PeriodId | null>(null);
  const lastDate = useRef(phNow().date);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    const timer = setInterval(tick, 30000);
    const app = AppState.addEventListener('change', state => { if (state === 'active') tick(); });
    void checkForUpdates();
    return () => { clearInterval(timer); app.remove(); };
  }, [checkForUpdates]);
  const current = phNow(clock);
  useEffect(() => {
    if (lastDate.current !== current.date) { lastDate.current = current.date; setManualPeriod(null); }
  }, [current.date]);
  const today = content.weather.find(day => day.forecastDate === current.date);
  const hikes = topMovers(content.prices, 'up', 3);
  const drops = topMovers(content.prices, 'down', 3);
  return <View style={styles.screen}>
    <BlurTargetView ref={glassTargetRef} style={styles.scrollSurface}>
    <ScrollView contentContainerStyle={[styles.body, { paddingTop: headerHeight + 14, paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
    <Pressable accessibilityRole="button" onPress={() => router.push('/weather' as Href)} style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>Weather</Text><Text style={styles.chevron}>›</Text>
    </Pressable>
    <MainWeatherCard date={current.date} day={today} period={manualPeriod ?? current.period} now loading={!ready}
      onPeriod={setManualPeriod} onNow={() => setManualPeriod(null)} />
    <Pressable accessibilityRole="button" onPress={() => router.push('/market-prices' as Href)} style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>Market Prices</Text><Text style={styles.chevron}>›</Text>
    </Pressable>
    <View style={styles.marketCard}>
      <Text style={styles.marketHeading}>TOP 3 PRICE HIKES</Text>
      {hikes.length ? hikes.map(item => <MoverRow key={item.price.id} item={item.price} percent={item.change.percent} />)
        : <Text style={styles.emptyLine}>No price increases available.</Text>}
      <Text style={[styles.marketHeading, styles.secondHeading]}>TOP 3 PRICE DECREASES</Text>
      {drops.length ? drops.map(item => <MoverRow key={item.price.id} item={item.price} percent={item.change.percent} />)
        : <Text style={styles.emptyLine}>No price decreases available.</Text>}
    </View>
    <Pressable accessibilityRole="button" onPress={() => router.push('/almanac' as Href)} style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>Almanac</Text><Text style={styles.chevron}>›</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Almanac. Previewing 4 mixed crops"
      onPress={() => router.push('/almanac' as Href)}
      style={({ pressed }) => [styles.previewGrid2x2, pressed && styles.cardPressed]}>
        {PREVIEW_CROPS.map(crop => (
          <View key={crop.id} style={styles.previewCell}>
            <ParchmentCardTexture />
            <View style={styles.previewImageWrap}>
              <Image source={crop.image} style={styles.previewImage} resizeMode="contain" />
            </View>
            <Text style={styles.previewName} numberOfLines={1}>{crop.localName}</Text>
          </View>
        ))}
    </Pressable>
    </ScrollView>
    </BlurTargetView>
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['rgba(247, 250, 244, 0.8)', 'rgba(247, 250, 244, 0)']}
        style={[styles.topFade, { height: headerHeight + 28 }]} />
      <LinearGradient colors={['rgba(247, 250, 244, 0)', 'rgba(247, 250, 244, 0.8)']}
        style={[styles.bottomFade, { height: insets.bottom + 42 }]} />
    </View>
  </View>;
}

function MoverRow({ item, percent }: { item: PriceRecord; percent: number }) {
  return <View style={styles.mover}><Text style={styles.moverName} numberOfLines={1}>{item.commodityName}</Text>
    <Text style={styles.moverPrice}>{peso(item.amount)}</Text>
    <Text style={[styles.moverChange, { color: percent > 0 ? '#178449' : '#C6403D' }]}>{percent > 0 ? '▲' : '▼'} {percentText(percent)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7FAF4' },
  scrollSurface: { flex: 1 },
  body: { paddingHorizontal: 18 },
  topFade: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 10, minHeight: 32 },
  sectionTitle: { fontFamily: Fonts.sansSemiBold, color: '#173F2B', fontSize: 21 },
  chevron: { fontFamily: Fonts.sansRegular, color: '#28814A', fontSize: 33, lineHeight: 32 },
  marketCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DEE9DC', borderRadius: 21, paddingHorizontal: 15, paddingTop: 16, paddingBottom: 8 },
  marketHeading: { fontFamily: Fonts.monoMedium, color: '#6D826F', fontSize: 10, letterSpacing: 1 },
  secondHeading: { marginTop: 18 },
  mover: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 6 },
  moverName: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 14, color: '#214A31' },
  moverPrice: { fontFamily: Fonts.monoMedium, fontSize: 11, color: '#315640' },
  moverChange: { minWidth: 61, textAlign: 'right', fontFamily: Fonts.monoMedium, fontSize: 10 },
  emptyLine: { fontFamily: Fonts.sansRegular, fontSize: 13, color: '#748575', paddingVertical: 14 },
  cardPressed: { opacity: 0.88 },
  previewGrid2x2: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  previewCell: { width: '48%', alignItems: 'center', backgroundColor: '#F1D8AC', borderWidth: 1, borderColor: '#CEAD7C', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 8, overflow: 'hidden' },
  previewImageWrap: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  previewImage: { width: '100%', height: '100%' },
  previewName: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: '#25432B', textAlign: 'center' },
  status: { fontFamily: Fonts.sansRegular, color: '#718373', fontSize: 11, textAlign: 'center', marginTop: 18 },
});
