import { Image, StyleSheet, View } from 'react-native';

/** Subtle paper grain shared by the Almanac preview and crop cards. */
export function ParchmentCardTexture() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={require('@/assets/Almanac/parchment-card.png')}
        resizeMode="cover"
        accessible={false}
        style={styles.texture}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  texture: {
    ...StyleSheet.absoluteFill,
    opacity: 0.8,
  },
});
