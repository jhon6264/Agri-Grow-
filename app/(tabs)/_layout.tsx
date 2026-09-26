import { BlurTargetView, BlurView } from 'expo-blur';
import { Slot, usePathname, useRouter, type Href } from 'expo-router';
import { ChatDatabaseProvider } from '@/src/database/ChatDatabaseProvider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View as NativeView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/chat/AppIcon';
import { ChatDrawer } from '@/components/chat/ChatDrawer';
import { GlassSurface } from '@/components/chat/GlassSurface';
import { Text, View } from '@/components/Themed';
import Colors, { Palette } from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';
import { ChatProvider, useChat } from '@/src/chat/ChatProvider';
import { ChatSurfaceProvider } from '@/src/chat/ChatSurfaceContext';
import { AiProvider, useAI } from '@/src/ai/AiProvider';
import { AiSetupPanel } from '@/components/chat/AiSetupPanel';

const navigationItems = [
  { label: 'Calendar', href: '/' as const, path: '/' },
  { label: 'Chat', href: '/(tabs)/chat' as const, path: '/chat' },
  { label: 'Others', href: '/(tabs)/others' as const, path: '/others' },
];

export default function MainLayout() {
  return <ChatDatabaseProvider fallback={<DatabaseLoadingScreen />}>
    <AiProvider><ChatProvider><MainScaffold /></ChatProvider></AiProvider>
  </ChatDatabaseProvider>;
}

function DatabaseLoadingScreen() {
  return (
    <SafeAreaView style={styles.loadingScreen}>
      <ActivityIndicator color={Palette.forest} size="small" />
      <Text style={styles.loadingLabel}>PREPARING OFFLINE DATA</Text>
    </SafeAreaView>
  );
}

