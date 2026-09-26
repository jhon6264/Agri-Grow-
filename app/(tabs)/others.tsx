import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';

const sections = [
  { code: '01', key: 'market-prices', title: 'Market Prices', detail: 'Davao del Sur crop prices' },
  { code: '02', key: 'weather', title: 'Weather', detail: 'Downloaded local forecasts' },
  { code: '03', key: 'almanac', title: 'Almanac', detail: 'Offline crop descriptions' },
] as const;

export default function OthersScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  return (
    <View style={styles.container}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>EXPLORE</Text>
      <Text style={styles.title}>More tools</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Prices, weather, and crop knowledge in one place.</Text>

      <View style={styles.list}>
        {sections.map((item) => {
          const isSelected = item.key === section;

          return (
            <View
              key={item.code}
              style={[
                styles.card,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? colors.primarySoft : colors.background,
                },
              ]}>
              <Text style={[styles.code, { color: colors.primary }]}>{item.code}</Text>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={[styles.cardDetail, { color: colors.textSecondary }]}>{item.detail}</Text>
              </View>
              <Text style={[styles.arrow, { color: colors.primary }]}>→</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  eyebrow: {
    fontFamily: Fonts.monoSemiBold,
    fontSize: 11,
    letterSpacing: 1.8,
    marginBottom: 9,
  },
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 30,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 7,
    maxWidth: 320,
  },
  list: {
    backgroundColor: 'transparent',
    gap: 12,
    marginTop: 22,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  code: {
    fontFamily: Fonts.monoSemiBold,
    fontSize: 12,
    marginRight: 15,
  },
  cardCopy: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  cardTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
  },
  cardDetail: {
    fontSize: 13,
    marginTop: 4,
  },
  arrow: {
    fontFamily: Fonts.monoSemiBold,
    fontSize: 18,
  },
});
