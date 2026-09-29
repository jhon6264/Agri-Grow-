export type TabKey = 'calendar' | 'chat' | 'others';

/**
 * Resolves the currently active tab in the main scaffold.
 * When navigating to sub-routes (e.g., /weather, /market-prices, /almanac, /add-schedule),
 * the active tab retains its previous state so the scaffold does not abruptly flash or
 * switch modes during transitions.
 */
export function resolveCurrentTab(pathname: string, previousTab: TabKey = 'calendar'): TabKey {
  if (pathname === '/chat') return 'chat';
  if (pathname === '/others') return 'others';
  if (pathname === '/' || pathname === '/index' || pathname === '') return 'calendar';
  return previousTab;
}
