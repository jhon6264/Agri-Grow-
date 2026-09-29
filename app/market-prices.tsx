import { memo, useMemo, useRef, useState } from 'react';
import { BlurTargetView } from 'expo-blur';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailEdgeFades, DetailHeader } from '@/components/others/DetailHeader';
import { FloatingSearchBar, FLOATING_SEARCH_CONTENT_TOP } from '@/components/others/FloatingSearchBar';
import { Fonts } from '@/constants/Typography';
import { useContent } from '@/src/others/ContentProvider';
import { percentText, peso, priceMovement, type PriceRecord } from '@/src/others/content-model';

export default function MarketPricesScreen() {
  const insets = useSafeAreaInsets();
  const blurTarget = useRef<View | null>(null);
  const { content, checking, online, error, checkForUpdates } = useContent();
  const [query, setQuery] = useState('');
  const products = useMemo(() => content.prices.filter(item =>
    item.commodityName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => a.commodityName.localeCompare(b.commodityName)), [content.prices, query]);
  return <View style={styles.screen}>
    <BlurTargetView ref={blurTarget} style={styles.scrollSurface}>
    <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + FLOATING_SEARCH_CONTENT_TOP, paddingBottom: insets.bottom + 56 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={checking} onRefresh={() => void checkForUpdates(true)} tintColor="#236D40" />}>
      <Text style={styles.count}>{products.length} {products.length === 1 ? 'PRODUCT' : 'PRODUCTS'} · DAVAO DEL SUR</Text>
      <View style={styles.list}>{products.length ? products.map(item => <ProductRow key={item.id} item={item} />)
        : <Text style={styles.empty}>{query ? 'No products match your search.' : 'No saved market prices yet. Connect to load them.'}</Text>}</View>
      <Text style={styles.status}>{online === false ? 'Offline · Showing saved prices' : 'Saved market prices'}{error ? `\n${error}` : ''}</Text>
    </ScrollView>
    </BlurTargetView>
    <DetailEdgeFades />
    <DetailHeader title="Market Prices" blurTarget={blurTarget} />
    <FloatingSearchBar blurTarget={blurTarget} value={query} onChangeText={setQuery}
      placeholder="Search products" accessibilityLabel="Search products" />
  </View>;
}

const ProductRow = memo(function ProductRow({ item }: { item: PriceRecord }) {
  const movement = priceMovement(item);
  const direction = movement && movement.difference > 0 ? 'up' : movement && movement.difference < 0 ? 'down' : 'flat';
  return <View style={styles.row}>
    <Text style={styles.product} numberOfLines={2}>{item.commodityName}</Text>
    <View style={styles.priceColumn}><Text style={styles.price}>{peso(item.amount)}</Text>
      <Text style={[styles.change, direction === 'up' ? styles.up : direction === 'down' ? styles.down : styles.flat]}>
        {movement ? `${direction === 'up' ? '▲ ' : direction === 'down' ? '▼ ' : ''}${percentText(movement.percent)}` : '—'}
      </Text></View>
  </View>;
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7FAF4' },
  scrollSurface: { flex: 1 },
  body: { paddingHorizontal: 17 },
  count: { fontFamily: Fonts.monoMedium, fontSize: 10, letterSpacing: 1.2, color: '#718473', marginBottom: 10 },
  list: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E9DD', borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', minHeight: 70, alignItems: 'center', paddingHorizontal: 17, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#D9E5D7', gap: 12 },
  product: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 16, lineHeight: 21, color: '#183F2B' },
  priceColumn: { alignItems: 'flex-end' },
  price: { fontFamily: Fonts.monoMedium, color: '#1B4230', fontSize: 15 },
  change: { fontFamily: Fonts.monoMedium, fontSize: 11, marginTop: 3 },
  up: { color: '#178449' }, down: { color: '#C6403D' }, flat: { color: '#6F7F70' },
  empty: { fontFamily: Fonts.sansRegular, fontSize: 14, color: '#647566', textAlign: 'center', padding: 30 },
  status: { fontFamily: Fonts.sansRegular, color: '#718373', fontSize: 11, textAlign: 'center', marginTop: 20 },
});
