'use client';

import { useEffect } from 'react';

// The pop-out menus are native <details>, which only close by clicking their own
// summary again. This dismisses them the way a menu is expected to behave.
//
// Scoped by selector on purpose: `.ed-translations` is also a <details>, but an
// inline expander holding a scrollable table — closing that on an outside click
// would throw the author out of their edit. Only genuine popovers are listed.
const POPOVERS = 'details.row-menu[open], details.room-tool[open]';

function closeAll(shouldClose: (menu: HTMLDetailsElement) => boolean) {
  document.querySelectorAll<HTMLDetailsElement>(POPOVERS).forEach((menu) => {
    if (shouldClose(menu)) menu.open = false;
  });
}

/**
 * Close open pop-out menus on an outside click, on Escape, and once a menu item
 * has been chosen. React renders these <details> uncontrolled — it never passes
 * `open` — so setting the property directly cannot drift from any React state.
 */
export function usePopoverDismiss() {
  useEffect(() => {
    // Bubble phase, so a menu item's own handler has already run by the time we
    // close the menu it lives in.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      closeAll((menu) => {
        if (!target || !menu.contains(target)) return true;
        // Clicking the summary is the native toggle; leave that alone.
        return !!target.closest('.menu-item');
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll(() => true);
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
}
