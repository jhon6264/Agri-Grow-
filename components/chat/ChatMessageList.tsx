import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useRef, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { ScrollViewProps, ViewToken } from 'react-native';
import { KeyboardChatScrollView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSharedValue } from 'react-native-reanimated';
import { ChatMessage } from '@/components/chat/ChatMessage';
import type { SelectedMessage } from '@/components/chat/ChatMessage';
import { WelcomeMascot } from '@/components/chat/WelcomeMascot';
import { RotatingGreeting } from '@/components/chat/RotatingGreeting';
import { AppIcon } from '@/components/chat/AppIcon';
import Colors from '@/constants/Colors';
import { useChatSurface } from '@/src/chat/ChatSurfaceContext';
import type { ChatMessage as Message } from '@/src/chat/chat-types';
import { compareMessages, messageBlocks, shouldFollowMessage } from '@/src/chat/message-data';
import type { MessageBlock } from '@/src/chat/message-data';

type ChatScrollProps = ScrollViewProps & {
  chatRef: React.RefObject<ScrollView | null>;
  onEndVisible: (visible: boolean) => void;
};

// Preserve FlatList's internal ref as well as a ref for keyboard-aware scrollToEnd.
const ChatScroll = forwardRef<ScrollView, ChatScrollProps>(function ChatScroll(
  { chatRef, onEndVisible, ...props }, ref,
) {
  const zeroPadding = useSharedValue(0);
  const assignRef = useCallback((instance: ScrollView | null) => {
    chatRef.current = instance;
    if (typeof ref === 'function') ref(instance);
    else if (ref) ref.current = instance;
  }, [chatRef, ref]);

  return (
    <KeyboardChatScrollView
      {...props}
      ref={assignRef}
      keyboardLiftBehavior="whenAtEnd"
      extraContentPadding={zeroPadding}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      onEndVisible={onEndVisible}
    />
  );
});

type Props = {
  messages: Message[];
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  loadOlderMessages: () => Promise<void>;
  bouncingMessageId: string | null;
  composerHeight: number;
  contextMenuOpen: boolean;
  headerHeight: number;
  introVisible: boolean;
  onLongPressMessage: (selection: SelectedMessage) => void;
};

const keyExtractor = (block: MessageBlock) => block.key;
const Separator = ({ leadingItem }: { leadingItem?: MessageBlock }) => leadingItem?.last ? <View style={styles.separator} /> : null;
const preservePosition = Platform.OS === 'ios' ? { minIndexForVisible: 0 } : undefined;

