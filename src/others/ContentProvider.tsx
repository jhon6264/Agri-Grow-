import NetInfo from '@react-native-community/netinfo';
import { useCallback, useContext, useEffect, useRef, useState, createContext, type PropsWithChildren } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { dayLabel } from '@/src/calendar/calendar-time';
import { DownloadMascot } from '@/components/chat/DownloadMascot';
import { WeatherArt } from '@/components/others/WeatherArt';
import { Fonts } from '@/constants/Typography';
import { Palette } from '@/constants/Colors';
import { openContentDatabase, readContentCache, writeContentCache } from './content-cache';
import { fetchContent, fetchRevisions } from './firebase-content';
import {
  CONDITIONS, PERIODS, contentSignature, emptyContent, percentText, phNow, peso, topMovers,
  type ContentData, type ContentKind,
} from './content-model';
import type { SQLiteDatabase } from 'expo-sqlite';

type Pending = { content: ContentData; changed: ContentKind[] };
type ContentContextValue = {
  content: ContentData; ready: boolean; checking: boolean; online: boolean | null;
  error: string; pending: boolean; syncNow: () => Promise<void>; checkForUpdates: (manual?: boolean) => Promise<void>;
};
const Context = createContext<ContentContextValue | null>(null);
const kinds: ContentKind[] = ['prices', 'weather'];
const networkAvailable = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) =>
  state.isConnected === true && state.isInternetReachable !== false;
const signature = (content: ContentData) => `${contentSignature('prices', content)}|${contentSignature('weather', content)}`;

export function ContentProvider({ children }: PropsWithChildren) {
  const { height } = useWindowDimensions();
  const db = useRef<SQLiteDatabase | null>(null);
  const contentRef = useRef<ContentData>(emptyContent());
  const pendingRef = useRef<Pending | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const onlineRef = useRef<boolean | null>(null);
  const checkedDate = useRef(phNow().date);
  const dismissedSignature = useRef<string | null>(null);
  const lastCheckedTime = useRef(0);
  const [content, setContent] = useState(contentRef.current);
  const [pending, setPending] = useState<Pending | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const commit = useCallback(async (next: ContentData, updated: ContentKind[]) => {
    if (!db.current) throw new Error('Local storage is still opening.');
    await writeContentCache(db.current, next, updated);
    contentRef.current = next;
    setContent(next);
  }, []);

  const checkForUpdates = useCallback(async (manual = false) => {
    if (!db.current || onlineRef.current !== true) return;
    if (manual) dismissedSignature.current = null;
    if (pendingRef.current) { if (manual) setModalVisible(true); return; }
    if (inFlight.current) return inFlight.current;
    if (!manual && Date.now() - lastCheckedTime.current < 120000) return;
    lastCheckedTime.current = Date.now();
    const job = (async () => {
      setChecking(true);
      try {
        const previous = contentRef.current;
        const [revisions, prices, weather] = await Promise.all([
          fetchRevisions(), fetchContent('prices'), fetchContent('weather', Date.now()),
        ]);
        const loadedAt = Date.now();
        const next: ContentData = {
          prices, weather, revisions, loadedAt: { prices: loadedAt, weather: loadedAt },
        };
        const changed = kinds.filter(kind => previous.loadedAt[kind] === null ||
          contentSignature(kind, previous) !== contentSignature(kind, next));
        if (changed.length && (next.prices.length || next.weather.length) &&
          (manual || dismissedSignature.current !== signature(next))) {
          const update = { content: next, changed };
          pendingRef.current = update; setPending(update); setModalVisible(true);
        } else if (!changed.length) {
          await commit(next, kinds);
        }
        checkedDate.current = phNow().date;
        setError('');
      } catch (reason) {
        setError((reason as { code?: string })?.code === 'permission-denied'
          ? 'Firestore denied read access to weather or prices.'
          : 'Could not check for updates. Saved data remains available.');
      } finally { setChecking(false); inFlight.current = null; }
    })();
    inFlight.current = job;
    return job;
  }, [commit]);

  const syncNow = useCallback(async () => {
    const update = pendingRef.current;
    if (!update || saving) return;
    setSaving(true);
    try {
      await commit(update.content, kinds);
      dismissedSignature.current = null;
      pendingRef.current = null; setPending(null); setModalVisible(false); setError('');
    } catch { setError('Could not save the update on this device. Please retry.'); }
    finally { setSaving(false); }
  }, [commit, saving]);

  const dismiss = useCallback(() => {
    if (pendingRef.current) dismissedSignature.current = signature(pendingRef.current.content);
    pendingRef.current = null;
    setPending(null);
    setModalVisible(false);
  }, []);

  useEffect(() => {
    let live = true;
    void openContentDatabase().then(async database => {
      const cached = await readContentCache(database);
      if (!live) return;
      db.current = database; contentRef.current = cached; setContent(cached); setReady(true);
      void checkForUpdates();
    }).catch(() => { if (live) { setError('Could not open saved weather and prices.'); setReady(true); } });
    return () => { live = false; };
  }, [checkForUpdates]);

  useEffect(() => {
    let live = true;
    const updateNetwork = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      if (!live) return;
      const available = networkAvailable(state);
      const reconnected = onlineRef.current !== true && available;
      onlineRef.current = available; setOnline(available);
      if (reconnected) void checkForUpdates();
    };
    void NetInfo.fetch().then(updateNetwork).catch(() => undefined);
    const subscription = NetInfo.addEventListener(updateNetwork);
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') void checkForUpdates();
    });
    const timer = setInterval(() => {
      const today = phNow().date;
      if (today !== checkedDate.current) { checkedDate.current = today; void checkForUpdates(); }
    }, 60000);
    return () => { live = false; subscription(); app.remove(); clearInterval(timer); };
  }, [checkForUpdates]);

  const value: ContentContextValue = { content, ready, checking, online, error, pending: !!pending, syncNow, checkForUpdates };
  const current = phNow();
  const today = pending?.content.weather.find(day => day.forecastDate === current.date);
  const todaysWeather = today?.periods[current.period];
  const rising = pending ? topMovers(pending.content.prices, 'up', 1)[0] : undefined;
  const falling = pending ? topMovers(pending.content.prices, 'down', 1)[0] : undefined;
  return <Context.Provider value={value}>
    {children}
    <Modal visible={modalVisible && !!pending} transparent animationType="fade" statusBarTranslucent
      onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={[styles.panelGroup, { maxHeight: height - 36 }]}>
          <View pointerEvents="none" style={styles.mascot}><DownloadMascot active={modalVisible} size={132} /></View>
        <View style={[styles.panel, { maxHeight: height - 156 }]} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.title}>Updates!</Text>
          <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false}>
            <View style={styles.group}>
              <Text style={styles.groupTitle}>Today’s weather</Text>
              <Text style={styles.rowLabel}>{dayLabel(current.date, { weekday: 'long', month: 'short', day: 'numeric' })} · {PERIODS.find(period => period.id === current.period)?.label}</Text>
              {todaysWeather ? <View style={styles.weatherRow}>
                <WeatherArt condition={todaysWeather.condition} size={72} animate={false} />
                <View style={styles.weatherCopy}><Text style={styles.weatherCondition}>{CONDITIONS[todaysWeather.condition]}</Text>
                  <Text style={styles.weatherTemp}>{todaysWeather.temperatureC}°C</Text>
                  <Text style={styles.rowLabel}>Low {today!.minTemperatureC}° · High {today!.maxTemperatureC}°</Text></View>
              </View> : <Text style={styles.empty}>Today’s forecast is unavailable.</Text>}
            </View>
            <View style={styles.group}>
              <Text style={styles.groupTitle}>Market price movement</Text>
              <View style={styles.previewRow}><Text style={styles.direction}>Price increase</Text>
                {rising ? <><View style={styles.marketLine}><Text style={styles.product}>{rising.price.commodityName}</Text>
                  <Text style={[styles.changeValue, styles.up]}>▲ {percentText(rising.change.percent)}</Text></View>
                  <Text style={styles.price}>{peso(rising.price.amount)}</Text></>
                  : <Text style={styles.empty}>No price increase available.</Text>}</View>
              <View style={styles.previewRow}><Text style={styles.direction}>Price decrease</Text>
                {falling ? <><View style={styles.marketLine}><Text style={styles.product}>{falling.price.commodityName}</Text>
                  <Text style={[styles.changeValue, styles.down]}>▼ {percentText(falling.change.percent)}</Text></View>
                  <Text style={styles.price}>{peso(falling.price.amount)}</Text></>
                  : <Text style={styles.empty}>No price decrease available.</Text>}</View>
            </View>
          </ScrollView>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void syncNow()} style={styles.sync}><Text style={styles.syncText}>{saving ? 'Saving…' : 'Sync Now'}</Text></Pressable>
        </View>
        </View>
      </View>
    </Modal>
  </Context.Provider>;
}

