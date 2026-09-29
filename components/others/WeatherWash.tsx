import { memo, useId } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import type { Condition } from '@/src/others/content-model';

const tones: Record<Condition, { colors: readonly [string, string, string]; pigment: string }> = {
  sunny: { colors: ['rgba(246, 207, 111, 0.24)', 'rgba(255, 255, 255, 0)', 'rgba(244, 197, 118, 0.10)'], pigment: '#D9AB5A' },
  cloudy: { colors: ['rgba(166, 193, 212, 0.34)', 'rgba(255, 255, 255, 0)', 'rgba(190, 207, 220, 0.18)'], pigment: '#84A8C2' },
  rainy: { colors: ['rgba(143, 185, 215, 0.35)', 'rgba(255, 255, 255, 0)', 'rgba(170, 204, 228, 0.20)'], pigment: '#75A4C7' },
  'heavy-rain': { colors: ['rgba(112, 151, 185, 0.37)', 'rgba(255, 255, 255, 0)', 'rgba(151, 179, 206, 0.22)'], pigment: '#6485AA' },
  'heavy-rain-thunder': { colors: ['rgba(134, 140, 183, 0.38)', 'rgba(255, 255, 255, 0)', 'rgba(166, 173, 207, 0.22)'], pigment: '#8586B0' },
};

export type WeatherWashRadius = number | {
  topLeft?: number;
  topRight?: number;
  bottomLeft?: number;
  bottomRight?: number;
};

// Soft, fixed pigment blooms complement the watercolor artwork without moving.
// Calendar cards use only the right-side bloom; other weather cards retain the full wash.
export const WeatherWash = memo(function WeatherWash({ condition, radius, placement = 'full' }: { condition?: Condition; radius: WeatherWashRadius; placement?: 'full' | 'right' }) {
  const pigmentId = useId().replace(/:/g, '');
  if (!condition) return null;
  const tone = tones[condition];
  const radiusStyle = typeof radius === 'number'
    ? { borderRadius: radius }
    : {
        borderTopLeftRadius: radius.topLeft ?? 0,
        borderTopRightRadius: radius.topRight ?? 0,
        borderBottomLeftRadius: radius.bottomLeft ?? 0,
        borderBottomRightRadius: radius.bottomRight ?? 0,
      };
  if (placement === 'right') return <View pointerEvents="none" style={[styles.clip, radiusStyle]}>
    <Svg width="100%" height="100%" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
      <Defs><RadialGradient id={pigmentId} cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor={tone.pigment} stopOpacity={condition === 'sunny' ? 0.26 : 0.38} />
        <Stop offset="52%" stopColor={tone.pigment} stopOpacity={condition === 'sunny' ? 0.14 : 0.20} />
        <Stop offset="100%" stopColor={tone.pigment} stopOpacity={0} />
      </RadialGradient></Defs>
      <Ellipse cx="354" cy="77" rx="188" ry="151" fill={`url(#${pigmentId})`} />
      <Ellipse cx="375" cy="186" rx="142" ry="93" fill={`url(#${pigmentId})`} />
    </Svg>
  </View>;
  return <View pointerEvents="none" style={[styles.clip, radiusStyle]}>
    <LinearGradient colors={tone.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <Svg width="100%" height="100%" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
      <Defs><RadialGradient id={pigmentId} cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor={tone.pigment} stopOpacity={condition === 'sunny' ? 0.17 : 0.24} />
        <Stop offset="65%" stopColor={tone.pigment} stopOpacity={condition === 'sunny' ? 0.07 : 0.10} />
        <Stop offset="100%" stopColor={tone.pigment} stopOpacity={0} />
      </RadialGradient></Defs>
      <Ellipse cx="346" cy="38" rx="147" ry="92" rotation={-15} origin="346, 38" fill={`url(#${pigmentId})`} />
      <Ellipse cx="40" cy="244" rx="170" ry="103" rotation={18} origin="40, 244" fill={`url(#${pigmentId})`} />
    </Svg>
  </View>;
});

const styles = StyleSheet.create({ clip: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' } });