export const ChatMessageList = memo(function ChatMessageList({
  messages,
  bouncingMessageId,
  composerHeight,
  contextMenuOpen,
  headerHeight,
  introVisible,
  onLongPressMessage,
  hasOlderMessages,
  loadingOlderMessages,
  loadOlderMessages,
}: Props) {
  const { drawerMounted } = useChatSurface();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const keyboardHeight = useKeyboardState((state) => state.height);
  const { height, fontScale } = useWindowDimensions();
  const mascotSize = Math.min(192, Math.max(0, height - headerHeight - composerHeight - 64 * fontScale - 36));
  const scrollRef = useRef<ScrollView | null>(null);
  const listRef = useRef<FlatList<MessageBlock> | null>(null);
  const blocks = useMemo(() => messages.flatMap(messageBlocks), [messages]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const atEnd = useRef(true);
  const previousLastId = useRef<string | undefined>(undefined);
  const frameRequest = useRef<number | null>(null);
  const pending = useRef<{ key: string; animated: boolean; attempts: number } | null>(null);
  const lastVisible = useRef<string | null>(null);
  const dragged = useRef(false);
  const gestureActive = useRef(false);
  const lastStreamingMessageId = useRef<string | null>(null);
  const olderLoadAllowed = useRef(false);
  const [played] = useState(() => new Set(messages.map((message) => message.id)));
  const newestOnMount = useRef(messages[messages.length - 1]);
  const markPlayed = useCallback((id: string) => { played.add(id); }, [played]);
  const handleLongPress = useCallback((selection: SelectedMessage) => {
    const current = messagesRef.current.find(item => item.id === selection.message.id);
    onLongPressMessage(current ? { ...selection, message: current } : selection);
  }, [onLongPressMessage]);

  const [listHeight, setListHeight] = useState(0);
  const [rawContentHeight, setRawContentHeight] = useState(0);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const currentKeyboardHeight = keyboardVisible ? Math.max(0, Math.abs(keyboardHeight)) : 0;
  // Available vertical room from top of screen to top edge of composer:
  // Android's resize mode already removes the keyboard from the list viewport.
  const composerTop = Math.max(0, listHeight - (Platform.OS === 'ios' ? currentKeyboardHeight : 0) - composerHeight);
  // Full when the bottom-most word/message reaches within 5px of the composer:
  const isSpaceFull = blocks.length > 0 && composerTop > 0 && rawContentHeight >= (composerTop - 5);
  // Lock scrolling when chat area is not full:
  const canUserScroll = !contextMenuOpen;

  const lastMessage = messages[messages.length - 1];
  const isStreaming = lastMessage?.role === 'assistant' && lastMessage?.status === 'streaming';
  useLayoutEffect(() => {
    if (isStreaming && lastMessage) lastStreamingMessageId.current = lastMessage.id;
  }, [isStreaming, lastMessage?.id]);

  const scrollToBottom = useCallback((animated: boolean = true) => {
    if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current);
    frameRequest.current = requestAnimationFrame(() => {
      frameRequest.current = null;
      scrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const resolveScroll = useCallback(() => {
    if (!pending.current) return;
    if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current);
    frameRequest.current = requestAnimationFrame(() => {
      frameRequest.current = null;
      const request = pending.current;
      if (!request) return;
      if (lastVisible.current === request.key) {
        pending.current = null;
        scrollRef.current?.scrollToEnd({ animated: request.animated });
      } else if (request.attempts < 3 && blocksRef.current.length > 0) {
        request.attempts++;
        listRef.current?.scrollToIndex({ index: Math.max(0, blocksRef.current.length - 1), animated: false, viewPosition: 1 });
      } else {
        pending.current = null;
        scrollRef.current?.scrollToEnd({ animated: false });
      }
    });
  }, []);

  useEffect(() => () => {
    if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current);
  }, []);

  // Once the response fills the viewport, follow without starting a competing scroll animation.
  useEffect(() => {
    if (isSpaceFull && !keyboardVisible) {
      if (isStreaming && !dragged.current) {
        pending.current = null;
        scrollToBottom(false);
      } else {
        resolveScroll();
      }
    }
  }, [isSpaceFull, isStreaming, keyboardVisible, scrollToBottom, resolveScroll]);

  // Handle new message insertion
  useLayoutEffect(() => {
    const last = messages[messages.length - 1];
    if (last && last.id !== previousLastId.current) {
      const initial = previousLastId.current === undefined;
      if (shouldFollowMessage(initial, last.role, atEnd.current)) {
        if (blocks.length > 0) {
          pending.current = { key: blocks[blocks.length - 1].key, animated: false, attempts: 0 };
        }
        dragged.current = false;
        if (isSpaceFull && !keyboardVisible) {
          resolveScroll();
        }
      }
      previousLastId.current = last.id;
    }
  }, [messages, blocks, isSpaceFull, keyboardVisible, resolveScroll]);

  const onEndVisible = useCallback((visible: boolean) => {
    atEnd.current = visible;
    if (visible && !gestureActive.current) {
      dragged.current = false;
      setShowScrollDown(false);
    }
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<MessageBlock>[] }) => {
    const last = blocksRef.current[blocksRef.current.length - 1];
    lastVisible.current = last && viewableItems.some((item) => item.key === last.key) ? last.key : null;
    if (pending.current && lastVisible.current === pending.current.key && isSpaceFull && !keyboardVisible) {
      resolveScroll();
    }
  }, [resolveScroll, isSpaceFull, keyboardVisible]);

  const renderScroll = useCallback((props: ScrollViewProps) => (
    <ChatScroll {...props} chatRef={scrollRef} onEndVisible={onEndVisible} />
  ), [onEndVisible]);

  const renderItem = useCallback(({ item }: { item: MessageBlock }) => (
    <ChatMessage
      message={item.message}
      block={item}
      bounce={!item.segmented && item.message.id === bouncingMessageId}
      animateEntrance={!item.segmented && !played.has(item.message.id)
        && (!newestOnMount.current || compareMessages(item.message, newestOnMount.current) > 0)}
      onEntrancePlayed={markPlayed}
      onLongPress={handleLongPress}
    />
  ), [bouncingMessageId, markPlayed, played, handleLongPress]);

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={blocks}
        maintainVisibleContentPosition={preservePosition}
        onViewableItemsChanged={onViewableItemsChanged}
        onLayout={(e) => {
          setListHeight(e.nativeEvent.layout.height);
        }}
        onScrollToIndexFailed={({ averageItemLength, index }) => {
          if (index >= 0) {
            listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
          }
          if (isSpaceFull) {
            scrollToBottom(false);
          }
        }}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderScrollComponent={renderScroll}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={[
          styles.content,
          {
            justifyContent: 'flex-start',
            paddingTop: headerHeight + 20,
            paddingBottom: composerHeight + 16,
          },
        ]}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={canUserScroll}
        bounces={isSpaceFull}
        onContentSizeChange={(w, h) => {
          const currentPaddingBottom = composerHeight + 16;
          const rawHeight = Math.max(0, h - currentPaddingBottom);
          setRawContentHeight(rawHeight);
          if (isSpaceFull && !keyboardVisible) {
            if ((isStreaming || lastStreamingMessageId.current === lastMessage?.id) && !dragged.current) {
              pending.current = null;
              scrollToBottom(false);
            } else {
              resolveScroll();
            }
          }
          if (!isStreaming) lastStreamingMessageId.current = null;
        }}
        onScrollBeginDrag={() => {
          pending.current = null;
          dragged.current = true;
          gestureActive.current = true;
          olderLoadAllowed.current = true;
          if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current);
        }}
        onScrollEndDrag={() => {
          gestureActive.current = false;
          if (atEnd.current) dragged.current = false;
        }}
        onMomentumScrollBegin={() => { gestureActive.current = true; }}
        onMomentumScrollEnd={() => {
          gestureActive.current = false;
          if (atEnd.current) dragged.current = false;
        }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distanceToBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
          if (gestureActive.current) atEnd.current = distanceToBottom <= 40;
          if (isSpaceFull && dragged.current && distanceToBottom > 120) {
            setShowScrollDown(true);
          } else if (distanceToBottom <= 40) {
            setShowScrollDown(false);
          }

          if (dragged.current && olderLoadAllowed.current && event.nativeEvent.contentOffset.y < 120 && hasOlderMessages && !loadingOlderMessages) {
            olderLoadAllowed.current = false;
            void loadOlderMessages().catch(() => { olderLoadAllowed.current = true; });
          }
        }}
        scrollEventThrottle={64}
        showsVerticalScrollIndicator={false}
        initialNumToRender={16}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
      />
      {showScrollDown && isSpaceFull && (
        <Pressable
          accessibilityLabel="Scroll to bottom"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            dragged.current = false;
            atEnd.current = true;
            scrollToBottom(true);
            setShowScrollDown(false);
          }}
          style={({ pressed }) => [
            styles.scrollDownButton,
            {
              bottom: composerHeight + currentKeyboardHeight + 12,
              opacity: pressed ? 0.75 : 1,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}>
          <AppIcon
            name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'arrow_downward' }}
            fallback="↓"
            color={Colors.light.text}
            size={18}
          />
        </Pressable>
      )}
      {introVisible && (
        <View pointerEvents="none" style={[styles.empty, { top: headerHeight, bottom: composerHeight }]}>
          {!keyboardVisible && mascotSize > 0 && (
            <View style={styles.mascot}>
              <WelcomeMascot active={!drawerMounted && !contextMenuOpen} size={mascotSize} />
            </View>
          )}
          <RotatingGreeting active={!keyboardVisible && !drawerMounted && !contextMenuOpen} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 16 },
  separator: { height: 10 },
  empty: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  mascot: { marginBottom: 12 },
  scrollDownButton: {
    position: 'absolute',
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
});
