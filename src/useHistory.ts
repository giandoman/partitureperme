import { useCallback, useRef, useState } from 'react';

interface H<T> {
  past: T[];
  present: T;
  future: T[];
}

/** Stato con annulla/ripeti. `key` raggruppa modifiche ravvicinate (es. digitazione). */
export function useHistory<T>(initial: T) {
  const [h, setH] = useState<H<T>>({ past: [], present: initial, future: [] });
  const last = useRef<{ key?: string; t: number }>({ t: 0 });

  const update = useCallback((fn: (draft: T) => void, key?: string) => {
    const now = Date.now();
    const coalesce = !!key && last.current.key === key && now - last.current.t < 900;
    last.current = { key, t: now };
    setH((s) => {
      const next = structuredClone(s.present);
      fn(next);
      return {
        past: coalesce ? s.past : [...s.past.slice(-120), s.present],
        present: next,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    last.current = { t: 0 };
    setH((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    last.current = { t: 0 };
    setH((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  const reset = useCallback((v: T) => setH({ past: [], present: v, future: [] }), []);

  return { state: h.present, update, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
