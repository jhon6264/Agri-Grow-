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
type MarkdownPart = ReturnType<typeof markdownSegments>[number];
const streamingParts = new Map<string, { source: string; parts: MarkdownPart[] }>();

// A blank line or a closed fence leaves the preceding Markdown stable while the next block grows.
function stableMarkdownEnd(source: string) {
  let end = 0;
  let lineStart = 0;
  let fence: { marker: string; length: number } | null = null;
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '\n') continue;
    const line = source.slice(lineStart, i);
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = { marker: marker[0], length: marker.length };
      else if (marker[0] === fence.marker && marker.length >= fence.length
        && line.slice(line.indexOf(marker) + marker.length).trim() === '') {
        fence = null;
        end = i + 1;
      }
    } else if (!fence && (line.trim() === '' || /^ {0,3}#{1,6}\s/.test(line))) {
      end = i + 1;
    }
    lineStart = i + 1;
  }
  return end;
}

function streamingMarkdownParts(source: string, messageId: string) {
  const stableSource = source.slice(0, stableMarkdownEnd(source));
  let stored = streamingParts.get(messageId);
  if (!stored || stored.source !== stableSource) {
    const parsed = stableSource ? markdownSegments(stableSource, messageId) : [];
    if (stored && stableSource.startsWith(stored.source)) {
      const previous = new Map(stored.parts.map(part => [part.key, part]));
      for (let i = 0; i < parsed.length; i++) {
        const old = previous.get(parsed[i].key);
        if (old && old.text === parsed[i].text) parsed[i] = old;
      }
    }
    stored = { source: stableSource, parts: parsed };
    streamingParts.delete(messageId);
    streamingParts.set(messageId, stored);
    if (streamingParts.size > 24) streamingParts.delete(streamingParts.keys().next().value!);
  }
  const tail = source.slice(stableSource.length);
  return [...stored.parts, ...(tail ? markdownSegments(tail, `${messageId}:live:${stableSource.length}`) : [])];
}

export function messageBlocks(message: ChatMessage): MessageBlock[] {
  const cached = cache.get(message);
  if (cached) return cached;
  const result: MessageBlock[] = [];
  const text = message.content;
  if (message.role === 'assistant' && text.trim()) {
    const parts = message.status === 'streaming'
      ? streamingMarkdownParts(text, message.id)
      : markdownSegments(text, message.id);
    if (message.status !== 'streaming') streamingParts.delete(message.id);
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
