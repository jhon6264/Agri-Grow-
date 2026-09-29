import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  WHOLE_CYCLE_MS,
  WHOLE_FRAME,
  WHOLE_OFFSETS,
  wholeFrameAt,
} from '@/assets/mascot/calendar-whole-motion';
import { useWelcomeActivity } from '@/src/chat/useWelcomeActivity';

const characters = {
  farmer: require('@/assets/mascot/calendar-whole-character.png'),
} as const;
export type CalendarMascotCharacter = keyof typeof characters;

export function CalendarCornerMascot({
  active,
  size,
  character = 'farmer',
}: {
  active: boolean;
  size: number;
  character?: CalendarMascotCharacter;
}) {
  const elapsed = useSharedValue(0);
  const { running } = useWelcomeActivity(active);
  const systemReducedMotion = useReducedMotion();
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    cancelAnimation(elapsed);
    elapsed.value = 0;
    if (running && !systemReducedMotion) {
      elapsed.value = withRepeat(
        withTiming(WHOLE_CYCLE_MS, {
          duration: WHOLE_CYCLE_MS,
          easing: Easing.linear,
        }),
        -1,
        false
      );
    }
    return () => cancelAnimation(elapsed);
  }, [elapsed, running, systemReducedMotion]);

  const scale = size / WHOLE_FRAME.viewWidth;
  const height = size * WHOLE_FRAME.viewHeight / WHOLE_FRAME.viewWidth;
  const sheetWidth = WHOLE_FRAME.sheetWidth * scale;
  const sheetHeight = WHOLE_FRAME.sheetHeight * scale;

  const spriteStyle = useAnimatedStyle(() => {
    const frame = wholeFrameAt(elapsed.value);
    const offset = WHOLE_OFFSETS[frame] ?? { dx: 0, dy: 0 };
    const col = frame % WHOLE_FRAME.columns;
    const row = Math.floor(frame / WHOLE_FRAME.columns);

    const sourceX = -(col * WHOLE_FRAME.width + WHOLE_FRAME.viewX - offset.dx);
    const sourceY = -(row * WHOLE_FRAME.height + WHOLE_FRAME.viewY - offset.dy);

    return {
      transform: [
        { translateX: sourceX * scale },
        { translateY: sourceY * scale },
      ],
    };
  }, [scale]);

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.viewport, { width: size, height }]}>
      <Animated.Image
        source={characters[character]}
        onLoad={() => setImageReady(true)}
        resizeMode="stretch"
        fadeDuration={0}
        style={[
          styles.sheet,
          { width: sheetWidth, height: sheetHeight },
          spriteStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
