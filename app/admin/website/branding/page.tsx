import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { getSiteBranding } from "@/lib/platform-settings";
import { getSocialLinks } from "@/lib/social-links";
import { getContactNumbers } from "@/lib/contact-numbers";
import { BrandingForm } from "./BrandingForm";

export const dynamic = "force-dynamic";

export default async function AdminWebsiteBrandingPage() {
  await requireAdmin();
  const [branding, socialLinks, contactNumbers] = await Promise.all([getSiteBranding(), getSocialLinks(), getContactNumbers()]);

  return (
    <div className="space-y-5">
      <PageHeader title="Logo, favicon & footer" subtitle="Applies to the public marketing site (zotomic.com) and the browser tab icon site-wide." />
      <BrandingForm branding={branding} socialLinks={socialLinks} contactNumbers={contactNumbers} />
    </div>
  );
}
