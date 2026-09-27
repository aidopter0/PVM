import { useCallback, useState } from 'react';

const LIMIT = 100;

/** Value with undo/redo. `reset` replaces the value and clears history (e.g. after loading). */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((s) => {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(s.present) : next;
      if (value === s.present) return s;
      return { past: [...s.past, s.present].slice(-LIMIT), present: value, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      const prev = s.past[s.past.length - 1];
      if (prev === undefined) return s;
      return { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      const [next, ...rest] = s.future;
      if (next === undefined) return s;
      return { past: [...s.past, s.present], present: next, future: rest };
    });
  }, []);

  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [] }), []);

  return {
    value: state.present,
    set,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
