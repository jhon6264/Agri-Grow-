import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

export function useWelcomeActivity(active: boolean) {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    let changed = false;
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      changed = true;
      setReduceMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && !changed) setReduceMotion(enabled);
    }).catch(() => {});
    const state = AppState.addEventListener('change', (value) => setForeground(value === 'active'));
    return () => { mounted = false; motion.remove(); state.remove(); };
  }, []);
  return { running: active && foreground, reduceMotion };
}
