import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { LeafLoader } from '@/components/ui/LeafLoader';
import { useAI } from '@/src/ai/AiProvider';
import { Fonts } from '@/constants/Typography';
import { DownloadMascot } from './DownloadMascot';
import { formatDownloadPercentage } from '@/src/ai/download-progress';
import { AiStartupOverlay, StartupLabel } from './AiStartupOverlay';

export function AiSetupPanel({ top }: { top: number }) {
  const ai = useAI();
  return ai.returning ? <AiStartupOverlay top={top} /> : <AiDownloadPanel top={top} />;
}
function AiDownloadPanel({ top }: { top: number }) {
  const ai = useAI();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const button = useRef(new Animated.Value(1)).current;
  const panel = useRef(new Animated.Value(0)).current;
  const backdrop = useRef(new Animated.Value(1)).current;
  const [leaving, setLeaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const busy = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; button.stopAnimation(); panel.stopAnimation(); backdrop.stopAnimation(); }; }, [button, panel, backdrop]);
  const downloading = ai.stage === 'downloading' || ai.stage === 'waiting';
  const label = downloading ? 'Cancel' : ai.stage === 'ready' ? 'Try now' : ai.stage === 'failed' ? 'Retry'
    : ai.stage === 'verifying' ? 'Checking…' : ai.stage === 'missing' ? 'Download' : 'Preparing…';
  const enabled = downloading || ['ready', 'missing'].includes(ai.stage) || (ai.stage === 'failed' && ai.canRetry);
  const progress = ai.total > 0 ? Math.min(1, ai.bytes / ai.total) : 0;
  const milestone = Math.floor(progress * 10) * 10;
  const full = ['verifying', 'initializing', 'ready'].includes(ai.stage);
  const showLeaf = downloading || full;
  useEffect(() => { AccessibilityInfo.announceForAccessibility(downloading ? `Download ${milestone} percent` : ai.stage === 'ready' ? 'Your assistant is ready' : label); }, [ai.stage, milestone, downloading, label]);
  const act = async () => {
    if (busy.current) return;
    busy.current = true; setActionError('');
    try {
      if (ai.stage !== 'ready') { await (downloading ? ai.cancel() : ai.stage === 'failed' ? ai.retry() : ai.download()); return; }
      setLeaving(true);
      const animation = Animated.sequence([
        Animated.timing(button, { toValue: 0, duration: reduce ? 80 : 400, useNativeDriver: true }),
        Animated.timing(panel, { toValue: height, duration: reduce ? 0 : 450, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: reduce ? 120 : 500, useNativeDriver: true }),
      ]);
      await new Promise<void>((resolve) => animation.start(() => resolve()));
      if (live.current) await ai.enter();
    } catch { if (live.current) { setActionError('Unable to open chat. Please try again.'); setLeaving(false); button.setValue(1); panel.setValue(0); backdrop.setValue(1); } }
    finally { busy.current = false; }
  };
  return <View style={styles.overlay}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: backdrop }]} />
    <ScrollView style={{ marginTop: top }} contentContainerStyle={[styles.panelArea, { paddingBottom: Math.max(20, insets.bottom) }]}
      showsVerticalScrollIndicator={false} bounces={false}>
    <Animated.View style={[styles.panelGroup, { transform: [{ translateY: panel }] }]}>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>Agri Grow AI</Text>
      {showLeaf && <LeafLoader size={80} paused={leaving || ai.stage === 'ready'}
        mode={downloading || ai.stage === 'ready' ? 'determinate' : 'indeterminate'}
        progress={ai.stage === 'ready' ? 1 : progress} accessibilityLabel={downloading ? 'Downloading your assistant' : ai.stage === 'ready' ? 'Your assistant is ready' : 'Preparing your assistant'} />}
      {ai.stage === 'initializing' || ai.stage === 'checking' ? <StartupLabel label={ai.label} waiting /> : ai.stage !== 'downloading' && <Text style={styles.body}>{ai.stage === 'missing' ? 'You haven’t downloaded the AI yet.\nWould you like to download it?'
        : ai.stage === 'failed' ? ai.error : ai.stage === 'ready' ? 'Your AI is ready!'
        : ai.stage === 'waiting' ? 'Waiting for a connection…'
        : ai.stage === 'verifying' ? 'Checking download…' : 'Preparing your AI…'}</Text>}
      {ai.slow && <Text style={styles.note}>This is taking longer than expected.</Text>}
      {downloading && <Text style={styles.percentage}>{formatDownloadPercentage(ai.bytes, ai.total)}</Text>}
      {ai.stage === 'missing' && <>
        <Text style={styles.note}>Note: You can use your AI offline</Text>
        <Text style={styles.note}>Size: 2.59 GB</Text>
      </>}
      {!!actionError && <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text>}
      <Animated.View style={{ opacity: button, alignSelf: 'stretch' }}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !enabled || leaving }} disabled={!enabled || leaving}
          onPress={() => void act()} style={[styles.button, downloading && styles.cancel, !enabled && { opacity: 0.65 }]}>
          <Text style={styles.buttonText}>{label}</Text>
        </Pressable>
      </Animated.View>
    </View>
    <View pointerEvents="none" style={styles.mascot}><DownloadMascot active={!leaving} size={132} /></View>
    </Animated.View>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 },
  panelArea: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  panelGroup: { width: '100%', maxWidth: 300, paddingTop: 124.8, overflow: 'visible' },
  mascot: { position: 'absolute', top: 0, alignSelf: 'center', zIndex: 1 },
  card: { width: '100%', backgroundColor: '#FFFBEF', borderColor: '#315E3E', borderWidth: 2, borderBottomWidth: 4, borderRadius: 20, padding: 20, alignItems: 'center', gap: 12 },
  title: { fontFamily: Fonts.sansBold, fontSize: 20, color: '#20432D', textAlign: 'center' },
  body: { fontFamily: Fonts.sansRegular, fontSize: 15, lineHeight: 22, color: '#26382C', textAlign: 'center' },
  percentage: { fontFamily: Fonts.monoMedium, fontSize: 17, color: '#20432D', textAlign: 'center' },
  note: { fontFamily: Fonts.sansRegular, fontSize: 13, lineHeight: 20, color: '#536758', textAlign: 'center' },
  error: { color: '#A83030', fontSize: 14 },
  button: { minHeight: 48, borderRadius: 15, backgroundColor: '#32834E', borderBottomWidth: 4, borderColor: '#205936', padding: 12, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: '#BA3E3E', borderColor: '#872828' },
  buttonText: { fontFamily: Fonts.sansBold, fontSize: 17, color: '#FFFFFF' },
});
