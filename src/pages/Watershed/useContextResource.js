import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Load one resource for the ACTIVE context.
 *
 * - status: IDLE | LOADING | DONE | ERROR | TIMEOUT  (every request terminates — the client enforces timeouts)
 * - switching context aborts the in-flight request, and a stale response can never be written
 *   (the request is tagged with the context key it was issued for).
 * - refreshToken: bump to re-run; the loader receives refresh=true so the server drops its cache.
 */
export function useContextResource(ctx, loader, { enabled = true, refreshToken = 0 } = {}) {
  const [state, setState] = useState({ status: 'IDLE', data: null, error: null, key: null });
  const [retryNonce, setRetryNonce] = useState(0);
  const lastRun = useRef({ key: null, refreshToken: 0 });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const key = ctx?.key || null;

  useEffect(() => {
    if (!ctx || !enabled) {
      setState({ status: 'IDLE', data: null, error: null, key });
      return undefined;
    }
    const refresh = lastRun.current.key === key && lastRun.current.refreshToken !== refreshToken;
    lastRun.current = { key, refreshToken };
    const ac = new AbortController();
    const started = performance.now();
    setState({ status: 'LOADING', data: null, error: null, key });
    loaderRef.current(ctx, { signal: ac.signal, refresh })
      .then((data) => {
        if (ac.signal.aborted) return;
        setState({ status: 'DONE', data, error: null, key, ms: Math.round(performance.now() - started) });
      })
      .catch((error) => {
        if (ac.signal.aborted) return;
        setState({ status: error?.code === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR', data: null, error, key });
      });
    return () => ac.abort();
    // ctx object identity changes only with its key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, refreshToken, retryNonce]);

  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);
  // never expose data that belongs to a different context
  return state.key === key ? { ...state, retry } : { status: ctx && enabled ? 'LOADING' : 'IDLE', data: null, error: null, key, retry };
}
