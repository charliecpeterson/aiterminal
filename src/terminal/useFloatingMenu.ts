import { useEffect, type RefObject } from 'react';

type XY = { x: number; y: number };

export function useFloatingMenu<T extends XY>(
  menu: T | null,
  setMenu: (value: T | null | ((prev: T | null) => T | null)) => void,
  menuRef: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (!menu) return;

    const clampMenuPosition = () => {
      const el = menuRef.current;
      if (!el) return;

      const menuRect = el.getBoundingClientRect();
      const margin = 8;
      const maxX = window.innerWidth - menuRect.width - margin;
      const maxY = window.innerHeight - menuRect.height - margin;
      const nextX = Math.min(Math.max(margin, menu.x), Math.max(margin, maxX));
      const nextY = Math.min(Math.max(margin, menu.y), Math.max(margin, maxY));

      if (nextX !== menu.x || nextY !== menu.y) {
        setMenu((prev) => (prev ? ({ ...prev, x: nextX, y: nextY } as T) : prev));
      }
    };

    requestAnimationFrame(clampMenuPosition);

    const handleGlobalMouseDown = (event: MouseEvent) => {
      const el = menuRef.current;
      if (!el) return;
      if (!el.contains(event.target as Node)) {
        setMenu(null);
      }
    };

    window.addEventListener('mousedown', handleGlobalMouseDown);
    return () => window.removeEventListener('mousedown', handleGlobalMouseDown);
  }, [menu, menuRef, setMenu]);
}
