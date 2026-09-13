import { Suspense } from "react";
import { getSocialLoginSettings } from "@/lib/platform-settings";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const social = await getSocialLoginSettings();

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4 py-12">
      <Suspense fallback={<p className="text-sm text-fg-subtle">Loading…</p>}>
        <SignupForm googleEnabled={social.googleEnabled} facebookEnabled={social.facebookEnabled} />
      </Suspense>
    </div>
  );
}
