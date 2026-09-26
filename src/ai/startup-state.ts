import type { InstallStatus } from './native';

export function startupLabel(phase: InstallStatus['initializationPhase'], ready: boolean) {
  return ready ? 'here it is' : phase === 'session' ? 'almost there' : 'preparing';
}
export function recoveryMessage(status: InstallStatus) {
  const reason = status.previousExit?.reason;
  const detail = reason === 'low_memory' ? 'Android closed the app because memory was low.'
    : reason === 'native_crash' ? 'Android recorded a native AI crash.'
    : reason === 'anr' ? 'Android reported that the app stopped responding.'
    : 'The previous AI operation was interrupted.';
  return `${detail} Your download and chats are kept. Tap Retry when you’re ready.`;
}
export function startupPresentation(status: InstallStatus) {
  return {
    returning: status.stage === 'installed' && status.accepted,
    recovery: status.recoverability === 'retry_required',
    canRetry: status.recoverability !== 'busy',
    slow: (status.elapsedMs ?? 0) >= 90000 && status.recoverability === 'busy',
    label: startupLabel(status.initializationPhase, status.ready === true),
  };
}
