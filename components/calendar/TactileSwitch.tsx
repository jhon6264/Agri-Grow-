import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Fonts } from '@/constants/Typography';

export function TactileSwitch({ value, disabled, onChange }: { value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  const reduce = useReducedMotion();
  const position = useSharedValue(value ? 1 : 0);
  const pressed = useSharedValue(0);
  useEffect(() => { position.value = reduce ? withTiming(value ? 1 : 0, { duration: 0 }) : withSpring(value ? 1 : 0, { damping: 17, stiffness: 230 }); }, [value, reduce, position]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * 22 }, { scale: 1 - pressed.value * 0.08 }] }));
  return <View style={styles.row}>
    <Text style={styles.state}>{value ? 'On' : 'Off'}</Text>
    <Pressable accessibilityRole="switch" accessibilityLabel="Reminder" accessibilityState={{ checked: value, disabled }} disabled={disabled}
      onPressIn={() => { pressed.value = withTiming(1, { duration: reduce ? 0 : 80 }); }}
      onPressOut={() => { pressed.value = withTiming(0, { duration: reduce ? 0 : 120 }); }}
      onPress={() => { void Haptics.selectionAsync().catch(() => undefined); onChange(!value); }}
      style={[styles.track, value ? styles.on : styles.off, disabled && styles.disabled]}>
      <Animated.View style={[styles.thumb, thumb]} />
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  state: { fontFamily: Fonts.sansMedium, color: '#536758', minWidth: 24 },
  track: { width: 56, height: 34, borderRadius: 17, padding: 3, borderWidth: 1, justifyContent: 'center' },
  on: { backgroundColor: '#32834E', borderColor: '#286A40' }, off: { backgroundColor: '#D7E1D7', borderColor: '#B9C8BA' },
  disabled: { opacity: 0.5 }, thumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', elevation: 2, shadowColor: '#183721', shadowOpacity: 0.2, shadowRadius: 2 },
});
