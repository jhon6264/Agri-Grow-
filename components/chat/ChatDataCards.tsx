import { useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { WeatherArt } from '@/components/others/WeatherArt';
import { WeatherWash } from '@/components/others/WeatherWash';
import { Fonts } from '@/constants/Typography';
import type { ChatDataCard } from '@/src/chat/chat-types';
import { ALMANAC_CROPS, BOTANICAL_PLACEHOLDER } from '@/src/others/almanac-data';
import { CONDITIONS, PERIODS, calculatePricesTableWidths, percentText, peso, priceMovement, weatherDateLabel } from '@/src/others/content-model';

const timestamp = (stamp: number | null) => stamp ? new Date(stamp).toLocaleString('en-PH', {
  timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
}) + ' PH' : 'Update time unavailable';

function WeatherCard({ card, width, height }: { card: Extract<ChatDataCard, { kind: 'weather' }>; width: number; height: number }) {
  const weather = card.day.periods[card.period];
  const label = PERIODS.find(item => item.id === card.period)?.label ?? 'Forecast';
  const artSize = Math.min(148, Math.max(116, Math.round(width * 0.43)));
  return <View style={[styles.weatherCard, { width, height }]}>
    <WeatherWash condition={weather.condition} radius={20} placement="right" />
    <View pointerEvents="none" style={styles.weatherArt}>
      <WeatherArt condition={weather.condition} size={artSize} animate={false} />
    </View>
    <Text style={styles.weatherDate} numberOfLines={1} adjustsFontSizeToFit>{weatherDateLabel(card.day.forecastDate, 'long')}</Text>
    <Text style={styles.weatherTitle}>{label} forecast</Text>
    <Text style={styles.location}>Davao del Sur</Text>
    <View style={styles.weatherDetails}>
      <Text style={styles.weatherDetail}>Rain {weather.rainChancePct}%  ·  Humidity {weather.humidityPct}%</Text>
      <Text style={styles.weatherDetail}>Wind {weather.windKph} km/h  ·  Low {card.day.minTemperatureC}° / High {card.day.maxTemperatureC}°</Text>
      <Text style={styles.updatedSmall}>Updated {timestamp(card.day.updatedAt ?? card.loadedAt)}</Text>
    </View>
    <View style={styles.weatherValue}>
      <Text style={styles.weatherCondition}>{CONDITIONS[weather.condition]}</Text>
      <Text style={styles.weatherTemperature}>{weather.temperatureC}°C</Text>
    </View>
  </View>;
}

function PricesCard({ card, width }: { card: Extract<ChatDataCard, { kind: 'prices' }>; width: number }) {
  const [showAll, setShowAll] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const containerWidthRef = useRef(0);
  const contentWidthRef = useRef(0);
  const scrollXRef = useRef(0);

  const checkScroll = (x: number, containerW = containerWidthRef.current, contentW = contentWidthRef.current) => {
    if (containerW <= 0 || contentW <= 0) return;
    setCanScrollLeft(x > 6);
    setCanScrollRight(contentW > containerW + 4 && x + containerW < contentW - 6);
  };

  const rows = showAll ? card.rows : card.rows.slice(0, 4);
  const columnWidths = useMemo(() => calculatePricesTableWidths(card.rows), [card.rows]);

  return <View style={[styles.panel, { width }]}>
    <View style={styles.priceHeading}>
      <Text style={styles.panelEyebrow}>MARKET PRICES</Text>
      <Text style={styles.panelTitle}>Davao del Sur</Text>
    </View>
    <View style={styles.tableWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        persistentScrollbar={Platform.OS === 'android'}
        accessibilityLabel="Market prices table"
        onLayout={(e) => {
          containerWidthRef.current = e.nativeEvent.layout.width;
          checkScroll(scrollXRef.current);
        }}
        onContentSizeChange={(w) => {
          contentWidthRef.current = w;
          checkScroll(scrollXRef.current);
        }}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          scrollXRef.current = x;
          checkScroll(x);
        }}
        scrollEventThrottle={32}
      >
        <View>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableHeading, { width: columnWidths.product }]}>Product</Text>
            <Text style={[styles.tableHeading, { width: columnWidths.category }]}>Category</Text>
            <Text style={[styles.tableHeading, { width: columnWidths.price }]}>Price</Text>
            <Text style={[styles.tableHeading, { width: columnWidths.change }]}>Change</Text>
          </View>
          {rows.map((item, index) => {
            const movement = priceMovement(item);
            const movementColor = movement && movement.difference > 0 ? '#A64734'
              : movement && movement.difference < 0 ? '#247044' : '#536758';
            return <View key={`${item.id}:${index}`} style={[styles.tableRow, index % 2 === 1 && styles.tableAlternate]}>
              <View style={[styles.productCell, { width: columnWidths.product }]}>
                <Text style={styles.productName} numberOfLines={1}>{item.commodityName}</Text>
                <Text style={styles.observed}>{item.observedAt ?? 'Date unavailable'}</Text>
              </View>
              <Text style={[styles.tableCell, { width: columnWidths.category }]} numberOfLines={1}>{item.category}</Text>
              <Text style={[styles.tableCell, { width: columnWidths.price }]} numberOfLines={1}>{peso(item.amount)}</Text>
              <Text style={[styles.tableCell, { width: columnWidths.change, color: movementColor }]} numberOfLines={1}>
                {movement ? `${movement.difference > 0 ? '+' : ''}${peso(movement.difference)}  (${percentText(movement.percent)})` : '—'}
              </Text>
            </View>;
          })}
        </View>
      </ScrollView>
      {canScrollLeft && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(247, 250, 244, 0.95)', 'rgba(247, 250, 244, 0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.tableScrollLeftFade}
        />
      )}
      {canScrollRight && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(247, 250, 244, 0)', 'rgba(247, 250, 244, 0.95)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.tableScrollRightFade}
        />
      )}
    </View>
    {card.rows.length > 4 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAll }}
      onPress={() => setShowAll(value => !value)} style={styles.priceExpand}>
      <Text style={styles.expandLabel}>{showAll ? 'Show fewer prices' : `Show all ${card.rows.length} prices`}</Text>
    </Pressable>}
    <Text style={styles.panelFoot}>Saved prices · loaded {timestamp(card.loadedAt)} · scroll table for all columns</Text>
  </View>;
}

