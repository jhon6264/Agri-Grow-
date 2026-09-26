import { AppState } from 'react-native';
import { useChatDatabase } from '@/src/database/ChatDatabaseProvider';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { ChatMessage, ChatRole, Conversation, PhotoAttachment } from '@/src/chat/chat-types';
import { RequestGate } from '@/src/ai/request-gate';
import { nativeAI, requireAI } from '@/src/ai/native';
import { acceptsMessageLoad, mergeMessages } from '@/src/chat/message-data';
import type { MessageCursor } from '@/src/chat/message-data';
import { StreamSmoother } from '@/src/chat/stream-smoother';
import { cleanResponse } from '@/src/chat/clean-response';
import { bulkScheduleExtractionPrompt, calendarClassificationPrompt, calendarIntent, draftFromSchedule,
  draftProblem, editScheduleExtractionPrompt, matchingScheduleTargets, parseCalendarIntent, parseEditExtraction, parseScheduleDrafts,
  parseDirectReviewChange, parseNumberedScheduleChange, parseScheduleCommand, parseScheduleLines,
  parseScheduleReviewChange, parseScheduleReviewFeedback, resolveScheduleDay, scheduleReviewChangePrompt, scheduleReviewPrompt,
  scheduleBulkSummary, scheduleCommandHelp, scheduleLineSummary, scheduleCancelledMessage, scheduleDraftDiffers, scheduleEditSummary,
  scheduleEditedMessage, scheduleFromDraft, scheduleLanguageForText, scheduleListMessage, scheduleReply, scheduleSavedMessage,
  scheduleTargetChoices, sameScheduleRecord,
  type PendingSchedule, type ScheduleCommand, type ScheduleDraft } from '@/src/calendar/chat-schedule';
import { getPendingSchedule, putPendingSchedule } from '@/src/calendar/schedule-chat-store';
import { saveScheduleBatchWithReminders, saveScheduleWithReminder } from '@/src/calendar/schedule-service';
import { getSchedule, listSchedules, type Schedule } from '@/src/calendar/schedule-store';
import {
  insertConversation,
  insertMessage,
  listConversations,
  listMessages,
  removeConversation,
  renameConversation,
  setConversationPinned,
  updateConversationActivity,
  updateConversationAfterMessage,
  updateMessage,
  recoverInterruptedMessages,
  attachmentUris,
} from '@/src/database/chatDatabase';

