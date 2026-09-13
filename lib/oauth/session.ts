import { getAdminSupabase } from "@/lib/supabase";
import { signToken } from "@/lib/auth";

interface OAuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  blocked: boolean;
  status: string;
}

/**
 * Shared find-or-link-or-create logic for both Google and Facebook. Mirrors
 * the exact session/redirect shape of /api/auth/login and /api/auth/signup —
 * same signToken call, same "owner with zero business_members → /onboarding"
 * check — so a social sign-in is indistinguishable downstream from a
 * password one.
 */
export async function completeOAuthSignIn(params: {
  provider: "google" | "facebook";
  providerId: string;
  email: string;
  name: string;
}): Promise<{ token: string; redirect: string; userId: string } | { error: string }> {
  const db = getAdminSupabase();
  const idColumn = params.provider === "google" ? "google_id" : "facebook_id";
  const cleanEmail = params.email.toLowerCase().trim();

  let user: OAuthUser | null = null;

  const { data: byProvider } = await db
    .from("users")
    .select("id, name, email, role, blocked, status")
    .eq(idColumn, params.providerId)
    .maybeSingle();
  if (byProvider) user = byProvider as OAuthUser;

  if (!user) {
    const { data: byEmail } = await db.from("users").select("id, name, email, role, blocked, status").eq("email", cleanEmail).maybeSingle();
    if (byEmail) {
      // Google/Facebook already verified this email is theirs — safe to link to the existing password account.
      await db.from("users").update({ [idColumn]: params.providerId }).eq("id", byEmail.id);
      user = byEmail as OAuthUser;
    }
  }

  if (!user) {
    const { data: created, error } = await db
      .from("users")
      .insert({
        name: params.name.trim().slice(0, 200) || cleanEmail,
        email: cleanEmail,
        password_hash: null,
        role: "owner",
        status: "active",
        auth_provider: params.provider,
        [idColumn]: params.providerId,
      })
      .select("id, name, email, role, blocked, status")
      .single();
    if (error || !created) return { error: "Could not create your account." };
    user = created as OAuthUser;
  }

  if (user.blocked) return { error: "Your account has been blocked. Contact support." };
  if (user.status === "suspended") return { error: "Your account has been suspended. Contact support." };

  const token = await signToken({ id: user.id, email: user.email, role: user.role, name: user.name });

  let redirect = user.role === "admin" ? "/admin" : "/app";
  if (user.role === "owner") {
    const { count } = await db.from("business_members").select("business_id", { count: "exact", head: true }).eq("user_id", user.id);
    if (!count) redirect = "/onboarding";
  }

  return { token, redirect, userId: user.id };
}
