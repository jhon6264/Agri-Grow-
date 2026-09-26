import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/chat/AppIcon';
import { GlassSurface } from '@/components/chat/GlassSurface';
import { useChatSurface } from '@/src/chat/ChatSurfaceContext';
import { Text } from '@/components/Themed';
import Colors, { Palette } from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';
import type { PhotoAttachment } from '@/src/chat/chat-types';
import { PhotoPreview } from './PhotoPreview';
import { LeafLoader } from '@/components/ui/LeafLoader';

type ChatComposerProps = {
  draft: string;
  keyboardVisible: boolean;
  onChangeDraft: (value: string) => void;
  onHeightChange?: (height: number) => void;
  onTopOffsetChange?: (offset: number) => void;
  onSend: () => void;
  disabled?: boolean;
  generating?: boolean;
  savingSchedule?: boolean;
  preparingPhoto?: boolean;
  attachment?: PhotoAttachment;
  onAttach?: () => void;
  onRemoveAttachment?: () => void;
  onStop?: () => void;
};

export function ChatComposer({
  draft,
  keyboardVisible,
  onChangeDraft,
  onHeightChange,
  onTopOffsetChange,
  onSend,
  disabled = false, generating = false, savingSchedule = false, preparingPhoto = false, attachment, onAttach, onRemoveAttachment, onStop,
}: ChatComposerProps) {
  const colors = Colors.light;
  const insets = useSafeAreaInsets();
  const { glassTargetRef, drawerMounted } = useChatSurface();
  const canSend = !disabled && !preparingPhoto && (draft.trim().length > 0 || !!attachment);

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={[
        styles.shell,
        { paddingBottom: (keyboardVisible ? 8 : Math.max(insets.bottom, 8)) + 11 },
      ]}>
      {attachment && <View style={{ width: '84%', alignSelf: 'center' }}><PhotoPreview photo={attachment} compact onRemove={!generating ? onRemoveAttachment : undefined} /></View>}
      {preparingPhoto && <View style={{ alignSelf: 'center' }}><LeafLoader size={32} accessibilityLabel="Preparing photo" /></View>}
      <View onLayout={(event) => onTopOffsetChange?.(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
        style={[styles.composer, { borderColor: colors.border }]}>
        <GlassSurface blurTarget={glassTargetRef} radius={22.5} suspended={drawerMounted} />
        <Pressable
          accessibilityLabel="Attach a photo"
          accessibilityRole="button"
          accessibilityState={{ disabled: disabled || generating || savingSchedule || preparingPhoto }}
          disabled={disabled || generating || savingSchedule || preparingPhoto}
          onPress={onAttach}
          hitSlop={4}
          style={styles.addButton}>
          <AppIcon
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            fallback="+"
            color={colors.textSecondary}
            size={22}
          />
        </Pressable>

        <TextInput
          accessibilityLabel="Message AgriGrow AI"
          multiline
          onChangeText={onChangeDraft}
          placeholder="Ask about your crops..."
          placeholderTextColor={colors.textSecondary}
          selectionColor={colors.primaryInteractive}
          style={[styles.input, { color: colors.text }]}
          value={draft}
          editable={!disabled && !generating && !savingSchedule && !preparingPhoto}
        />

        <Pressable
          accessibilityLabel={savingSchedule ? 'Saving schedule' : generating ? 'Stop response' : 'Send message'}
          accessibilityRole="button"
          accessibilityState={{ disabled: savingSchedule || (!generating && !canSend) }}
          disabled={savingSchedule || (!generating && !canSend)}
          hitSlop={4}
          onPress={generating ? onStop : onSend}
          style={({ pressed }) => [
            styles.sendButton,
            {
              backgroundColor: colors.primary,
              opacity: savingSchedule || (!canSend && !generating) ? 0.3 : pressed ? 0.78 : 1,
            },
          ]}>
          <Text style={styles.sendIcon} lightColor={Palette.white} darkColor={Palette.white}>{savingSchedule ? '…' : generating ? '■' : '↑'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
        AI guidance may be inaccurate. Verify important farming decisions.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingTop: 7,
  },
  composer: {
    width: '84%',
    alignSelf: 'center',
    borderRadius: 22.5,
    minHeight: 45,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 5,
    shadowColor: Palette.nearBlack,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.055,
    shadowRadius: 18,
    elevation: 2,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 7,
    paddingTop: 8,
    paddingBottom: 8,
    includeFontPadding: false,
    fontFamily: Fonts.sansMedium,
    fontSize: 17,
    lineHeight: 24,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    fontFamily: Fonts.monoBold,
    fontSize: 20,
    lineHeight: 22,
  },
  disclaimer: {
    backgroundColor: 'transparent',
    fontFamily: Fonts.sansRegular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    textAlign: 'center',
  },
});
