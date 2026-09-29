import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { scheduleTimeParts } from '@/src/calendar/calendar-time';
import type { ScheduleOccurrence } from '@/src/calendar/schedule-store';
import { Fonts } from '@/constants/Typography';

const PREVIEW_INTERVAL_MS = 8000;
const INTRO_TYPE_MS = 1000;
const ERASE_MS = 400;
const TYPE_MS = 1100;
const TYPE_TICK_MS = 32;
const typedPrefix = (text: string, fraction: number) => {
  const characters = Array.from(text);
  return characters.slice(0, Math.ceil(characters.length * Math.max(0, Math.min(1, fraction)))).join('');
};

export function ScheduleCardPreview({ items, now, contentWidth, onTitleHeight, playing = true }: {
  items: ScheduleOccurrence[]; now: number; contentWidth: number; onTitleHeight?: (height: number) => void; playing?: boolean;
}) {
  const reduce = useReducedMotion();
  const signature = items.map(item => `${item.id}:${item.at}:${item.title}`).join('|');
  const [shown, setShown] = useState<ScheduleOccurrence | null>(items[0] ?? null);
  const [incoming, setIncoming] = useState<ScheduleOccurrence | null>(null);
  const [typedTitle, setTypedTitle] = useState(items[0]?.title ?? '');
  const currentIndex = useRef(0);
  const intro = useRef(new Animated.Value(1)).current;
  const roll = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    currentIndex.current = 0;
    setShown(items[0] ?? null);
    setIncoming(null);
    intro.stopAnimation();
    roll.stopAnimation();
    roll.setValue(0);
    const title = items[0]?.title ?? '';
    if (!title) {
      setTypedTitle('');
      return;
    }
    if (!playing) {
      // While card is settling / in motion, display title statically without firing 32ms setInterval loops
      intro.setValue(1);
      setTypedTitle(title);
      return;
    }
    if (reduce) {
      intro.setValue(1);
      setTypedTitle(title);
      return;
    }
    intro.setValue(0);
    setTypedTitle('');
    Animated.timing(intro, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    const started = Date.now();
    const typing = setInterval(() => {
      const fraction = Math.min(1, (Date.now() - started) / INTRO_TYPE_MS);
      setTypedTitle(fraction === 1 ? title : typedPrefix(title, fraction));
      if (fraction === 1) clearInterval(typing);
    }, TYPE_TICK_MS);
    return () => {
      clearInterval(typing);
      intro.stopAnimation();
    };
  }, [signature, reduce, intro, roll, playing]);

  useEffect(() => {
    if (!playing || items.length < 2) return;
    const timer = setInterval(() => {
      currentIndex.current = (currentIndex.current + 1) % items.length;
      setIncoming(items[currentIndex.current]);
    }, PREVIEW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [signature, items.length, playing]);

  useEffect(() => {
    if (!playing || !incoming || !shown) return;
    const nextTitle = incoming.title;
    if (reduce) { setTypedTitle(nextTitle); setShown(incoming); setIncoming(null); return; }
    const oldTitle = shown.title;
    setTypedTitle(oldTitle); roll.setValue(0);
    Animated.timing(roll, { toValue: 1, duration: 520, useNativeDriver: true }).start();
    const started = Date.now();
    const typing = setInterval(() => {
      const elapsed = Date.now() - started;
      if (elapsed < ERASE_MS) setTypedTitle(typedPrefix(oldTitle, 1 - elapsed / ERASE_MS));
      else setTypedTitle(typedPrefix(nextTitle, (elapsed - ERASE_MS) / TYPE_MS));
      if (elapsed >= ERASE_MS + TYPE_MS) clearInterval(typing);
    }, TYPE_TICK_MS);
    const finish = setTimeout(() => {
      setShown(incoming); setIncoming(null); roll.setValue(0); setTypedTitle(nextTitle);
    }, ERASE_MS + TYPE_MS + TYPE_TICK_MS);
    return () => { clearInterval(typing); clearTimeout(finish); roll.stopAnimation(); };
  }, [incoming, reduce, shown, roll, playing]);

  if (!shown) return <Text style={styles.empty}>No schedules yet</Text>;
  const past = shown.at < now;
  const current = scheduleTimeParts(shown.at);
  const next = incoming ? scheduleTimeParts(incoming.at) : current;
  const oldTime = incoming ? current.time.padStart(5, '0') : '';
  const newTime = next.time.padStart(5, '0');
  const phase = incoming ? roll : intro;

  return <View style={styles.preview} accessibilityLiveRegion="none">
    <View style={[styles.timeRow, past && styles.pastTimeRow]}>
      {Array.from(newTime).map((char, index) => <TimeDigit key={index} oldChar={oldTime[index]} newChar={char} phase={phase} />)}
      <Text style={styles.period}>{next.period}</Text>
      {past && <View pointerEvents="none" style={styles.timeStrike} />}
    </View>
    <Text numberOfLines={2} style={[styles.previewTitle, past && styles.pastPreviewTitle]}>{typedTitle || ' '}</Text>
  </View>;
}

function TimeDigit({ oldChar, newChar, phase }: { oldChar?: string; newChar: string; phase: Animated.Value }) {
  if (newChar === ':' || oldChar === newChar) return <Text style={[styles.digit, newChar === ':' && styles.colon]}>{newChar}</Text>;
  const outgoing = phase.interpolate({ inputRange: [0, 1], outputRange: [0, 40] });
  const arriving = phase.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] });
  return <View style={styles.digitWindow}>
    {!!oldChar && <Animated.Text style={[styles.digit, styles.movingDigit, { transform: [{ translateY: outgoing }] }]}>{oldChar}</Animated.Text>}
    <Animated.Text style={[styles.digit, styles.movingDigit, { transform: [{ translateY: arriving }] }]}>{newChar}</Animated.Text>
  </View>;
}
const styles = StyleSheet.create({
  preview: { minHeight: 82 },
  timeRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', height: 40 },
  pastTimeRow: { opacity: 0.55 },
  timeStrike: { position: 'absolute', top: 20, left: 0, right: 0, height: 1.5, backgroundColor: '#20432D' },
  digitWindow: { width: 19, height: 40, overflow: 'hidden' },
  digit: { width: 19, height: 40, fontFamily: Fonts.monoSemiBold, fontSize: 28, lineHeight: 40, color: '#20432D', textAlign: 'center' },
  movingDigit: { position: 'absolute', left: 0, top: 0 }, colon: { width: 11 },
  period: { fontFamily: Fonts.sansSemiBold, fontSize: 14, lineHeight: 40, height: 40, color: '#285E3D', marginLeft: 8, textAlignVertical: 'center' },
  previewTitle: { fontFamily: Fonts.sansMedium, fontSize: 16, lineHeight: 21, color: '#20432D', marginTop: 4, minHeight: 42 },
  pastPreviewTitle: { color: '#788A7B', textDecorationLine: 'line-through' },
  empty: { fontFamily: Fonts.sansRegular, fontSize: 15, color: '#536758', marginTop: 18 },
});
