import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { MASCOT_COLUMNS, MASCOT_ROWS, MASCOT_CYCLE_MS, mascotFrameAt } from '@/assets/mascot/welcome-timing';
import { useWelcomeActivity } from '@/src/chat/useWelcomeActivity';

type WelcomeMascotProps = { active: boolean; size?: number };

export function WelcomeMascot({ active, size = 192 }: WelcomeMascotProps) {
  const elapsed = useSharedValue(0);
  const { running, reduceMotion } = useWelcomeActivity(active);
  // Stay still until the accessibility preference and local image are ready.
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    cancelAnimation(elapsed);
    elapsed.value = 0;
    if (running && !reduceMotion && imageReady) {
      const movementDuration = MASCOT_CYCLE_MS - 3000;
      elapsed.value = withRepeat(withSequence(
        withTiming(movementDuration, { duration: movementDuration, easing: Easing.linear }),
        withDelay(3000, withTiming(0, { duration: 0 })),
      ), -1, false);
    }
    return () => cancelAnimation(elapsed);
  }, [elapsed, running, imageReady, reduceMotion]);

  const spriteStyle = useAnimatedStyle(() => {
    const frame = mascotFrameAt(elapsed.value);
    return {
      transform: [
        { translateX: -(frame % MASCOT_COLUMNS) * size },
        { translateY: -Math.floor(frame / MASCOT_COLUMNS) * size },
      ],
    };
  }, [size]);

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.viewport, { width: size, height: size }]}>
      <Animated.Image
        source={require('@/assets/mascot/welcome-wave.png')}
        onLoad={() => setImageReady(true)}
        resizeMode="stretch"
        fadeDuration={0}
        style={[styles.sheet, { width: size * MASCOT_COLUMNS, height: size * MASCOT_ROWS }, spriteStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden', backgroundColor: 'transparent' },
  sheet: { position: 'absolute', top: 0, left: 0 },
});
