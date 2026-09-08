/**
 * Circuit breaker + backoff for the Gemini model chain.
 *
 * Problem it solves: when Gemini is overloaded (429/503) or a model id is
 * retired (404), the naive `for (model of CHAIN)` loop hammers every model on
 * every request from every user — turning one Google incident into a burst of
 * wasted calls (and, on metered keys, cost). This tracks failures per model in
 * module memory and short-circuits attempts during a cool-off.
 *
 * Best-effort per warm instance — no external state. Good enough: a hot instance
 * serving many assistant turns will stop retrying a dead model within seconds.
 */

const FAIL_THRESHOLD = 4; // consecutive failures before a model's circuit opens
const COOLOFF_MS = 60_000; // how long an open circuit stays open
const BACKOFF_BASE_MS = 400;
const BACKOFF_MAX_MS = 2_000;

interface ModelState {
  fails: number;
  openUntil: number;
}

const state = new Map<string, ModelState>();

function get(model: string): ModelState {
  let s = state.get(model);
  if (!s) {
    s = { fails: 0, openUntil: 0 };
    state.set(model, s);
  }
  return s;
}

/** May we call this model right now, or is its circuit open? */
export function canAttempt(model: string): boolean {
  return get(model).openUntil <= Date.now();
}

export function recordSuccess(model: string): void {
  const s = get(model);
  s.fails = 0;
  s.openUntil = 0;
}

/** `retryable` = 429/503/network (transient); non-retryable still counts but is logged upstream. */
export function recordFailure(model: string): void {
  const s = get(model);
  s.fails += 1;
  if (s.fails >= FAIL_THRESHOLD) {
    s.openUntil = Date.now() + COOLOFF_MS;
    s.fails = 0;
  }
}

/**
 * True when every model in the chain has an open circuit — callers should skip
 * the request entirely and fall back to deterministic behaviour.
 */
export function chainOpen(chain: readonly string[]): boolean {
  return chain.length > 0 && chain.every((m) => !canAttempt(m));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Exponential backoff delay for the Nth transient failure in a single request. */
export function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
}
