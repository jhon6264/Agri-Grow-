import type { ChatMessage } from './chat-types';
import { markdownSegments, type MarkdownNode } from './markdown.ts';

export type MessageCursor = Pick<ChatMessage, 'createdAt' | 'id'>;
export const compareMessages = (a: MessageCursor, b: MessageCursor) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Preserve the existing message objects while merging overlapping pages/appends. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const known = new Set(current.map((message) => message.id));
  const added = incoming.filter((message) => {
    if (known.has(message.id)) return false;
    known.add(message.id);
    return true;
  });
  if (!added.length) return current;
  return [...current, ...added].sort(compareMessages);
}

export type MessageBlock = {
  key: string;
  message: ChatMessage;
  text: string;
  first: boolean;
  last: boolean;
  segmented: boolean;
  markdown?: MarkdownNode[];
};

const cache = new WeakMap<ChatMessage, MessageBlock[]>();
export function messageBlocks(message: ChatMessage): MessageBlock[] {
  const cached = cache.get(message);
  if (cached) return cached;
  const result: MessageBlock[] = [];
  const text = message.content;
  if (message.role === 'assistant' && text) {
    const parts = markdownSegments(text, message.id);
    const blocks = parts.map((part, index) => ({ ...part, markdown: part.nodes, message,
      first: index === 0, last: index === parts.length - 1, segmented: parts.length > 1 }));
    cache.set(message, blocks);
    return blocks;
  }
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 1000, text.length);
    if (end < text.length) {
      const paragraph = text.lastIndexOf('\n', end - 1);
      const word = text.lastIndexOf(' ', end - 1);
      if (paragraph >= start + 500) end = paragraph + 1;
      else if (word >= start + 500) end = word + 1;
      // Keep UTF-16 surrogate pairs intact even in unbroken text.
      const code = text.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end--;
    }
    result.push({ key: `${message.id}:${start}`, message, text: text.slice(start, end),
      first: start === 0, last: end === text.length, segmented: text.length > 1000 });
    start = end;
  }
  if (!result.length) result.push({ key: `${message.id}:0`, message, text: '', first: true, last: true, segmented: false });
  cache.set(message, result);
  return result;
}

export function acceptsMessageLoad(request: number, current: number, conversationId: string, activeId: string | null) {
  return request === current && conversationId === activeId;
}

export function shouldFollowMessage(initial: boolean, role: string, atEnd: boolean) {
  return initial || role === 'user' || atEnd;
}
