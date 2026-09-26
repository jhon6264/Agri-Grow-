import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { greetingAt } from '@/src/chat/greeting-timing';
import { useWelcomeActivity } from '@/src/chat/useWelcomeActivity';
import { Fonts } from '@/constants/Typography';
import { Palette } from '@/constants/Colors';

export const RotatingGreeting = memo(function RotatingGreeting({ active }: { active: boolean }) {
  const { running, reduceMotion } = useWelcomeActivity(active);
  const elapsed = useRef(0);
  const [frame, setFrame] = useState(() => greetingAt(0, true));
  const { fontScale } = useWindowDimensions();

  useEffect(() => {
    setFrame(greetingAt(elapsed.current, reduceMotion));
    if (!running) return;
    const started = performance.now();
    const previous = elapsed.current;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const next = greetingAt(previous + performance.now() - started, reduceMotion);
      setFrame(next);
      timer = setTimeout(tick, Math.max(1, next.nextIn));
    };
    tick();
    return () => {
      clearTimeout(timer);
      elapsed.current = previous + performance.now() - started;
    };
  }, [running, reduceMotion]);

  return (
    <View style={[styles.space, { height: 64 * fontScale }]}>
      <Text
        accessible
        accessibilityLabel={frame.phrase}
        accessibilityLiveRegion="none"
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={styles.text}>{frame.text || ' '}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  space: { width: '100%', justifyContent: 'center' },
  text: { fontFamily: Fonts.sansSemiBold, fontSize: 25, lineHeight: 32, color: Palette.nearBlack, textAlign: 'center' },
});
