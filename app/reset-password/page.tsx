import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getSiteBranding } from "@/lib/platform-settings";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const branding = await getSiteBranding();

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo src={branding.logoUrl} />
        </Link>
        <div className="card p-6">
          <h1 className="mb-4 text-lg font-extrabold text-fg">Choose a new password</h1>
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
