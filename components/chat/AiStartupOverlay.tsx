import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { LeafLoader } from '@/components/ui/LeafLoader';
import { useAI } from '@/src/ai/AiProvider';

export function StartupLabel({ label, waiting, style }: { label: string; waiting: boolean; style?: StyleProp<TextStyle> }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [shown, setShown] = useState(label);
  const opacity = useRef(new Animated.Value(1)).current;
  const crossfade = useRef(new Animated.Value(1)).current;
  useEffect(() => { const sub = AppState.addEventListener('change', s => setActive(s === 'active')); return () => sub.remove(); }, []);
  useEffect(() => {
    const animation = Animated.timing(crossfade, { toValue: 0, duration: reduce ? 0 : 100, useNativeDriver: true });
    animation.start(({ finished }) => { if (finished) { setShown(label); Animated.timing(crossfade, { toValue: 1, duration: reduce ? 0 : 100, useNativeDriver: true }).start(); } });
    return () => crossfade.stopAnimation();
  }, [label, crossfade, reduce]);
  useEffect(() => {
    opacity.setValue(1);
    if (!waiting || reduce || !active) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, [waiting, reduce, active, opacity]);
  return <Animated.View style={{ opacity: crossfade }}><Animated.Text accessibilityLiveRegion="polite"
    style={[styles.text, style, { opacity }]}>{shown}</Animated.Text></Animated.View>;
}

export function AiStartupOverlay({ top }: { top: number }) {
  const ai = useAI();
  const reduce = useReducedMotion();
  const content = useRef(new Animated.Value(1)).current;
  const backdrop = useRef(new Animated.Value(1)).current;
  const enter = useRef(ai.enter); enter.current = ai.enter;
  const [error, setError] = useState('');
  useEffect(() => {
    content.setValue(1); backdrop.setValue(1);
    if (ai.stage !== 'ready') return;
    let live = true;
    const sequence = Animated.sequence([
      Animated.delay(reduce ? 0 : 400),
      Animated.timing(content, { toValue: 0, duration: reduce ? 80 : 350, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 0, duration: reduce ? 120 : 500, useNativeDriver: true }),
    ]);
    sequence.start(({ finished }) => { if (finished && live) void enter.current().catch(() => {
      if (live) { content.setValue(1); backdrop.setValue(1); setError('Unable to open chat. Please retry.'); }
    }); });
    return () => { live = false; sequence.stop(); };
  }, [ai.stage, reduce, content, backdrop]);
  const failed = ai.stage === 'failed' || !!error;
  return <View style={styles.overlay}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: backdrop }]} />
    <Animated.View style={[styles.center, { marginTop: top, opacity: content }]}>
      {failed ? <>
        <Text accessibilityRole="alert" style={styles.text}>{error || ai.error}</Text>
        <Pressable accessibilityRole="button" disabled={!ai.canRetry} style={styles.button}
          onPress={() => { setError(''); void ai.retry(); }}><Text style={styles.buttonText}>Retry</Text></Pressable>
      </> : <>
        <LeafLoader size={104} mode={ai.stage === 'ready' ? 'determinate' : 'indeterminate'} progress={1}
          paused={ai.stage === 'ready'} accessibilityLabel={ai.stage === 'ready' ? 'Your assistant is ready' : ai.label === 'almost there' ? 'Preparing your chat session' : 'Preparing your assistant'} />
        <StartupLabel label={ai.label} waiting={ai.stage !== 'ready'} style={styles.label} />
        {ai.slow && <Text style={styles.text}>This is taking longer than expected.</Text>}
      </>}
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 },
  label: { fontSize: 21, lineHeight: 31 },
  text: { color: '#26382C', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  button: { backgroundColor: '#32834E', borderRadius: 15, paddingHorizontal: 28, paddingVertical: 14 },
  buttonText: { color: 'white', fontSize: 17, fontWeight: '600' },
});
