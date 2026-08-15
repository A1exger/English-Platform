// The rail's homework badge is rendered by a component that never unmounts
// (the rail is mounted once by (app)/layout.tsx), while the work that changes
// the count happens in a page below it. A DOM event is the cheapest way for the
// two to talk without threading state through the layout or adding a store.
export const HOMEWORK_CHANGED_EVENT = 'homework:changed';

/** Tell the rail its outstanding-homework count is stale. Safe on the server. */
export function notifyHomeworkChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(HOMEWORK_CHANGED_EVENT));
}
