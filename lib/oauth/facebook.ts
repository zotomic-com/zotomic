import { getSocialLoginSettings } from "@/lib/platform-settings";

/**
 * Facebook Login authorization-code flow (confirmed against Meta's own
 * docs) — no library, hand-rolled fetch calls. The `email` permission is a
 * "basic" one and doesn't require app review.
 */

const GRAPH_VERSION = "v21.0";

export async function facebookConfigured(): Promise<boolean> {
  const s = await getSocialLoginSettings();
  return s.facebookEnabled && !!s.facebookClientId && !!s.facebookClientSecret;
}

export async function getFacebookAuthUrl(state: string, redirectUri: string): Promise<string | null> {
  const s = await getSocialLoginSettings();
  if (!s.facebookClientId) return null;
  const params = new URLSearchParams({
    client_id: s.facebookClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "email public_profile",
    state,
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

export interface FacebookProfile {
  id: string;
  email: string;
  name: string;
}

export async function exchangeFacebookCode(code: string, redirectUri: string): Promise<FacebookProfile | { error: string }> {
  const s = await getSocialLoginSettings();
  if (!s.facebookClientId || !s.facebookClientSecret) return { error: "Facebook sign-in isn't configured." };

  const tokenParams = new URLSearchParams({
    client_id: s.facebookClientId,
    client_secret: s.facebookClientSecret,
    redirect_uri: redirectUri,
    code,
  });
  const tokenRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${tokenParams.toString()}`);
  const tokenJson = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenJson?.access_token) {
    return { error: tokenJson?.error?.message ?? "Facebook rejected the sign-in request." };
  }

  const profileParams = new URLSearchParams({ fields: "id,name,email", access_token: tokenJson.access_token });
  const profileRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me?${profileParams.toString()}`);
  const profile = await profileRes.json().catch(() => null);
  if (!profileRes.ok || !profile?.id) {
    return { error: "Could not read your Facebook profile." };
  }
  if (!profile.email) {
    return { error: "Your Facebook account has no email address on file — please use email/password or Google instead." };
  }

  return { id: String(profile.id), email: String(profile.email), name: String(profile.name ?? profile.email) };
}