type ChatContextValue = {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: ChatMessage[];
  loading: boolean;
  generating: boolean;
  savingSchedule: boolean;
  reviewingSchedule: boolean;
  aiError: string;
  sendAI: (content: string, attachment?: PhotoAttachment) => Promise<void>;
  stopAI: () => void;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  loadOlderMessages: () => Promise<void>;
  createConversation: () => Promise<string>;
  selectConversation: (id: string) => Promise<void>;
  togglePinned: (conversation: Conversation) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<ChatMessage | null>;
  appendMessage: (
    conversationId: string,
    content: string,
    role: ChatRole,
  ) => Promise<ChatMessage | null>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const makeTitle = (content: string) => {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length <= 38 ? compact : `${compact.slice(0, 37).trim()}…`;
};

export function ChatProvider({ children }: PropsWithChildren) {
  const db = useChatDatabase();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [reviewingSchedule, setReviewingSchedule] = useState(false);
  const savingScheduleRef = useRef(false);
  const [aiError, setAiError] = useState('');
  const busy = useRef(false);
  const run = useRef<{
    requestId: string;
    message: ChatMessage;
    lastSave: number;
    lastPaint: number;
    doneKind?: 'complete' | 'stopped' | 'failed';
  } | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const gate = useRef(new RequestGate());
  const ticket = useRef<number | null>(null);
  const actionRun = useRef<{ requestId: string; cancel: () => void } | null>(null);

  const saveProgress = useCallback((message: ChatMessage) => {
    const snapshot = { ...message };
    writes.current = writes.current.catch(() => undefined).then(() => updateMessage(db, snapshot));
    return writes.current;
  }, [db]);

  const smoother = useRef<StreamSmoother | null>(null);
  if (!smoother.current) {
    smoother.current = new StreamSmoother((visibleText, completed) => {
      const current = run.current;
      if (!current) return;
      current.message = {
        ...current.message,
        content: visibleText,
        status: completed && current.doneKind
          ? (current.doneKind === 'complete' ? 'complete' : current.doneKind === 'stopped' ? 'stopped' : 'interrupted')
          : 'streaming',
      };
      if (activeConversationIdRef.current === current.message.conversationId) {
        const message = current.message;
        setMessages((list) => list.map((item) => (item.id === message.id ? message : item)));
      }
      if (completed && current.doneKind) {
        if (current.doneKind === 'complete') setAiError('');
        const cleaned = cleanResponse(current.message.content);
        if (cleaned !== current.message.content) {
          current.message = { ...current.message, content: cleaned };
          if (activeConversationIdRef.current === current.message.conversationId) {
            const message = current.message;
            setMessages((list) => list.map((item) => (item.id === message.id ? message : item)));
          }
        }
        const now = Date.now();
        void saveProgress(current.message).catch(() => undefined);
        void updateConversationActivity(db, current.message.conversationId, current.message.content.slice(0, 120), now)
          .then(refreshConversations)
          .catch(() => undefined);
        run.current = null;
        busy.current = false;
        if (ticket.current !== null) gate.current.finish(ticket.current);
        setGenerating(false);
      }
    });
  }

  const stopAI = useCallback(() => {
    gate.current.stop();
    actionRun.current?.cancel();
    setReviewingSchedule(false);
    nativeAI?.stop();
    smoother.current?.flush();
    if (run.current) {
      const cleaned = cleanResponse(run.current.message.content);
      const stoppedMessage = { ...run.current.message, content: cleaned, status: 'stopped' as const };
      void saveProgress(stoppedMessage).catch(() => undefined);
      setMessages((list) => list.map((item) => item.id === stoppedMessage.id ? stoppedMessage : item));
      run.current = null;
    }
    busy.current = false;
    if (ticket.current !== null) gate.current.finish(ticket.current);
    ticket.current = null;
    setGenerating(false);
    setAiError('');
  }, [saveProgress]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') stopAI(); });
    return () => sub.remove();
  }, [stopAI]);

  useEffect(() => {
    if (!generating) return;
    const timer = setTimeout(() => setAiError('This is taking longer than expected. You can leave Chat; native work may still be finishing.'), 90000);
    return () => clearTimeout(timer);
  }, [generating]);

  useEffect(() => {
    const subscription = nativeAI?.addListener('generation', (event) => {
      const current = run.current;
      if (!current || current.requestId !== event.requestId || current.message.conversationId !== event.conversationId) return;
      if (event.kind === 'phase') {
        current.message.statusText = event.text;
        if (activeConversationIdRef.current === current.message.conversationId) {
          const message = { ...current.message };
          setMessages((list) => list.map((item) => (item.id === message.id ? message : item)));
        }
        return;
      }
      if (event.kind === 'delta') {
        setAiError('');
        smoother.current?.append(event.text);
      } else {
        current.doneKind = event.kind;
        if (event.kind === 'failed') setAiError(event.text);
        else if (event.kind === 'complete') setAiError('');
        smoother.current?.markDone();
      }
      const done = event.kind !== 'delta';
      const now = Date.now();
      if (done || now - current.lastSave >= 2000) {
        current.lastSave = now;
        void saveProgress(current.message).catch(() => setAiError('The response could not be saved. Please check your storage.'));
      }
    });
    return () => { subscription?.remove(); nativeAI?.stop(); };
  }, [db, saveProgress]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const loadRevision = useRef(0);
  const olderRequest = useRef<number | null>(null);
  const oldestCursor = useRef<MessageCursor | undefined>(undefined);
  const conversationRevision = useRef(0);

  const refreshConversations = useCallback(async () => {
    const revision = ++conversationRevision.current;
    const next = await listConversations(db);
    if (revision === conversationRevision.current) setConversations(next);
    return next;
  }, [db]);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      const revision = ++loadRevision.current;
      olderRequest.current = null;
      oldestCursor.current = undefined;
      setMessages([]);
      setAiError('');
      setHasOlderMessages(false);
      setLoadingOlderMessages(false);
      setLoading(true);
      try {
        const page = await listMessages(db, conversationId);
        if (!acceptsMessageLoad(revision, loadRevision.current, conversationId, activeConversationIdRef.current)) return;
        oldestCursor.current = page.messages[0];
        setHasOlderMessages(page.hasOlder);
        setMessages((current) => acceptsMessageLoad(revision, loadRevision.current, conversationId, activeConversationIdRef.current)
          ? mergeMessages(current, page.messages) : current);
      } finally {
        if (revision === loadRevision.current) setLoading(false);
      }
    },
    [db],
  );

  const loadOlderMessages = useCallback(async () => {
    const id = activeConversationIdRef.current;
    const cursor = oldestCursor.current;
    const revision = loadRevision.current;
    if (!id || !cursor || !hasOlderMessages || loading || olderRequest.current !== null) return;
    olderRequest.current = revision;
    setLoadingOlderMessages(true);
    try {
      const page = await listMessages(db, id, cursor);
      if (!acceptsMessageLoad(revision, loadRevision.current, id, activeConversationIdRef.current)) return;
      oldestCursor.current = page.messages[0] ?? cursor;
      setHasOlderMessages(page.hasOlder);
      setMessages((current) => acceptsMessageLoad(revision, loadRevision.current, id, activeConversationIdRef.current)
        ? mergeMessages(current, page.messages) : current);
    } finally {
      if (olderRequest.current === revision) {
        olderRequest.current = null;
        setLoadingOlderMessages(false);
      }
    }
  }, [db, hasOlderMessages, loading]);

  const createBlankConversation = useCallback(async () => {
    const now = Date.now();
    const id = makeId('conversation');
    await insertConversation(db, {
      id,
      title: 'New conversation',
      createdAt: now,
      updatedAt: now,
    });
    activeConversationIdRef.current = id;
    ++loadRevision.current;
    olderRequest.current = null;
    oldestCursor.current = undefined;
    setHasOlderMessages(false);
    setLoadingOlderMessages(false);
    setLoading(false);
    setActiveConversationId(id);
    setAiError('');
    setMessages([]);
    await refreshConversations();
    return id;
  }, [db, refreshConversations]);

  useEffect(() => {
    let cancelled = false;
    const initialRevision = loadRevision.current;

    const initialize = async () => {
      try {
        await recoverInterruptedMessages(db);
        if (cancelled) return;
        const uris = await attachmentUris(db);
        if (cancelled) return;
        void nativeAI?.cleanPhotos(uris, 24 * 60 * 60 * 1000).catch(() => undefined);
        const saved = await listConversations(db);
        if (cancelled) return;

        setConversations(saved);
        if (saved.length > 0) {
          activeConversationIdRef.current = saved[0].id;
          setActiveConversationId(saved[0].id);
          await loadMessages(saved[0].id);
        } else {
          await createBlankConversation();
        }
      } catch (error) {
        if (!cancelled && loadRevision.current === initialRevision) setLoading(false);
        if (!cancelled) { setAiError('Unable to load your chats. Please reopen Chat.'); console.error('Unable to initialize conversations', error); }
      }
    };

    void initialize();
    return () => {
      cancelled = true;
      ++loadRevision.current;
    };
  }, [createBlankConversation, db, loadMessages]);

  const createConversation = useCallback(async () => {
    stopAI();
    const active = conversations.find((item) => item.id === activeConversationId);
    if (active && !loading && messages.length === 0) {
      return active.id;
    }

    return createBlankConversation();
  }, [activeConversationId, conversations, createBlankConversation, messages.length, loading]);

  const selectConversation = useCallback(
    async (id: string) => {
      stopAI();
      activeConversationIdRef.current = id;
      setActiveConversationId(id);
      await loadMessages(id);
    },
    [loadMessages],
  );

  const togglePinned = useCallback(
    async (conversation: Conversation) => {
      await setConversationPinned(db, conversation.id, !conversation.isPinned);
      await refreshConversations();
    },
    [db, refreshConversations],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      const cleanTitle = title.trim().slice(0, 80);
      if (!cleanTitle) return;
      await renameConversation(db, id, cleanTitle);
      await refreshConversations();
    },
    [db, refreshConversations],
  );

  const remove = useCallback(
    async (id: string) => {
      if (run.current?.message.conversationId === id || activeConversationIdRef.current === id) stopAI();
      await removeConversation(db, id);
      void attachmentUris(db).then((uris) => nativeAI?.cleanPhotos(uris, 24 * 60 * 60 * 1000)).catch(() => undefined);
      const remaining = await refreshConversations();

      if (activeConversationIdRef.current !== id) return;

      if (remaining.length > 0) {
        const newest = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        activeConversationIdRef.current = newest.id;
        setActiveConversationId(newest.id);
        await loadMessages(newest.id);
      } else {
        await createBlankConversation();
      }
    },
    [activeConversationId, createBlankConversation, db, loadMessages, refreshConversations],
  );

  const appendMessage = useCallback(
    async (conversationId: string, content: string, role: ChatRole, attachment?: PhotoAttachment) => {
      const cleanContent = content.trim();
      if (!cleanContent) return null;

      const now = Date.now();
      const message: ChatMessage = {
        id: makeId('message'),
        conversationId,
        role,
        content: cleanContent,
        createdAt: now,
        ...(attachment ? { attachment } : {}),
      };

      await insertMessage(db, message);

      const conversation = conversations.find((item) => item.id === conversationId);
      const title = role === 'user' && conversation?.title === 'New conversation'
        ? makeTitle(cleanContent)
        : (conversation?.title ?? makeTitle(cleanContent));

      if (role === 'user') {
        await updateConversationAfterMessage(
          db,
          conversationId,
          title,
          cleanContent.slice(0, 120),
          now,
        );
      } else {
        await updateConversationActivity(
          db,
          conversationId,
          cleanContent.slice(0, 120),
          now,
        );
      }
      if (activeConversationIdRef.current === conversationId) {
        setMessages((current) => activeConversationIdRef.current === conversationId
          ? mergeMessages(current, [message]) : current);
      }
      await refreshConversations();
      return message;
    },
    [conversations, db, refreshConversations],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const cleanContent = content.trim();
      if (!cleanContent) return null;

      let conversationId = activeConversationIdRef.current;
      if (!conversationId) {
        conversationId = await createBlankConversation();
      }

      return appendMessage(conversationId, cleanContent, 'user');
    },
    [appendMessage, createBlankConversation],
  );

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );

  const commitScheduleTurn = useCallback(async (conversationId: string, userText: string, answer: string,
    pending: PendingSchedule | null | undefined, revision: number, assistantMessageId?: string) => {
    const now = Date.now();
    const userMessage: ChatMessage = { id: makeId('message'), conversationId, role: 'user', content: userText, createdAt: now };
    const assistantMessage: ChatMessage = { id: makeId('message'), conversationId, role: 'assistant', content: answer, createdAt: now + 1, status: 'complete' };
    await db.withExclusiveTransactionAsync(async transaction => {
      if (!gate.current.accepts(revision) || activeConversationIdRef.current !== conversationId) {
        throw new Error('Sending stopped. Your draft has been kept.');
      }
      if (!await transaction.getFirstAsync('SELECT id FROM conversations WHERE id = ?', conversationId)) {
        throw new Error('The conversation was removed. Your draft has been kept.');
      }
      if (assistantMessageId) {
        await transaction.runAsync(
          "UPDATE messages SET content = ?, status = 'complete' WHERE id = ? AND conversation_id = ?",
          answer, assistantMessageId, conversationId
        );
      } else {
        await insertMessage(transaction, userMessage);
        await insertMessage(transaction, assistantMessage);
      }
      if (pending === null) {
        await transaction.runAsync('DELETE FROM pending_schedule_actions WHERE conversation_id = ?', conversationId);
      } else if (pending) await putPendingSchedule(transaction, pending);
      const title = conversations.find(item => item.id === conversationId)?.title;
      await updateConversationAfterMessage(transaction, conversationId,
        !title || title === 'New conversation' ? makeTitle(userText) : title, answer.slice(0, 120), now + 1);
    });
    if (activeConversationIdRef.current === conversationId) {
      if (assistantMessageId) {
        setMessages(current => current.map(item =>
          item.id === assistantMessageId ? { ...item, content: answer, status: 'complete', statusText: undefined } : item
        ));
      } else {
        setMessages(current => mergeMessages(current, [userMessage, assistantMessage]));
      }
    }
    run.current = null;
    void refreshConversations().catch(() => undefined);
  }, [conversations, db, refreshConversations]);

  const extractSchedule = useCallback(async (conversationId: string, requestId: string, prompt: string, revision: number) => {
    const api = requireAI();
    await api.prepare(requestId, [], prompt, null, 'schedule');
    if (!gate.current.accepts(revision) || activeConversationIdRef.current !== conversationId) {
      throw new Error('Sending stopped. Your draft has been kept.');
    }
    return new Promise<string>((resolve, reject) => {
      let text = ''; let finished = false;
      const close = (error?: Error) => {
        if (finished) return;
        finished = true; listener.remove();
        if (actionRun.current?.requestId === requestId) actionRun.current = null;
        if (error) reject(error); else resolve(text);
      };
      const listener = api.addListener('generation', event => {
        if (event.requestId !== requestId || event.conversationId !== conversationId) return;
        if (event.kind === 'delta') {
          text += event.text;
          if (text.length > 12000) { api.stop(); close(new Error('The schedule could not be understood. Please try a shorter request.')); }
        } else if (event.kind === 'complete') close();
        else if (event.kind === 'stopped' || event.kind === 'failed') {
          close(new Error(event.kind === 'stopped' ? 'Sending stopped. Your draft has been kept.' : 'The assistant could not read the schedule. Please retry.'));
        }
      });
      actionRun.current = { requestId, cancel: () => close(new Error('Sending stopped. Your draft has been kept.')) };
      void api.generate(requestId, conversationId).catch(() => close(new Error('The assistant could not read the schedule. Please retry.')));
    });
  }, []);

  const sendScheduleTurn = useCallback(async (conversationId: string, userText: string,
    pending: PendingSchedule | null, revision: number, requestId: string,
    intent: 'create' | 'list' | 'edit', command?: ScheduleCommand | null,
    assistantMessageId?: string) => {
    const actionNow = Date.now();
    const actionText = command?.body ?? userText;
    const createSummary = (drafts: ScheduleDraft[]) => pending?.kind === 'create' && pending.format === 'lines'
      ? scheduleLineSummary(drafts) : scheduleBulkSummary(drafts);
    const canCommit = () => gate.current.accepts(revision) && activeConversationIdRef.current === conversationId;
    if (intent === 'list') {
      const unsupportedDate = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b\d{1,2}[/-]\d{1,2}\b/i.test(actionText);
      const day = resolveScheduleDay(actionText, actionNow) ?? (unsupportedDate ? null : resolveScheduleDay('today', actionNow));
      const answer = day ? scheduleListMessage(day, await listSchedules(db, day, day), actionNow, scheduleLanguageForText(userText))
        : 'Which day should I check? You can say today, tomorrow, a weekday, or a date like 2026-09-25.';
      await commitScheduleTurn(conversationId, userText, answer, undefined, revision, assistantMessageId);
      return;
    }
    if (command && !actionText) {
      await commitScheduleTurn(conversationId, userText, scheduleCommandHelp, undefined, revision, assistantMessageId);
      return;
    }
    if (pending && command && /^(?:\.|\/sched)\s*(?:add|create|edit)\b/i.test(userText)) {
      await commitScheduleTurn(conversationId, userText,
        'Please confirm or cancel the schedule change under review before starting another one.', pending, revision, assistantMessageId);
      return;
    }
    if (pending && intent !== pending.kind && /\b(?:another|new|different|separate)\b/i.test(userText)) {
      await commitScheduleTurn(conversationId, userText,
        'Please confirm or cancel the schedule change already under review before starting another one.', pending, revision, assistantMessageId);
      return;
    }
    const reply = pending ? scheduleReply(actionText) : 'revise';
    if (pending && reply === 'cancel') {
      const language = pending.kind === 'create' ? pending.drafts[0].language : pending.draft?.language ?? 'en';
      await commitScheduleTurn(conversationId, userText, scheduleCancelledMessage(language), null, revision, assistantMessageId);
      return;
    }
    if (pending && reply === 'ask') {
      await commitScheduleTurn(conversationId, userText, 'What would you like to change? Nothing has been saved yet.', pending, revision, assistantMessageId);
      return;
    }
    if (pending && reply === 'confirm') {
      if (pending.kind === 'create') {
        if (pending.stage !== 'confirming' || pending.drafts.some(draft => draftProblem(draft))) {
          await commitScheduleTurn(conversationId, userText, createSummary(pending.drafts), pending, revision, assistantMessageId);
          return;
        }
        if (!canCommit()) throw new Error('Sending stopped. Your draft has been kept.');
        try {
          const schedules = pending.drafts.map((draft, index) =>
            scheduleFromDraft(pending.drafts.length === 1 ? pending.id : `${pending.id}-${index + 1}`, draft));
          savingScheduleRef.current = true; setSavingSchedule(true);
          await saveScheduleBatchWithReminders(db, schedules, canCommit);
          const language = pending.drafts[0].language;
          const answer = schedules.length === 1 ? scheduleSavedMessage(schedules[0].title, language)
            : language === 'tl' ? `Tapos na — naka-save ang lahat ng ${schedules.length} iskedyul sa kalendaryo mo.`
              : language === 'ceb' ? `Nahuman na — na-save ang tanang ${schedules.length} ka iskedyul sa imong kalendaryo.`
                : `Done — all ${schedules.length} reviewed schedules are saved to your calendar.`;
          await commitScheduleTurn(conversationId, userText, answer, null, revision, assistantMessageId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'The schedules could not be saved.';
          await commitScheduleTurn(conversationId, userText,
            `${message}\n\nYour proposal is still pending. Reply **Correct** to retry, or tell me what to change.`, pending, revision, assistantMessageId);
        } finally { savingScheduleRef.current = false; setSavingSchedule(false); }
        return;
      }
      if (!pending.targetId || !pending.snapshot || !pending.draft || pending.stage !== 'confirming' || draftProblem(pending.draft)) {
        await commitScheduleTurn(conversationId, userText,
          pending.candidateIds.length ? 'Please choose a schedule number first. Nothing has changed.' : 'Please provide the schedule and the change you want.', pending, revision, assistantMessageId);
        return;
      }
      if (!canCommit()) throw new Error('Sending stopped. Your draft has been kept.');
      const current = await getSchedule(db, pending.targetId);
      if (!current) {
        await commitScheduleTurn(conversationId, userText, 'That schedule was removed. Please start a new edit request.', null, revision, assistantMessageId);
        return;
      }
      const proposed = scheduleFromDraft(current.id, pending.draft);
      if (sameScheduleRecord(current, proposed)) {
        await commitScheduleTurn(conversationId, userText, 'That change is already saved. No duplicate edit was made.', null, revision, assistantMessageId);
        return;
      }
      if (!sameScheduleRecord(current, pending.snapshot)) {
        await commitScheduleTurn(conversationId, userText,
          'This schedule changed since the review. Please start a new edit request so I can show the current details.', null, revision, assistantMessageId);
        return;
      }
      try {
        savingScheduleRef.current = true; setSavingSchedule(true);
        await saveScheduleWithReminder(db, proposed, current, canCommit);
        await commitScheduleTurn(conversationId, userText,
          scheduleEditedMessage(proposed.title, pending.draft.language), null, revision, assistantMessageId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The schedule could not be updated.';
        await commitScheduleTurn(conversationId, userText,
          `${message}\n\nThe edit is still pending. Reply **Correct** to retry.`, pending, revision, assistantMessageId);
      } finally { savingScheduleRef.current = false; setSavingSchedule(false); }
      return;
    }
    if (pending?.kind === 'edit' && !pending.targetId && pending.candidateIds.length) {
      const number = /^\s*(\d{1,2})\s*[.!]?\s*$/.exec(userText)?.[1];
      const exactMatches = number ? [] : (await Promise.all(pending.candidateIds.map(id => getSchedule(db, id))))
        .filter(item => item?.title.toLowerCase() === userText.trim().toLowerCase());
      const selectedId = number ? pending.candidateIds[Number(number) - 1]
        : exactMatches.length === 1 ? exactMatches[0]?.id : undefined;
      if (!selectedId) {
        const choices = (await Promise.all(pending.candidateIds.map(id => getSchedule(db, id))))
          .filter((item): item is Schedule => item !== null);
        await commitScheduleTurn(conversationId, userText, scheduleTargetChoices(choices), pending, revision, assistantMessageId);
        return;
      }
      const snapshot = await getSchedule(db, selectedId);
      if (!snapshot) {
        await commitScheduleTurn(conversationId, userText, 'That schedule is no longer available. Please start again.', null, revision, assistantMessageId);
        return;
      }
      const draft = { ...draftFromSchedule(snapshot), ...pending.changes };
      const next: PendingSchedule = { ...pending, targetId: snapshot.id, snapshot, draft,
        candidateIds: [], stage: draftProblem(draft) || !scheduleDraftDiffers(snapshot, draft) ? 'clarifying' : 'confirming', updatedAt: Date.now() };
      await commitScheduleTurn(conversationId, userText, scheduleEditSummary(snapshot, draft), next, revision, assistantMessageId);
      return;
    }
    if (pending?.kind === 'create') {
      const changed = parseNumberedScheduleChange(actionText, pending.drafts)
        ?? parseDirectReviewChange(actionText, pending.drafts);
      if (changed) {
        const next: PendingSchedule = { ...pending, drafts: changed,
          stage: changed.some(draft => draftProblem(draft)) ? 'clarifying' : 'confirming', updatedAt: Date.now() };
        await commitScheduleTurn(conversationId, userText,
          `I updated the review. Nothing has been saved yet.\n\n${createSummary(changed)}`, next, revision, assistantMessageId);
        return;
      }
      setReviewingSchedule(true);
      let reviewRaw: string;
      try {
        reviewRaw = await extractSchedule(conversationId, requestId,
          scheduleReviewPrompt(actionText, pending.drafts, actionNow), revision);
      } catch (error) {
        if (!canCommit()) throw error;
        await commitScheduleTurn(conversationId, userText,
          `I could not interpret that change right now. The review is unchanged. Please try again or name the schedule number and change.\n\n${createSummary(pending.drafts)}`,
          pending, revision, assistantMessageId);
        return;
      } finally { setReviewingSchedule(false); }
      if (!canCommit()) throw new Error('Sending stopped. Your draft has been kept.');
      const review = parseScheduleReviewFeedback(reviewRaw, pending.drafts, actionNow);
      if (review?.kind === 'confirm') {
        if (pending.stage !== 'confirming' || pending.drafts.some(draft => draftProblem(draft))) {
          await commitScheduleTurn(conversationId, userText, createSummary(pending.drafts), pending, revision, assistantMessageId);
          return;
        }
        try {
          const schedules = pending.drafts.map((draft, index) =>
            scheduleFromDraft(pending.drafts.length === 1 ? pending.id : `${pending.id}-${index + 1}`, draft));
          savingScheduleRef.current = true; setSavingSchedule(true);
          await saveScheduleBatchWithReminders(db, schedules, canCommit);
          const language = pending.drafts[0].language;
          const answer = schedules.length === 1 ? scheduleSavedMessage(schedules[0].title, language)
            : language === 'tl' ? `Tapos na — naka-save ang lahat ng ${schedules.length} iskedyul sa kalendaryo mo.`
              : language === 'ceb' ? `Nahuman na — na-save ang tanang ${schedules.length} ka iskedyul sa imong kalendaryo.`
                : `Done — all ${schedules.length} reviewed schedules are saved to your calendar.`;
          await commitScheduleTurn(conversationId, userText, answer, null, revision, assistantMessageId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'The schedules could not be saved.';
          await commitScheduleTurn(conversationId, userText,
            `${message}\n\nYour proposal is still pending. Reply **Correct** to retry, or tell me what to change.`, pending, revision, assistantMessageId);
        } finally { savingScheduleRef.current = false; setSavingSchedule(false); }
        return;
      }
      if (review?.kind === 'cancel') {
        const language = pending.drafts[0].language;
        await commitScheduleTurn(conversationId, userText, scheduleCancelledMessage(language), null, revision, assistantMessageId);
        return;
      }
      if (review?.kind === 'updated') {
        const next: PendingSchedule = { ...pending, drafts: review.drafts,
          stage: review.drafts.some(draft => draftProblem(draft)) ? 'clarifying' : 'confirming', updatedAt: Date.now() };
        await commitScheduleTurn(conversationId, userText,
          `I updated the review. Nothing has been saved yet.\n\n${createSummary(review.drafts)}`, next, revision, assistantMessageId);
      } else {
        const question = review?.kind === 'clarify' ? review.question : 'I could not safely identify the change. Which schedule and detail should I update?';
        await commitScheduleTurn(conversationId, userText,
          `${question}\n\n${createSummary(pending.drafts)}`,
          pending, revision, assistantMessageId);
      }
      return;
    }
    if (!pending && intent === 'create') {
      const lines = parseScheduleLines(actionText, actionNow);
      const isMultiLine = actionText.split(/\r?\n/).filter(line => line.trim()).length > 1;
      const structured = /^(?:\d{1,2}[.)]\s*)?(?:\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)\b|(?:[01]?\d|2[0-3]):[0-5]\d\b)/i.test(actionText);
      if (lines.errors.length && (isMultiLine || structured || command?.action === 'create')) {
        await commitScheduleTurn(conversationId, userText,
          `I could not review every line:\n\n${lines.errors.join('\n')}\n\nPlease resend the corrected list. Nothing was saved.`, null, revision, assistantMessageId);
        return;
      }
      if (!lines.errors.length && lines.drafts.length > 0 && (isMultiLine || structured || command?.action === 'create')) {
        const next: PendingSchedule = { kind: 'create', id: makeId('schedule'), conversationId,
          drafts: lines.drafts, format: 'lines', stage: lines.drafts.some(draft => draftProblem(draft)) ? 'clarifying' : 'confirming', updatedAt: Date.now() };
        await commitScheduleTurn(conversationId, userText, scheduleLineSummary(lines.drafts, actionNow), next, revision, assistantMessageId);
        return;
      }
    }
    setReviewingSchedule(true);
    let raw: string;
    try {
      raw = await extractSchedule(conversationId, requestId,
        pending?.kind === 'edit' || (!pending && intent === 'edit')
          ? editScheduleExtractionPrompt(actionText, pending?.kind === 'edit' ? pending.draft ?? undefined : undefined, actionNow)
          : bulkScheduleExtractionPrompt(actionText, undefined, actionNow)
            + (command ? ' In this schedule command, an omitted day means today in Philippine time; reminder defaults to false. Include every input line.' : ''), revision);
    } catch (error) {
      if (!canCommit()) throw error;
      await commitScheduleTurn(conversationId, userText,
        'I could not extract the schedule details right now. Please resend with title, date, and time.', pending, revision, assistantMessageId);
      return;
    } finally { setReviewingSchedule(false); }
    if (!canCommit()) throw new Error('Sending stopped. Your draft has been kept.');
    if (pending?.kind === 'edit' || (!pending && intent === 'edit')) {
      const parsed = parseEditExtraction(raw);
      if (!parsed) {
        await commitScheduleTurn(conversationId, userText,
          'I could not understand that edit. Please give the schedule title and what should change; nothing was saved.', pending, revision, assistantMessageId);
        return;
      }
      if (pending?.kind === 'edit' && pending.targetId && pending.snapshot && pending.draft) {
        const draft = { ...pending.draft, ...parsed.changes };
        const next: PendingSchedule = { ...pending, draft, changes: { ...pending.changes, ...parsed.changes },
          stage: draftProblem(draft) || !scheduleDraftDiffers(pending.snapshot, draft) ? 'clarifying' : 'confirming', updatedAt: Date.now() };
        await commitScheduleTurn(conversationId, userText, scheduleEditSummary(pending.snapshot, draft), next, revision, assistantMessageId);
        return;
      }
      const records = await db.getAllAsync<Schedule>(
        "SELECT * FROM schedules WHERE at > ? OR repeatKind != 'none' ORDER BY at LIMIT 200", Date.now());
      const candidates = matchingScheduleTargets(records, parsed.target, actionText);
      const selected = candidates.length === 1 ? candidates[0] : null;
      const draft = selected ? { ...draftFromSchedule(selected, parsed.language), ...parsed.changes } : null;
      const next: PendingSchedule = { kind: 'edit', id: makeId('edit'), conversationId,
        targetId: selected?.id ?? null, snapshot: selected, draft,
        changes: parsed.changes, targetQuery: parsed.target,
        candidateIds: selected ? [] : candidates.slice(0, 10).map(item => item.id),
        stage: selected && draft && !draftProblem(draft) && scheduleDraftDiffers(selected, draft)
          ? 'confirming' : 'clarifying', updatedAt: Date.now() };
      await commitScheduleTurn(conversationId, userText,
        selected && draft ? scheduleEditSummary(selected, draft) : scheduleTargetChoices(candidates),
        candidates.length ? next : null, revision, assistantMessageId);
      return;
    }
    const drafts = parseScheduleDrafts(raw);
    if (!drafts) {
      await commitScheduleTurn(conversationId, userText,
        'I could not understand the schedules. Please include each title, date, and time; nothing has been saved.', null, revision, assistantMessageId);
      return;
    }
    if (command && !pending) {
      const expected = actionText.split(/\r?\n/).filter(line => line.trim()).length;
      if (drafts.length !== expected) {
        await commitScheduleTurn(conversationId, userText,
          `I found ${drafts.length} of ${expected} lines. Please send one schedule per line so I can review all of them. Nothing was saved.`, null, revision, assistantMessageId);
        return;
      }
      const namedDay = /\b(?:today|tomorrow|day after tomorrow|ngayon|bukas|karon|ugma|next\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b\d{4}-\d{2}-\d{2}\b/i.test(actionText);
      const defaultDay = resolveScheduleDay('today', actionNow);
      drafts.forEach(draft => {
        if (!namedDay || !draft.day) draft.day = defaultDay;
        draft.reminder = /\breminder\s+on\b/i.test(actionText);
      });
    } else if (!pending && drafts.length === 1) {
      const day = resolveScheduleDay(userText, actionNow);
      if (day) drafts[0].day = day;
    }
    const next: PendingSchedule = { kind: 'create', id: makeId('schedule'),
      conversationId, drafts, ...(command ? { format: 'lines' as const } : {}),
      stage: drafts.some(draft => draftProblem(draft)) ? 'clarifying' : 'confirming', updatedAt: Date.now() };
    await commitScheduleTurn(conversationId, userText,
      next.format === 'lines' ? scheduleLineSummary(drafts) : scheduleBulkSummary(drafts), next, revision, assistantMessageId);
  }, [commitScheduleTurn, db, extractSchedule]);

  const sendAI = useCallback(async (content: string, attachment?: PhotoAttachment) => {
    if (busy.current || savingScheduleRef.current) throw new Error('Please wait for the current message.');
    const revision = gate.current.begin(); ticket.current = revision;
    busy.current = true; setGenerating(true); setAiError('');
    const requestId = makeId('request');
    const prompt = content.trim() || (attachment
      ? 'Tan-awa kini nga litrato sa tanom o uma. Isaysay unsay imong nakita (mga timailhan sa sakit, peste, o kakuwang sa abono), unsa ang posibleng hinungdan, ug unsa ang sayon nga solusyon o tambal gamit ang yano nga Binisaya.'
      : 'Unsay akong ikaabag kanimo karon sa imong pagpanguma?');
    const selectedId = activeConversationIdRef.current;
    try {
      const pending = !attachment && selectedId ? await getPendingSchedule(db, selectedId) : null;
      const command = attachment ? null : parseScheduleCommand(prompt);
      let intent = attachment ? 'chat' as const : command?.action === 'menu' ? 'chat' as const
        : command?.action ?? calendarIntent(prompt);
      let uncertainIntent = false;
      if (!attachment && intent === 'ambiguous' && !pending) {
        const id = activeConversationIdRef.current ?? await createBlankConversation();
        setReviewingSchedule(true);
        try {
          const raw = await extractSchedule(id, makeId('classify'), calendarClassificationPrompt(prompt), revision);
          const classified = parseCalendarIntent(raw);
          if (classified) intent = classified;
          else uncertainIntent = true;
        } finally { setReviewingSchedule(false); }
      }
      if (!attachment && (command || pending || intent !== 'chat' || uncertainIntent)) {
        try {
          const id = activeConversationIdRef.current ?? await createBlankConversation();
          const now = Date.now();
          const assistantMessage: ChatMessage = {
            id: makeId('message'),
            conversationId: id,
            content: '',
            role: 'assistant',
            createdAt: now + 1,
            status: 'streaming',
            statusText: pending?.kind === 'create' ? 'Reviewing schedule...' : 'Checking calendar...',
          };
          const userMessage: ChatMessage = {
            id: makeId('message'),
            conversationId: id,
            content: prompt,
            role: 'user',
            createdAt: now,
          };
          await db.withExclusiveTransactionAsync(async transaction => {
            await transaction.execAsync('PRAGMA busy_timeout = 2500;');
            if (!await transaction.getFirstAsync('SELECT id FROM conversations WHERE id = ?', id)) {
              throw new Error('The conversation was removed. Your draft has been kept.');
            }
            await insertMessage(transaction, userMessage);
            await insertMessage(transaction, assistantMessage);
            const title = conversations.find(item => item.id === id)?.title;
            await updateConversationAfterMessage(
              transaction,
              id,
              !title || title === 'New conversation' ? makeTitle(prompt) : title,
              prompt.slice(0, 120),
              assistantMessage.createdAt
            );
            if (!gate.current.accepts(revision) || activeConversationIdRef.current !== id) {
              throw new Error('Sending stopped. Your draft has been kept.');
            }
          });
          void refreshConversations().catch(() => undefined);
          run.current = { requestId, message: assistantMessage, lastSave: Date.now(), lastPaint: 0 };
          if (activeConversationIdRef.current === id) {
            setMessages((list) => mergeMessages(list, [userMessage, assistantMessage]));
          }

          if (command?.action === 'menu') {
            await commitScheduleTurn(id, prompt, scheduleCommandHelp, undefined, revision, assistantMessage.id);
          } else if (uncertainIntent) {
            await commitScheduleTurn(id, prompt,
              'I’m not sure whether you want to create, check, or edit a schedule. Please say which one; nothing was changed.',
              undefined, revision, assistantMessage.id);
          } else {
            await sendScheduleTurn(id, prompt, pending, revision, requestId,
              intent === 'chat' || intent === 'ambiguous' ? pending?.kind ?? 'create' : intent, command, assistantMessage.id);
          }
        } finally {
          if (actionRun.current?.requestId === requestId) actionRun.current.cancel();
          gate.current.finish(revision);
          if (ticket.current === revision) {
            ticket.current = null;
            busy.current = false; setGenerating(false);
          }
        }
        return;
      }
      const api = requireAI();
      const history = selectedId ? (await listMessages(db, selectedId)).messages
        .filter((item) => item.status !== 'streaming' && item.content.length > 0)
        .map((item) => ({ role: item.role, content: item.content, ...(item.attachment ? { image: item.attachment.uri } : {}) })) : [];
      if (!gate.current.accepts(revision)) throw new Error('Sending stopped. Your draft has been kept.');
      const id = activeConversationIdRef.current ?? await createBlankConversation();
      const response: ChatMessage = {
        id: makeId('message'),
        conversationId: id,
        content: '',
        role: 'assistant',
        createdAt: Date.now(),
        status: 'streaming',
        statusText: attachment ? 'Viewing the image...' : 'Thinking...',
      };
      const userMessage: ChatMessage = { id: makeId('message'), conversationId: id, content: prompt,
        role: 'user', createdAt: response.createdAt - 1, ...(attachment ? { attachment } : {}) };
      await db.withExclusiveTransactionAsync(async transaction => {
        await transaction.execAsync('PRAGMA busy_timeout = 2500;');
        if (!await transaction.getFirstAsync('SELECT id FROM conversations WHERE id = ?', id)) {
          throw new Error('The conversation was removed. Your draft has been kept.');
        }
        await insertMessage(transaction, userMessage);
        await insertMessage(transaction, response);
        const title = conversations.find(item => item.id === id)?.title;
        await updateConversationAfterMessage(transaction, id, !title || title === 'New conversation' ? makeTitle(prompt) : title,
          prompt.slice(0, 120), response.createdAt);
        if (!gate.current.accepts(revision) || activeConversationIdRef.current !== id) throw new Error('Sending stopped. Your draft has been kept.');
      });
      void refreshConversations().catch(() => undefined);
      run.current = { requestId, message: response, lastSave: Date.now(), lastPaint: 0 };
      smoother.current?.reset('');
      if (activeConversationIdRef.current === id) setMessages((list) => mergeMessages(list, [userMessage, response]));

      try {
        await api.prepare(requestId, history, prompt, attachment?.uri ?? null, 'chat');
        if (!gate.current.accepts(revision)) throw new Error('Sending stopped. Your draft has been kept.');
        if (selectedId && selectedId !== activeConversationIdRef.current) throw new Error('The conversation changed.');
        void api.generate(requestId, id).catch(() => {
          if (run.current?.requestId !== requestId) return;
          smoother.current?.flush();
          const failed = { ...run.current.message, status: 'interrupted' as const };
          void saveProgress(failed).catch(() => undefined);
          setMessages((list) => list.map((item) => item.id === failed.id ? failed : item));
          run.current = null; busy.current = false; if (ticket.current !== null) gate.current.finish(ticket.current); setGenerating(false);
          setAiError('The assistant could not finish. Please try again.');
        });
      } catch (prepError) {
        if (run.current?.requestId === requestId) {
          smoother.current?.flush();
          const failed = { ...run.current.message, status: 'interrupted' as const };
          void saveProgress(failed).catch(() => undefined);
          setMessages((list) => list.map((item) => item.id === failed.id ? failed : item));
          run.current = null;
        }
        nativeAI?.stop();
        gate.current.finish(revision);
        busy.current = false;
        setGenerating(false);
        setAiError('The assistant could not prepare. Please try again.');
        throw prepError;
      }
    } catch (error) {
      if (run.current) {
        const failed = { ...run.current.message, status: 'interrupted' as const };
        void saveProgress(failed).catch(() => undefined);
        setMessages((list) => list.map((item) => item.id === failed.id ? failed : item));
        run.current = null;
      }
      if (ticket.current === revision) {
        nativeAI?.stop(); gate.current.finish(revision); ticket.current = null;
        busy.current = false; setGenerating(false);
      }
      throw error;
    }

  }, [conversations, refreshConversations, createBlankConversation, db, saveProgress, sendScheduleTurn,
    extractSchedule, commitScheduleTurn]);

  const value = useMemo<ChatContextValue>(
    () => ({
      conversations,
      activeConversation,
      messages,
      loading,
      generating, savingSchedule, reviewingSchedule, aiError, sendAI, stopAI,
      hasOlderMessages,
      loadingOlderMessages,
      loadOlderMessages,
      createConversation,
      selectConversation,
      togglePinned,
      renameConversation: rename,
      deleteConversation: remove,
      sendMessage,
      appendMessage,
    }),
    [
      activeConversation,
      generating, savingSchedule, reviewingSchedule, aiError, sendAI, stopAI,
      appendMessage,
      conversations,
      createConversation,
      loading,
      hasOlderMessages,
      loadingOlderMessages,
      loadOlderMessages,
      messages,
      remove,
      rename,
      selectConversation,
      sendMessage,
      togglePinned,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used inside ChatProvider');
  }
  return context;
}
