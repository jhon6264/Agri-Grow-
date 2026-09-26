export type ChatRole = 'user' | 'assistant' | 'system';

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
};

export type PhotoAttachment = { id: string; uri: string; thumbnailUri: string; width: number; height: number };
