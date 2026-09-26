import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useWelcomeActivity } from '@/src/chat/useWelcomeActivity';
import { DOWNLOAD_MASCOT_COLUMNS, DOWNLOAD_MASCOT_ROWS, DOWNLOAD_MASCOT_CYCLE_MS, downloadMascotFrameAt } from '@/assets/mascot/download-timing';

export function DownloadMascot({ active, size = 110 }: { active: boolean; size?: number }) {
  // The 1254px atlas has 313.5px cells. Fingers from the preceding row
  // extend ~4px into the next cell; the hat begins after 18px.
  const topInset = size * (8 / 313.5);
  const { running, reduceMotion } = useWelcomeActivity(active);
  const [ready, setReady] = useState(false);
  const elapsed = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(elapsed);
    if (reduceMotion) elapsed.value = 0;
    if (running && !reduceMotion && ready) {
      elapsed.value = 0;
      elapsed.value = withRepeat(withTiming(DOWNLOAD_MASCOT_CYCLE_MS, { duration: DOWNLOAD_MASCOT_CYCLE_MS, easing: Easing.linear }), -1, false);
    }
    return () => cancelAnimation(elapsed);
  }, [running, reduceMotion, ready, elapsed]);
  const sprite = useAnimatedStyle(() => {
    const frame = downloadMascotFrameAt(elapsed.value);
    return { transform: [{ translateX: -(frame % DOWNLOAD_MASCOT_COLUMNS) * size }, { translateY: -Math.floor(frame / DOWNLOAD_MASCOT_COLUMNS) * size }] };
  }, [size]);
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.viewport, { width: size, height: size }]}>
    <View style={[styles.viewport, { position: 'absolute', top: topInset, width: size, height: size - topInset }]}>
      <Animated.Image source={require('@/assets/mascot/download-perch.png')} onLoad={() => setReady(true)} fadeDuration={0} resizeMode="stretch"
        style={[styles.sheet, { top: -topInset, width: size * DOWNLOAD_MASCOT_COLUMNS, height: size * DOWNLOAD_MASCOT_ROWS }, sprite]} />
    </View>
  </View>;
}
const styles = StyleSheet.create({ viewport: { overflow: 'hidden', backgroundColor: 'transparent' }, sheet: { position: 'absolute', top: 0, left: 0 } });
