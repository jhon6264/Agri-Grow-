import { useEffect, useId, useState } from 'react';
import { AppState, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const SHAPE = 'M49 91 C42 80 20 80 18 39 C40 48 48 55 48 74 L30 53 C44 64 48 82 49 91 Z M50 95 C54 68 42 36 91 10 C93 52 78 68 60 79 L51 95 Z M53 81 L78 33 L57 63 Z';
type Props = { mode?: 'determinate' | 'indeterminate'; progress?: number; size?: number; color?: string; trackColor?: string; accessibilityLabel?: string; paused?: boolean };
export function LeafLoader({ mode = 'indeterminate', progress = 0, size = 96, color = '#2B8754', trackColor = '#DCE8DE', accessibilityLabel = 'Loading', paused = false }: Props) {
  const id = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const phase = useSharedValue(0);
  const fill = useSharedValue(0);
  const amount = mode === 'determinate' ? Math.max(0, Math.min(1, progress)) : 0.48;
  useEffect(() => { const sub = AppState.addEventListener('change', (state) => setActive(state === 'active')); return () => sub.remove(); }, []);
  useEffect(() => {
    fill.value = withTiming(amount, { duration: reduce ? 0 : 250 });
  }, [amount, fill, reduce]);
  useEffect(() => {
    if (!paused && active && !reduce) phase.value = withRepeat(withTiming(Math.PI * 2, { duration: 2400, easing: Easing.linear }), -1, false);
    else cancelAnimation(phase);
    return () => cancelAnimation(phase);
  }, [paused, active, reduce, phase]);
  const front = useAnimatedProps(() => {
    const y = 102 - fill.value * 105;
    const wave = reduce ? 0 : Math.sin(phase.value) * 3;
    return { d: `M0 ${y} Q25 ${y + wave * 2} 50 ${y} T100 ${y} V105 H0Z` };
  });
  const back = useAnimatedProps(() => {
    const y = 101 - fill.value * 105;
    const wave = reduce ? 0 : Math.cos(phase.value) * 3;
    return { d: `M0 ${y} Q25 ${y - wave * 2} 50 ${y} T100 ${y} V105 H0Z` };
  });
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}
    accessibilityValue={mode === 'determinate' ? { min: 0, max: 100, now: Math.round(amount * 100) } : { text: 'In progress' }}>
    <Svg width={size} height={size} viewBox="0 0 100 105" accessible={false}>
      <Defs><ClipPath id={id}><Path d={SHAPE} fillRule="evenodd" /></ClipPath></Defs>
      <G clipPath={`url(#${id})`}><Rect width={100} height={105} fill={trackColor} />
        <AnimatedPath animatedProps={back} fill={color} opacity={0.4} /><AnimatedPath animatedProps={front} fill={color} />
      </G>
    </Svg>
  </View>;
}
