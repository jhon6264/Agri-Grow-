import { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  View as NativeView,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import Colors, { Palette } from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';
import type { ChatMessage as ChatMessageType } from '@/src/chat/chat-types';
import type { MessageBlock } from '@/src/chat/message-data';
import { useReducedMotion } from 'react-native-reanimated';
import { MarkdownResponse } from './MarkdownResponse';
import { PhotoPreview } from './PhotoPreview';

export type MessageFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SelectedMessage = {
  message: ChatMessageType;
  frame: MessageFrame;
  block?: MessageBlock;
};

type ChatMessageProps = {
  message: ChatMessageType;
  block?: MessageBlock;
  bounce: boolean;
  animateEntrance?: boolean;
  onEntrancePlayed?: (id: string) => void;
  onLongPress: (selection: SelectedMessage) => void;
};

type ChatMessageSurfaceProps = {
  message: ChatMessageType;
  block?: MessageBlock;
};

function BreathingStatusLabel({ label }: { label: string }) {
  const reduce = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.32,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduce]);

  return (
    <Animated.View style={[styles.thinkingContainer, { opacity }]}>
      <Text accessibilityLiveRegion="polite" style={styles.thinkingText}>{label}</Text>
    </Animated.View>
  );
}

function StreamFadeView({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: reduce ? 0 : 200,
      useNativeDriver: true,
    }).start();
  }, [opacity, reduce]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

export function ChatMessageSurface({ message, block }: ChatMessageSurfaceProps) {
  const userMessage = message.role === 'user';
  const colors = Colors.light;
  const first = block?.first ?? true;
  const last = block?.last ?? true;
  const content = block?.text ?? message.content;

  if (!userMessage) {
    const statusLabel = message.statusText || (message.attachment ? 'Viewing the image...' : 'Thinking...');
    return (
      <View style={[styles.aiSurface, !first && styles.noTopPadding, !last && styles.noBottomPadding]}>
        {!content && message.status === 'streaming' ? (
          <BreathingStatusLabel label={statusLabel} />
        ) : (
          <StreamFadeView>
            <MarkdownResponse source={content} nodes={block?.markdown} />
          </StreamFadeView>
        )}
        {last && message.status && ['stopped', 'interrupted'].includes(message.status) && (
          <Text style={{ color: '#68786E', fontSize: 12 }}>
            {message.status === 'stopped' ? 'Stopped' : 'Response interrupted'}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.userSurface}>
      {last && <Svg
        pointerEvents="none"
        style={styles.userTail}
        viewBox="0 0 20 20"
        width={20}
        height={20}>
        <Path
          d="M1 1 C2 8 7 14 19 16 C13 19 6 18 1 14 Z"
          fill={Palette.forest}
        />
      </Svg>}
      <View style={[styles.userBubble, !first && styles.continuedTop, !last && styles.continuedBottom]}>
        {first && message.attachment && <PhotoPreview photo={message.attachment} />}
        <Text style={[styles.messageText, styles.userMessageText]}>{content}</Text>
      </View>
    </View>
  );
}

export const ChatMessage = memo(function ChatMessage({ message, block, bounce, animateEntrance = false, onEntrancePlayed, onLongPress }: ChatMessageProps) {
  const messageRef = useRef<NativeView | null>(null);
  const [entrance] = useState(() => new Animated.Value(animateEntrance ? 0 : 1));
  const [bounceScale] = useState(() => new Animated.Value(1));
  const userMessage = message.role === 'user';

  useEffect(() => {
    if (!animateEntrance) return;
    onEntrancePlayed?.(message.id);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 210,
      useNativeDriver: true,
    }).start();
  }, [animateEntrance, entrance, message.id, onEntrancePlayed]);

  useEffect(() => {
    if (!bounce) return;

    bounceScale.setValue(0.94);
    Animated.spring(bounceScale, {
      toValue: 1,
      damping: 8,
      stiffness: 220,
      mass: 0.65,
      useNativeDriver: true,
    }).start();
  }, [bounce, bounceScale]);

  const handleLongPress = () => {
    messageRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress({ message, block, frame: { x, y, width, height } });
    });
  };

  return (
    <Animated.View
      style={[
        styles.messageRow,
        userMessage ? styles.userRow : styles.aiRow,
        {
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [7, 0],
              }),
            },
            { scale: bounceScale },
          ],
        },
      ]}>
      <Pressable
        ref={messageRef}
        accessibilityHint="Hold for message actions"
        accessibilityRole="text"
        delayLongPress={360}
        onLongPress={handleLongPress}
        style={({ pressed }) => [
          userMessage ? styles.userPressable : styles.aiPressable,
          block?.segmented && (userMessage ? styles.wideUser : styles.wideAi),
          pressed && styles.pressed,
        ]}>
        <ChatMessageSurface message={message} block={block} />
      </Pressable>
    </Animated.View>
  );
}, (previous, next) =>
  previous.message.id === next.message.id &&
  previous.message.content === next.message.content &&
  previous.message.role === next.message.role &&
  previous.message.status === next.message.status &&
  previous.message.attachment === next.message.attachment &&
  previous.block === next.block &&
  previous.bounce === next.bounce &&
  previous.animateEntrance === next.animateEntrance &&
  previous.onLongPress === next.onLongPress &&
  previous.onEntrancePlayed === next.onEntrancePlayed,
);

const styles = StyleSheet.create({
  wideUser: { width: '86%' },
  wideAi: { width: '88%' },
  noTopPadding: { paddingTop: 0 },
  noBottomPadding: { paddingBottom: 0 },
  continuedTop: { borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: 0 },
  continuedBottom: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 0 },
  messageRow: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  userRow: {
    alignItems: 'flex-end',
    paddingRight: 6,
  },
  aiRow: {
    alignItems: 'flex-start',
  },
  userPressable: {
    maxWidth: '86%',
  },
  aiPressable: {
    width: '100%',
  },
  userSurface: {
    backgroundColor: 'transparent',
    position: 'relative',
    paddingRight: 4,
  },
  userBubble: {
    zIndex: 1,
    backgroundColor: Palette.forest,
    borderRadius: 17,
    borderBottomRightRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  userTail: {
    position: 'absolute',
    right: -1,
    bottom: 0,
  },
  aiSurface: {
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  messageText: {
    includeFontPadding: false,
    fontFamily: Fonts.sansMedium,
    fontSize: 17,
    lineHeight: 25,
  },
  userMessageText: {
    color: Palette.white,
  },
  pressed: {
    opacity: 0.8,
  },
  thinkingContainer: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  thinkingText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
    lineHeight: 22,
    color: '#415748',
  },
});
