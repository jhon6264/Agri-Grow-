import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';

export const CHAT_BACKGROUND = '#F6FAF7';

type Size = { width: number; height: number };

export const ChatWallpaper = memo(function ChatWallpaper(_: Size) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: CHAT_BACKGROUND }]} />;
});

export const ChatEdgeFades = memo(function ChatEdgeFades({
  width,
  height,
  navigationTop = 0,
  navigationBottom,
  composerHeight,
  composerOffset,
}: Size & {
  navigationTop?: number;
  navigationBottom: number;
  composerHeight: number;
  composerOffset: number;
}) {
  const { height: keyboard } = useReanimatedKeyboardAnimation();
  const animatedBottomStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboard.value }],
  }));

  if (!width || !height) return null;

  const restingStart = height - composerHeight + composerOffset;
  const topFadeHeight = Math.max(0, navigationBottom - navigationTop);

  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      {/* Top Edge Fade: begins at the top border of the top navigation bar and fades to its bottom border */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: navigationBottom }}>
        <View style={{ height: navigationTop, backgroundColor: 'rgba(246, 250, 247, 0.8)' }} />
        {topFadeHeight > 0 && (
          <LinearGradient
            colors={['rgba(246, 250, 247, 0.8)', 'rgba(246, 250, 247, 0)']}
            style={{ height: topFadeHeight, width: '100%' }}
          />
        )}
      </View>

      {/* Bottom Edge Fade: Hardware-accelerated GPU translation during keyboard movement */}
      <Animated.View
        style={[
          styles.bottomContainer,
          {
            top: restingStart,
            height: Math.max(0, height - restingStart + 600),
          },
          animatedBottomStyle,
        ]}>
        <LinearGradient
          colors={['rgba(246, 250, 247, 0)', 'rgba(246, 250, 247, 0.8)']}
          style={styles.gradient}
        />
        <View style={styles.bottomSolid} />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  gradient: {
    height: 32,
    width: '100%',
  },
  bottomContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  bottomSolid: {
    flex: 1,
    backgroundColor: 'rgba(246, 250, 247, 0.8)',
  },
});
