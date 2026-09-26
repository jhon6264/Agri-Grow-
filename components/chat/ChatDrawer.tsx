import type { SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ref } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  TextInput,
  View as NativeView,
  useWindowDimensions,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, View } from '@/components/Themed';
import { AppIcon } from '@/components/chat/AppIcon';
import Colors, { Palette } from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';
import { useChat } from '@/src/chat/ChatProvider';
import type { Conversation } from '@/src/chat/chat-types';
import { positionChatPopover } from '@/src/chat/popover-position';
import type { PopoverAnchor } from '@/src/chat/popover-position';

type ChatDrawerProps = {
  onClose: () => void;
  active: boolean;
};

type IconButtonProps = {
  accessibilityLabel: string;
  icon: SymbolViewProps['name'];
  fallback: string;
  color?: string;
  onPress: () => void;
  anchorRef?: Ref<NativeView>;
};

function IconButton({ accessibilityLabel, icon, fallback, color = Palette.nearBlack, onPress, anchorRef }: IconButtonProps) {
  return (
    <Pressable
      ref={anchorRef}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <AppIcon name={icon} fallback={fallback} color={color} size={22} />
    </Pressable>
  );
}

type ChatRowProps = {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
  onPin: () => void;
  onMenu: (anchor: PopoverAnchor) => void;
};

function ChatRow({
  conversation,
  active,
  onSelect,
  onPin,
  onMenu,
}: ChatRowProps) {
  const colors = Colors.light;
  const menuButton = useRef<NativeView | null>(null);

  return (
    <View style={[styles.rowShell, active && { backgroundColor: colors.surface }]}>
      <View style={styles.rowMain}>
        <Pressable
          accessibilityLabel={`Open ${conversation.title}`}
          accessibilityRole="button"
          onPress={onSelect}
          style={({ pressed }) => [styles.rowTitleButton, pressed && styles.pressed]}>
          <Text numberOfLines={1} style={styles.rowTitle}>{conversation.title}</Text>
          {!!conversation.lastMessagePreview && (
            <Text numberOfLines={1} style={[styles.rowPreview, { color: colors.textSecondary }]}>
              {conversation.lastMessagePreview}
            </Text>
          )}
        </Pressable>

        <IconButton
          accessibilityLabel={conversation.isPinned ? 'Unpin conversation' : 'Pin conversation'}
          icon={{
            ios: conversation.isPinned ? 'pin.fill' : 'pin',
            android: conversation.isPinned ? 'keep' : 'keep_off',
            web: conversation.isPinned ? 'keep' : 'keep_off',
          }}
          fallback="P"
          color={conversation.isPinned ? colors.primaryInteractive : colors.textSecondary}
          onPress={onPin}
        />
        <IconButton
          accessibilityLabel={`More options for ${conversation.title}`}
          anchorRef={menuButton}
          icon={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }}
          fallback="⋮"
          onPress={() => menuButton.current?.measureInWindow((x, y, width, height) => onMenu({ x, y, width, height }))}
        />
      </View>

    </View>
  );
}

type RenameDialogProps = {
  conversation: Conversation | null;
  onCancel: () => void;
  onSave: (title: string) => void;
};

