/**
 * Shown at once while the server prepares an (app) screen (tab switch, item, place):
 * the header and the bottom bar stay, the content area shows a light skeleton instead of
 * the previous screen staying frozen. Text-free, so it needs no dictionaries.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="flex animate-pulse flex-col gap-4" aria-label="…">
      <div className="h-8 w-40 rounded-lg bg-surface" />
      <div className="flex gap-2">
        <div className="h-11 w-32 rounded-xl bg-surface" />
        <div className="h-11 w-28 rounded-xl bg-surface" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="aspect-square w-full rounded-xl bg-surface" />
            <div className="h-4 w-3/4 rounded bg-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}
