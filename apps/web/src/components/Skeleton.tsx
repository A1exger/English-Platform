// Loading placeholder. Replaces the "…" that every screen used to show while
// fetching — the shape of the answer appears before the answer does.
export function Skeleton({ lines = 3, card = true }: { lines?: number; card?: boolean }) {
  const body = (
    <div className="skeleton" aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
  );
  return card ? <div className="card">{body}</div> : body;
}