function RenameDialog({ conversation, onCancel, onSave }: RenameDialogProps) {
  const [title, setTitle] = useState(conversation?.title ?? '');
  const colors = Colors.light;

  return (
    <Modal animationType="fade" transparent visible={!!conversation} onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.dialogBackdrop}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>Rename conversation</Text>
          <TextInput
            accessibilityLabel="Conversation name"
            autoFocus
            maxLength={80}
            onChangeText={setTitle}
            onSubmitEditing={() => title.trim() && onSave(title)}
            returnKeyType="done"
            selectionColor={colors.primaryInteractive}
            style={[styles.dialogInput, { borderColor: colors.border, color: colors.text }]}
            value={title}
          />
          <View style={styles.dialogActions}>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
              <Text style={styles.textButtonLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!title.trim()}
              onPress={() => onSave(title)}
              style={({ pressed }) => [
                styles.primaryButton,
                (!title.trim() || pressed) && styles.pressed,
              ]}>
              <Text style={styles.primaryButtonLabel}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type DeleteDialogProps = {
  conversation: Conversation | null;
  onCancel: () => void;
  onConfirm: () => void;
};

function DeleteDialog({ conversation, onCancel, onConfirm }: DeleteDialogProps) {
  const reduce = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const visible = !!conversation;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: reduce ? 0 : 200,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          tension: 65,
          friction: 9,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.92);
    }
  }, [visible, opacity, scale, reduce]);

  if (!visible) return null;

  return (
    <Modal animationType="none" transparent visible={visible} onRequestClose={onCancel}>
      <NativeView style={styles.modalOverlay}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.modalBackdrop, { opacity }]}>
          <Pressable accessibilityLabel="Close delete confirmation" accessibilityRole="button" onPress={onCancel} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={[styles.modalCardContainer, { opacity, transform: [{ scale }] }]}>
          <NativeView accessibilityViewIsModal style={styles.deleteCard}>
            <Text accessibilityRole="header" style={styles.deleteTitle}>Delete Conversation?</Text>
            <Text style={styles.deleteCopy}>
              “{conversation?.title}” and its messages will be removed from this phone.
            </Text>
            <NativeView style={styles.modalButtonStack}>
              <Pressable
                accessibilityLabel="Delete conversation"
                accessibilityRole="button"
                onPress={onConfirm}
                style={({ pressed }) => [
                  styles.modalActionButton,
                  styles.destructiveButton,
                  pressed && styles.modalButtonPressed,
                ]}>
                <Text style={styles.modalButtonText}>Delete</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Cancel"
                accessibilityRole="button"
                onPress={onCancel}
                style={({ pressed }) => [
                  styles.modalActionButton,
                  styles.cancelModalButton,
                  pressed && styles.modalButtonPressed,
                ]}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>
            </NativeView>
          </NativeView>
        </Animated.View>
      </NativeView>
    </Modal>
  );
}

