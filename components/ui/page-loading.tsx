/** Shared fallback shown while a route's server payload is in flight. */
export default function PageLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[45dvh] w-full items-center justify-center px-4 py-16"
    >
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-border-strong border-t-primary" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
