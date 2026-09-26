import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Keyboard, StyleSheet, Text, View } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { AttachPhotoModal } from '@/components/chat/AttachPhotoModal';
import type { SelectedMessage } from '@/components/chat/ChatMessage';
import { ChatMessageContextMenu } from '@/components/chat/ChatMessageContextMenu';
import { ChatMessageList } from '@/components/chat/ChatMessageList';
import { ChatWallpaper, ChatEdgeFades } from '@/components/chat/ChatWallpaper';
import { useChat } from '@/src/chat/ChatProvider';
import { useChatSurface } from '@/src/chat/ChatSurfaceContext';
import { useAI } from '@/src/ai/AiProvider';
import { requireAI } from '@/src/ai/native';
import type { PhotoAttachment } from '@/src/chat/chat-types';
import { LeafLoader } from '@/components/ui/LeafLoader';

export default function ChatScreen() {
  const { activeConversation, messages, loading, hasOlderMessages, loadingOlderMessages, loadOlderMessages, sendAI, stopAI, generating, savingSchedule, reviewingSchedule, aiError } = useChat();
  const { blurTargetRef, glassTargetRef, headerHeight, navigationTop, navigationBottom, introVisible } = useChatSurface();
  const ai = useAI();
  const router = useRouter();
  const setupTarget = useRef<View | null>(null);
  const live = useRef(true);
  const picking = useRef(false);
  const sending = useRef(false);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<PhotoAttachment>();
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [attachModalVisible, setAttachModalVisible] = useState(false);
  const [error, setError] = useState('');
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const [composerHeight, setComposerHeight] = useState(92);
  const [composerOffset, setComposerOffset] = useState(52);
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  const [selectedMessage, setSelectedMessage] = useState<SelectedMessage | null>(null);

  useEffect(() => { live.current = true; return () => { live.current = false; stopAI(); }; }, [stopAI]);
  useEffect(() => {
    if (!ai.blocked) return;
    Keyboard.dismiss(); setSelectedMessage(null);
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { router.replace('/'); return true; });
    return () => sub.remove();
  }, [ai.blocked, router]);

  const pick = async (camera: boolean) => {
    if (picking.current || generating || ai.blocked) return;
    picking.current = true; setError('');
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        Alert.alert('Camera access needed', 'Allow camera access in Android settings, or choose a photo instead.'); return;
      }
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false, base64: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1, exif: false, base64: false });
      if (result.canceled || !live.current) return;
      setPreparingPhoto(true);
      const photo = await requireAI().preparePhoto(result.assets[0].uri);
      if (live.current) setAttachment(photo);
    } catch { if (live.current) setError('This photo could not be prepared. Please choose another photo.'); }
    finally { picking.current = false; if (live.current) setPreparingPhoto(false); }
  };

  const send = async () => {
    if (sending.current || generating || ai.blocked || preparingPhoto || (!draft.trim() && !attachment)) return;
    sending.current = true; setError('');
    const currentDraft = draft;
    const currentAttachment = attachment;
    setDraft('');
    setAttachment(undefined);
    try {
      await sendAI(currentDraft, currentAttachment);
    } catch (reason) {
      if (live.current) {
        setDraft(currentDraft);
        setAttachment(currentAttachment);
        setError(reason instanceof Error ? reason.message : 'Unable to send. Your draft has been kept.');
      }
    } finally {
      sending.current = false;
    }
  };

  return <View style={styles.screen} onLayout={({ nativeEvent: { layout } }) => setSurfaceSize({ width: layout.width, height: layout.height })}>
    <BlurTargetView ref={setupTarget} style={styles.screen} pointerEvents={ai.blocked ? 'none' : 'auto'}
      accessibilityElementsHidden={ai.blocked} importantForAccessibility={ai.blocked ? 'no-hide-descendants' : 'auto'}>
      <BlurTargetView ref={glassTargetRef} style={styles.screen}>
        <ChatWallpaper {...surfaceSize} />
        {!loading && <ChatMessageList key={activeConversation?.id ?? 'empty'} bouncingMessageId={null} composerHeight={composerHeight}
          contextMenuOpen={!!selectedMessage} headerHeight={headerHeight} introVisible={introVisible} messages={messages}
          hasOlderMessages={hasOlderMessages} loadingOlderMessages={loadingOlderMessages} loadOlderMessages={loadOlderMessages} onLongPressMessage={setSelectedMessage} />}
      </BlurTargetView>
      {!introVisible && <ChatEdgeFades {...surfaceSize} navigationTop={navigationTop} navigationBottom={navigationBottom} composerHeight={composerHeight} composerOffset={composerOffset} />}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }} pointerEvents="box-none" style={styles.composerOverlay}>
        {reviewingSchedule && <View style={styles.scheduleLoading}>
          <LeafLoader size={26} accessibilityLabel="Reviewing schedule" /><Text style={styles.scheduleLoadingText}>Reviewing schedule…</Text>
        </View>}
        {!!(error || aiError) && <Text accessibilityRole="alert" style={styles.error}>{error || aiError}</Text>}
        <ChatComposer draft={draft} keyboardVisible={keyboardVisible} onChangeDraft={setDraft} onHeightChange={setComposerHeight}
          onTopOffsetChange={setComposerOffset} onSend={() => void send()} disabled={ai.blocked} generating={generating} savingSchedule={savingSchedule}
          preparingPhoto={preparingPhoto} attachment={attachment} onRemoveAttachment={() => setAttachment(undefined)} onStop={stopAI}
          onAttach={() => setAttachModalVisible(true)} />
      </KeyboardStickyView>
    </BlurTargetView>
    <ChatMessageContextMenu blurTarget={blurTargetRef} onClose={() => setSelectedMessage(null)} selection={selectedMessage} />
    <AttachPhotoModal
      visible={attachModalVisible}
      onClose={() => setAttachModalVisible(false)}
      onTakePhoto={() => void pick(true)}
      onChoosePhoto={() => void pick(false)}
    />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent', position: 'relative', overflow: 'hidden' },
  composerOverlay: { position: 'absolute', right: 0, bottom: 0, left: 0, zIndex: 2, backgroundColor: 'transparent' },
  error: { alignSelf: 'center', maxWidth: '90%', backgroundColor: '#FFF1ED', color: '#8E3430', padding: 10, borderRadius: 10, fontSize: 13 },
  scheduleLoading: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14,
    paddingVertical: 6, borderRadius: 16, backgroundColor: '#F6FAF7' },
  scheduleLoadingText: { fontSize: 13, color: '#285E3D' },
});
