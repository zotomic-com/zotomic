/**
 * A tiny, non-httpOnly "who is signed in" hint for the marketing header.
 *
 * The real session lives in the httpOnly `auth_token` cookie and every guard
 * (middleware, server pages, API routes) verifies it. Reading that cookie in
 * the root layout would force every marketing page to render dynamically, so
 * we mirror only the role here and let the client header show "Dashboard".
 * The value is user-editable but can only change which button label appears —
 * access is still enforced by the token.
 */
export const AUTH_ROLE_COOKIE = "auth_role";

export const AUTH_ROLE_MAX_AGE = 60 * 60 * 24 * 7;

export function readAuthRole(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)auth_role=([^;]*)/);
  if (!match) return null;
  const role = decodeURIComponent(match[1]).trim();
  return role || null;
}
