import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { PageHeader } from "@/components/app/PageHeader";
import { MediaClient } from "./MediaClient";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  return (
    <div className="space-y-5">
      <PageHeader title="Media" subtitle="Product images, stored on Cloudinary and delivered optimized." />
      <MediaClient />
    </div>
  );
}
