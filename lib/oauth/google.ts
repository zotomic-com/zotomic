import { getSocialLoginSettings } from "@/lib/platform-settings";

/**
 * Google OAuth 2.0 authorization-code flow (confirmed against Google's own
 * docs) — no library, hand-rolled fetch calls. There is no Google SDK
 * installed in this project and none is needed for this flow.
 */

export async function googleConfigured(): Promise<boolean> {
  const s = await getSocialLoginSettings();
  return s.googleEnabled && !!s.googleClientId && !!s.googleClientSecret;
}

export async function getGoogleAuthUrl(state: string, redirectUri: string): Promise<string | null> {
  const s = await getSocialLoginSettings();
  if (!s.googleClientId) return null;
  const params = new URLSearchParams({
    client_id: s.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleProfile {
  id: string;
  email: string;
  verifiedEmail: boolean;
  name: string;
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleProfile | { error: string }> {
  const s = await getSocialLoginSettings();
  if (!s.googleClientId || !s.googleClientSecret) return { error: "Google sign-in isn't configured." };

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: s.googleClientId,
      client_secret: s.googleClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const tokenJson = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenJson?.access_token) {
    return { error: tokenJson?.error_description ?? "Google rejected the sign-in request." };
  }

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const profile = await profileRes.json().catch(() => null);
  if (!profileRes.ok || !profile?.id || !profile?.email) {
    return { error: "Could not read your Google profile." };
  }

  return { id: String(profile.id), email: String(profile.email), verifiedEmail: !!profile.verified_email, name: String(profile.name ?? profile.email) };
}
