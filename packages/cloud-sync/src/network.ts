import type { NetworkMonitor } from './engine';

/** Browser connectivity from `navigator.onLine` and `online`/`offline` events. */
export function createBrowserNetworkMonitor(target: Window | undefined = typeof window === 'undefined' ? undefined : window): NetworkMonitor {
  return {
    online: () => (target ? target.navigator.onLine : null),
    subscribe(listener) {
      if (!target) return () => {};
      const up = () => listener(true);
      const down = () => listener(false);
      target.addEventListener('online', up);
      target.addEventListener('offline', down);
      return () => {
        target.removeEventListener('online', up);
        target.removeEventListener('offline', down);
      };
    },
  };
}

/** Manually driven monitor (tests, or platforms that report connectivity some other way). */
export function createManualNetworkMonitor(initial: boolean | null = null): NetworkMonitor & { set(online: boolean): void } {
  let state = initial;
  const listeners = new Set<(online: boolean) => void>();
  return {
    online: () => state,
    set(online) {
      state = online;
      for (const listener of listeners) listener(online);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