export function ChatDrawer({ onClose, active }: ChatDrawerProps) {
  const colors = Colors.light;
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const {
    conversations,
    activeConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    selectConversation,
    togglePinned,
  } = useChat();
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ conversation: Conversation; anchor: PopoverAnchor } | null>(null);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  useEffect(() => {
    if (!active) { setMenu(null); setRenameTarget(null); setDeleteTarget(null); }
  }, [active]);
  useEffect(() => { setMenu(null); }, [activeConversation?.id, query, width, height, conversations]);
  const menuPosition = menu
    ? positionChatPopover(menu.anchor, width, height, insets.top, insets.bottom, fontScale)
    : null;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return conversations;
    return conversations.filter((conversation) =>
      conversation.title.toLocaleLowerCase().includes(normalized),
    );
  }, [conversations, query]);

  const sections = useMemo(() => [
    { title: 'PINNED', data: filtered.filter((conversation) => conversation.isPinned) },
    { title: 'RECENT', data: filtered.filter((conversation) => !conversation.isPinned) },
  ], [filtered]);

  const select = async (id: string) => {
    await selectConversation(id);
    onClose();
  };

  const create = async () => {
    await createConversation();
    onClose();
  };


  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.drawer, { borderRightColor: colors.border }]}>
      <View style={styles.drawerHeader}>
        <IconButton
          accessibilityLabel="Close chat history"
          icon={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }}
          fallback="←"
          onPress={onClose}
        />

        <View style={[styles.searchShell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppIcon
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            fallback="S"
            color={colors.textSecondary}
            size={20}
          />
          <TextInput
            accessibilityLabel="Search conversations"
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.textSecondary}
            selectionColor={colors.primaryInteractive}
            style={[styles.searchInput, { color: colors.text }]}
            value={query}
          />
        </View>

        <IconButton
          accessibilityLabel="New conversation"
          icon={{ ios: 'plus', android: 'add', web: 'add' }}
          fallback="+"
          onPress={() => void create()}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        initialNumToRender={12}
        windowSize={5}
        renderSectionHeader={({ section }) => (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{section.title}</Text>
            {!section.data.length && <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No conversations</Text>}
          </View>
        )}
        renderItem={({ item }) => (
          <ChatRow conversation={item} active={activeConversation?.id === item.id}
            onMenu={(anchor) => setMenu({ conversation: item, anchor })}
            onPin={() => void togglePinned(item)} onSelect={() => void select(item.id)} />
        )}
        onScrollBeginDrag={() => setMenu(null)}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false} />

      {menu && menuPosition && (
        <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent
          onRequestClose={() => setMenu(null)}>
          <NativeView style={styles.popoverRoot}>
            <Pressable accessibilityLabel="Close conversation actions" accessibilityRole="button"
              onPress={() => setMenu(null)} style={StyleSheet.absoluteFill} />
            <NativeView accessibilityViewIsModal style={[styles.rowMenu, {
              left: menuPosition.left, top: menuPosition.top, width: menuPosition.width,
            }]}>
              <Pressable accessibilityRole="menuitem" onPress={() => {
                setRenameTarget(menu.conversation); setMenu(null);
              }} style={({ pressed }) => [styles.menuItem, { minHeight: menuPosition.rowHeight }, pressed && styles.menuItemPressed]}>
                <AppIcon name={{ ios: 'pencil', android: 'edit', web: 'edit' }} fallback="R" color={colors.text} size={16} />
                <Text style={styles.menuItemText}>Rename</Text>
              </Pressable>
              <Pressable accessibilityRole="menuitem" onPress={() => {
                setDeleteTarget(menu.conversation); setMenu(null);
              }} style={({ pressed }) => [styles.menuItem, { minHeight: menuPosition.rowHeight }, pressed && styles.menuItemPressed]}>
                <AppIcon name={{ ios: 'trash', android: 'delete', web: 'delete' }} fallback="D" color={Palette.red} size={16} />
                <Text style={[styles.menuItemText, { color: Palette.red }]}>Delete</Text>
              </Pressable>
            </NativeView>
          </NativeView>
        </Modal>
      )}

      <RenameDialog
        key={renameTarget?.id ?? 'rename-dialog'}
        conversation={renameTarget}
        onCancel={() => setRenameTarget(null)}
        onSave={(title) => {
          if (!renameTarget) return;
          void renameConversation(renameTarget.id, title);
          setRenameTarget(null);
        }}
      />
      <DeleteDialog
        conversation={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          void deleteConversation(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  drawer: {
    flex: 1,
    backgroundColor: Palette.white,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  drawerHeader: {
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchShell: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.sansRegular,
    fontSize: 16,
    paddingVertical: 0,
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  section: {
    backgroundColor: 'transparent',
    marginTop: 16,
  },
  sectionLabel: {
    fontFamily: Fonts.monoSemiBold,
    fontSize: 12,
    letterSpacing: 1.4,
    marginBottom: 7,
    paddingHorizontal: 10,
  },
  emptyText: {
    fontFamily: Fonts.sansRegular,
    fontSize: 15,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rowShell: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    marginBottom: 3,
    overflow: 'hidden',
  },
  rowMain: {
    backgroundColor: 'transparent',
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
  },
  rowTitleButton: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    minWidth: 0,
    paddingRight: 2,
  },
  rowTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 16,
    lineHeight: 22,
  },
  rowPreview: {
    fontFamily: Fonts.sansRegular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 1,
  },
  rowMenu: {
    position: 'absolute',
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: 12,
    paddingVertical: 4,
    elevation: 10,
    shadowColor: Palette.nearBlack,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  popoverRoot: { flex: 1, backgroundColor: 'transparent' },
  menuItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  menuItemPressed: {
    backgroundColor: Palette.softWhite,
  },
  menuItemText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.58,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(16, 24, 19, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: Palette.white,
    padding: 18,
  },
  dialogTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  dialogCopy: {
    fontFamily: Fonts.sansRegular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  dialogInput: {
    height: 46,
    borderWidth: 1,
    borderRadius: 12,
    fontFamily: Fonts.sansRegular,
    fontSize: 15,
    marginTop: 14,
    paddingHorizontal: 12,
  },
  dialogActions: {
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 18,
  },
  textButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  textButtonLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: Palette.nearBlack,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonLabel: {
    color: Palette.white,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
  },
  deleteButton: {
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: Palette.red,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  deleteButtonLabel: {
    color: Palette.white,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(16, 26, 21, 0.55)',
  },
  modalCardContainer: {
    width: '100%',
    maxWidth: 320,
    overflow: 'visible',
  },
  deleteCard: {
    width: '100%',
    backgroundColor: '#FFFBEF',
    borderColor: '#315E3E',
    borderWidth: 2,
    borderBottomWidth: 4,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  deleteTitle: {
    fontFamily: Fonts.sansBold,
    fontSize: 20,
    color: '#20432D',
    textAlign: 'center',
  },
  deleteCopy: {
    fontFamily: Fonts.sansRegular,
    fontSize: 14.5,
    lineHeight: 21,
    color: '#26382C',
    textAlign: 'center',
  },
  modalButtonStack: {
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
  modalActionButton: {
    minHeight: 48,
    borderRadius: 15,
    borderBottomWidth: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructiveButton: {
    backgroundColor: '#BA3E3E',
    borderColor: '#872828',
  },
  cancelModalButton: {
    backgroundColor: '#32834E',
    borderColor: '#205936',
  },
  modalButtonPressed: {
    opacity: 0.88,
    transform: [{ translateY: 1 }],
  },
  modalButtonText: {
    fontFamily: Fonts.sansBold,
    fontSize: 16.5,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
