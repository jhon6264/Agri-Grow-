import { createContext, PropsWithChildren, RefObject, useContext, useMemo } from 'react';
import type { View } from 'react-native';

type ChatSurfaceContextValue = {
  blurTargetRef: RefObject<View | null>;
  glassTargetRef: RefObject<View | null>;
  headerHeight: number;
  navigationTop: number;
  navigationBottom: number;
  introVisible: boolean;
  drawerMounted: boolean;
};

const ChatSurfaceContext = createContext<ChatSurfaceContextValue | null>(null);

type ChatSurfaceProviderProps = PropsWithChildren<
  Omit<ChatSurfaceContextValue, 'navigationTop'> & { navigationTop?: number }
>;

export function ChatSurfaceProvider({
  blurTargetRef,
  glassTargetRef,
  headerHeight,
  navigationTop = 0,
  navigationBottom,
  introVisible,
  drawerMounted,
  children,
}: ChatSurfaceProviderProps) {
  const value = useMemo(
    () => ({
      blurTargetRef,
      glassTargetRef,
      headerHeight,
      navigationTop,
      navigationBottom,
      introVisible,
      drawerMounted,
    }),
    [blurTargetRef, glassTargetRef, headerHeight, navigationTop, navigationBottom, introVisible, drawerMounted]
  );
  return (
    <ChatSurfaceContext.Provider value={value}>
      {children}
    </ChatSurfaceContext.Provider>
  );
}

export function useChatSurface() {
  const context = useContext(ChatSurfaceContext);
  if (!context) {
    throw new Error('useChatSurface must be used inside ChatSurfaceProvider');
  }
  return context;
}
