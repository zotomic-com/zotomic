import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getSocialLoginSettings } from "@/lib/platform-settings";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const social = await getSocialLoginSettings();

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        <div className="card p-6">
          <h1 className="text-lg font-extrabold text-fg">Welcome back</h1>
          <p className="mb-6 mt-1 text-sm text-fg-muted">Sign in to your Zotomic account.</p>
          <Suspense fallback={<p className="text-sm text-fg-subtle">Loading…</p>}>
            <LoginForm googleEnabled={social.googleEnabled} facebookEnabled={social.facebookEnabled} />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-sm text-fg-muted">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-primary">
            Start free
          </Link>
        </p>
      </div>
    </div>
  );
}
