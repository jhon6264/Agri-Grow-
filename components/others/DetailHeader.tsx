import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import type { RefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSurface } from '@/components/chat/GlassSurface';
import { Fonts } from '@/constants/Typography';

const background = '247, 250, 244';

export function DetailEdgeFades() {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
    <LinearGradient colors={[`rgba(${background}, 0.92)`, `rgba(${background}, 0.82)`, `rgba(${background}, 0)`]}
      locations={[0, 0.55, 1]} style={[styles.topFade, { height: insets.top + 72 }]} />
    <LinearGradient colors={[`rgba(${background}, 0)`, `rgba(${background}, 0.88)`]}
      style={[styles.bottomFade, { height: insets.bottom + 46 }]} />
  </View>;
}

export function DetailHeader({ title, blurTarget }: { title: string; blurTarget: RefObject<View | null> }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return <View pointerEvents="box-none" style={[styles.header, { top: insets.top + 8 }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Others" hitSlop={8}
      onPress={() => router.back()} style={styles.back}><Text style={styles.arrow}>‹</Text></Pressable>
    <View style={styles.titlePill}>
      <GlassSurface blurTarget={blurTarget} radius={24} />
      <Text style={styles.title}>{title}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  topFade: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  header: { position: 'absolute', left: 16, right: 16, height: 46, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  back: { position: 'absolute', left: 0, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  arrow: { fontFamily: Fonts.sansMedium, color: '#1B6338', fontSize: 32, lineHeight: 36, marginTop: -4 },
  titlePill: { minWidth: 146, height: 44, paddingHorizontal: 20, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 18, color: '#173F2B', textAlign: 'center' },
});
