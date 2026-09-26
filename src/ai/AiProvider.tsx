import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { startupLabel, startupPresentation, recoveryMessage } from './startup-state';
import { nativeAI, requireAI, type InstallStatus } from './native';

type Stage = InstallStatus['stage'] | 'checking' | 'initializing' | 'ready';
type AiState = { stage: Stage; bytes: number; total: number; error: string; blocked: boolean; returning: boolean; label: string; slow: boolean; canRetry: boolean;
  download: () => Promise<void>; cancel: () => Promise<void>; retry: () => Promise<void>; enter: () => Promise<void> };
const Context = createContext<AiState | null>(null);
export function AiProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [stage, setStage] = useState<Stage>('checking');
  const [bytes, setBytes] = useState(0);
  const [total, setTotal] = useState(2588147712);
  const [error, setError] = useState('');
  const [entered, setEntered] = useState(false);
  const [returning, setReturning] = useState(true);
  const [label, setLabel] = useState('preparing');
  const [slow, setSlow] = useState(false);
  const [canRetry, setCanRetry] = useState(true);
  const polling = useRef(false);
  const startupRevision = useRef(0);
  const enteredRef = useRef(false);
  enteredRef.current = entered;
  const [active, setActive] = useState(AppState.currentState === 'active');
  const running = useRef(false);
  const ready = useRef(false);
  const failed = useRef(false);
  const revision = useRef(0);
  const visible = useRef(false);
  visible.current = pathname === '/chat' && active;
  const fail = useCallback((reason: unknown) => {
    failed.current = true;
    setError(reason instanceof Error ? reason.message : 'Unable to prepare your assistant. Please retry.');
    setStage('failed');
  }, []);
  useEffect(() => {
    const sub = nativeAI?.addListener('startup', event => {
      startupRevision.current++;
      if (!visible.current || enteredRef.current || failed.current) return;
      if (event.phase === 'failed') return; // initialize() supplies the actionable error.
      setLabel(startupLabel(event.phase, event.ready));
      setStage(event.ready ? 'ready' : 'initializing');
      if (event.ready) setSlow(false);
    });
    return () => sub?.remove();
  }, []);
  const refresh = useCallback(async () => {
    if (polling.current || !visible.current) return;
    const version = revision.current;
    polling.current = true;
    try {
      const api = requireAI();
      const observedStartup = startupRevision.current;
      const status = await api.status();
      if (version !== revision.current || observedStartup !== startupRevision.current) return;
      setBytes(status.bytes); setTotal(status.total);
      const view = startupPresentation(status);
      setReturning(view.returning); setLabel(view.label); setSlow(view.slow); setCanRetry(view.canRetry);
      if (view.recovery) { fail(new Error(recoveryMessage(status))); return; }
      if (running.current || failed.current) return;
      if (enteredRef.current && status.ready) return;
      if (enteredRef.current && status.recoverability === 'busy') return;
      if (!status.ready) { ready.current = false; setEntered(false); }

      if (status.stage === 'failed') { fail(new Error(status.error)); return; }
      if (status.stage === 'verifying') {
        running.current = true; setStage('verifying');
        void api.verify().catch(fail).finally(() => { running.current = false; }); return;
      } else if (status.stage !== 'installed') { setStage(status.stage); return; }
      if (status.ready) { ready.current = true; setStage('ready'); return; }
      if (status.recoverability === 'busy') { setStage('initializing'); return; }
      running.current = true; setStage('initializing');
      void api.initialize().catch((reason) => {
        if (version === revision.current && visible.current) fail(reason);
      }).finally(() => { running.current = false; });
    } catch (reason) { if (version === revision.current && visible.current) fail(reason); }
    finally { polling.current = false; }
  }, [fail]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (value) => {
      setActive(value === 'active');
      if (value !== 'active') { revision.current++; ready.current = false; setEntered(false); setStage('checking'); nativeAI?.stop(); }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (pathname === '/chat' && active) {
      void refresh();
      const timer = setInterval(() => void refresh(), 1000);
      return () => clearInterval(timer);
    }
    nativeAI?.stop();
    const timer = setTimeout(() => {
      ready.current = false; setEntered(false); setStage('checking');
      void nativeAI?.release();
    }, 30000);
    return () => clearTimeout(timer);
  }, [pathname, active, refresh]);
  const download = async () => {
    if (running.current) return;
    running.current = true; failed.current = false; setError('');
    try { const status = await requireAI().download(); setStage(status.stage); setBytes(status.bytes); }
    catch (reason) { fail(reason); }
    finally { running.current = false; }
  };
  const cancel = async () => {
    revision.current++; running.current = true;
    try { await requireAI().cancelDownload(); failed.current = false; ready.current = false; setEntered(false); setBytes(0); setStage('missing'); }
    catch (reason) { fail(reason); }
    finally { running.current = false; }
  };
  const retry = async () => { failed.current = false; setError(''); setStage('checking');
    try {
      const api = requireAI(); const status = await api.status();
      if (status.recoverability === 'busy' || running.current) return;
      await api.acknowledgeRecovery();
      if (status.stage === 'failed') await download(); else await refresh();
    }
    catch (reason) { fail(reason); }
  };
  const enter = async () => { await requireAI().accept(); setEntered(true); };
  return <Context.Provider value={{ stage, bytes, total, error, returning, label, slow, canRetry, blocked: !entered || stage !== 'ready', download, cancel, retry, enter }}>{children}</Context.Provider>;
}
export function useAI() { const value = useContext(Context); if (!value) throw new Error('AiProvider is missing'); return value; }
