import type { PeriodId, PriceRecord, WeatherDay } from '../others/content-model';

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatDataCard =
  | { version: 1; kind: 'weather'; day: WeatherDay; period: PeriodId; loadedAt: number | null }
  | { version: 1; kind: 'prices'; rows: PriceRecord[]; loadedAt: number | null }
  | { version: 1; kind: 'crop'; cropId: string };

export type Conversation = {
  id: string;
  title: string;
  isPinned: boolean;
  pinnedAt: number | null;
  createdAt: number;
  updatedAt: number;
  lastMessagePreview: string | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  status?: 'streaming' | 'complete' | 'stopped' | 'interrupted';
  statusText?: string;
  attachment?: PhotoAttachment;
  cards?: ChatDataCard[];
};

export type PhotoAttachment = { id: string; uri: string; thumbnailUri: string; width: number; height: number };
