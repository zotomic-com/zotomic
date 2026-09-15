import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getSiteBranding } from "@/lib/platform-settings";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const branding = await getSiteBranding();

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo src={branding.logoUrl} />
        </Link>
        <div className="card p-6">
          <h1 className="text-lg font-extrabold text-fg">Reset your password</h1>
          <ForgotPasswordForm />
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