function CropCard({ card, width }: { card: Extract<ChatDataCard, { kind: 'crop' }>; width: number }) {
  const [expanded, setExpanded] = useState(false);
  const crop = ALMANAC_CROPS.find(item => item.id === card.cropId);
  if (!crop) return null;
  return <View style={[styles.panel, { width }]}>
    <View style={styles.cropImageWrap}>
      <Image source={crop.image ?? BOTANICAL_PLACEHOLDER} resizeMode="contain" style={styles.cropImage} />
    </View>
    <View style={styles.cropBody}>
      <Text style={styles.panelEyebrow}>ALMANAC</Text>
      <Text style={styles.panelTitle}>{crop.name} <Text style={styles.localName}>({crop.localName})</Text></Text>
      <Text style={styles.scientific}>{crop.scientificName}</Text>
      <Text style={styles.cropSummary}>{crop.summary}</Text>
      {expanded && <View style={styles.cropDetails}>
        <Text style={styles.cropFact}><Text style={styles.factLabel}>Planting season: </Text>{crop.plantingSeason}</Text>
        <Text style={styles.cropFact}><Text style={styles.factLabel}>Harvest: </Text>{crop.daysToHarvest}</Text>
        <Text style={styles.cropFact}><Text style={styles.factLabel}>Sunlight: </Text>{crop.sunlight}</Text>
        <Text style={styles.cropFact}><Text style={styles.factLabel}>Soil and water: </Text>{crop.soilAndWater}</Text>
        <Text style={styles.tipsTitle}>GROWING TIPS</Text>
        {crop.growingTips.map((tip, index) => <Text key={index} style={styles.cropFact}>• {tip}</Text>)}
      </View>}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.expandButton}>
        <Text style={styles.expandLabel}>{expanded ? 'Hide growing details' : 'Show growing details'}</Text>
      </Pressable>
    </View>
  </View>;
}

