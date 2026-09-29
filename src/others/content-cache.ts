import { Platform } from 'react-native';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { connectionOwner } from '@/src/database/connection-owner';
import { emptyContent, normalizePrice, normalizeWeather, type ContentData, type ContentKind, type PriceRecord, type WeatherDay } from './content-model';

const runtime = globalThis as typeof globalThis & { agriContentDatabase?: () => Promise<SQLiteDatabase> };
export const openContentDatabase = runtime.agriContentDatabase ??= connectionOwner(async () => {
  const db = await openDatabaseAsync('agrigrow-content.db', { useNewConnection: true });
  try {
    await db.execAsync(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS content_cache (
        kind TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        revision INTEGER,
        loaded_at INTEGER NOT NULL
      );`);
    return db;
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
});

type CacheRow = { kind: ContentKind; payload: string; revision: number | null; loaded_at: number };
export async function readContentCache(db: SQLiteDatabase): Promise<ContentData> {
  const result = emptyContent();
  const rows = await db.getAllAsync<CacheRow>('SELECT kind, payload, revision, loaded_at FROM content_cache');
  for (const row of rows) {
    if (row.kind !== 'prices' && row.kind !== 'weather') continue;
    try {
      const values: unknown = JSON.parse(row.payload);
      if (!Array.isArray(values)) continue;
      if (row.kind === 'prices') {
        result.prices = values.map(value => {
          const id = value && typeof value === 'object' && 'id' in value ? String(value.id) : '';
          return normalizePrice(id, value);
        }).filter((item): item is PriceRecord => item !== null);
      } else {
        result.weather = values.map(value => normalizeWeather(value))
          .filter((item): item is WeatherDay => item !== null);
      }
      result.revisions[row.kind] = Number.isSafeInteger(row.revision) && row.revision !== null ? row.revision : null;
      result.loadedAt[row.kind] = Number.isFinite(row.loaded_at) ? row.loaded_at : null;
    } catch { /* Leave the other cached collection available. */ }
  }
  return result;
}

export async function writeContentCache(db: SQLiteDatabase, content: ContentData, kinds: ContentKind[]) {
  const write = async (tx: SQLiteDatabase) => {
    for (const kind of kinds) {
      const loadedAt = content.loadedAt[kind];
      if (loadedAt === null) continue;
      await tx.runAsync(
        `INSERT INTO content_cache (kind, payload, revision, loaded_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload, revision=excluded.revision, loaded_at=excluded.loaded_at`,
        kind, JSON.stringify(content[kind]), content.revisions[kind], loadedAt,
      );
    }
  };
  if (Platform.OS === 'web') await db.withTransactionAsync(() => write(db));
  else await db.withExclusiveTransactionAsync(write);
}
