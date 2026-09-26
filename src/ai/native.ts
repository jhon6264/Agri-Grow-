import { requireOptionalNativeModule, NativeModule } from 'expo-modules-core';
import type { PhotoAttachment } from '@/src/chat/chat-types';

export type InstallStage = 'missing' | 'downloading' | 'waiting' | 'verifying' | 'installed' | 'failed';
export type InstallStatus = { stage: InstallStage; bytes: number; total: number; accepted: boolean; ready?: boolean; error?: string;
  initializationPhase?: 'idle' | 'engine' | 'session' | 'ready' | 'failed';
  operationId?: string | null; operationPhase?: string; elapsedMs?: number;
  recoverability?: 'retry_required' | 'busy' | 'retry_allowed';
  previousExit?: { reason: 'native_crash' | 'low_memory' | 'managed_crash' | 'anr' | 'other'; timestamp: number; pssKb: number; rssKb: number } | null;
  interruptedPhase?: string; diagnosticBreadcrumbs?: string;
};
export type GenerationEvent = { requestId: string; conversationId: string; kind: 'delta' | 'complete' | 'stopped' | 'failed' | 'phase'; text: string };
export type HistoryEntry = { role: string; content: string; image?: string };
export type StartupEvent = { phase: InstallStatus['initializationPhase']; ready: boolean };
declare class AiModule extends NativeModule<{ generation: (event: GenerationEvent) => void; startup: (event: StartupEvent) => void }> {
  status(): Promise<InstallStatus>;
  download(): Promise<InstallStatus>;
  cancelDownload(): Promise<void>;
  verify(): Promise<void>;
  initialize(): Promise<void>;
  acknowledgeRecovery(): Promise<void>;
  accept(): Promise<void>;
  release(): Promise<void>;
  stop(): void;
  preparePhoto(uri: string): Promise<PhotoAttachment>;
  cleanPhotos(keep: string[], minimumAge: number): Promise<void>;
  prepare(requestId: string, history: HistoryEntry[], prompt: string, image: string | null, mode: 'chat' | 'schedule'): Promise<void>;
  generate(requestId: string, conversationId: string): Promise<void>;
}
export const nativeAI = requireOptionalNativeModule<AiModule>('AgriAi');
export function requireAI() {
  if (!nativeAI) throw new Error('Install the new Android build to use your offline assistant.');
  return nativeAI;
}