export function ChatDataCards({ cards }: { cards: ChatDataCard[] }) {
  const { width, fontScale } = useWindowDimensions();
  const calendarWidth = Math.max(180, width - 34);
  const contentWidth = Math.max(180, width - 40);
  const cardHeight = Math.max(194, Math.round(Math.min(calendarWidth / 1.85, 210) * Math.max(1, fontScale)));
  return <View style={styles.stack}>
    {cards.map((card, index) => card.kind === 'weather'
      ? <WeatherCard key={`weather:${index}`} card={card} width={calendarWidth} height={cardHeight} />
      : card.kind === 'prices'
        ? <PricesCard key={`prices:${index}`} card={card} width={contentWidth} />
        : <CropCard key={`crop:${card.cropId}:${index}`} card={card} width={contentWidth} />)}
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 10, marginBottom: 8 },
  weatherCard: { marginLeft: -3, overflow: 'hidden', borderRadius: 20, borderWidth: 2, borderColor: '#285E3D', backgroundColor: '#E6F1E8', padding: 18 },
  weatherArt: { position: 'absolute', top: -4, right: 6 },
  weatherDate: { fontFamily: Fonts.sansSemiBold, color: '#285E3D', fontSize: 16, maxWidth: '70%' },
  weatherTitle: { fontFamily: Fonts.sansSemiBold, color: '#20432D', fontSize: 21, marginTop: 12, maxWidth: '55%' },
  location: { fontFamily: Fonts.sansRegular, color: '#536758', fontSize: 13, marginTop: 4 },
  weatherDetails: { position: 'absolute', left: 18, bottom: 12, maxWidth: '65%' },
  weatherDetail: { fontFamily: Fonts.sansRegular, color: '#415748', fontSize: 11, lineHeight: 16 },
  updatedSmall: { fontFamily: Fonts.sansRegular, color: '#68786E', fontSize: 10, marginTop: 5 },
  weatherValue: { position: 'absolute', right: 18, bottom: 14, alignItems: 'flex-end', maxWidth: '34%' },
  weatherCondition: { fontFamily: Fonts.sansSemiBold, fontSize: 13, lineHeight: 17, color: '#285E3D', textAlign: 'right' },
  weatherTemperature: { fontFamily: Fonts.sansMedium, fontSize: 22, color: '#20432D', marginTop: 3 },
  panel: { borderRadius: 18, borderWidth: 1, borderColor: '#D6E3D6', backgroundColor: '#F7FAF4', overflow: 'hidden', paddingTop: 15 },
  panelEyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.2, color: '#32834E' },
  panelTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 20, color: '#20432D', marginTop: 3 },
  priceHeading: { paddingHorizontal: 15 },
  priceExpand: { alignSelf: 'flex-start', paddingHorizontal: 15, paddingTop: 11 },
  tableRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#E3EBE2' },
  tableHeader: { minHeight: 32, marginTop: 12, backgroundColor: '#EAF3E9' },
  tableAlternate: { backgroundColor: '#F0F6EF' },
  tableHeading: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: '#415748', paddingRight: 6 },
  tableCell: { fontFamily: Fonts.sansMedium, fontSize: 12, color: '#20432D', paddingRight: 6 },
  productCell: { paddingRight: 6 },
  productCol: { width: 104 }, categoryCol: { width: 70 }, priceCol: { width: 72 }, changeCol: { width: 115 },
  productName: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: '#20432D' },
  observed: { fontFamily: Fonts.sansRegular, fontSize: 10, color: '#68786E', marginTop: 2 },
  panelFoot: { fontFamily: Fonts.sansRegular, fontSize: 10, color: '#68786E', paddingHorizontal: 15, paddingVertical: 11 },
  tableWrapper: { position: 'relative', width: '100%' },
  tableScrollLeftFade: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 22, zIndex: 10 },
  tableScrollRightFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 22, zIndex: 10 },
  cropImageWrap: { height: 150, backgroundColor: '#EAF3E9', marginTop: -15, alignItems: 'center', justifyContent: 'center' },
  cropImage: { width: '90%', height: 140 },
  cropBody: { padding: 15 },
  localName: { fontFamily: Fonts.sansRegular, fontSize: 15 },
  scientific: { fontFamily: Fonts.sansRegular, fontSize: 12, fontStyle: 'italic', color: '#68786E', marginTop: 2 },
  cropSummary: { fontFamily: Fonts.sansRegular, fontSize: 13, lineHeight: 19, color: '#415748', marginTop: 10 },
  cropDetails: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#DCE8DE', paddingTop: 10, gap: 7 },
  cropFact: { fontFamily: Fonts.sansRegular, fontSize: 12, lineHeight: 18, color: '#415748' },
  factLabel: { fontFamily: Fonts.sansSemiBold, color: '#20432D' },
  tipsTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1, color: '#32834E', marginTop: 6 },
  expandButton: { marginTop: 13, alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 10 },
  expandLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: '#285E3D' },
});
