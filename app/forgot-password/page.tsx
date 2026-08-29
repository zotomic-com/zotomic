import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        <div className="card p-6">
          <PagePlaceholder title="Reset your password" phase="Phase 1" />
        </div>
        <p className="mt-4 text-center text-sm text-fg-muted">
          <Link href="/login" className="font-semibold text-primary">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
