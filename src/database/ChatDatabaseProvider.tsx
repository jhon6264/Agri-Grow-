import { createContext, useContext, useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Pressable, Text, View } from 'react-native';
import { migrateChatDatabase } from './chatDatabase';
import { connectionOwner } from './connection-owner';

// Fast Refresh and navigation share this owner. Android closes it with the runtime.
const runtime = globalThis as typeof globalThis & { agriChatDatabase?: () => Promise<SQLiteDatabase> };
const openChatDatabase = runtime.agriChatDatabase ??= connectionOwner(async () => {
  const db = await openDatabaseAsync('agrigrow.db', { useNewConnection: true });
  try { await migrateChatDatabase(db); return db; }
  catch (error) { await db.closeAsync().catch(() => undefined); throw error; }
});
const Context = createContext<SQLiteDatabase | null>(null);
export function ChatDatabaseProvider({ children, fallback }: PropsWithChildren<{ fallback: ReactNode }>) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError(false);
    void openChatDatabase().then(value => { if (live) setDb(value); }, () => { if (live) setError(true); });
    return () => { live = false; };
  }, [attempt]);
  if (error) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 }}>
    <Text>Unable to open your chats. Your saved data has not been removed.</Text>
    <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)}><Text>Retry</Text></Pressable>
  </View>;
  return db ? <Context.Provider value={db}>{children}</Context.Provider> : fallback;
}
export function useChatDatabase() {
  const db = useContext(Context);
  if (!db) throw new Error('ChatDatabaseProvider is missing');
  return db;
}