export function useContent() {
  const context = useContext(Context);
  if (!context) throw new Error('ContentProvider is missing.');
  return context;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18, backgroundColor: 'rgba(17,37,24,0.48)' },
  panelGroup: { width: '100%', maxWidth: 350, paddingTop: 125, overflow: 'visible' },
  mascot: { position: 'absolute', top: 0, alignSelf: 'center', zIndex: 3, elevation: 3 },
  panel: { backgroundColor: '#FFFBEF', borderColor: '#315E3E', borderWidth: 2, borderBottomWidth: 4, borderRadius: 20, padding: 18, gap: 11 },
  title: { fontFamily: Fonts.sansBold, fontSize: 22, lineHeight: 28, color: '#20432D', textAlign: 'center' },
  preview: { flexGrow: 0 }, previewContent: { gap: 15 }, group: { gap: 7 },
  groupTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: '#285E3D' },
  weatherRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 13, backgroundColor: '#ECF4E8', paddingHorizontal: 10, paddingVertical: 4, gap: 7 },
  weatherCopy: { flex: 1 },
  weatherCondition: { fontFamily: Fonts.sansMedium, color: '#20432D', fontSize: 15 },
  weatherTemp: { fontFamily: Fonts.sansMedium, color: '#20432D', fontSize: 24 },
  previewRow: { borderTopWidth: 1, borderColor: '#DFE8D9', paddingTop: 8, gap: 2 },
  rowLabel: { fontFamily: Fonts.sansMedium, fontSize: 12, color: '#536758' },
  direction: { fontFamily: Fonts.sansMedium, fontSize: 12, color: '#536758' },
  marketLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  up: { color: '#178449' }, down: { color: '#C6403D' },
  product: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 14, color: '#20432D' },
  changeValue: { fontFamily: Fonts.monoMedium, fontSize: 12, textAlign: 'right' },
  price: { fontFamily: Fonts.monoMedium, fontSize: 12, color: '#536758' },
  empty: { fontFamily: Fonts.sansRegular, fontSize: 13, color: '#647566' },
  error: { fontFamily: Fonts.sansRegular, fontSize: 12, color: Palette.red },
  sync: { alignSelf: 'stretch', minHeight: 48, borderRadius: 13, backgroundColor: '#32834E', justifyContent: 'center', alignItems: 'center', marginTop: 7 },
  syncText: { fontFamily: Fonts.sansBold, color: '#FFFFFF', fontSize: 15 },
});
