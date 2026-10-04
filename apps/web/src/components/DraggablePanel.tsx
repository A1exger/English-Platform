'use client';

import { ReactNode, useCallback, useRef, useState } from 'react';
import { Icon } from './Icon';

interface Props {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  initial?: { x: number; y: number; width: number; height: number };
}

// A floating window that can be dragged anywhere on screen (even off the board)
// and resized from its bottom-right corner.
export function DraggablePanel({ title, onClose, children, initial }: Props) {
  const [pos, setPos] = useState({
    x: initial?.x ?? 140,
    y: initial?.y ?? 120
  });
  const size = {
    width: initial?.width ?? 300,
    height: initial?.height ?? 240
  };
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onMove = useCallback((e: PointerEvent) => {
    if (!drag.current) return;
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
  }, []);

  const onUp = useCallback(() => {
    drag.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove]);

  function onDown(e: React.PointerEvent) {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div
      className="dpanel"
      style={{ left: pos.x, top: pos.y, width: size.width, height: size.height }}
    >
      <div className="dpanel-head" onPointerDown={onDown}>
        <strong>{title}</strong>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="close">
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="dpanel-body">{children}</div>
    </div>
  );
}