function MainScaffold() {
  const pathname = usePathname();
  const router = useRouter();
  const colors = Colors.light;
  const insets = useSafeAreaInsets();
  const { loading, messages } = useChat();
  const { blocked } = useAI();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.round(width * 0.7);
  const blurTargetRef = useRef<NativeView | null>(null);
  const glassTargetRef = useRef<NativeView | null>(null);
  const drawerProgress = useRef(new Animated.Value(0)).current;
  const animationRevision = useRef(0);
  const drawerTargetOpen = useRef(false);
  const gestureStart = useRef<number | null>(null);
  const gestureDistance = useRef(0);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerPrepared, setDrawerPrepared] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(50);
  const [navigationBottom, setNavigationBottom] = useState(47);
  const isChat = pathname === '/chat';
  const introVisible = isChat && !loading && messages.length === 0;
  useEffect(() => {
    if (!isChat || loading || drawerPrepared) return;
    const idle = requestIdleCallback(() => setDrawerPrepared(true), { timeout: 1000 });
    return () => cancelIdleCallback(idle);
  }, [isChat, loading, drawerPrepared]);

  const animateDrawer = useCallback(
    (open: boolean) => {
      const revision = ++animationRevision.current;
      drawerTargetOpen.current = open;
      drawerProgress.stopAnimation();
      Animated.timing(drawerProgress, {
        toValue: open ? 1 : 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && revision === animationRevision.current && !open) {
          setDrawerMounted(false);
        }
      });
    },
    [drawerProgress],
  );

  const openDrawer = useCallback(() => {
    setDrawerPrepared(true);
    drawerTargetOpen.current = true;
    setDrawerMounted(true);
    if (drawerMounted) animateDrawer(true);
  }, [animateDrawer, drawerMounted]);

  const closeDrawer = useCallback(() => {
    animateDrawer(false);
  }, [animateDrawer]);

  // Start only after the transparent overlay and its blur have committed.
  useEffect(() => {
    if (drawerMounted && drawerTargetOpen.current) animateDrawer(true);
  }, [animateDrawer, drawerMounted]);

  useEffect(() => () => {
    ++animationRevision.current;
    drawerProgress.stopAnimation();
  }, [drawerProgress]);

  useEffect(() => {
    if (!isChat && drawerMounted) {
      closeDrawer();
    }
  }, [closeDrawer, drawerMounted, isChat]);

  useEffect(() => {
    if (!drawerMounted) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerTargetOpen.current) closeDrawer();
      return true;
    });

    return () => subscription.remove();
  }, [closeDrawer, drawerMounted]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: () => {
        const revision = ++animationRevision.current;
        gestureStart.current = null;
        gestureDistance.current = 0;
        drawerProgress.stopAnimation((value) => {
          if (revision !== animationRevision.current) return;
          gestureStart.current = value;
          drawerProgress.setValue(Math.max(0, Math.min(1, value + gestureDistance.current / drawerWidth)));
        });
      },
      onPanResponderMove: (_, gesture) => {
        gestureDistance.current = gesture.dx;
        if (gestureStart.current !== null) {
          drawerProgress.setValue(Math.max(0, Math.min(1, gestureStart.current + gesture.dx / drawerWidth)));
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -drawerWidth * 0.3 || gesture.vx < -0.5) {
          closeDrawer();
        } else {
          animateDrawer(true);
        }
      },
      onPanResponderTerminate: () => animateDrawer(true),
    }),
    [animateDrawer, closeDrawer, drawerProgress, drawerWidth],
  );

  const translateX = drawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth, 0],
    extrapolate: 'clamp',
  });

  const navigationTabs = (
            <View
              accessibilityRole="tablist"
              onLayout={(event) => setNavigationBottom(insets.top + 3 + event.nativeEvent.layout.height)}
              style={[
                styles.segmentedControl,
                {
                  backgroundColor: isChat && !blocked ? 'transparent' : colors.surface,
                  borderColor: isChat ? 'rgba(16, 24, 19, 0.12)' : colors.border,
                },
              ]}>
              {isChat && !blocked && <GlassSurface blurTarget={glassTargetRef} radius={10} suspended={drawerMounted} />}
              {navigationItems.map((item) => {
                const active = pathname === item.path;

                return (
                  <Pressable
                    key={item.href}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => router.replace(item.href)}
                    style={({ pressed }) => [
                      styles.segment,
                      active && styles.activeSegment,
                      pressed && styles.pressedSegment,
                    ]}>
                    <Text
                      style={styles.segmentLabel}
                      lightColor={active ? Palette.white : colors.textSecondary}
                      darkColor={active ? Palette.white : colors.textSecondary}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
  );
  return (
    <NativeView style={[styles.root, { backgroundColor: colors.background }]}>
      <BlurTargetView
        ref={blurTargetRef}
        accessibilityElementsHidden={drawerMounted}
        importantForAccessibility={drawerMounted ? 'no-hide-descendants' : 'auto'}
        style={styles.backgroundTarget}>
        <ChatSurfaceProvider
          drawerMounted={drawerMounted}
          blurTargetRef={blurTargetRef}
          glassTargetRef={glassTargetRef}
          headerHeight={headerHeight}
          navigationTop={insets.top + 3}
          navigationBottom={navigationBottom}
          introVisible={introVisible}>
          {isChat && (
            <View style={[styles.content, styles.chatContent]}><Slot /></View>
          )}
          <View
            onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
            style={[
              styles.navigationShell,
              { paddingTop: insets.top + 3 },
              isChat ? styles.chatNavigationShell : styles.standardNavigationShell,
            ]}>
            {isChat && (
              <Pressable
                accessibilityLabel="Open chat history"
                accessibilityRole="button"
                disabled={blocked}
                accessibilityElementsHidden={blocked}
                importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}
                accessibilityState={{ disabled: blocked }}
                hitSlop={4}
                onPress={openDrawer}
                style={({ pressed }) => [
                  styles.headerIconButton,
                  styles.headerMenuButton,
                  { top: insets.top + 3 },
                  pressed && styles.pressedSegment,
                ]}>
                <AppIcon
                  name={{ ios: 'line.3.horizontal', android: 'menu', web: 'menu' }}
                  fallback="≡"
                  color={colors.text}
                  size={30}
                />
              </Pressable>
            )}
            {pathname === '/' && <Pressable accessibilityRole="button" accessibilityLabel="Add schedule"
              onPress={() => router.push('/add-schedule' as Href)} hitSlop={4}
              style={[styles.headerIconButton, styles.headerMenuButton, { top: insets.top + 3 }]}>
              <AppIcon name={{ ios: 'plus', android: 'add', web: 'add' }} fallback="+" color={colors.text} size={30} />
            </Pressable>}

            <NativeView pointerEvents={isChat && blocked ? "none" : "auto"}
              accessibilityElementsHidden={isChat && blocked} importantForAccessibility={isChat && blocked ? "no-hide-descendants" : "auto"}
              style={{ opacity: isChat && blocked ? 0 : 1 }}>{navigationTabs}</NativeView>
          </View>

          {!isChat && <View style={styles.content}><Slot /></View>}
        </ChatSurfaceProvider>
      </BlurTargetView>

      {isChat && blocked && <>
        <AiSetupPanel top={headerHeight} />
        <NativeView pointerEvents="box-none" style={[styles.navigationShell, styles.chatNavigationShell, { paddingTop: insets.top + 3, zIndex: 6 }]}>{navigationTabs}</NativeView>
      </>}

      {drawerPrepared && !blocked && (
        <NativeView
          accessibilityViewIsModal={drawerMounted}
          accessibilityElementsHidden={!drawerMounted}
          importantForAccessibility={drawerMounted ? 'auto' : 'no-hide-descendants'}
          pointerEvents={drawerMounted ? 'auto' : 'none'}
          style={[StyleSheet.absoluteFill, styles.drawerOverlay, { opacity: drawerMounted ? 1 : 0 }]}>
          {drawerMounted && <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: drawerProgress }]}>
            <BlurView
              blurMethod="dimezisBlurViewSdk31Plus"
              blurTarget={blurTargetRef}
              intensity={36}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
              tint="light"
            />
            <Pressable
              accessibilityElementsHidden
              accessibilityLabel="Chat history is open"
              onPress={() => undefined}
              style={[StyleSheet.absoluteFill, styles.blurBlocker]}
            />
          </Animated.View>}

          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.drawerPanel,
              {
                width: drawerWidth,
                transform: [{ translateX }],
              },
            ]}>
            <ChatDrawer onClose={closeDrawer} active={drawerMounted} />
          </Animated.View>
        </NativeView>
      )}
    </NativeView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: Palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingLabel: {
    color: Palette.forest,
    fontFamily: Fonts.monoSemiBold,
    fontSize: 10,
    letterSpacing: 1.3,
  },
  root: {
    flex: 1,
    backgroundColor: Palette.white,
  },
  backgroundTarget: {
    flex: 1,
    backgroundColor: Palette.white,
    position: 'relative',
  },
  navigationShell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingTop: 3,
    paddingBottom: 3,
    zIndex: 3,
  },
  standardNavigationShell: {
    backgroundColor: Palette.white,
  },
  chatNavigationShell: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    backgroundColor: 'transparent',
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMenuButton: {
    position: 'absolute',
    left: 8,
    zIndex: 2,
  },
  segmentedControl: {
    width: 224,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    flexDirection: 'row',
    padding: 2,
  },
  segment: {
    flex: 1,
    minHeight: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  activeSegment: {
    backgroundColor: Palette.nearBlack,
  },
  pressedSegment: {
    opacity: 0.62,
  },
  segmentLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
  },
  content: {
    flex: 1,
    zIndex: 1,
  },
  chatContent: {
    backgroundColor: 'transparent',
  },
  blurBlocker: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  drawerOverlay: {
    backgroundColor: 'transparent',
  },
  drawerPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Palette.white,
    shadowColor: Palette.nearBlack,
    shadowOffset: { width: 7, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 12,
  },
});
