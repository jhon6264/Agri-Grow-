import type { RefObject } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSurface } from '@/components/chat/GlassSurface';
import { Fonts } from '@/constants/Typography';

const SEARCH_TOP = 68;
const SEARCH_HEIGHT = 52;
export const FLOATING_SEARCH_CONTENT_TOP = SEARCH_TOP + SEARCH_HEIGHT + 14;

export function FloatingSearchBar({
  blurTarget,
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
}: {
  blurTarget: RefObject<View | null>;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.position, { top: insets.top + SEARCH_TOP }]}>
      <View style={styles.pill}>
        <GlassSurface blurTarget={blurTarget} radius={27} />
        <Text style={styles.magnifier}>⌕</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#698071"
          style={styles.input}
          accessibilityLabel={accessibilityLabel}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {value.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => onChangeText('')}
            hitSlop={8}
            style={styles.clearButton}>
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  position: {
    position: 'absolute',
    left: 17,
    right: 17,
    zIndex: 4,
    borderRadius: 27,
    shadowColor: '#31533A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.13,
    shadowRadius: 12,
    elevation: 4,
  },
  pill: {
    height: SEARCH_HEIGHT,
    borderRadius: 27,
    overflow: 'hidden',
    backgroundColor: 'rgba(246, 250, 247, 0.34)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  magnifier: { fontSize: 25, color: '#356A46', marginRight: 9 },
  input: {
    flex: 1,
    fontFamily: Fonts.sansRegular,
    fontSize: 15,
    color: '#203D2B',
    paddingVertical: 10,
  },
  clearButton: { padding: 6 },
  clearText: { color: '#637B69', fontSize: 14, fontWeight: 'bold' },
});
