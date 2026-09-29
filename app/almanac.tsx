import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { BlurTargetView } from 'expo-blur';
import {
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailEdgeFades, DetailHeader } from '@/components/others/DetailHeader';
import { FloatingSearchBar, FLOATING_SEARCH_CONTENT_TOP } from '@/components/others/FloatingSearchBar';
import { ParchmentCardTexture } from '@/components/others/ParchmentCardTexture';
import { Fonts } from '@/constants/Typography';
import { ALMANAC_CROPS, BOTANICAL_PLACEHOLDER, type AlmanacCrop } from '@/src/others/almanac-data';

export default function AlmanacScreen() {
  const insets = useSafeAreaInsets();
  const blurTarget = useRef<View | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCrop, setSelectedCrop] = useState<AlmanacCrop | null>(null);

  const filteredCrops = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALMANAC_CROPS.filter((crop) => {
      return (
        !q ||
        crop.localName.toLowerCase().includes(q) ||
        crop.name.toLowerCase().includes(q) ||
        crop.scientificName.toLowerCase().includes(q)
      );
    });
  }, [query]);

  return (
    <View style={styles.screen}>
      <BlurTargetView ref={blurTarget} style={styles.scrollSurface}>
        <FlatList
          data={filteredCrops}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CropCard crop={item} onPress={() => setSelectedCrop(item)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          contentContainerStyle={[
            styles.body,
            { paddingTop: insets.top + FLOATING_SEARCH_CONTENT_TOP, paddingBottom: insets.bottom + 60 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No crops match your search.</Text>
              <Pressable
                onPress={() => setQuery('')}
                style={styles.resetBtn}>
                <Text style={styles.resetBtnText}>Clear search</Text>
              </Pressable>
            </View>
          }
        />
      </BlurTargetView>

      <DetailEdgeFades />
      <DetailHeader title="Almanac" blurTarget={blurTarget} />
      <FloatingSearchBar
        blurTarget={blurTarget}
        value={query}
        onChangeText={setQuery}
        placeholder="Search crops..."
        accessibilityLabel="Search crops"
      />

      {/* Crop Details Modal */}
      {selectedCrop && (
        <CropDetailModal
          crop={selectedCrop}
          onClose={() => setSelectedCrop(null)}
        />
      )}
    </View>
  );
}

const CropCard = memo(function CropCard({
  crop,
  onPress,
}: {
  crop: AlmanacCrop;
  onPress: () => void;
}) {
  const categoryBadge =
    crop.category === 'fruits'
      ? { bg: '#FFF4E5', text: '#B25E00', label: 'FRUIT' }
      : crop.category === 'vegetables'
      ? { bg: '#EBF5EB', text: '#216C37', label: 'VEGETABLE' }
      : crop.category === 'leafy_greens'
      ? { bg: '#E3F4E8', text: '#196135', label: 'LEAFY GREEN' }
      : crop.category === 'root_crops'
      ? { bg: '#F5ECE1', text: '#8A521E', label: 'ROOT CROP' }
      : crop.category === 'grains'
      ? { bg: '#FEF8E3', text: '#9B780D', label: 'GRAIN' }
      : { bg: '#FDECEF', text: '#B8283B', label: 'SPICE' };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${crop.localName}, ${crop.name}. Tap to view growing details`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}>
      <ParchmentCardTexture />
      <View style={styles.cardImageContainer}>
        <Image
          source={crop.image ?? BOTANICAL_PLACEHOLDER}
          style={[styles.cardImage, !crop.image && styles.placeholderCardImage]}
          resizeMode="contain"
        />
      </View>
      <View style={styles.cardInfo}>
        <View style={styles.cardHeader}>
          <Text style={styles.localName}>{crop.localName}</Text>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: categoryBadge.bg },
            ]}>
            <Text
              style={[
                styles.categoryBadgeText,
                { color: categoryBadge.text },
              ]}>
              {categoryBadge.label}
            </Text>
          </View>
        </View>

        <Text style={styles.englishName} numberOfLines={1}>
          {crop.name}
        </Text>
        <Text style={styles.scientificName} numberOfLines={1}>
          {crop.scientificName}
        </Text>

        <Text style={styles.viewMore}>View crop ›</Text>
      </View>
    </Pressable>
  );
});

function CropDetailModal({
  crop,
  onClose,
}: {
  crop: AlmanacCrop;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const scrollOffset = useRef(0);
  const closing = useRef(false);
  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = translateY.interpolate({
    inputRange: [0, height],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const show = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const dismiss = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(translateY, {
      toValue: height,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
      else closing.current = false;
    });
  }, [height, onClose, translateY]);

  const moveSheet = useCallback((dy: number) => {
    if (closing.current) return;
    translateY.setValue(Math.max(0, dy));
  }, [translateY]);

  const releaseSheet = useCallback((dy: number, vy: number) => {
    if (closing.current) return;
    if (dy > 80 || vy > 0.7) {
      dismiss();
    } else {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    }
  }, [dismiss, translateY]);

  const handlePanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      !closing.current && gesture.dy > 6 && gesture.dy > Math.abs(gesture.dx) * 1.2,
    onPanResponderMove: (_, gesture) => moveSheet(gesture.dy),
    onPanResponderRelease: (_, gesture) => releaseSheet(gesture.dy, gesture.vy),
    onPanResponderTerminate: () => {
      if (!closing.current) Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [moveSheet, releaseSheet, translateY]);

  const contentPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      !closing.current && scrollOffset.current <= 2 && gesture.dy > 12 && gesture.dy > Math.abs(gesture.dx) * 1.2,
    onMoveShouldSetPanResponder: (_, gesture) =>
      !closing.current && scrollOffset.current <= 2 && gesture.dy > 12 && gesture.dy > Math.abs(gesture.dx) * 1.2,
    onPanResponderMove: (_, gesture) => moveSheet(gesture.dy),
    onPanResponderRelease: (_, gesture) => releaseSheet(gesture.dy, gesture.vy),
    onPanResponderTerminate: () => {
      if (!closing.current) Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [moveSheet, releaseSheet, translateY]);

  return (
    <Modal
      animationType="none"
      transparent
      visible
      onShow={show}
      onRequestClose={dismiss}>
      <View style={styles.modalOverlay}>
        <Animated.View pointerEvents="none" style={[styles.modalShade, { opacity: backdropOpacity }]} />
        <Pressable style={styles.modalBackdrop} onPress={dismiss} />
        <Animated.View
          style={[
            styles.modalSheet,
            { paddingBottom: Math.max(24, insets.bottom + 12) },
            { transform: [{ translateY }] },
          ]}>
          <ParchmentCardTexture />
          <View style={styles.modalTopBar} {...handlePanResponder.panHandlers}>
            <View style={styles.modalDragHandle} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close crop"
              onPress={dismiss}
              hitSlop={8}
              style={styles.modalCloseLabel}>
              <Text style={styles.modalCloseLabelText}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.modalContent} {...contentPanResponder.panHandlers}>
            <ScrollView
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
              onScroll={(event) => { scrollOffset.current = Math.max(0, event.nativeEvent.contentOffset.y); }}
              scrollEventThrottle={16}
              contentContainerStyle={styles.modalScroll}>
            {/* Header with image */}
            <View style={styles.modalHeader}>
              <View style={styles.modalImageWrapper}>
                <Image
                  source={crop.image ?? BOTANICAL_PLACEHOLDER}
                  style={[styles.modalImage, !crop.image && styles.placeholderModalImage]}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.modalTitleBlock}>
                <Text style={styles.modalLocalName}>{crop.localName}</Text>
                <Text style={styles.modalEnglishName}>{crop.name}</Text>
                <Text style={styles.modalScientificName}>
                  {crop.scientificName}
                </Text>
              </View>
            </View>

            {/* Summary */}
            <Text style={styles.modalSummary}>{crop.summary}</Text>

            {/* Specification Grid */}
            <View style={styles.specGrid}>
              <View style={styles.specBox}>
                <Text style={styles.specLabel}>PLANTING SEASON</Text>
                <Text style={styles.specValue}>{crop.plantingSeason}</Text>
              </View>
              <View style={styles.specBox}>
                <Text style={styles.specLabel}>DAYS TO HARVEST</Text>
                <Text style={styles.specValue}>{crop.daysToHarvest}</Text>
              </View>
              <View style={styles.specBox}>
                <Text style={styles.specLabel}>SUNLIGHT NEEDS</Text>
                <Text style={styles.specValue}>{crop.sunlight}</Text>
              </View>
              <View style={styles.specBox}>
                <Text style={styles.specLabel}>SOIL & WATERING</Text>
                <Text style={styles.specValue}>{crop.soilAndWater}</Text>
              </View>
            </View>

            {/* Growing Tips */}
            <Text style={styles.tipsHeading}>FARMING & GROWING TIPS</Text>
            {crop.growingTips.map((tip, index) => (
              <View key={index} style={styles.tipRow}>
                <Text style={styles.tipBullet}>•</Text>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7FAF4' },
  scrollSurface: { flex: 1 },
  body: { paddingHorizontal: 17 },

  cropsGrid: {
    gap: 12,
  },
  card: {
    backgroundColor: '#F1D8AC',
    borderWidth: 1,
    borderColor: '#CEAD7C',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardImageContainer: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  placeholderCardImage: {
    opacity: 0.65,
    transform: [{ scale: 0.88 }],
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  localName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 18,
    color: '#163D28',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontFamily: Fonts.monoMedium,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  englishName: {
    fontFamily: Fonts.sansRegular,
    fontSize: 13,
    color: '#4B6350',
    marginTop: 1,
  },
  scientificName: {
    fontFamily: Fonts.sansRegular,
    fontStyle: 'italic',
    fontSize: 12,
    color: '#665C46',
    marginTop: 1,
  },
  viewMore: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    color: '#1D6438',
    marginTop: 10,
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DFE8DD',
    gap: 12,
  },
  emptyText: {
    fontFamily: Fonts.sansRegular,
    color: '#748575',
    fontSize: 14,
  },
  resetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#EDF4EB',
    borderRadius: 12,
  },
  resetBtnText: {
    fontFamily: Fonts.sansMedium,
    color: '#1E5834',
    fontSize: 13,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 24, 15, 0.45)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  modalSheet: {
    backgroundColor: '#F1D8AC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    paddingHorizontal: 20,
    paddingTop: 10,
    overflow: 'hidden',
  },
  modalTopBar: {
    height: 35,
    justifyContent: 'center',
    marginBottom: 8,
  },
  modalDragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#A88B61',
    alignSelf: 'center',
  },
  modalCloseLabel: {
    position: 'absolute',
    right: 0,
    top: 0,
    minWidth: 56,
    minHeight: 35,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  modalCloseLabelText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: '#225333',
  },
  modalContent: {
    flexShrink: 1,
    minHeight: 0,
  },
  modalScrollView: {
    flexShrink: 1,
  },
  modalScroll: {
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  modalImageWrapper: {
    width: 96,
    height: 96,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  placeholderModalImage: {
    opacity: 0.72,
    transform: [{ scale: 0.9 }],
  },
  modalTitleBlock: {
    flex: 1,
  },
  modalLocalName: {
    fontFamily: Fonts.sansBold,
    fontSize: 24,
    color: '#163D28',
  },
  modalEnglishName: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
    color: '#3B5742',
    marginTop: 2,
  },
  modalScientificName: {
    fontFamily: Fonts.sansRegular,
    fontStyle: 'italic',
    fontSize: 13,
    color: '#5D634B',
    marginTop: 2,
  },
  modalSummary: {
    fontFamily: Fonts.sansRegular,
    fontSize: 14.5,
    lineHeight: 22,
    color: '#284633',
    marginBottom: 18,
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 20,
  },
  specBox: {
    width: '48%',
    backgroundColor: 'rgba(255, 249, 231, 0.48)',
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D5B988',
  },
  specLabel: {
    fontFamily: Fonts.monoMedium,
    fontSize: 9.5,
    letterSpacing: 1,
    color: '#5C684C',
    marginBottom: 4,
  },
  specValue: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    color: '#1B3B26',
    lineHeight: 18,
  },
  tipsHeading: {
    fontFamily: Fonts.monoMedium,
    fontSize: 10.5,
    letterSpacing: 1.1,
    color: '#536E58',
    marginBottom: 10,
    marginTop: 4,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 9,
  },
  tipBullet: {
    color: '#7B623E',
    fontSize: 20,
    lineHeight: 20,
  },
  tipText: {
    flex: 1,
    fontFamily: Fonts.sansRegular,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#284533',
  },
});
