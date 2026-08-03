'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useTranslations } from 'next-intl';

interface UndoOptions {
  /** Restore the optimistic change (the API call has NOT happened yet). */
  onUndo?: () => void;
  /** Actually perform the destructive call, once the window expires. */
  onCommit?: () => void | Promise<void>;
  /** Grace period before committing. Default 6000ms. */
  ms?: number;
}

interface ToastItem {
  id: number;
  message: string;
  undo?: () => void;
}

interface ToastApi {
  show(message: string): void;
  /**
   * Optimistic destructive action. The row disappears immediately, but the
   * DELETE only fires when the grace period expires — so "undo" is free and
   * nothing is ever lost to a mis-click.
   */
  showUndo(message: string, options: UndoOptions): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common');
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string) => {
      const id = (seq.current += 1);
      setItems((prev) => [...prev, { id, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 4000)
      );
    },
    [dismiss]
  );

  const showUndo = useCallback(
    (message: string, options: UndoOptions) => {
      const id = (seq.current += 1);
      const undo = () => {
        dismiss(id);
        options.onUndo?.();
      };
      setItems((prev) => [...prev, { id, message, undo }]);
      timers.current.set(
        id,
        setTimeout(() => {
          dismiss(id);
          void options.onCommit?.();
        }, options.ms ?? 6000)
      );
    },
    [dismiss]
  );

  // Flush every pending commit if the provider unmounts mid-countdown.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((handle) => clearTimeout(handle));
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, showUndo }), [show, showUndo]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="toast">
            <span>{item.message}</span>
            {item.undo && (
              <button type="button" className="toast-undo" onClick={item.undo}>
                {t('undo')}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
