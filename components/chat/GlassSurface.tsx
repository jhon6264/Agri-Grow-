import { BlurView } from 'expo-blur';
import type { RefObject } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

/** Place behind controls, outside the content captured by blurTarget. */
export function GlassSurface({ blurTarget, radius, suspended = false }: {
  blurTarget: RefObject<View | null>;
  radius: number;
  suspended?: boolean;
}) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius }]}>
      {!suspended && (
        <BlurView
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={18}
          tint="light"
          blurReductionFactor={Platform.OS === 'android' ? 4 : 4}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={[StyleSheet.absoluteFill, styles.tint, { borderRadius: radius }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  tint: {
    backgroundColor: 'rgba(246, 250, 247, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.78)',
  },
});
