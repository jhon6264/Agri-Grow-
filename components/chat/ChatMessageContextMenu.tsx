import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { RefObject, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  View as NativeView,
} from 'react-native';

import { AppIcon } from '@/components/chat/AppIcon';
import { ChatMessageSurface, type SelectedMessage } from '@/components/chat/ChatMessage';
import { Text } from '@/components/Themed';
import Colors, { Palette } from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';

type ChatMessageContextMenuProps = {
  blurTarget: RefObject<NativeView | null>;
  selection: SelectedMessage | null;
  onClose: () => void;
};

export function ChatMessageContextMenu({
  blurTarget,
  selection,
  onClose,
}: ChatMessageContextMenuProps) {
  const colors = Colors.light;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const selectedScale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (!selection) return;

    overlayOpacity.setValue(0);
    selectedScale.setValue(0.96);
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.spring(selectedScale, {
        toValue: 1.035,
        damping: 12,
        stiffness: 210,
        mass: 0.72,
        useNativeDriver: true,
      }),
    ]).start();
  }, [overlayOpacity, selectedScale, selection]);

  const menuPosition = useMemo(() => {
    if (!selection) return { left: 12, top: 12 };

    const menuWidth = 126;
    const menuHeight = 50;
    const left = Math.max(
      12,
      Math.min(screenWidth - menuWidth - 12, selection.frame.x + selection.frame.width - menuWidth),
    );
    const preferredTop = selection.frame.y - menuHeight - 10;
    const fallbackTop = selection.frame.y + selection.frame.height + 10;
    const top = preferredTop >= 12
      ? preferredTop
      : Math.min(screenHeight - menuHeight - 12, fallbackTop);

    return { left, top };
  }, [screenHeight, screenWidth, selection]);

  const copy = async () => {
    if (!selection) return;
    await Clipboard.setStringAsync(selection.message.content);
    onClose();
  };

  if (!selection) return null;

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible>
      <View accessibilityViewIsModal style={styles.contextRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>
          <BlurView
            blurMethod="dimezisBlurViewSdk31Plus"
            blurTarget={blurTarget}
            intensity={48}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            tint="light"
          />
          <View style={styles.contextDim} />
        </Animated.View>

        <Pressable
          accessibilityLabel="Close message actions"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.liftedMessage,
            {
              left: selection.frame.x,
              top: selection.frame.y,
              width: selection.frame.width,
              opacity: overlayOpacity,
              transform: [{ scale: selectedScale }],
            },
          ]}>
          <ChatMessageSurface message={selection.message} block={selection.block} />
        </Animated.View>

        <Animated.View
          style={[
            styles.contextMenu,
            menuPosition,
            { opacity: overlayOpacity },
          ]}>
          <Pressable
            accessibilityRole="menuitem"
            onPress={() => void copy()}
            style={({ pressed }) => [styles.copyAction, pressed && styles.copyPressed]}>
            <AppIcon
              name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
              fallback="C"
              color={colors.text}
              size={18}
            />
            <Text style={styles.copyLabel}>Copy</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  contextRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  contextDim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(16, 24, 19, 0.12)',
  },
  liftedMessage: {
    position: 'absolute',
    zIndex: 2,
  },
  contextMenu: {
    position: 'absolute',
    width: 126,
    minHeight: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: 'rgba(16, 24, 19, 0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    shadowColor: Palette.nearBlack,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.16,
    shadowRadius: 15,
    elevation: 14,
    zIndex: 3,
  },
  copyAction: {
    minHeight: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 15,
  },
  copyPressed: {
    backgroundColor: Palette.softWhite,
  },
  copyLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: Palette.nearBlack,
  },
});
